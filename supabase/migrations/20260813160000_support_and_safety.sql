-- NaNanny UAE — support and safety (PRD §40)
--
-- The reports table and the admin moderation queue already existed, but nothing
-- could ever put a row in them: there was no way for a user to report anything.
-- A moderation queue that cannot receive a report is decoration.
--
-- This adds the missing half: a way to report, a way to block, and a way to ask
-- for help that reaches someone.

-- ---------------------------------------------------------------------------
-- Support requests
-- ---------------------------------------------------------------------------

-- Separate from `reports` on purpose. A report is about somebody else's
-- behaviour and needs moderation. A support request is about a problem the
-- person is having, and needs an answer. Mixing them makes both queues worse.
create table public.support_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  -- Kept even when the account is gone, so a thread can still be answered.
  contact_email extensions.citext not null,
  contact_name text,
  category text not null check (category in (
    'account', 'profile', 'billing', 'safety', 'technical', 'other'
  )),
  subject text not null,
  message text not null check (length(btrim(message)) >= 10),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'answered', 'closed')),
  internal_note text,
  handled_by uuid references public.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_requests_status_idx on public.support_requests (status, created_at desc);
create index support_requests_user_idx on public.support_requests (user_id, created_at desc);

create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

alter table public.support_requests enable row level security;

-- Anyone may open one, signed in or not: someone locked out of their account
-- is exactly the person who most needs to reach us.
create policy support_requests_insert_anyone on public.support_requests
  for insert to anon, authenticated
  with check (
    user_id is null or user_id = auth.uid()
  );

create policy support_requests_own_read on public.support_requests
  for select to authenticated
  using (user_id = auth.uid());

create policy support_requests_admin on public.support_requests
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant insert on public.support_requests to anon, authenticated;
grant select, update on public.support_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

-- A general support request has no target; a report always does. Reports also
-- gain a free-text reason list so the queue can be read at a glance.
comment on table public.reports is
  'User reports about a profile, message, job or review. Filed through report_content(), which resolves who is being reported so an admin does not have to.';

/**
 * Files a report.
 *
 * SECURITY DEFINER so it can look up who owns the reported thing: a reporter
 * knows the message they are looking at, not the account behind it, and an
 * admin should not have to work that out by hand at 2am.
 */
create or replace function public.report_content(
  p_target_kind text,
  p_target_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter uuid := auth.uid();
  v_reported_user uuid;
begin
  if v_reporter is null then
    raise exception 'Please log in to report something' using errcode = 'ROLE1';
  end if;

  if p_target_kind not in ('profile', 'message', 'job', 'review', 'user') then
    raise exception 'Unknown report target' using errcode = 'RPT1';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Choose a reason' using errcode = 'RPT1';
  end if;

  -- Resolve the account behind whatever was reported.
  if p_target_kind = 'profile' then
    select user_id into v_reported_user from public.nanny_profiles where id = p_target_id;
  elsif p_target_kind = 'message' then
    select sender_id into v_reported_user from public.messages where id = p_target_id;
  elsif p_target_kind = 'job' then
    select f.user_id into v_reported_user
      from public.jobs j join public.family_profiles f on f.id = j.family_id
     where j.id = p_target_id;
  elsif p_target_kind = 'review' then
    select author_id into v_reported_user from public.reviews where id = p_target_id;
  elsif p_target_kind = 'user' then
    v_reported_user := p_target_id;
  end if;

  if v_reported_user is null then
    raise exception 'That content no longer exists' using errcode = 'RPT2';
  end if;

  if v_reported_user = v_reporter then
    raise exception 'You cannot report your own content' using errcode = 'RPT1';
  end if;

  -- One open report per person per thing. Repeatedly tapping report should not
  -- flood the queue with duplicates of the same complaint.
  if exists (
    select 1 from public.reports
     where reporter_id = v_reporter
       and target_kind = p_target_kind
       and target_id = p_target_id
       and status in ('open', 'under_review')
  ) then
    return jsonb_build_object('already_reported', true);
  end if;

  insert into public.reports (
    reporter_id, target_kind, target_id, reported_user_id, reason, details
  )
  values (v_reporter, p_target_kind, p_target_id, v_reported_user, p_reason, p_details);

  return jsonb_build_object('already_reported', false);
end;
$$;

grant execute on function public.report_content(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Blocking
-- ---------------------------------------------------------------------------

/**
 * Blocks someone, and closes any conversation with them.
 *
 * Blocking has to stop messages in both directions immediately. Recording the
 * block without touching the conversation would leave the thread open and the
 * other person still able to write.
 */
create or replace function public.block_user(p_blocked_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocker uuid := auth.uid();
  v_conversations int := 0;
begin
  if v_blocker is null then
    raise exception 'Please log in' using errcode = 'ROLE1';
  end if;
  if p_blocked_id = v_blocker then
    raise exception 'You cannot block yourself' using errcode = 'RPT1';
  end if;

  insert into public.blocks (blocker_id, blocked_id, reason)
  values (v_blocker, p_blocked_id, p_reason)
  on conflict (blocker_id, blocked_id) do nothing;

  with closed as (
    update public.conversations c
       set blocked_by = v_blocker, blocked_at = now()
      from public.family_profiles f, public.nanny_profiles n
     where f.id = c.family_id
       and n.id = c.nanny_id
       and c.blocked_at is null
       and (
         (f.user_id = v_blocker and n.user_id = p_blocked_id)
         or (n.user_id = v_blocker and f.user_id = p_blocked_id)
       )
    returning 1
  )
  select count(*) into v_conversations from closed;

  return jsonb_build_object('blocked', true, 'conversations_closed', v_conversations);
end;
$$;

create or replace function public.unblock_user(p_blocked_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_blocker uuid := auth.uid();
begin
  if v_blocker is null then
    raise exception 'Please log in' using errcode = 'ROLE1';
  end if;

  delete from public.blocks where blocker_id = v_blocker and blocked_id = p_blocked_id;

  -- Reopen only threads this person closed. A block by the other side stands.
  update public.conversations c
     set blocked_by = null, blocked_at = null
    from public.family_profiles f, public.nanny_profiles n
   where f.id = c.family_id
     and n.id = c.nanny_id
     and c.blocked_by = v_blocker
     and (
       (f.user_id = v_blocker and n.user_id = p_blocked_id)
       or (n.user_id = v_blocker and f.user_id = p_blocked_id)
     );

  return jsonb_build_object('blocked', false);
end;
$$;

grant execute on function public.block_user(uuid, text) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: answering support
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_support_request(
  p_request_id uuid,
  p_status text,
  p_internal_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_before text;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  if p_status not in ('open', 'in_progress', 'answered', 'closed') then
    raise exception 'Unknown status' using errcode = 'ADMN3';
  end if;

  select status into v_before from public.support_requests where id = p_request_id;
  if v_before is null then
    raise exception 'Request not found' using errcode = 'ADMN2';
  end if;

  update public.support_requests
     set status = p_status,
         internal_note = coalesce(p_internal_note, internal_note),
         handled_by = auth.uid(),
         handled_at = now()
   where id = p_request_id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, before_state, after_state)
  values (auth.uid(), 'support_updated', 'support_request', p_request_id,
          jsonb_build_object('status', v_before),
          jsonb_build_object('status', p_status));

  return jsonb_build_object('status', p_status);
end;
$$;

grant execute on function public.admin_update_support_request(uuid, text, text) to authenticated;
