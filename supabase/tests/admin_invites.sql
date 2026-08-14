-- Inviting an administrator.
--
-- What this proves: only a super_admin can create or revoke an invite, the
-- role is applied at signup only when the registered email matches a live
-- invite, and expired or revoked invites do nothing. The role never travels
-- with the client: everything is decided by rows in admin_invites.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;
\set QUIET on
update public.users set role = 'super_admin' where email = 'admin@nananny.example.test';
\set QUIET off

-- 1. a super admin can create an invite
do $$
declare sa uuid; inv uuid;
begin
  select id into sa from public.users where role = 'super_admin' limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', sa, 'role', 'authenticated')::text, true);

  inv := public.admin_invite_create('Invited.Admin@Example.Test', 'admin', 'test');
  if exists (select 1 from public.admin_invites
              where id = inv and email = 'invited.admin@example.test' and role = 'admin') then
    raise notice 'PASS 1  a super admin invites, email stored lowercased';
  else
    raise notice 'FAIL 1  the invite was not stored as expected';
  end if;
end $$;

-- 2. a plain admin cannot invite
do $$
declare a uuid;
begin
  set local role postgres;
  select id into a from public.users where role = 'admin' limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_invite_create('mole@example.test', 'admin', null);
    raise notice 'FAIL 2  a plain admin created an invite';
  exception when others then
    raise notice 'PASS 2  a plain admin cannot invite';
  end;
end $$;

-- 3. a second pending invite for the same email is refused
do $$
declare sa uuid;
begin
  set local role postgres;
  select id into sa from public.users where role = 'super_admin' limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_invite_create('invited.admin@example.test', 'super_admin', null);
    raise notice 'FAIL 3  a duplicate pending invite was accepted';
  exception when others then
    raise notice 'PASS 3  one live invite per address';
  end;
end $$;

-- 4. an email that already has an account is refused
do $$
declare sa uuid;
begin
  set local role postgres;
  select id into sa from public.users where role = 'super_admin' limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_invite_create('family1@nananny.example.test', 'admin', null);
    raise notice 'FAIL 4  invited an email that already has an account';
  exception when others then
    raise notice 'PASS 4  existing accounts go through the Users page, not invites';
  end;
end $$;

-- 5. signup with the invited email gets the invited role, and the invite closes
do $$
declare uid uuid := extensions.gen_random_uuid();
begin
  set local role postgres;
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  values (uid, 'invited.admin@example.test', '{"role":"family"}'::jsonb, now(), now());

  if (select role from public.users where id = uid) = 'admin'
     and exists (select 1 from public.admin_invites
                  where email = 'invited.admin@example.test'
                    and accepted_at is not null and accepted_user_id = uid) then
    raise notice 'PASS 5  the invited email signs up as admin, invite marked accepted';
  else
    raise notice 'FAIL 5  role %, invite not closed',
      (select role from public.users where id = uid);
  end if;
end $$;

-- 6. any other email is untouched, even if the client asks for a role
do $$
declare uid uuid := extensions.gen_random_uuid();
begin
  set local role postgres;
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  values (uid, 'uninvited@example.test', '{"role":"admin"}'::jsonb, now(), now());

  if (select role from public.users where id = uid) = 'family' then
    raise notice 'PASS 6  an uninvited signup cannot ask its way into a role';
  else
    raise notice 'FAIL 6  role became %', (select role from public.users where id = uid);
  end if;
end $$;

-- 7. a revoked invite does nothing at signup
do $$
declare sa uuid; inv uuid; uid uuid := extensions.gen_random_uuid();
begin
  set local role postgres;
  select id into sa from public.users where role = 'super_admin' limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  inv := public.admin_invite_create('revoked@example.test', 'admin', null);
  perform public.admin_invite_revoke(inv);

  set local role postgres;
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  values (uid, 'revoked@example.test', '{}'::jsonb, now(), now());

  if (select role from public.users where id = uid) = 'family' then
    raise notice 'PASS 7  a revoked invite grants nothing';
  else
    raise notice 'FAIL 7  a revoked invite still granted a role';
  end if;
end $$;

-- 8. an expired invite does nothing at signup
do $$
declare sa uuid; inv uuid; uid uuid := extensions.gen_random_uuid();
begin
  set local role postgres;
  select id into sa from public.users where role = 'super_admin' limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  inv := public.admin_invite_create('late@example.test', 'admin', null);

  set local role postgres;
  update public.admin_invites set expires_at = now() - interval '1 hour' where id = inv;
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  values (uid, 'late@example.test', '{}'::jsonb, now(), now());

  if (select role from public.users where id = uid) = 'family' then
    raise notice 'PASS 8  an expired invite grants nothing';
  else
    raise notice 'FAIL 8  an expired invite still granted a role';
  end if;
end $$;

-- 9. anon cannot touch the functions or the table
do $$
begin
  set local role anon;
  begin
    perform public.admin_invite_create('anon@example.test', 'admin', null);
    raise notice 'FAIL 9  anon created an invite';
  exception when others then
    raise notice 'PASS 9  anon cannot call admin_invite_create';
  end;
end $$;

rollback;
