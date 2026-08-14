-- A launch window during which contacting a nanny is free for everyone.
--
-- The rule the whole product rests on is that free usage is derived from the
-- rows in family_nanny_contacts and never held in a counter. This does not
-- change that. It changes one thing: a contact opened inside the window is
-- written with consumed_free_credit = false, so it is not counted, exactly the
-- way a subscriber's contacts are already not counted.
--
-- The consequence is the one that was asked for. When the window closes, every
-- family still has all of its free contacts, and the paywall starts from there.
-- Nobody is punished for having tried the product early.
--
-- Both dates default to null, which means no promotion. Deploying this changes
-- nothing until somebody sets a window, which is deliberate: the launch date
-- does not exist yet.

alter table public.pricing_config
  add column if not exists promo_starts_at timestamptz,
  add column if not exists promo_ends_at timestamptz,
  add column if not exists promo_label text;

comment on column public.pricing_config.promo_starts_at is
  'Start of the free launch window. Null means no promotion.';
comment on column public.pricing_config.promo_ends_at is
  'End of the free launch window. Contacts opened before this cost nothing and are never counted.';
comment on column public.pricing_config.promo_label is
  'Short phrase for the banner, so the reason can be changed without a deploy.';

-- A window that ends before it starts would silently be permanently inactive,
-- which is the hardest kind of configuration mistake to notice.
alter table public.pricing_config
  drop constraint if exists pricing_config_promo_window_valid;
alter table public.pricing_config
  add constraint pricing_config_promo_window_valid
  check (
    promo_starts_at is null
    or promo_ends_at is null
    or promo_ends_at > promo_starts_at
  );

/**
 * Whether the launch window is open right now.
 *
 * A missing start means "from whenever this was configured", a missing end
 * means "until somebody says otherwise". Both null is no promotion at all,
 * which is the default and the state this ships in.
 */
create or replace function public.promo_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (promo_starts_at is not null or promo_ends_at is not null)
            and (promo_starts_at is null or now() >= promo_starts_at)
            and (promo_ends_at is null or now() < promo_ends_at)
       from public.pricing_config where id),
    false);
$$;

grant execute on function public.promo_active() to anon, authenticated;

/**
 * The window itself, for anything that needs to say when it ends.
 */
create or replace function public.promo_window()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'active', public.promo_active(),
    'starts_at', promo_starts_at,
    'ends_at', promo_ends_at,
    'label', promo_label
  )
  from public.pricing_config where id;
$$;

grant execute on function public.promo_window() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Contact state, now aware of the window
-- ---------------------------------------------------------------------------

-- The return type gains two columns, so the old signature has to go first.
drop function if exists public.my_contact_state();
drop function if exists public.family_contact_state(uuid);

create or replace function public.family_contact_state(p_family_id uuid)
returns table (
  family_id uuid,
  free_contacts_limit int,
  free_contacts_used int,
  free_contacts_remaining int,
  subscription_active boolean,
  can_contact boolean,
  plan public.subscription_plan,
  current_period_end timestamptz,
  promo_active boolean,
  promo_ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select free_contacts, promo_ends_at from public.pricing_config where id
  ),
  promo as (
    select public.promo_active() as active
  ),
  used as (
    -- Unchanged, and the reason this works. Contacts opened during the window
    -- are written with consumed_free_credit = false, so they were never in
    -- this count in the first place.
    select count(*)::int as n
      from public.family_nanny_contacts c
     where c.family_id = p_family_id
       and c.consumed_free_credit
  ),
  sub as (
    select s.plan, s.current_period_end
      from public.subscriptions s
     where s.family_id = p_family_id
       and s.status in ('active', 'past_due', 'cancelled')
       and s.current_period_end > now()
     order by s.current_period_end desc
     limit 1
  )
  select
    p_family_id,
    cfg.free_contacts,
    used.n,
    greatest(cfg.free_contacts - used.n, 0),
    sub.plan is not null,
    -- During the window nobody is stopped, subscriber or not.
    promo.active or (sub.plan is not null) or (used.n < cfg.free_contacts),
    sub.plan,
    sub.current_period_end,
    promo.active,
    cfg.promo_ends_at
  from cfg
  cross join promo
  cross join used
  left join sub on true;
$$;

comment on function public.family_contact_state(uuid) is
  'Authoritative contact entitlement for a family. Never compute this in the client.';

