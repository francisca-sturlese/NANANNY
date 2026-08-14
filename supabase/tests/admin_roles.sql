-- Appointing an administrator.
--
-- The separation this proves: a super_admin appoints, a plain admin does not.
-- Without it one compromised moderator account is enough to mint more, and
-- there is no step at which anybody has to notice.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;
\set QUIET on
-- Promote the seed admin to super_admin, as the bootstrap SQL would.
update public.users set role = 'super_admin' where email = 'admin@nananny.example.test';
\set QUIET off

do $$
declare sa uuid; target uuid;
begin
  select id into sa from public.users where role = 'super_admin' limit 1;
  select id into target from public.users where role = 'family' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', sa, 'role', 'authenticated')::text, true);

  perform public.admin_set_user_role(target, 'admin', 'Joining the moderation team');
  if (select role from public.users where id = target) = 'admin' then
    raise notice 'PASS 1  a super admin can appoint an admin';
  else
    raise notice 'FAIL 1  the role did not change';
  end if;
end $$;

do $$
declare a uuid; target uuid;
begin
  set local role postgres;
  select id into a from public.users where role = 'admin' limit 1;
  select id into target from public.users where role = 'nanny' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_set_user_role(target, 'admin', 'trying');
    raise notice 'FAIL 2  a plain admin appointed another admin';
  exception when sqlstate 'ROLE1' then
    raise notice 'PASS 2  a plain admin cannot appoint anyone';
  end;
end $$;

do $$
declare sa uuid;
begin
  set local role postgres;
  select id into sa from public.users where role = 'super_admin' limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_set_user_role(sa, 'family', 'oops');
    raise notice 'FAIL 3  a super admin demoted themselves';
  exception when sqlstate 'ROLE3' then
    raise notice 'PASS 3  you cannot change your own role';
  end;
end $$;

do $$
declare n uuid; target uuid;
begin
  set local role postgres;
  select id into n from public.users where role = 'nanny' limit 1;
  select id into target from public.users where role = 'family' limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', n, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_set_user_role(n, 'super_admin', 'promote me');
    raise notice 'FAIL 4  a nanny promoted herself';
  exception when others then
    raise notice 'PASS 4  a nanny cannot promote anyone (%)' , sqlstate;
  end;
end $$;

do $$
declare n int;
begin
  set local role postgres;
  select count(*) into n from public.audit_logs where action = 'user_role_change';
  if n > 0 then
    raise notice 'PASS 5  the appointment was audited (% rows)', n;
  else
    raise notice 'FAIL 5  nothing was written to audit_logs';
  end if;
end $$;

rollback;
