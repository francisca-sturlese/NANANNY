-- NaNanny UAE — free contact accounting and the paywall gate
-- (PRD §15, §16, §21, §61)
--
-- Design notes:
--   * Free usage is DERIVED from family_nanny_contacts, never stored in a counter.
--   * A contact is consumed only when a family opens a NEW conversation with a
--     nanny it has never messaged. Viewing, saving and shortlisting are free.
--   * Every mutation goes through start_conversation(), which takes a per-family
--     advisory lock so two concurrent requests cannot both spend the last credit.

create or replace function public.family_contact_state(p_family_id uuid)
returns table (
  family_id uuid,
  free_contacts_limit int,
  free_contacts_used int,
  free_contacts_remaining int,
  subscription_active boolean,
  can_contact boolean,
  plan public.subscription_plan,
  current_period_end timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select free_contacts from public.pricing_config where id
  ),
  used as (
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
    (sub.plan is not null) or (used.n < cfg.free_contacts),
    sub.plan,
    sub.current_period_end
  from cfg
  cross join used
  left join sub on true;
$$;

comment on function public.family_contact_state(uuid) is
  'Authoritative contact entitlement for a family. Never compute this in the client.';

-- Convenience wrapper for the signed-in family.
create or replace function public.my_contact_state()
returns table (
  family_id uuid,
  free_contacts_limit int,
  free_contacts_used int,
  free_contacts_remaining int,
  subscription_active boolean,
  can_contact boolean,
  plan public.subscription_plan,
  current_period_end timestamptz
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

-- Opens (or reuses) a conversation with a nanny, spending a free credit only
-- when this is a genuinely new family→nanny pair and no subscription is active.
--
-- Raises:
--   PAYW1 — free contacts exhausted and no active subscription (paywall)
--   NANN1 — nanny profile not contactable
--   ROLE1 — caller is not a family account
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

    v_consumed := not v_state.subscription_active;

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
    'subscription_active', v_state.subscription_active
  );
end;
$$;

revoke all on function public.start_conversation(uuid, public.contact_source, text, uuid) from public;
grant execute on function public.start_conversation(uuid, public.contact_source, text, uuid) to authenticated;
grant execute on function public.my_contact_state() to authenticated;
grant execute on function public.family_contact_state(uuid) to authenticated;

-- Sending a message inside an existing conversation is always free and open to
-- both sides, provided the thread is not blocked.
create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_mime text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message_id uuid;
  v_conv record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = 'ROLE1';
  end if;

  select c.*, f.user_id as family_user_id, n.user_id as nanny_user_id
    into v_conv
    from public.conversations c
    join public.family_profiles f on f.id = c.family_id
    join public.nanny_profiles n on n.id = c.nanny_id
   where c.id = p_conversation_id;

  if v_conv.id is null then
    raise exception 'Conversation not found' using errcode = 'CONV1';
  end if;

  if v_user_id <> v_conv.family_user_id and v_user_id <> v_conv.nanny_user_id then
    raise exception 'Not a participant in this conversation' using errcode = 'ROLE1';
  end if;

  if v_conv.blocked_at is not null then
    raise exception 'This conversation is blocked' using errcode = 'CONV2';
  end if;

  insert into public.messages (
    conversation_id, sender_id, body, attachment_path, attachment_name, attachment_mime
  )
  values (
    p_conversation_id, v_user_id, btrim(p_body), p_attachment_path, p_attachment_name, p_attachment_mime
  )
  returning id into v_message_id;

  return v_message_id;
end;
$$;

grant execute on function public.send_message(uuid, text, text, text, text) to authenticated;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_is_family boolean;
  v_is_nanny boolean;
begin
  select
    exists (select 1 from public.family_profiles f where f.id = c.family_id and f.user_id = v_user_id),
    exists (select 1 from public.nanny_profiles n where n.id = c.nanny_id and n.user_id = v_user_id)
    into v_is_family, v_is_nanny
    from public.conversations c
   where c.id = p_conversation_id;

  if not coalesce(v_is_family, false) and not coalesce(v_is_nanny, false) then
    raise exception 'Not a participant in this conversation' using errcode = 'ROLE1';
  end if;

  update public.conversations
     set family_unread_count = case when v_is_family then 0 else family_unread_count end,
         nanny_unread_count  = case when v_is_nanny  then 0 else nanny_unread_count end
   where id = p_conversation_id;

  update public.messages
     set read_at = now()
   where conversation_id = p_conversation_id
     and sender_id <> v_user_id
     and read_at is null;
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;
