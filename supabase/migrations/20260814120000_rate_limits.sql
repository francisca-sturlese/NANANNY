-- Rate limiting for the actions that can reach another human.
--
-- In the database rather than in the app, for two reasons. The app is heading
-- for a serverless host where nothing is shared between requests, so an
-- in-memory counter would reset constantly and limit nothing. And these actions
-- are database functions already: a limit enforced anywhere else is a limit an
-- attacker can skip by calling the function directly with a stolen anon key.
--
-- Auth itself is already limited by GoTrue (see [auth.rate_limit] in
-- config.toml). This covers what happens after someone is signed in: messages,
-- reports, and support requests, which are the three ways one account can put
-- unwanted text in front of another person.
--
-- Applied with triggers rather than by rewriting each function. Copying a
-- function body to insert one line is how a `btrim` goes missing.

create table if not exists public.rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

comment on table public.rate_limit_hits is
  'One row per attempt at a limited action. Pruned by consume_rate_limit().';

create index if not exists rate_limit_hits_lookup_idx
  on public.rate_limit_hits (user_id, action, created_at desc);

alter table public.rate_limit_hits enable row level security;

-- Nobody reads or writes this directly. Only the SECURITY DEFINER function
-- below touches it, which is what stops a client deleting its own history to
-- reset the limit.
revoke all on public.rate_limit_hits from anon, authenticated;

create policy rate_limit_hits_admin on public.rate_limit_hits
  for select using (public.is_admin());

/**
 * Records an attempt and raises if the caller has had too many.
 *
 * Counts inside a sliding window rather than resetting on the hour, so
 * somebody who exhausts a limit at 10:59 does not get a fresh allowance at
 * 11:00. Old rows for this user and action are pruned on the way through,
 * which keeps the table from growing without a scheduled job to run.
 */
create or replace function public.consume_rate_limit(
  p_action text,
  p_limit int,
  p_window interval,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_used int;
  v_is_admin boolean;
begin
  -- Nobody to count against. Support requests written by a signed out visitor
  -- land here, and there is genuinely no per user counter to keep: those are
  -- limited per IP at the edge instead. Everything else with a null uid is the
  -- service role or a migration.
  if v_user_id is null then
    return;
  end if;

  -- Admins moderating a queue are not the abuse case either. Checked against
  -- the row rather than the session, because the caller may be the service
  -- role acting on someone's behalf.
  select role in ('admin', 'super_admin') into v_is_admin
    from public.users where id = v_user_id;
  if coalesce(v_is_admin, false) then
    return;
  end if;

  delete from public.rate_limit_hits
   where user_id = v_user_id
     and action = p_action
     and created_at < now() - p_window;

  select count(*) into v_used
    from public.rate_limit_hits
   where user_id = v_user_id
     and action = p_action;

  if v_used >= p_limit then
    raise exception 'Too many % in a short time. Please wait a little and try again.', p_action
      using errcode = 'RATE1';
  end if;

  insert into public.rate_limit_hits (user_id, action) values (v_user_id, p_action);
end;
$$;

-- Called only from triggers, never from a client.
revoke execute on function public.consume_rate_limit(text, int, interval, uuid)
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The limits themselves
-- ---------------------------------------------------------------------------

/**
 * 60 messages an hour.
 *
 * Set well above a real conversation and well below a script. A family
 * arranging an interview sends a handful; nobody types sixty in an hour by
 * hand, and the ceiling stops a compromised account filling an inbox.
 */
create or replace function public.limit_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.consume_rate_limit('messages', 60, interval '1 hour');
  return new;
end;
$$;

create trigger messages_rate_limit
  before insert on public.messages
  for each row
  execute function public.limit_messages();

/**
 * 10 reports a day.
 *
 * Reporting must stay easy, so the limit is generous. It exists because a
 * report puts a real person in front of a moderator, and a script filing
 * hundreds would bury the ones that matter.
 */
create or replace function public.limit_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.consume_rate_limit('reports', 10, interval '1 day');
  return new;
end;
$$;

create trigger reports_rate_limit
  before insert on public.reports
  for each row
  execute function public.limit_reports();

/**
 * 5 support requests an hour.
 *
 * Counted against the row's user_id, not against auth.uid(). The support form
 * is submitted through the service client so that someone signed out can use
 * it, which means there is no session inside this trigger and reading
 * auth.uid() would silently limit nobody at all.
 *
 * Anyone signed out may still write in, deliberately: a person locked out of
 * their account is exactly who needs support. Those carry no user id and are
 * limited per IP at the edge instead.
 */
create or replace function public.limit_support_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.consume_rate_limit('support requests', 5, interval '1 hour', new.user_id);
  return new;
end;
$$;

create trigger support_requests_rate_limit
  before insert on public.support_requests
  for each row
  execute function public.limit_support_requests();
