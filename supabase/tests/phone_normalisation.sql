-- Phone numbers, in one shape.
--
-- Written for a real case: a nanny made three accounts with the same number
-- typed three ways, because each time she thought the previous attempt had
-- failed. The point of these checks is that all three now collapse to the same
-- value, and that the fourth attempt would have been stopped with a signpost.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on
\set uid '''71111111-1111-4111-8111-111111111111'''
\set uid2 '''71111111-1111-4111-8111-111111111112'''
\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. The three forms the nanny actually used collapse to one
-- ---------------------------------------------------------------------------
select case when public.normalise_phone('971541869704') = '+971541869704'
             and public.normalise_phone('+971 54 186 9704') = '+971541869704'
             and public.normalise_phone('0541869704') = '+971541869704'
       then 'PASS 1  the three real formats become one number'
       else 'FAIL 1  ' || coalesce(public.normalise_phone('0541869704'), 'null') end;

-- ---------------------------------------------------------------------------
-- 2. A bare mobile and an international prefix work too
-- ---------------------------------------------------------------------------
select case when public.normalise_phone('541869704') = '+971541869704'
             and public.normalise_phone('00971541869704') = '+971541869704'
       then 'PASS 2  bare and 00 prefixed forms match as well'
       else 'FAIL 2  bare gives ' || coalesce(public.normalise_phone('541869704'), 'null') end;

-- ---------------------------------------------------------------------------
-- 3. Somebody else's country is left alone rather than guessed at
-- ---------------------------------------------------------------------------
select case when public.normalise_phone('+39 333 1234567') = '+393331234567'
             and public.normalise_phone('+1 415 555 0132') = '+14155550132'
       then 'PASS 3  a foreign number keeps its own country code'
       else 'FAIL 3  ' || coalesce(public.normalise_phone('+39 333 1234567'), 'null') end;

-- ---------------------------------------------------------------------------
-- 4. Junk becomes nothing, not a number nobody can call
-- ---------------------------------------------------------------------------
select case when public.normalise_phone('abc') is null
             and public.normalise_phone('12') is null
             and public.normalise_phone('   ') is null
             and public.normalise_phone(null) is null
       then 'PASS 4  junk is stored as nothing'
       else 'FAIL 4  junk survived normalisation' end;

-- ---------------------------------------------------------------------------
-- 5. It is normalised on the way in, not just by the migration
-- ---------------------------------------------------------------------------
do $$
declare stored text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('71111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'phone-one@test.local', '', now(), '{}'::jsonb,
          '{"role":"nanny","first_name":"Rona","phone":"0541869704"}'::jsonb, now(), now());

  select phone into stored from public.users
   where id = '71111111-1111-4111-8111-111111111111';

  if stored = '+971541869704' then
    raise notice 'PASS 5  a signup stores the normalised number (%)', stored;
  else
    raise notice 'FAIL 5  stored as %', coalesce(stored, 'null');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. And on the way through an update
-- ---------------------------------------------------------------------------
do $$
declare stored text;
begin
  update public.users set phone = '971 54 186 9704'
   where id = '71111111-1111-4111-8111-111111111111';

  select phone into stored from public.users
   where id = '71111111-1111-4111-8111-111111111111';

  if stored = '+971541869704' then
    raise notice 'PASS 6  editing a number normalises it too';
  else
    raise notice 'FAIL 6  stored as %', coalesce(stored, 'null');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. The second attempt in a different format is recognised
-- ---------------------------------------------------------------------------
do $$
begin
  if public.phone_already_registered('+971 54 186 9704')
     and public.phone_already_registered('541869704')
     and public.phone_already_registered('0541869704') then
    raise notice 'PASS 7  the same number is recognised in every format';
  else
    raise notice 'FAIL 7  a format slipped through';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. A different number is not
-- ---------------------------------------------------------------------------
do $$
begin
  if not public.phone_already_registered('0509999999') then
    raise notice 'PASS 8  a different number is free to sign up';
  else
    raise notice 'FAIL 8  an unrelated number was reported as taken';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. A signed-in user cannot use it to look up who owns a number
-- ---------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  begin
    perform public.phone_already_registered('0541869704');
    raise notice 'FAIL 9  any signed-in user can probe phone numbers';
  exception when insufficient_privilege then
    raise notice 'PASS 9  the lookup is not reachable from a session';
  end;
  set local role postgres;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Duplicates are grouped for an admin, oldest first
-- ---------------------------------------------------------------------------
do $$
declare groups jsonb; admin_uid uuid;
begin
  set local role postgres;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('71111111-1111-4111-8111-111111111112', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'phone-two@test.local', '', now(), '{}'::jsonb,
          '{"role":"nanny","first_name":"Rona","phone":"+971 54 186 9704"}'::jsonb, now(), now());

  select id into admin_uid from public.users where role in ('admin', 'super_admin') limit 1;
  if admin_uid is null then
    raise notice 'SKIP 10 no admin to check with';
    return;
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_uid, 'role', 'authenticated')::text, true);

  groups := public.admin_duplicate_phones();

  if jsonb_array_length(groups) >= 1
     and (groups -> 0 ->> 'phone') = '+971541869704'
     and (groups -> 0 ->> 'accounts')::int = 2 then
    raise notice 'PASS 10 the two accounts are grouped under one number';
  else
    raise notice 'FAIL 10 %', groups;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. A family cannot read the duplicate list
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '71111111-1111-4111-8111-111111111111',
                      'role', 'authenticated')::text, true);
  begin
    perform public.admin_duplicate_phones();
    raise notice 'FAIL 11 a nanny read the duplicate list';
  exception when sqlstate 'ROLE1' then
    raise notice 'PASS 11 only an admin can see duplicates';
  end;
end $$;

rollback;
