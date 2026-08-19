-- A family that brings a family.
--
-- This grants free contacts, and free contacts are the business, so the things
-- worth proving are not that the arithmetic adds up. They are that the reward
-- reaches the paywall (a credit nobody can spend is a lie on a screen), that a
-- signup on its own pays nothing (which is the whole fraud story), and that
-- turning the mechanic off leaves the gate exactly where it was.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on

-- No launch window: during one, nothing is consumed and every case below would
-- pass for the wrong reason.
update public.pricing_config set promo_starts_at = null, promo_ends_at = null, promo_label = null;
update public.pricing_config
   set referral_enabled = true, referral_bonus_contacts = 1, referral_bonus_max = 10;

\set inviter_uid '''61111111-1111-4111-8111-111111111111'''
\set guest_uid   '''61111111-1111-4111-8111-222222222222'''

-- Two families: one who invites, one who arrives through the link.
do $$
declare uid uuid;
begin
  foreach uid in array array['61111111-1111-4111-8111-111111111111'::uuid,
                             '61111111-1111-4111-8111-222222222222'::uuid] loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'ref-' || replace(uid::text, '-', '') || '@test.local', '', now(), '{}'::jsonb,
            '{"role":"family","first_name":"Ref","last_name":"Family"}'::jsonb, now(), now());
    -- Onboarding deliberately unfinished: earning it is what the test is about.
    insert into public.family_profiles (user_id, emirate, area, children_count)
    values (uid, 'Dubai', 'Dubai Hills', 1);
  end loop;
end $$;

-- Eight nannies, so an allowance of three plus a bonus can be spent and overrun.
do $$
declare uid uuid;
begin
  for i in 1..8 loop
    uid := ('62222222-2222-4222-8222-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'ref-nanny' || i || '@test.local', '', now(), '{}'::jsonb,
            '{"role":"nanny","first_name":"Nanny"}'::jsonb, now(), now());
    insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
    values (uid, 'approved', 'Dubai', 5, 'Ref nanny ' || i);
  end loop;
end $$;

create temporary view ref_nannies as
  select row_number() over (order by user_id) as n, id
    from public.nanny_profiles
   where user_id::text like '62222222%';
grant select on ref_nannies to authenticated;

create temporary view ref_families as
  select (select id from public.family_profiles where user_id = '61111111-1111-4111-8111-111111111111') as inviter,
         (select id from public.family_profiles where user_id = '61111111-1111-4111-8111-222222222222') as guest;
grant select on ref_families to authenticated;

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. A code is minted for the caller, and only for a family
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :inviter_uid, 'role', 'authenticated')::text, true);

do $$
declare first_code text; second_code text;
begin
  first_code := public.my_referral_code();
  second_code := public.my_referral_code();
  if first_code is null or length(first_code) <> 6 then
    raise notice 'FAIL 1  the code is not six characters: %', coalesce(first_code, 'null');
  elsif first_code <> second_code then
    raise notice 'FAIL 1  asking twice minted two codes: % then %', first_code, second_code;
  elsif first_code ~ '[O0I1]' then
    raise notice 'FAIL 1  the code contains characters that look alike: %', first_code;
  else
    raise notice 'PASS 1  one stable code, six readable characters';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. A family cannot invite itself
-- ---------------------------------------------------------------------------
do $$
declare result jsonb;
begin
  result := public.claim_referral(public.my_referral_code());
  if (result->>'claimed')::boolean then
    raise notice 'FAIL 2  a family claimed its own invite code';
  else
    raise notice 'PASS 2  a family cannot claim its own code (%)', result->>'reason';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The guest claims the code, and claiming twice changes nothing
-- ---------------------------------------------------------------------------
do $$
declare code text; first_result jsonb; second_result jsonb; rows int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '61111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
  code := public.my_referral_code();

  perform set_config('request.jwt.claims',
    json_build_object('sub', '61111111-1111-4111-8111-222222222222', 'role', 'authenticated')::text, true);
  first_result := public.claim_referral(code);
  second_result := public.claim_referral(code);

  -- Counted as postgres on purpose: a family cannot read this table, which is
  -- the design and is asserted at the end. Reading it here as the family would
  -- test the grant rather than the claim.
  set local role postgres;
  select count(*) into rows from public.family_referrals
   where referred_family_id = (select guest from ref_families);

  if (first_result->>'claimed')::boolean and not (second_result->>'claimed')::boolean and rows = 1 then
    raise notice 'PASS 3  claimed once, and a second attempt left one row';
  else
    raise notice 'FAIL 3  first % second % rows %', first_result, second_result, rows;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A signup alone pays nothing. This is the fraud story.
