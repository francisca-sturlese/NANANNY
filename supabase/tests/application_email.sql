-- One email a day about applications, and it has to be true all day.
--
-- The cap is the point. A family that posts a good job can receive four
-- applications in an afternoon, and four emails is how a notification somebody
-- wanted becomes a filter rule. But a cap creates its own bug: the email covers
-- everything that arrives for the rest of the day, so anything it says about
-- one application stops being true the moment the second one lands.
--
-- So the two things tested here are that the second one sends nothing, and that
-- what the first one carries is a count read at the time of sending rather than
-- anything about the application that triggered it.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on

\set family_uid '''6c111111-1111-4111-8111-11111111111c'''
\set nanny1_uid '''6c222222-2222-4222-8222-22222222222c'''
\set nanny2_uid '''6c333333-3333-4333-8333-33333333333c'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  (:family_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'app-family@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Hana"}'::jsonb, now(), now()),
  (:nanny1_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'app-nanny1@test.local', '', now(), '{}'::jsonb,
   '{"role":"nanny","first_name":"Josphine"}'::jsonb, now(), now()),
  (:nanny2_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'app-nanny2@test.local', '', now(), '{}'::jsonb,
   '{"role":"nanny","first_name":"Olivia"}'::jsonb, now(), now());

insert into public.family_profiles (user_id, emirate, area, children_count, display_name)
values (:family_uid::uuid, 'Dubai', 'Mirdif', 2, 'The Applied family');

insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
values
  (:nanny1_uid::uuid, 'approved', 'Dubai', 5, 'Josphine'),
  (:nanny2_uid::uuid, 'approved', 'Dubai', 7, 'Olivia');

insert into public.jobs (family_id, title, emirate, area, status)
values
  ((select id from public.family_profiles where user_id = :family_uid::uuid),
   'Live out help in Mirdif', 'Dubai', 'Mirdif', 'active'),
  ((select id from public.family_profiles where user_id = :family_uid::uuid),
   'Weekend cover', 'Dubai', 'Mirdif', 'active');

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. The first application of the day sends
-- ---------------------------------------------------------------------------
do $$
declare v_job uuid; decision jsonb;
begin
  select id into v_job from public.jobs where title = 'Live out help in Mirdif';

  insert into public.job_applications (job_id, nanny_id, cover_note)
  values (v_job, (select id from public.nanny_profiles
                   where user_id = '6c222222-2222-4222-8222-22222222222c'),
          'I have five years with toddlers.');

  decision := public.notify_application_email(v_job);

  if (decision ->> 'send')::boolean
     and decision ->> 'to' = 'app-family@test.local'
     and (decision ->> 'waiting')::int = 1 then
    raise notice 'PASS 1  the family is told, with a count rather than a name';
  else
    raise notice 'FAIL 1  %', decision;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The second one the same day sends nothing
-- ---------------------------------------------------------------------------
do $$
declare v_job uuid; decision jsonb;
begin
  select id into v_job from public.jobs where title = 'Weekend cover';

  insert into public.job_applications (job_id, nanny_id)
  values (v_job, (select id from public.nanny_profiles
                   where user_id = '6c333333-3333-4333-8333-33333333333c'));

  decision := public.notify_application_email(v_job);

  if not (decision ->> 'send')::boolean
     and decision ->> 'reason' = 'already emailed today' then
    raise notice 'PASS 2  a second application the same day is the bell only';
  else
    raise notice 'FAIL 2  %', decision;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Exactly one event exists, whatever was tried
-- ---------------------------------------------------------------------------
do $$
declare events int;
begin
  select count(*) into events from public.email_events
   where recipient = 'app-family@test.local'
     and email_type = 'application_received';

  if events = 1 then
    raise notice 'PASS 3  one event for the day, not one per application';
  else
    raise notice 'FAIL 3  % events', events;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Tomorrow is a new day
-- ---------------------------------------------------------------------------
-- A cap that never lifts is not a cap, it is an off switch that took a week to
-- notice. The bucket is a Dubai day, so this proves the key rolls over rather
-- than proving the clock.
do $$
declare v_job uuid; key_today text; key_tomorrow text;
begin
  select id into v_job from public.jobs where title = 'Weekend cover';

  key_today := format('application_email:%s:%s',
    '6c111111-1111-4111-8111-11111111111c',
    to_char(now() at time zone 'Asia/Dubai', 'YYYYMMDD'));
  key_tomorrow := format('application_email:%s:%s',
    '6c111111-1111-4111-8111-11111111111c',
    to_char((now() + interval '1 day') at time zone 'Asia/Dubai', 'YYYYMMDD'));

  if key_today <> key_tomorrow
     and exists (select 1 from public.email_events where idempotency_key = key_today)
     and not exists (select 1 from public.email_events where idempotency_key = key_tomorrow)
  then
    raise notice 'PASS 4  the cap lifts at the start of the next Dubai day';
  else
    raise notice 'FAIL 4  today=% tomorrow=%', key_today, key_tomorrow;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Nothing the applicant typed is anywhere near it
-- ---------------------------------------------------------------------------
do $$
declare leaked int;
begin
  select count(*) into leaked from public.email_events
   where email_type = 'application_received'
     and (subject || metadata::text) like '%five years with toddlers%';

  if leaked = 0 then
    raise notice 'PASS 5  the cover note is not carried into the email';
  else
    raise notice 'FAIL 5  the cover note reached the mailer';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The count is everything waiting, not everything ever
-- ---------------------------------------------------------------------------
-- A family that has already replied should not be told it has three waiting.
-- The count is `applied` only, which is what "not heard back yet" means.
do $$
declare v_job uuid; decision jsonb;
begin
  select id into v_job from public.jobs where title = 'Live out help in Mirdif';

  update public.job_applications set status = 'shortlisted'
   where job_id = v_job;

  -- A fresh day, so the decision is allowed to be made again.
  delete from public.email_events where email_type = 'application_received';

  decision := public.notify_application_email(v_job);

  if (decision ->> 'waiting')::int = 1 then
    raise notice 'PASS 6  an application already answered is not counted as waiting';
  else
    raise notice 'FAIL 6  waiting was %', decision ->> 'waiting';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. A suspended family is not written to
-- ---------------------------------------------------------------------------
do $$
declare v_job uuid; decision jsonb;
begin
  select id into v_job from public.jobs where title = 'Live out help in Mirdif';
  update public.users set status = 'suspended'
   where id = '6c111111-1111-4111-8111-11111111111c';
  delete from public.email_events where email_type = 'application_received';

  decision := public.notify_application_email(v_job);

  if not (decision ->> 'send')::boolean then
    raise notice 'PASS 7  a suspended family is not emailed';
  else
    raise notice 'FAIL 7  %', decision;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. And a session cannot call it
-- ---------------------------------------------------------------------------
-- It returns a family's email address and it makes us send mail.
do $$
declare reachable boolean;
begin
  select has_function_privilege('authenticated',
    'public.notify_application_email(uuid)', 'execute') into reachable;

  if not reachable then
    raise notice 'PASS 8  only the backend can call it';
  else
    raise notice 'FAIL 8  a signed in user can make us send mail';
  end if;
end $$;

rollback;
