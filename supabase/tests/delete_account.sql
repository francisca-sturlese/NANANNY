-- Leaving the platform.
--
-- The privacy page promises erasure, so this has to actually erase. It also has
-- to not tear a hole in somebody else's history: a conversation has two people
-- in it, and only one of them asked to leave.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on

\set fam_uid   '''91111111-1111-4111-8111-111111111111'''
\set nanny_uid '''92222222-2222-4222-8222-222222222221'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  (:fam_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'leaving-family@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Leaving","last_name":"Family","phone":"0541111111"}'::jsonb,
   now(), now()),
  (:nanny_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'staying-nanny@test.local', '', now(), '{}'::jsonb,
   '{"role":"nanny","first_name":"Grace"}'::jsonb, now(), now());

insert into public.family_profiles (user_id, emirate, area, children_count, display_name)
values (:fam_uid::uuid, 'Dubai', 'Marina', 2, 'The Leaving family');

insert into public.family_children (family_id, age_years)
select id, 3 from public.family_profiles where user_id = :fam_uid::uuid;

insert into public.family_requirements (family_id, label, is_primary, arrangement, working_days)
select id, 'Main', true, 'live_out', array['mon']::text[]
  from public.family_profiles where user_id = :fam_uid::uuid;

insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
values (:nanny_uid::uuid, 'approved', 'Dubai', 5, 'Grace');

set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :fam_uid, 'role', 'authenticated')::text, true);

select public.start_conversation(
  (select id from public.nanny_profiles where user_id = :nanny_uid::uuid),
  'profile'::public.contact_source,
  'Hello Grace, are you available on weekdays?');

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. It will not happen by accident
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.delete_my_account('yes');
    raise notice 'FAIL 1  the wrong confirmation deleted an account';
  exception when sqlstate 'DELE1' then
    raise notice 'PASS 1  deletion needs the word typed exactly';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 2. And nothing was touched by the attempt
-- ---------------------------------------------------------------------------
select case when exists (
         select 1 from public.family_profiles where user_id = :fam_uid::uuid)
       then 'PASS 2  a refused attempt changes nothing'
       else 'FAIL 2  the profile is gone after a refused attempt' end;

-- ---------------------------------------------------------------------------
-- 3. An administrator cannot delete themselves
-- ---------------------------------------------------------------------------
do $$
declare admin_uid uuid;
begin
  set local role postgres;
  select id into admin_uid from public.users where role in ('admin', 'super_admin') limit 1;

  if admin_uid is null then
    raise notice 'SKIP 3  no admin in the database';
    return;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_uid, 'role', 'authenticated')::text, true);
  begin
    perform public.delete_my_account('delete');
    raise notice 'FAIL 3  an administrator deleted themselves';
  exception when sqlstate 'DELE2' then
    raise notice 'PASS 3  an administrator has to be demoted first';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The real thing
-- ---------------------------------------------------------------------------
do $$
declare result jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '91111111-1111-4111-8111-111111111111',
                      'role', 'authenticated')::text, true);

  result := public.delete_my_account('DELETE');

  if (result ->> 'deleted')::boolean then
    raise notice 'PASS 4  the account was deleted';
  else
    raise notice 'FAIL 4  %', result;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Everything that existed only because they were here is gone
-- ---------------------------------------------------------------------------
do $$
declare left_behind text[] := '{}';
begin
  set local role postgres;

  if exists (select 1 from public.family_profiles
              where user_id = '91111111-1111-4111-8111-111111111111'
                and (display_name <> 'Deleted account' or emirate is not null
                     or children_count <> 0))
    then left_behind := left_behind || 'profile'::text; end if;
  if exists (select 1 from public.family_children c
              join public.family_profiles f on f.id = c.family_id
             where f.user_id = '91111111-1111-4111-8111-111111111111')
    then left_behind := left_behind || 'children'::text; end if;
  if exists (select 1 from public.notifications
              where user_id = '91111111-1111-4111-8111-111111111111')
    then left_behind := left_behind || 'notifications'::text; end if;

  if cardinality(left_behind) = 0 then
    raise notice 'PASS 5  nothing of theirs is left behind';
  else
    raise notice 'FAIL 5  still there: %', array_to_string(left_behind, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. They cannot log in again
-- ---------------------------------------------------------------------------
select case when (select email from auth.users where id = :fam_uid::uuid)
                  like 'deleted+%@nananny.invalid'
             and (select banned_until from auth.users where id = :fam_uid::uuid) > now()
       then 'PASS 6  the login is emptied and banned, and the address is free again'
       else 'FAIL 6  the login still works' end;

-- ---------------------------------------------------------------------------
-- 7. The nanny's side of the conversation is intact
-- ---------------------------------------------------------------------------
do $$
declare msgs int; sender text; conv uuid;
begin
  -- This suite's own conversation. The seed has a nanny called Grace too, and
  -- matching on the message text alone quietly started counting hers.
  select c.id into conv from public.conversations c
    join public.nanny_profiles n on n.id = c.nanny_id
   where n.user_id = '92222222-2222-4222-8222-222222222221';

  select count(*) into msgs from public.messages where conversation_id = conv;

  select btrim(u.first_name || ' ' || coalesce(u.last_name, '')) into sender
    from public.messages m join public.users u on u.id = m.sender_id
   where m.conversation_id = conv limit 1;

  if msgs = 1 and sender = 'Deleted account' then
    raise notice 'PASS 7  the message she received is still there, from a deleted account';
  else
    raise notice 'FAIL 7  % messages, sender "%"', msgs, sender;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Nothing identifying is left on the row that had to stay
-- ---------------------------------------------------------------------------
do $$
declare u record;
begin
  select * into u from public.users where id = '91111111-1111-4111-8111-111111111111';

  if u.email like 'deleted+%@nananny.invalid'
     and u.phone is null
     and u.status::text = 'deleted' then
    raise notice 'PASS 8  the remaining row carries nothing about them';
  else
    raise notice 'FAIL 8  email %, phone %, status %', u.email, u.phone, u.status;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Nothing new can arrive in that conversation
-- ---------------------------------------------------------------------------
select case when (
         select c.blocked_at from public.conversations c
           join public.nanny_profiles n on n.id = c.nanny_id
          where n.user_id = :nanny_uid::uuid) is not null
       then 'PASS 9  the conversation is closed to new messages'
       else 'FAIL 9  the conversation is still open' end;

-- ---------------------------------------------------------------------------
-- 10. The deletion itself is on the record
-- ---------------------------------------------------------------------------
select case when exists (
         select 1 from public.audit_logs where action = 'account_deleted')
       then 'PASS 10 the deletion is in the audit trail'
       else 'FAIL 10 nothing was audited' end;

rollback;
