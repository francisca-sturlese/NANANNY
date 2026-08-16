-- Saying no to reminder mail, and seeing the nanny who never started.
--
-- What this proves: a nanny who signed up and never opened the onboarding is
-- now due the nudge (the original query started from nanny_profiles and could
-- not see her), a row in email_optouts silences every reminder for that user,
-- and the optout table is not reachable from a session.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;
\set QUIET on
update public.reminder_config set audience = 'everyone';
\set QUIET off

-- 1. a nanny with no profile row at all is due the nudge after the threshold
do $$
declare uid uuid := extensions.gen_random_uuid(); due jsonb;
begin
  set local role postgres;
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  values (uid, 'neverstarted@example.test', '{"role":"nanny"}'::jsonb, now(), now());
  update public.users set created_at = now() - interval '3 days' where id = uid;

  due := public.due_reminders();
  if exists (select 1 from jsonb_array_elements(due) e
              where (e->>'user_id')::uuid = uid and e->>'reason' = 'nudge_nanny') then
    raise notice 'PASS 1  the nanny who never opened onboarding is due the nudge';
  else
    raise notice 'FAIL 1  she is still invisible: %', due;
  end if;
end $$;

-- 2. a fresh signup is not nudged before the threshold
do $$
declare uid uuid := extensions.gen_random_uuid(); due jsonb;
begin
  set local role postgres;
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  values (uid, 'brandnew@example.test', '{"role":"nanny"}'::jsonb, now(), now());

  due := public.due_reminders();
  if exists (select 1 from jsonb_array_elements(due) e
              where (e->>'user_id')::uuid = uid) then
    raise notice 'FAIL 2  a nanny who signed up just now was nudged';
  else
    raise notice 'PASS 2  no nudge before the threshold';
  end if;
end $$;

-- 3. an opt out silences the nudge
do $$
declare uid uuid; due jsonb;
begin
  set local role postgres;
  select id into uid from public.users where email = 'neverstarted@example.test';
  insert into public.email_optouts (user_id) values (uid);

  due := public.due_reminders();
  if exists (select 1 from jsonb_array_elements(due) e
              where (e->>'user_id')::uuid = uid) then
    raise notice 'FAIL 3  an opted out user is still listed';
  else
    raise notice 'PASS 3  an opt out silences every reminder for that user';
  end if;
end $$;

-- 4. the optout table is not reachable from a session
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  begin
    perform * from public.email_optouts limit 1;
    raise notice 'FAIL 4  a session can read email_optouts';
  exception when others then
    raise notice 'PASS 4  email_optouts is closed to sessions';
  end;
end $$;

rollback;
