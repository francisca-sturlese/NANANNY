-- Reading somebody's private messages leaves a mark.
--
-- The back office can open the conversations a job post started, which is the
-- right tool for moderation and the most invasive power anybody here has.
--
-- What makes it worth a row is what we tell a nanny. She is asked to keep her
-- phone number out of her profile and to talk to families here instead, on the
-- promise that she keeps a record and can stop anyone. A product that says that
-- and then reads her messages with no record of its own is telling her
-- something it does not apply to itself.
--
-- It records rather than prevents. Somebody resolving a report should read the
-- thread. What has to exist afterwards is an answer to who read it and when.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on

\set family_uid '''6c777777-7777-4777-8777-77777777777c'''
\set nanny_uid  '''6c888888-8888-4888-8888-88888888888c'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  (:family_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'read-family@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Reader"}'::jsonb, now(), now()),
  (:nanny_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'read-nanny@test.local', '', now(), '{}'::jsonb,
   '{"role":"nanny","first_name":"Read"}'::jsonb, now(), now());

insert into public.family_profiles (user_id, emirate, area, children_count, display_name)
values (:family_uid::uuid, 'Dubai', 'Marina', 1, 'The Reading family');

insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
values (:nanny_uid::uuid, 'approved', 'Dubai', 4, 'Read');

insert into public.conversations (family_id, nanny_id)
values ((select id from public.family_profiles where user_id = :family_uid::uuid),
        (select id from public.nanny_profiles where user_id = :nanny_uid::uuid));

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. Only an administrator can write one
-- ---------------------------------------------------------------------------
-- Otherwise anybody could fill the log with plausible entries about somebody
-- else, which is worse than no log at all.
do $$
declare v_conv uuid; refused boolean := false;
begin
  select id into v_conv from public.conversations
   where family_id = (select id from public.family_profiles
                       where user_id = '6c777777-7777-4777-8777-77777777777c');

  perform set_config('request.jwt.claims',
    json_build_object('sub', '6c888888-8888-4888-8888-88888888888c',
                      'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform public.record_conversation_read(v_conv);
  exception when others then refused := true;
  end;

  set local role postgres;

  if refused then
    raise notice 'PASS 1  a signed in user who is not an admin cannot write a reading';
  else
    raise notice 'FAIL 1  anybody can write one';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. An admin reading it is recorded, once
-- ---------------------------------------------------------------------------
-- A refresh is not a second reading, and a log full of the same fact is one
-- nobody reads, which is the same as not having it.
do $$
declare v_conv uuid; v_admin uuid; rows_now int;
begin
  select id into v_conv from public.conversations
   where family_id = (select id from public.family_profiles
                       where user_id = '6c777777-7777-4777-8777-77777777777c');
  select id into v_admin from public.users where role in ('admin', 'super_admin') limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.record_conversation_read(v_conv);
  perform public.record_conversation_read(v_conv);

  set local role postgres;

  select count(*) into rows_now from public.audit_logs
   where action = 'conversation_read' and entity_id = v_conv and actor_id = v_admin;

  if rows_now = 1 then
    raise notice 'PASS 2  the reading is recorded once, against the admin who did it';
  else
    raise notice 'FAIL 2  % rows', rows_now;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. And it does not stop them reading
-- ---------------------------------------------------------------------------
-- Somebody resolving a report has to be able to open the thread. The row is
-- the point, not the permission.
do $$
declare v_conv uuid; v_admin uuid; ok boolean := true;
begin
  select id into v_conv from public.conversations
   where family_id = (select id from public.family_profiles
                       where user_id = '6c777777-7777-4777-8777-77777777777c');
  select id into v_admin from public.users where role in ('admin', 'super_admin') limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform public.record_conversation_read(v_conv);
  exception when others then ok := false;
  end;

  set local role postgres;

  if ok then
    raise notice 'PASS 3  recording never refuses the admin who needs to read';
  else
    raise notice 'FAIL 3  it raised';
  end if;
end $$;

rollback;