-- ---------------------------------------------------------------------------
do $$
declare inviter_bonus int; guest_bonus int;
begin
  inviter_bonus := public.family_referral_bonus((select inviter from ref_families));
  guest_bonus := public.family_referral_bonus((select guest from ref_families));
  if inviter_bonus = 0 and guest_bonus = 0 then
    raise notice 'PASS 4  an invitation that produced only a signup pays nothing';
  else
    raise notice 'FAIL 4  paid % and % before the guest finished onboarding', inviter_bonus, guest_bonus;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Finishing onboarding pays both sides, once each
-- ---------------------------------------------------------------------------
do $$
declare inviter_bonus int; guest_bonus int;
begin
  set local role postgres;
  update public.family_profiles set onboarding_completed_at = now()
   where id = (select guest from ref_families);

  inviter_bonus := public.family_referral_bonus((select inviter from ref_families));
  guest_bonus := public.family_referral_bonus((select guest from ref_families));
  if inviter_bonus = 1 and guest_bonus = 1 then
    raise notice 'PASS 5  both sides earned exactly one';
  else
    raise notice 'FAIL 5  inviter % guest %', inviter_bonus, guest_bonus;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The reward reaches the paywall: a fourth contact goes through
-- ---------------------------------------------------------------------------
do $$
declare opened int := 0;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '61111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

  for i in 1..6 loop
    begin
      perform public.start_conversation((select id from ref_nannies where n = i));
      opened := opened + 1;
    exception when sqlstate 'PAYW1' then
      exit;
    end;
  end loop;

  if opened = 4 then
    raise notice 'PASS 6  three free contacts plus the one that was earned';
  else
    raise notice 'FAIL 6  % contacts went through, expected 4', opened;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Usage is still derived, not banked
-- ---------------------------------------------------------------------------
do $$
declare st record;
begin
  select * into st from public.family_contact_state((select inviter from ref_families));
  if st.free_contacts_limit = 4 and st.free_contacts_used = 4 and st.free_contacts_remaining = 0
     and st.referral_bonus = 1 then
    raise notice 'PASS 7  limit 4, used 4, nothing left, bonus reported separately';
  else
    raise notice 'FAIL 7  limit % used % remaining % bonus %',
      st.free_contacts_limit, st.free_contacts_used, st.free_contacts_remaining, st.referral_bonus;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Turning it off puts the gate back exactly where it was
-- ---------------------------------------------------------------------------
do $$
declare st record;
begin
  set local role postgres;
  update public.pricing_config set referral_enabled = false;
  select * into st from public.family_contact_state((select inviter from ref_families));
  if st.free_contacts_limit = 3 and st.referral_bonus = 0 and st.can_contact = false then
    raise notice 'PASS 8  switched off, the allowance is three again';
  else
    raise notice 'FAIL 8  limit % bonus % can_contact %',
      st.free_contacts_limit, st.referral_bonus, st.can_contact;
  end if;
  update public.pricing_config set referral_enabled = true;
end $$;

-- ---------------------------------------------------------------------------
-- 9. The ceiling holds, which is what makes this a priced offer
-- ---------------------------------------------------------------------------
do $$
declare bonus int;
begin
  set local role postgres;
  update public.pricing_config set referral_bonus_max = 0;
  bonus := public.family_referral_bonus((select inviter from ref_families));
  if bonus = 0 then
    raise notice 'PASS 9  the ceiling is enforced';
  else
    raise notice 'FAIL 9  the ceiling was ignored: %', bonus;
  end if;
  update public.pricing_config set referral_bonus_max = 10;
end $$;

-- ---------------------------------------------------------------------------
-- 10. A guest who leaves takes the reward with them
-- ---------------------------------------------------------------------------
do $$
declare bonus int; guest_user uuid;
begin
  set local role postgres;
  select user_id into guest_user from public.family_profiles where id = (select guest from ref_families);
  delete from public.family_profiles where id = (select guest from ref_families);
  bonus := public.family_referral_bonus((select inviter from ref_families));
  if bonus = 0 then
    raise notice 'PASS 10  the reward for an account that no longer exists is gone';
  else
    raise notice 'FAIL 10  still paying % for a family that left', bonus;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. An anonymous session cannot read who invited whom
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  set local role anon;
  begin
    select count(*) into n from public.family_referrals;
    raise notice 'FAIL 11  anon read % rows of the referral table', n;
  exception when insufficient_privilege then
    raise notice 'PASS 11  anon cannot read the referral table at all';
  end;
  set local role postgres;
end $$;

rollback;
