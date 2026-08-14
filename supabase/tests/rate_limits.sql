-- Rate limits, proven by hitting them.
--
-- A limit nobody has tripped on purpose is a limit that might not be wired up.
-- Each case here drives the real path, through auth.uid(), until it is refused.
--
-- Run with:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f this-file
-- Rolled back at the end.

begin;

\set QUIET on

-- The launch window suspends the paywall for everybody, which is what this file
-- exists to test the absence of. Closed inside the transaction, so it is rolled
-- back with the rest and a window open in the database is left exactly as it
-- was found. Without this the suite fails and reads as a broken gate.
update public.pricing_config set promo_starts_at = null, promo_ends_at = null;

\set ON_ERROR_STOP on

\set family_uid '''41111111-1111-4111-8111-111111111111'''
\set nanny_uid  '''42222222-2222-4222-8222-222222222221'''
\set other_uid  '''43333333-3333-4333-8333-333333333331'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  (:family_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rl-family@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Rate","last_name":"Limit"}'::jsonb, now(), now()),
  (:nanny_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rl-nanny@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Nanny"}'::jsonb, now(), now()),
  (:other_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rl-other@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Other"}'::jsonb, now(), now());

insert into public.family_profiles (user_id, emirate, area, children_count)
values (:family_uid::uuid, 'Dubai', 'Dubai Hills', 1);

insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
values (:nanny_uid::uuid, 'approved', 'Dubai', 5, 'Nanny'),
       (:other_uid::uuid, 'approved', 'Dubai', 5, 'Other');

-- report_content() already refuses a second open report of the same thing, so
-- reaching the daily limit needs distinct targets. Fifteen of them.
do $$
declare uid uuid;
begin
  for i in 1..15 loop
    uid := ('44444444-4444-4444-8444-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'rl-target' || i || '@test.local', '', now(), '{}'::jsonb,
            '{"role":"nanny","first_name":"Target"}'::jsonb, now(), now());
    insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
    values (uid, 'approved', 'Dubai', 3, 'Target ' || i);
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :family_uid, 'role', 'authenticated')::text, true);

-- One conversation to send into.
select public.start_conversation(
  (select id from public.nanny_profiles where user_id = :nanny_uid::uuid),
  'profile'::public.contact_source,
  'Hello, are you available for an interview this week?');

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. A normal exchange is never refused
-- ---------------------------------------------------------------------------
do $$
declare conv uuid;
begin
  select id into conv from public.conversations
   where family_id = (select id from public.family_profiles
                       where user_id = '41111111-1111-4111-8111-111111111111');

  for i in 1..12 loop
    perform public.send_message(conv, 'Message number ' || i);
  end loop;

  raise notice 'PASS 1  twelve messages in a row go through';
exception when others then
  raise notice 'FAIL 1  a normal conversation was refused: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 2. A script is stopped
-- ---------------------------------------------------------------------------
do $$
declare
  conv uuid;
  sent int := 0;
begin
  select id into conv from public.conversations
   where family_id = (select id from public.family_profiles
                       where user_id = '41111111-1111-4111-8111-111111111111');

  -- The exception is caught inside the loop on purpose. A block that wraps the
  -- whole loop is one subtransaction, so raising at the end rolls back every
  -- successful send along with the recorded attempts, and the next test sees a
  -- clean counter. Each send is its own transaction in the real app.
  for i in 1..200 loop
    begin
      perform public.send_message(conv, 'Flood ' || i);
      sent := sent + 1;
    exception when sqlstate 'RATE1' then
      raise notice 'PASS 2  refused after % more (60 an hour)', sent;
      return;
    end;
  end loop;

  raise notice 'FAIL 2  two hundred messages went through unchecked';
end $$;

-- ---------------------------------------------------------------------------
-- 3. The refusal says what to do, not just that something failed
-- ---------------------------------------------------------------------------
do $$
declare conv uuid; msg text;
begin
  select id into conv from public.conversations
   where family_id = (select id from public.family_profiles
                       where user_id = '41111111-1111-4111-8111-111111111111');
  begin
    perform public.send_message(conv, 'One more');
    raise notice 'FAIL 3  still accepting messages';
  exception when sqlstate 'RATE1' then
    msg := sqlerrm;
    if msg like '%wait%' and msg like '%try again%' then
      raise notice 'PASS 3  the message tells the sender what to do';
    else
      raise notice 'FAIL 3  unhelpful message: %', msg;
    end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The limit is per person, not global
-- ---------------------------------------------------------------------------
do $$
declare conv uuid;
begin
  select id into conv from public.conversations
   where family_id = (select id from public.family_profiles
                       where user_id = '41111111-1111-4111-8111-111111111111');

  -- The nanny on the other side of the same conversation is unaffected.
  perform set_config('request.jwt.claims',
    json_build_object('sub', '42222222-2222-4222-8222-222222222221',
                      'role', 'authenticated')::text, true);

  perform public.send_message(conv, 'Yes, Thursday morning works for me.');
  raise notice 'PASS 4  the other participant can still reply';
exception when others then
  raise notice 'FAIL 4  one sender hitting the limit silenced the other: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 5. A user cannot clear their own history to reset the limit
-- ---------------------------------------------------------------------------
do $$
declare removed int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '41111111-1111-4111-8111-111111111111',
                      'role', 'authenticated')::text, true);
  begin
    delete from public.rate_limit_hits
     where user_id = '41111111-1111-4111-8111-111111111111';
    get diagnostics removed = row_count;
    if removed > 0 then
      raise notice 'FAIL 5  a user deleted % of their own rate limit rows', removed;
    else
      raise notice 'PASS 5  deleting rate limit rows removes nothing';
    end if;
  exception when insufficient_privilege then
    raise notice 'PASS 5  a user cannot touch the rate limit table';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Reports are limited too, and generously
-- ---------------------------------------------------------------------------
do $$
declare filed int := 0;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '41111111-1111-4111-8111-111111111111',
                      'role', 'authenticated')::text, true);
  for i in 1..15 loop
    begin
      perform public.report_content(
        'profile',
        (select id from public.nanny_profiles
          where user_id = ('44444444-4444-4444-8444-' || lpad(i::text, 12, '0'))::uuid),
        'spam',
        'Report number ' || i);
      filed := filed + 1;
    exception when sqlstate 'RATE1' then
      if filed >= 5 then
        raise notice 'PASS 6  refused after % reports (10 a day)', filed;
      else
        raise notice 'FAIL 6  reporting is too hard: refused after only %', filed;
      end if;
      return;
    end;
  end loop;

  raise notice 'FAIL 6  fifteen reports went through unchecked';
end $$;

-- ---------------------------------------------------------------------------
-- 7. An admin moderating is not throttled
-- ---------------------------------------------------------------------------
do $$
declare conv uuid; admin_uid uuid;
begin
  set local role postgres;
  select id into admin_uid from public.users where role in ('admin', 'super_admin') limit 1;

  if admin_uid is null then
    raise notice 'SKIP 7  no admin in the database';
    return;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_uid, 'role', 'authenticated')::text, true);

  for i in 1..80 loop
    perform public.consume_rate_limit('messages', 60, interval '1 hour');
  end loop;

  raise notice 'PASS 7  an admin is not throttled';
exception when sqlstate 'RATE1' then
  raise notice 'FAIL 7  an admin was throttled while moderating';
end $$;

-- ---------------------------------------------------------------------------
-- 8. The window slides: old attempts stop counting
-- ---------------------------------------------------------------------------
do $$
declare conv uuid;
begin
  set local role postgres;
  -- Age every recorded attempt past the window, as the clock would.
  update public.rate_limit_hits set created_at = created_at - interval '2 hours'
   where user_id = '41111111-1111-4111-8111-111111111111';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '41111111-1111-4111-8111-111111111111',
                      'role', 'authenticated')::text, true);

  select id into conv from public.conversations
   where family_id = (select id from public.family_profiles
                       where user_id = '41111111-1111-4111-8111-111111111111');

  perform public.send_message(conv, 'An hour later, this should work.');
  raise notice 'PASS 8  the window slides rather than locking the account';
exception when others then
  raise notice 'FAIL 8  still refused after the window passed: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Support requests are limited even though they are written by the service
--    role, which has no session of its own
-- ---------------------------------------------------------------------------
do $$
declare opened int := 0;
begin
  set local role service_role;
  perform set_config('request.jwt.claims', null, true);

  for i in 1..12 loop
    begin
      insert into public.support_requests (user_id, contact_email, category, subject, message)
      values ('41111111-1111-4111-8111-111111111111', 'rl-family@test.local',
              'other', 'Subject ' || i, 'Message body number ' || i);
      opened := opened + 1;
    exception when sqlstate 'RATE1' then
      if opened = 5 then
        raise notice 'PASS 9  refused after % support requests (5 an hour)', opened;
      else
        raise notice 'FAIL 9  refused after % rather than 5', opened;
      end if;
      return;
    end;
  end loop;

  raise notice 'FAIL 9  twelve support requests went through unchecked';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Someone signed out can still write in
-- ---------------------------------------------------------------------------
do $$
declare opened int := 0;
begin
  set local role service_role;
  for i in 1..8 loop
    insert into public.support_requests (user_id, contact_email, category, subject, message)
    values (null, 'locked-out@test.local', 'account',
            'Locked out ' || i, 'I cannot sign in and need help getting back in.');
    opened := opened + 1;
  end loop;

  raise notice 'PASS 10 a locked out visitor is never blocked from asking for help';
exception when others then
  raise notice 'FAIL 10 a signed out visitor was refused: %', sqlerrm;
end $$;

rollback;
