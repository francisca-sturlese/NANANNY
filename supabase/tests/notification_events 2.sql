-- Everything else that writes a notification.
--
-- The end to end run proves the bell lights up. This proves the part the bell
-- cannot see: that the row goes to the right person, that a user cannot write
-- one by hand, and that the noisy cases stay quiet.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on

\set family_uid '''6a111111-1111-4111-8111-11111111111a'''
\set nanny_uid  '''6a222222-2222-4222-8222-22222222222a'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  (:family_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'events-family@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Dana","last_name":"Family"}'::jsonb, now(), now()),
  (:nanny_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'events-nanny@test.local', '', now(), '{}'::jsonb,
   '{"role":"nanny","first_name":"Joy"}'::jsonb, now(), now());

insert into public.family_profiles (user_id, emirate, area, children_count, display_name)
values (:family_uid::uuid, 'Dubai', 'Jumeirah', 2, 'The Events family');

insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
values (:nanny_uid::uuid, 'submitted', 'Dubai', 6, 'Joy');

insert into public.jobs (family_id, title, emirate, area, status, employment_type)
values (
  (select id from public.family_profiles where user_id = :family_uid::uuid),
  'Afternoons in Jumeirah',
  'Dubai', 'Jumeirah', 'active', 'part_time');

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. She applies, and the family is the one told
-- ---------------------------------------------------------------------------
do $$
declare v_job uuid; v_nanny uuid; told int; wrongly_told int;
begin
  select id into v_job from public.jobs
   where title = 'Afternoons in Jumeirah';
  select id into v_nanny from public.nanny_profiles
   where user_id = '6a222222-2222-4222-8222-22222222222a';

  -- As the nanny, through the role the app uses, so the trigger has to reach
  -- past row level security on its own rather than borrowing the test's
  -- superuser session.
  perform set_config('request.jwt.claims',
    json_build_object('sub', '6a222222-2222-4222-8222-22222222222a',
                      'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.job_applications (job_id, nanny_id, cover_note)
  values (v_job, v_nanny, 'I am free from two every day.');

  set local role postgres;

  select count(*) into told from public.notifications
   where user_id = '6a111111-1111-4111-8111-11111111111a'
     and kind = 'application_received';

  select count(*) into wrongly_told from public.notifications
   where user_id = '6a222222-2222-4222-8222-22222222222a'
     and kind = 'application_received';

  if told = 1 and wrongly_told = 0 then
    raise notice 'PASS 1  the family is told about the application, the applicant is not';
  else
    raise notice 'FAIL 1  family=% nanny=%', told, wrongly_told;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Nothing the nanny typed is on the row
-- ---------------------------------------------------------------------------
-- The same rule as the message email, one layer earlier. A cover note is text
-- one user wrote for another, and a notification carrying it is a notification
-- that can say anything at all.
do $$
declare leaked int;
begin
  select count(*) into leaked from public.notifications
   where coalesce(title, '') || coalesce(body, '') || metadata::text
         like '%free from two%';

  if leaked = 0 then
    raise notice 'PASS 2  the cover note is not copied onto the notification';
  else
    raise notice 'FAIL 2  % notifications carry the cover note', leaked;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Being looked at is not news
-- ---------------------------------------------------------------------------
do $$
declare v_job uuid; v_nanny uuid; told int;
begin
  select id into v_job from public.jobs where title = 'Afternoons in Jumeirah';
  select id into v_nanny from public.nanny_profiles
   where user_id = '6a222222-2222-4222-8222-22222222222a';

  update public.job_applications set status = 'viewed'
   where job_id = v_job and nanny_id = v_nanny;

  select count(*) into told from public.notifications
   where user_id = '6a222222-2222-4222-8222-22222222222a'
     and kind like 'application_%';

  if told = 0 then
    raise notice 'PASS 3  a family opening the page tells her nothing';
  else
    raise notice 'FAIL 3  % notifications for a view', told;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A decision is news, and only once
-- ---------------------------------------------------------------------------
do $$
declare v_job uuid; v_nanny uuid; told int;
begin
  select id into v_job from public.jobs where title = 'Afternoons in Jumeirah';
  select id into v_nanny from public.nanny_profiles
   where user_id = '6a222222-2222-4222-8222-22222222222a';

  update public.job_applications set status = 'shortlisted'
   where job_id = v_job and nanny_id = v_nanny;

  -- Written again with the value it already has. Nothing changed, so nothing
  -- happened, and an update that touches another column must not fire it
  -- either.
  update public.job_applications set status = 'shortlisted'
   where job_id = v_job and nanny_id = v_nanny;
  update public.job_applications set cover_note = 'edited'
   where job_id = v_job and nanny_id = v_nanny;

  select count(*) into told from public.notifications
   where user_id = '6a222222-2222-4222-8222-22222222222a'
     and kind = 'application_shortlisted';

  if told = 1 then
    raise notice 'PASS 4  shortlisting tells her once, and a rewrite of the same value tells her nothing';
  else
    raise notice 'FAIL 4  % notifications for one decision', told;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. A review is news
-- ---------------------------------------------------------------------------
do $$
declare told int;
begin
  update public.nanny_profiles set status = 'under_review'
   where user_id = '6a222222-2222-4222-8222-22222222222a';

  select count(*) into told from public.notifications
   where user_id = '6a222222-2222-4222-8222-22222222222a'
     and kind like 'profile_%';

  if told > 0 then
    raise notice 'FAIL 5  a profile moving into review told her something';
    return;
  end if;

  update public.nanny_profiles set status = 'approved'
   where user_id = '6a222222-2222-4222-8222-22222222222a';

  select count(*) into told from public.notifications
   where user_id = '6a222222-2222-4222-8222-22222222222a'
     and kind = 'profile_approved';

  if told = 1 then
    raise notice 'PASS 5  approval is told, moving into the queue is not';
  else
    raise notice 'FAIL 5  % approval notifications', told;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Nobody can write one by hand
-- ---------------------------------------------------------------------------
-- The whole meaning of this table is "the system said this". A user who can
-- insert into it can put any sentence in front of themselves, and, if a kind
-- with an href is chosen well, in front of somebody else.
do $$
declare wrote boolean := false;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '6a222222-2222-4222-8222-22222222222a',
                      'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.notifications (user_id, kind, title)
    values ('6a111111-1111-4111-8111-11111111111a', 'new_message', 'Send money here');
    wrote := true;
  exception when others then
    wrote := false;
  end;

  set local role postgres;

  if wrote then
    raise notice 'FAIL 6  a signed in user wrote a notification for somebody else';
  else
    raise notice 'PASS 6  a signed in user cannot write a notification at all';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Marking read touches only your own
-- ---------------------------------------------------------------------------
do $$
declare mine_unread int; theirs_unread int; marked int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '6a222222-2222-4222-8222-22222222222a',
                      'role', 'authenticated')::text, true);
  set local role authenticated;

  marked := public.mark_notifications_read();

  set local role postgres;

  select count(*) into mine_unread from public.notifications
   where user_id = '6a222222-2222-4222-8222-22222222222a' and read_at is null;
  select count(*) into theirs_unread from public.notifications
   where user_id = '6a111111-1111-4111-8111-11111111111a' and read_at is null;

  if mine_unread = 0 and theirs_unread > 0 then
    raise notice 'PASS 7  her own are marked read, the family''s are untouched';
  else
    raise notice 'FAIL 7  hers unread=%, theirs unread=%', mine_unread, theirs_unread;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. The bell is fed by one query, and it agrees with itself
-- ---------------------------------------------------------------------------
do $$
declare feed jsonb; listed int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '6a111111-1111-4111-8111-11111111111a',
                      'role', 'authenticated')::text, true);
  set local role authenticated;

  feed := public.my_notifications(15);

  set local role postgres;

  select count(*) into listed from public.notifications
   where user_id = '6a111111-1111-4111-8111-11111111111a';

  if jsonb_array_length(feed -> 'items') = listed
     and (feed ->> 'unread')::int = listed then
    raise notice 'PASS 8  the count and the list come from the same read';
  else
    raise notice 'FAIL 8  feed=% rows=%', feed, listed;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. The stream exists at all
-- ---------------------------------------------------------------------------
-- Without the table in this publication the subscription connects, subscribes,
-- reports success and delivers nothing for the rest of time. There is no error
-- anywhere: it looks exactly like an account with no notifications.
do $$
declare published int;
begin
  select count(*) into published from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public' and tablename = 'notifications';

  if published = 1 then
    raise notice 'PASS 9  notifications are in the realtime publication';
  else
    raise notice 'FAIL 9  realtime would deliver nothing, silently';
  end if;
end $$;

rollback;
