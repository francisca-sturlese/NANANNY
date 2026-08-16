-- Operational changes leave the same trail as administrative ones.
--
-- `admin_set_nanny_status()` checks is_admin() and so cannot be called by the
-- backend key, which has no auth.uid(). That left an operator running a one-off
-- with two bad options: write the row directly and leave no trace, or write the
-- audit row by hand afterwards and hope somebody remembers. Four nanny profiles
-- were published by hand in an afternoon, for a real reason that lived in a chat
-- message.
--
-- This suite is about the trail rather than the change. Anybody with the
-- service key could always make the change; what has to hold is that the easy
-- way now records who and why.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on

\set nanny_uid '''6d111111-1111-4111-8111-11111111111d'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values (:nanny_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'ops-nanny@test.local', '', now(), '{}'::jsonb,
        '{"role":"nanny","first_name":"Ops"}'::jsonb, now(), now());

insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
values (:nanny_uid::uuid, 'draft', 'Dubai', 3, 'Ops');

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. A blank reason is refused
-- ---------------------------------------------------------------------------
-- Optional would mean blank, and a status change with no reason is the thing
-- this exists to stop rather than a detail of it.
do $$
declare v_id uuid; refused boolean := false;
begin
  select id into v_id from public.nanny_profiles
   where user_id = '6d111111-1111-4111-8111-11111111111d';
  begin
    perform public.ops_set_nanny_status(v_id, 'submitted', '   ');
  exception when others then refused := true;
  end;

  if refused then
    raise notice 'PASS 1  a status change with no reason is refused';
  else
    raise notice 'FAIL 1  it went through without one';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The change and the reason are both recorded
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; result jsonb; audited int;
begin
  select id into v_id from public.nanny_profiles
   where user_id = '6d111111-1111-4111-8111-11111111111d';

  result := public.ops_set_nanny_status(v_id, 'submitted', 'founder instruction, empty marketplace');

  select count(*) into audited from public.audit_logs
   where entity_id = v_id
     and action = 'nanny_status_changed'
     and after_state ->> 'by' = 'ops'
     and after_state ->> 'reason' = 'founder instruction, empty marketplace';

  if (result ->> 'to') = 'submitted' and (result ->> 'from') = 'draft' and audited = 1 then
    raise notice 'PASS 2  the status moved and the reason is in the trail';
  else
    raise notice 'FAIL 2  result=% audited=%', result, audited;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Nobody is blamed for it
-- ---------------------------------------------------------------------------
-- Borrowing an administrator's id would read as an account having acted, and
-- send whoever investigates to ask a person who pressed nothing.
do $$
declare actor uuid;
begin
  select actor_id into actor from public.audit_logs
   where action = 'nanny_status_changed' and after_state ->> 'by' = 'ops'
   order by created_at desc limit 1;

  if actor is null then
    raise notice 'PASS 3  no person is recorded as having done it';
  else
    raise notice 'FAIL 3  it was attributed to %', actor;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A second change does not make an old submission look new
-- ---------------------------------------------------------------------------
-- The review queue orders by submitted_at, so resetting it would push somebody
-- who has been waiting the longest to the back.
do $$
declare v_id uuid; first_at timestamptz; second_at timestamptz;
begin
  select id into v_id from public.nanny_profiles
   where user_id = '6d111111-1111-4111-8111-11111111111d';

  select submitted_at into first_at from public.nanny_profiles where id = v_id;
  perform pg_sleep(0.05);
  perform public.ops_set_nanny_status(v_id, 'submitted', 'reapplied by hand');
  select submitted_at into second_at from public.nanny_profiles where id = v_id;

  if first_at = second_at then
    raise notice 'PASS 4  the original submission time is kept';
  else
    raise notice 'FAIL 4  % became %', first_at, second_at;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Only the backend can call it
-- ---------------------------------------------------------------------------
do $$
begin
  if not has_function_privilege('authenticated',
       'public.ops_set_nanny_status(uuid, public.nanny_profile_status, text)', 'execute')
     and not has_function_privilege('anon',
       'public.ops_set_nanny_status(uuid, public.nanny_profile_status, text)', 'execute')
  then
    raise notice 'PASS 5  a session cannot change a status without being an admin';
  else
    raise notice 'FAIL 5  reachable from a session';
  end if;
end $$;

rollback;
