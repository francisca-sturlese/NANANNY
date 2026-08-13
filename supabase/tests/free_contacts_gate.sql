-- Reproduction test for the monetisation core (PRD §15, §16, §21, §22).
--
-- Not a smoke test: it drives start_conversation() exactly as the app does,
-- through auth.uid(), and asserts every rule the business model depends on.
-- Run with:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f this-file
--
-- Everything happens inside one transaction that is rolled back at the end, so
-- it leaves no residue in the local database.

begin;

\set QUIET on
\set ON_ERROR_STOP on

-- Fixed UUIDs make failures readable.
\set family_uid   '''11111111-1111-4111-8111-111111111111'''
\set nanny1_uid   '''22222222-2222-4222-8222-222222222221'''
\set nanny2_uid   '''22222222-2222-4222-8222-222222222222'''
\set nanny3_uid   '''22222222-2222-4222-8222-222222222223'''
\set nanny4_uid   '''22222222-2222-4222-8222-222222222224'''

-- ---------------------------------------------------------------------------
-- Fixtures. Inserting into auth.users fires handle_new_auth_user(), which is
-- the same path a real signup takes.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  (:family_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'family@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Test","last_name":"Family"}'::jsonb, now(), now()),
  (:nanny1_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'nanny1@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Maria"}'::jsonb, now(), now()),
  (:nanny2_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'nanny2@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Grace"}'::jsonb, now(), now()),
  (:nanny3_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'nanny3@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Anna"}'::jsonb, now(), now()),
  (:nanny4_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'nanny4@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Rose"}'::jsonb, now(), now());

-- The signup trigger must have created the mirrored rows with the right roles.
do $$
begin
  if (select count(*) from public.users
        where role = 'nanny' and email like '%@test.local') <> 4 then
    raise exception 'FAIL: handle_new_auth_user did not provision the 4 nanny rows';
  end if;
  if (select role from public.users where email = 'family@test.local') <> 'family' then
    raise exception 'FAIL: family role was not provisioned';
  end if;
end $$;

insert into public.family_profiles (user_id, emirate, area, children_count)
values (:family_uid::uuid, 'Dubai', 'Dubai Hills', 2);

insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
values
  (:nanny1_uid::uuid, 'approved', 'Dubai', 6, 'Maria'),
  (:nanny2_uid::uuid, 'approved', 'Dubai', 4, 'Grace'),
  (:nanny3_uid::uuid, 'approved', 'Dubai', 9, 'Anna'),
  (:nanny4_uid::uuid, 'approved', 'Dubai', 2, 'Rose');

-- Act as the family, the way PostgREST does.
set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :family_uid, 'role', 'authenticated')::text,
                  true);

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. A brand new family starts with the configured allowance
-- ---------------------------------------------------------------------------
do $$
declare s record;
begin
  select * into s from public.my_contact_state();
  if s.free_contacts_limit <> 3 then
    raise exception 'FAIL 1: expected limit 3, got %', s.free_contacts_limit;
  end if;
  if s.free_contacts_used <> 0 or s.free_contacts_remaining <> 3 then
    raise exception 'FAIL 1: expected 0/3 used, got %/%', s.free_contacts_used, s.free_contacts_remaining;
  end if;
  if s.subscription_active then
    raise exception 'FAIL 1: new family must not be subscribed';
  end if;
  raise notice 'PASS 1 — new family: 0/3 used, no subscription';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Viewing and saving a profile must never consume a contact (PRD §16)
-- ---------------------------------------------------------------------------
do $$
declare s record;
begin
  insert into public.saved_profiles (family_id, nanny_id)
  select public.my_family_id(), n.id from public.nanny_profiles n
   where n.user_id = '22222222-2222-4222-8222-222222222221'::uuid;

  select * into s from public.my_contact_state();
  if s.free_contacts_used <> 0 then
    raise exception 'FAIL 2: saving a profile consumed a contact (used=%)', s.free_contacts_used;
  end if;
  raise notice 'PASS 2 — saving a profile consumed nothing';
end $$;

-- ---------------------------------------------------------------------------
-- 3. The first three contacts are free
-- ---------------------------------------------------------------------------
do $$
declare
  n record;
  result jsonb;
  i int := 0;
begin
  for n in
    select np.id from public.nanny_profiles np
     where np.user_id in (
       '22222222-2222-4222-8222-222222222221'::uuid,
       '22222222-2222-4222-8222-222222222222'::uuid,
       '22222222-2222-4222-8222-222222222223'::uuid)
     order by np.user_id
  loop
    i := i + 1;
    result := public.start_conversation(n.id, 'search', 'Hello, are you available?');

    if (result ->> 'consumed_free_credit')::boolean is not true then
      raise exception 'FAIL 3: contact % should have consumed a free credit', i;
    end if;
    if (result ->> 'free_contacts_used')::int <> i then
      raise exception 'FAIL 3: after contact % expected used=%, got %',
        i, i, result ->> 'free_contacts_used';
    end if;
    raise notice 'PASS 3.% — contact % free, % of 3 used, % remaining',
      i, i, result ->> 'free_contacts_used', result ->> 'free_contacts_remaining';
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The fourth contact hits the paywall
-- ---------------------------------------------------------------------------
do $$
declare
  target uuid;
  caught text;
begin
  select np.id into target from public.nanny_profiles np
   where np.user_id = '22222222-2222-4222-8222-222222222224'::uuid;

  begin
    perform public.start_conversation(target, 'search', 'Hi there');
    raise exception 'FAIL 4: the 4th contact was allowed without a subscription';
  exception when sqlstate 'PAYW1' then
    caught := 'PAYW1';
  end;

  if caught is null then
    raise exception 'FAIL 4: expected PAYW1';
  end if;
  raise notice 'PASS 4 — 4th contact raised PAYW1 (paywall)';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Re-contacting a nanny already messaged costs nothing (PRD §16)
