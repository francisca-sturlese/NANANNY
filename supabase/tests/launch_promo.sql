-- The launch window.
--
-- This touches the one rule the business rests on, so the thing worth proving
-- is not that the promotion works. It is that closing it leaves every family
-- with its allowance untouched, and that nothing about the gate changed while
-- no window is configured.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on

\set family_uid '''51111111-1111-4111-8111-111111111111'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values (:family_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'promo-family@test.local', '', now(), '{}'::jsonb,
        '{"role":"family","first_name":"Promo","last_name":"Family"}'::jsonb, now(), now());

insert into public.family_profiles (user_id, emirate, area, children_count)
values (:family_uid::uuid, 'Dubai', 'Dubai Hills', 1);

-- Ten nannies, so the allowance can be exhausted several times over.
do $$
declare uid uuid;
begin
  for i in 1..10 loop
    uid := ('52222222-2222-4222-8222-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'promo-nanny' || i || '@test.local', '', now(), '{}'::jsonb,
            '{"role":"nanny","first_name":"Nanny"}'::jsonb, now(), now());
    insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
    values (uid, 'approved', 'Dubai', 5, 'Nanny ' || i);
  end loop;
end $$;

create temporary view nannies as
  select row_number() over (order by user_id) as n, id
    from public.nanny_profiles
   where user_id::text like '52222222%';
grant select on nannies to authenticated;

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. Shipped with no window configured, nothing has changed
-- ---------------------------------------------------------------------------
select case when public.promo_active() = false
       then 'PASS 1  no window configured means no promotion'
       else 'FAIL 1  a promotion is running by default' end;

set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :family_uid, 'role', 'authenticated')::text, true);

-- ---------------------------------------------------------------------------
-- 2. The paywall still arrives on the fourth contact
-- ---------------------------------------------------------------------------
do $$
declare opened int := 0;
begin
  for i in 1..6 loop
    begin
      perform public.start_conversation((select id from nannies where n = i));
      opened := opened + 1;
    exception when sqlstate 'PAYW1' then
      if opened = 3 then
        raise notice 'PASS 2  the paywall still arrives after % contacts', opened;
      else
        raise notice 'FAIL 2  the paywall arrived after % contacts', opened;
      end if;
      return;
    end;
  end loop;
  raise notice 'FAIL 2  six contacts went through with no paywall';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Opening the window lets that same family carry on
-- ---------------------------------------------------------------------------
do $$
begin
  set local role postgres;
  update public.pricing_config
     set promo_starts_at = now() - interval '1 day',
         promo_ends_at = now() + interval '3 weeks',
         promo_label = 'Free for our first three weeks';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '51111111-1111-4111-8111-111111111111',
                      'role', 'authenticated')::text, true);

  perform public.start_conversation((select id from public.nanny_profiles
                                      where user_id = '52222222-2222-4222-8222-000000000004'));
  raise notice 'PASS 3  a family past its allowance can contact during the window';
exception when others then
  raise notice 'FAIL 3  the window did not lift the paywall: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Those contacts do not count. This is the whole point.
-- ---------------------------------------------------------------------------
do $$
declare used int;
begin
  for i in 5..9 loop
    perform public.start_conversation((select id from public.nanny_profiles
      where user_id = ('52222222-2222-4222-8222-' || lpad(i::text, 12, '0'))::uuid));
  end loop;

  select free_contacts_used into used
    from public.family_contact_state(
      (select id from public.family_profiles
        where user_id = '51111111-1111-4111-8111-111111111111'));

  if used = 3 then
    raise notice 'PASS 4  six more contacts during the window, still % used', used;
  else
    raise notice 'FAIL 4  promotional contacts were counted: % used', used;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. And they are recorded as having cost nothing
-- ---------------------------------------------------------------------------
do $$
declare free_rows int;
begin
  select count(*) into free_rows
    from public.family_nanny_contacts
   where family_id = (select id from public.family_profiles
                       where user_id = '51111111-1111-4111-8111-111111111111')
     and not consumed_free_credit;

  if free_rows = 6 then
    raise notice 'PASS 5  every promotional contact is marked as free (%)', free_rows;
  else
    raise notice 'FAIL 5  expected 6 free rows, found %', free_rows;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. A family that starts during the window keeps its full allowance after
-- ---------------------------------------------------------------------------
do $$
declare newcomer uuid; newcomer_family uuid; state record;
begin
  set local role postgres;
  newcomer := '53333333-3333-4333-8333-333333333331';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (newcomer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'promo-newcomer@test.local', '', now(), '{}'::jsonb,
          '{"role":"family","first_name":"New"}'::jsonb, now(), now());
  insert into public.family_profiles (user_id, emirate, area, children_count)
  values (newcomer, 'Dubai', 'Marina', 1)
  returning id into newcomer_family;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', newcomer, 'role', 'authenticated')::text, true);

  -- Five contacts during the window, which is more than the allowance.
  for i in 1..5 loop
    perform public.start_conversation((select id from public.nanny_profiles
      where user_id = ('52222222-2222-4222-8222-' || lpad(i::text, 12, '0'))::uuid));
  end loop;

  -- The window closes.
  set local role postgres;
  update public.pricing_config
     set promo_starts_at = now() - interval '4 weeks',
         promo_ends_at = now() - interval '1 minute';

  select * into state from public.family_contact_state(newcomer_family);

  if state.free_contacts_used = 0 and state.free_contacts_remaining = 3 then
    raise notice 'PASS 6  after the window they start with all % contacts', state.free_contacts_remaining;
  else
    raise notice 'FAIL 6  used %, remaining %', state.free_contacts_used, state.free_contacts_remaining;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. And the paywall works again for them, from the beginning
-- ---------------------------------------------------------------------------
do $$
declare opened int := 0;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '53333333-3333-4333-8333-333333333331',
                      'role', 'authenticated')::text, true);

  for i in 6..10 loop
    begin
      perform public.start_conversation((select id from public.nanny_profiles
        where user_id = ('52222222-2222-4222-8222-' || lpad(i::text, 12, '0'))::uuid));
      opened := opened + 1;
    exception when sqlstate 'PAYW1' then
      if opened = 3 then
        raise notice 'PASS 7  the paywall arrives after exactly % once the window closes', opened;
      else
        raise notice 'FAIL 7  the paywall arrived after %', opened;
      end if;
      return;
    end;
  end loop;
  raise notice 'FAIL 7  no paywall after the window closed';
end $$;

-- ---------------------------------------------------------------------------
-- 8. A window in the future is not a window that is open
-- ---------------------------------------------------------------------------
do $$
begin
  set local role postgres;
  update public.pricing_config
     set promo_starts_at = now() + interval '1 week',
         promo_ends_at = now() + interval '4 weeks';

  if public.promo_active() then
    raise notice 'FAIL 8  a future window is treated as open';
  else
    raise notice 'PASS 8  a window that has not started yet is closed';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. A window that ends before it starts is refused outright
-- ---------------------------------------------------------------------------
do $$
begin
  set local role postgres;
  begin
    update public.pricing_config
       set promo_starts_at = now() + interval '1 week',
           promo_ends_at = now();
    raise notice 'FAIL 9  an impossible window was accepted';
  exception when check_violation then
    raise notice 'PASS 9  a window ending before it starts is refused';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Only an admin may open one, and it is audited
-- ---------------------------------------------------------------------------
do $$
declare admin_uid uuid;
begin
  set local role postgres;
  select id into admin_uid from public.users where role in ('admin', 'super_admin') limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '51111111-1111-4111-8111-111111111111',
                      'role', 'authenticated')::text, true);
  begin
    perform public.admin_set_promo(now(), now() + interval '3 weeks', 'nope');
    raise notice 'FAIL 10 a family opened a promotion';
  exception when sqlstate 'ROLE1' then
    raise notice 'PASS 10 only an admin can open a promotion';
  end;

  if admin_uid is null then
    raise notice 'SKIP 10 no admin to check the audit trail with';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_uid, 'role', 'authenticated')::text, true);
  perform public.admin_set_promo(now(), now() + interval '3 weeks', 'Free for three weeks');

  set local role postgres;
  if exists (select 1 from public.audit_logs where action = 'promo_changed') then
    raise notice 'PASS 11 opening a promotion is audited';
  else
    raise notice 'FAIL 11 nothing was written to audit_logs';
  end if;
end $$;

rollback;