create or replace function public.my_contact_state()
returns table (
  family_id uuid,
  free_contacts_limit int,
  free_contacts_used int,
  free_contacts_remaining int,
  subscription_active boolean,
  can_contact boolean,
  plan public.subscription_plan,
  current_period_end timestamptz,
  promo_active boolean,
  promo_ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.*
    from public.family_profiles f
    cross join lateral public.family_contact_state(f.id) s
   where f.user_id = auth.uid();
$$;

grant execute on function public.family_contact_state(uuid) to authenticated;
grant execute on function public.my_contact_state() to authenticated;

-- ---------------------------------------------------------------------------
-- Opening a conversation
-- ---------------------------------------------------------------------------

-- Reproduced in full because the change is inside the body. Exactly one line
-- differs from the original in 20260813120700: the value of v_consumed.
create or replace function public.start_conversation(
  p_nanny_id uuid,
  p_source public.contact_source default 'profile',
  p_first_message text default null,
  p_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_conversation_id uuid;
  v_existing boolean := false;
  v_state record;
  v_consumed boolean := false;
  v_message_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = 'ROLE1';
  end if;

  select f.id into v_family_id
    from public.family_profiles f
    join public.users u on u.id = f.user_id
   where f.user_id = v_user_id
     and u.role = 'family'
     and u.status = 'active';

  if v_family_id is null then
    raise exception 'Only an active family account can start a conversation'
      using errcode = 'ROLE1';
  end if;

  -- Serialise per family so concurrent requests cannot overspend the allowance.
  perform pg_advisory_xact_lock(hashtextextended(v_family_id::text, 0));

  if not exists (
    select 1 from public.nanny_profiles n
      join public.users nu on nu.id = n.user_id
     where n.id = p_nanny_id
       and n.status = 'approved'
       and nu.status = 'active'
  ) then
    raise exception 'This nanny profile is not available for contact'
      using errcode = 'NANN1';
  end if;

  select id into v_conversation_id
    from public.conversations
   where family_id = v_family_id and nanny_id = p_nanny_id;

  if v_conversation_id is not null then
    -- Already contacted: reopening never costs a second credit (PRD §16).
    v_existing := true;
  else
    select * into v_state from public.family_contact_state(v_family_id);

    if not v_state.can_contact then
      raise exception 'Free nanny contacts exhausted' using errcode = 'PAYW1';
    end if;

    -- The one changed line. During the launch window a contact costs nothing
    -- and is not counted, so a family that tries the product early still has
    -- its full allowance the day the window closes.
    v_consumed := not v_state.subscription_active and not v_state.promo_active;

    insert into public.conversations (family_id, nanny_id, job_id)
    values (v_family_id, p_nanny_id, p_job_id)
    returning id into v_conversation_id;

    insert into public.family_nanny_contacts (
      family_id, nanny_id, conversation_id, source, consumed_free_credit
    )
    values (v_family_id, p_nanny_id, v_conversation_id, p_source, v_consumed);

    insert into public.analytics_events (user_id, family_id, event, properties)
    values (
      v_user_id,
      v_family_id,
      'nanny_contacted',
      jsonb_build_object(
        'nanny_id', p_nanny_id,
        'source', p_source,
        'consumed_free_credit', v_consumed,
        'during_promo', v_state.promo_active,
        'contact_index', (
          select count(*) from public.family_nanny_contacts where family_id = v_family_id
        )
      )
    );
  end if;

  if p_first_message is not null and length(btrim(p_first_message)) > 0 then
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, v_user_id, btrim(p_first_message))
    returning id into v_message_id;
  end if;

  select * into v_state from public.family_contact_state(v_family_id);

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'already_contacted', v_existing,
    'consumed_free_credit', v_consumed,
    'free_contacts_limit', v_state.free_contacts_limit,
    'free_contacts_used', v_state.free_contacts_used,
    'free_contacts_remaining', v_state.free_contacts_remaining,
    'subscription_active', v_state.subscription_active,
    'promo_active', v_state.promo_active,
    'promo_ends_at', v_state.promo_ends_at
  );
end;
$$;

revoke all on function public.start_conversation(uuid, public.contact_source, text, uuid) from public;
grant execute on function public.start_conversation(uuid, public.contact_source, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Setting the window
-- ---------------------------------------------------------------------------

/**
 * Opens, moves or closes the launch window.
 *
 * An admin capability like any other: checks the caller itself and audits what
 * it did, because "who turned the paywall off" is a question somebody will ask.
 */
create or replace function public.admin_set_promo(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_before jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not permitted' using errcode = 'ROLE1';
  end if;

  select jsonb_build_object(
    'starts_at', promo_starts_at, 'ends_at', promo_ends_at, 'label', promo_label)
    into v_before from public.pricing_config where id;

  update public.pricing_config
     set promo_starts_at = p_starts_at,
         promo_ends_at = p_ends_at,
         promo_label = nullif(btrim(coalesce(p_label, '')), ''),
         updated_by = auth.uid()
   where id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id,
                                 before_state, after_state)
  values (auth.uid(), 'promo_changed', 'pricing_config', null, v_before,
          jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at, 'label', p_label));

  return public.promo_window();
end;
$$;

grant execute on function public.admin_set_promo(timestamptz, timestamptz, text) to authenticated;