-- ---------------------------------------------------------------------------
do $$
declare
  target uuid;
  result jsonb;
begin
  select np.id into target from public.nanny_profiles np
   where np.user_id = '22222222-2222-4222-8222-222222222221'::uuid;

  result := public.start_conversation(target, 'profile', 'Following up');

  if (result ->> 'already_contacted')::boolean is not true then
    raise exception 'FAIL 5: reopening was not recognised as an existing contact';
  end if;
  if (result ->> 'free_contacts_used')::int <> 3 then
    raise exception 'FAIL 5: reopening changed the count to %', result ->> 'free_contacts_used';
  end if;
  raise notice 'PASS 5 — reopening an existing thread: still 3/3, no second charge';
end $$;

-- ---------------------------------------------------------------------------
-- 6. The unique constraint is the real guarantee, not just the function
-- ---------------------------------------------------------------------------
do $$
declare
  fam uuid := public.my_family_id();
  target uuid;
begin
  select np.id into target from public.nanny_profiles np
   where np.user_id = '22222222-2222-4222-8222-222222222221'::uuid;

  begin
    set local role postgres;
    insert into public.family_nanny_contacts (family_id, nanny_id) values (fam, target);
    raise exception 'FAIL 6: a duplicate family/nanny contact row was accepted';
  exception when unique_violation then
    raise notice 'PASS 6 — duplicate (family_id, nanny_id) rejected by the database itself';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 7. An active subscription unlocks unlimited contacts
-- ---------------------------------------------------------------------------
set local role postgres;
insert into public.subscriptions (family_id, plan, status, price_aed, current_period_end)
select id, 'monthly', 'active', 250.00, now() + interval '30 days'
  from public.family_profiles
 where user_id = '11111111-1111-4111-8111-111111111111'::uuid;

set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :family_uid, 'role', 'authenticated')::text,
                  true);

do $$
declare
  target uuid;
  result jsonb;
  s record;
begin
  select * into s from public.my_contact_state();
  if not s.subscription_active then
    raise exception 'FAIL 7: subscription not seen as active';
  end if;

  select np.id into target from public.nanny_profiles np
   where np.user_id = '22222222-2222-4222-8222-222222222224'::uuid;

  result := public.start_conversation(target, 'match', 'Hello!');

  if (result ->> 'consumed_free_credit')::boolean is not false then
    raise exception 'FAIL 7: a subscribed family burned a free credit';
  end if;
  if (result ->> 'free_contacts_used')::int <> 3 then
    raise exception 'FAIL 7: free usage moved to % while subscribed', result ->> 'free_contacts_used';
  end if;
  raise notice 'PASS 7 — subscribed: 4th contact allowed, free credits untouched at 3/3';
end $$;

-- ---------------------------------------------------------------------------
-- 8. When the subscription lapses, unused free credits are still unused
-- ---------------------------------------------------------------------------
do $$
declare s record;
begin
  set local role postgres;
  -- Backdate the whole period, not just its end: subscription_period_valid
  -- requires end > start, and a lapsed subscription started in the past too.
  update public.subscriptions
     set status = 'expired',
         current_period_start = now() - interval '31 days',
         current_period_end = now() - interval '1 day'
   where family_id = (select id from public.family_profiles
                       where user_id = '11111111-1111-4111-8111-111111111111'::uuid);

  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', '11111111-1111-4111-8111-111111111111',
                                       'role', 'authenticated')::text, true);

  select * into s from public.my_contact_state();
  if s.subscription_active then
    raise exception 'FAIL 8: an expired subscription still reads as active';
  end if;
  if s.free_contacts_used <> 3 then
    raise exception 'FAIL 8: expected 3 free used after lapse, got %', s.free_contacts_used;
  end if;
  if s.can_contact then
    raise exception 'FAIL 8: contact allowed after lapse with 3/3 free used';
  end if;
  raise notice 'PASS 8 — after lapse: back to the paywall, free usage still 3/3 (not 4)';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Messaging inside an existing thread is always free
-- ---------------------------------------------------------------------------
do $$
declare
  conv uuid;
  s_before int;
  s_after int;
begin
  select free_contacts_used into s_before from public.my_contact_state();
  select c.id into conv from public.conversations c
    join public.family_profiles f on f.id = c.family_id
   where f.user_id = '11111111-1111-4111-8111-111111111111'::uuid
   limit 1;
  perform public.send_message(conv, 'Just following up on my earlier message.');
  select free_contacts_used into s_after from public.my_contact_state();

  if s_before <> s_after then
    raise exception 'FAIL 9: sending a message changed free usage from % to %', s_before, s_after;
  end if;
  raise notice 'PASS 9 — messaging in an open thread consumed nothing';
end $$;

-- ---------------------------------------------------------------------------
-- 10. The admin can change the allowance and it takes effect immediately
-- ---------------------------------------------------------------------------
do $$
declare s record;
begin
  set local role postgres;
  update public.pricing_config set free_contacts = 5;

  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', '11111111-1111-4111-8111-111111111111',
                                       'role', 'authenticated')::text, true);

  select * into s from public.my_contact_state();
  if s.free_contacts_limit <> 5 or s.free_contacts_remaining <> 2 then
    raise exception 'FAIL 10: expected limit 5 / remaining 2, got % / %',
      s.free_contacts_limit, s.free_contacts_remaining;
  end if;
  if not s.can_contact then
    raise exception 'FAIL 10: raising the allowance did not reopen contacting';
  end if;
  raise notice 'PASS 10 — allowance is server-side config: 5 free -> 2 remaining, paywall lifted';
end $$;

rollback;
