-- Reminders for people who have gone quiet.
--
-- Two of them, one mechanism.
--
--   nudge   somebody made a profile and then posted nothing. A family with no
--           job and no conversation, or a nanny whose profile is still a draft.
--   unread  somebody has messages waiting that they have not opened.
--
-- The unread one needs no "last seen" tracking. Opening a thread marks it read,
-- so a message that is still unread after several hours is itself the evidence
-- that they have not been back. Using the data we already keep is better than
-- writing a timestamp on every page view, which on this deployment target would
-- be a database write per request.
--
-- Everything about when and to whom lives in one row, so the thresholds can be
-- tuned without a deploy. Nobody knows yet whether "a long time" is four hours
-- or three days, and guessing in code means guessing permanently.

create table public.reminder_config (
  id boolean primary key default true check (id),

  /**
   * Who is eligible at all.
   *
   *   paying    only families with an active subscription
   *   everyone  anybody who meets the other conditions
   *   off       nobody
   *
   * Defaults to `paying`, which is what was asked for. Worth knowing what that
   * means in practice: no payments are live yet and the launch window makes
   * everything free, so today it reaches nobody. It also never reaches a nanny,
   * because nannies do not pay and never will. The side of a marketplace that
   * most needs telling about an unread message is the side that cannot pay to
   * hear about it.
   */
  audience text not null default 'paying'
    check (audience in ('paying', 'everyone', 'off')),

  -- After a profile exists and nothing has been posted.
  nudge_after_hours int not null default 48 check (nudge_after_hours > 0),

  -- After a message has sat unread.
  unread_after_hours int not null default 24 check (unread_after_hours > 0),

  -- However long they stay away, at most one of each per this many hours.
  min_gap_hours int not null default 168 check (min_gap_hours > 0),

  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.reminder_config (id) values (true);

create trigger reminder_config_set_updated_at
  before update on public.reminder_config
  for each row execute function public.set_updated_at();

alter table public.reminder_config enable row level security;

create policy reminder_config_read on public.reminder_config
  for select to authenticated using (public.is_admin());

grant select on public.reminder_config to authenticated;

-- ---------------------------------------------------------------------------

/**
 * Who is due a reminder right now, and which one.
 *
 * Returns the list rather than sending anything: the sending lives in the app,
 * where the templates and the provider already are, and a function that only
 * reads is one that can be run by hand to see what would happen.
 *
 * The `min_gap_hours` window is enforced by the same unique index on
 * `email_events.idempotency_key` that the message notification used, so
 * somebody who stays away for a month gets one reminder a week rather than one
 * an hour.
 */
create or replace function public.due_reminders(p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.reminder_config;
  v_bucket text;
  result jsonb;
begin
  select * into cfg from public.reminder_config where id;

  if cfg.audience = 'off' then
    return '[]'::jsonb;
  end if;

  -- One bucket per gap window, so the key repeats until the window rolls over.
  v_bucket := to_char(
    to_timestamp(floor(extract(epoch from now()) / (cfg.min_gap_hours * 3600))
                 * cfg.min_gap_hours * 3600),
    'YYYYMMDDHH24');

  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) into result
    from (
      -- Unread messages waiting.
      select u.id as user_id,
             u.email,
             coalesce(u.first_name, 'there') as name,
             'unread'::text as reason,
             count(distinct m.conversation_id)::int as conversations,
             count(*)::int as messages,
             format('reminder:unread:%s:%s', u.id, v_bucket) as dedupe_key
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
        join public.family_profiles f on f.id = c.family_id
        join public.nanny_profiles n on n.id = c.nanny_id
        join public.users u
          on u.id = case when m.sender_id = f.user_id then n.user_id else f.user_id end
       where m.read_at is null
         and m.created_at < now() - make_interval(hours => cfg.unread_after_hours)
         and c.blocked_at is null
         and u.status = 'active'
         and (cfg.audience = 'everyone' or public.has_active_subscription(f.id))
       group by u.id, u.email, u.first_name

      union all

      -- A family that made a profile and never posted or messaged anybody.
      select u.id, u.email, coalesce(u.first_name, 'there'), 'nudge_family', 0, 0,
             format('reminder:nudge:%s:%s', u.id, v_bucket)
        from public.family_profiles f
        join public.users u on u.id = f.user_id
       where f.created_at < now() - make_interval(hours => cfg.nudge_after_hours)
         and u.status = 'active'
         and (cfg.audience = 'everyone' or public.has_active_subscription(f.id))
         and not exists (select 1 from public.jobs j where j.family_id = f.id)
         and not exists (select 1 from public.conversations c where c.family_id = f.id)

      union all

      -- A nanny whose profile never left draft. Never eligible while the
      -- audience is `paying`, because a nanny does not pay.
      select u.id, u.email, coalesce(u.first_name, 'there'), 'nudge_nanny', 0, 0,
             format('reminder:nudge:%s:%s', u.id, v_bucket)
        from public.nanny_profiles n
        join public.users u on u.id = n.user_id
       where cfg.audience = 'everyone'
         and n.created_at < now() - make_interval(hours => cfg.nudge_after_hours)
         and u.status = 'active'
         and n.status = 'draft'
    ) r
   where not exists (
     select 1 from public.email_events e
      where e.idempotency_key = r.dedupe_key
   )
   limit greatest(p_limit, 1);

  return result;
end;
$$;

revoke execute on function public.due_reminders(int) from public;
grant execute on function public.due_reminders(int) to service_role;

/**
 * Claims a reminder before it is sent.
 *
 * Returns the event id when this caller got it, and null when somebody else
 * already had. Two schedulers firing at once is a normal thing to happen, and
 * a duplicate reminder is exactly the annoyance this feature is meant to avoid.
 */
create or replace function public.claim_reminder(
  p_user_id uuid,
  p_email text,
  p_reason text,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.email_events (
    user_id, email_type, recipient, subject, metadata, status, idempotency_key
  )
  values (
    p_user_id, 'reminder_' || p_reason, p_email,
    'A reminder from NaNanny',
    jsonb_build_object('reason', p_reason),
    'queued', p_dedupe_key
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.claim_reminder(uuid, text, text, text) from public;
grant execute on function public.claim_reminder(uuid, text, text, text) to service_role;

/** Admin control over when these go out, audited like every other setting. */
create or replace function public.admin_update_reminders(
  p_audience text,
  p_nudge_after_hours int,
  p_unread_after_hours int,
  p_min_gap_hours int
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

  select to_jsonb(r) into v_before from public.reminder_config r where id;

  update public.reminder_config
     set audience = p_audience,
         nudge_after_hours = p_nudge_after_hours,
         unread_after_hours = p_unread_after_hours,
         min_gap_hours = p_min_gap_hours,
         updated_by = auth.uid()
   where id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id,
                                 before_state, after_state)
  select auth.uid(), 'reminders_changed', 'reminder_config', null, v_before, to_jsonb(r)
    from public.reminder_config r where id;

  return (select to_jsonb(r) from public.reminder_config r where id);
end;
$$;

grant execute on function public.admin_update_reminders(text, int, int, int) to authenticated;
