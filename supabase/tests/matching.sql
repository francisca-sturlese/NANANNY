-- Tests for the match score (PRD §24).
--
-- The point of a deterministic score is that it can be checked. Each case here
-- changes exactly one thing about a nanny and asserts the score moves the way a
-- family would expect, and that the sentence explaining it actually appears.
--
-- Run with:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f this-file
-- Rolled back at the end, so it leaves nothing behind.

begin;

\set QUIET on
\set ON_ERROR_STOP on

\set family_uid '''31111111-1111-4111-8111-111111111111'''
\set perfect_uid '''32222222-2222-4222-8222-222222222221'''
\set faraway_uid '''32222222-2222-4222-8222-222222222222'''
\set pricey_uid  '''32222222-2222-4222-8222-222222222223'''
\set livein_uid  '''32222222-2222-4222-8222-222222222224'''
\set pending_uid '''32222222-2222-4222-8222-222222222225'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  (:family_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'match-family@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Test","last_name":"Family"}'::jsonb, now(), now()),
  (:perfect_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'match-perfect@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Perfect"}'::jsonb, now(), now()),
  (:faraway_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'match-faraway@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Faraway"}'::jsonb, now(), now()),
  (:pricey_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'match-pricey@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Pricey"}'::jsonb, now(), now()),
  (:livein_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'match-livein@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Livein"}'::jsonb, now(), now()),
  (:pending_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'match-pending@test.local', '', now(), '{}'::jsonb, '{"role":"nanny","first_name":"Pending"}'::jsonb, now(), now());

insert into public.family_profiles (user_id, emirate, area, children_count)
values (:family_uid::uuid, 'Dubai', 'Dubai Hills', 1);

insert into public.family_children (family_id, age_years)
select id, 2 from public.family_profiles where user_id = :family_uid::uuid;

insert into public.family_requirements (
  family_id, label, is_primary, arrangement, working_days, languages,
  salary_min_aed, salary_max_aed, required_experience_years,
  needs_toddler_care, needs_cooking, start_date)
select id, 'Main', true, 'live_out',
       array['mon','tue','wed','thu','fri']::text[],
       array['English']::text[],
       3000, 5000, 3, true, true, current_date + 30
  from public.family_profiles where user_id = :family_uid::uuid;

-- Every nanny below is identical to the first except for the one thing named
-- after her, so any score difference has exactly one cause. The last is left
-- awaiting review on purpose: she must never be matched.
insert into public.nanny_profiles (
  user_id, status, first_name, emirate, preferred_locations, years_experience,
  arrangement, available_from, available_days, languages,
  salary_expectation_min_aed, salary_expectation_max_aed,
  toddler_experience, can_cook)
values
  (:perfect_uid::uuid, 'approved', 'Perfect', 'Dubai', '{}'::text[], 6,
   'live_out', current_date, array['mon','tue','wed','thu','fri','sat']::text[],
   array['English','Tagalog']::text[], 4000, 5000, true, true),
  (:faraway_uid::uuid, 'approved', 'Faraway', 'Fujairah', array['Fujairah']::text[], 6,
   'live_out', current_date, array['mon','tue','wed','thu','fri','sat']::text[],
   array['English']::text[], 4000, 5000, true, true),
  (:pricey_uid::uuid, 'approved', 'Pricey', 'Dubai', '{}'::text[], 6,
   'live_out', current_date, array['mon','tue','wed','thu','fri','sat']::text[],
   array['English']::text[], 9000, 12000, true, true),
  (:livein_uid::uuid, 'approved', 'Livein', 'Dubai', '{}'::text[], 6,
   'live_in', current_date, array['mon','tue','wed','thu','fri','sat']::text[],
   array['English']::text[], 4000, 5000, true, true),
  (:pending_uid::uuid, 'submitted', 'Pending', 'Dubai', '{}'::text[], 6,
   'live_out', current_date, array['mon','tue','wed','thu','fri','sat']::text[],
   array['English']::text[], 4000, 5000, true, true);

create temporary view fam as
  select id from public.family_profiles where user_id = :family_uid::uuid;
create temporary view nan as
  select user_id, id from public.nanny_profiles;

-- The views are created as postgres; the assertions run as authenticated.
grant select on fam, nan to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :family_uid, 'role', 'authenticated')::text,
                  true);

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. A nanny who fits every stated requirement scores at the top
-- ---------------------------------------------------------------------------
select case when (public.compute_match(
         (select id from fam),
         (select id from nan where user_id = :perfect_uid::uuid)) ->> 'score')::numeric >= 95
       then 'PASS 1  perfect fit scores 95 or more'
       else 'FAIL 1  got ' || (public.compute_match((select id from fam),
              (select id from nan where user_id = :perfect_uid::uuid)) ->> 'score') end;

-- ---------------------------------------------------------------------------
-- 2. Perfect fit has no conflicts to report
-- ---------------------------------------------------------------------------
select case when jsonb_array_length(public.compute_match(
         (select id from fam),
         (select id from nan where user_id = :perfect_uid::uuid)) -> 'conflicts') = 0
       then 'PASS 2  perfect fit lists no conflicts'
       else 'FAIL 2  unexpected conflicts' end;

-- ---------------------------------------------------------------------------
-- 3. Every reason is a sentence, not a bare field name
-- ---------------------------------------------------------------------------
select case when (select bool_and(length(r) > 12 and r ~ '\S \S')
                    from jsonb_array_elements_text(
                      public.compute_match((select id from fam),
                        (select id from nan where user_id = :perfect_uid::uuid)) -> 'reasons') r)
       then 'PASS 3  reasons read as sentences'
       else 'FAIL 3  a reason is not readable' end;

-- ---------------------------------------------------------------------------
-- 4. The wrong emirate costs points and says so
-- ---------------------------------------------------------------------------
select case when (public.compute_match((select id from fam),
                    (select id from nan where user_id = :faraway_uid::uuid)) -> 'breakdown' ->> 'location')::numeric < 0.2
                and (public.compute_match((select id from fam),
                    (select id from nan where user_id = :faraway_uid::uuid)) -> 'conflicts')::text like '%Fujairah%'
       then 'PASS 4  wrong emirate scores low and is explained'
       else 'FAIL 4  location not penalised' end;

-- ---------------------------------------------------------------------------
-- 5. Distance alone does not sink an otherwise good nanny
-- ---------------------------------------------------------------------------
select case when (public.compute_match((select id from fam),
                    (select id from nan where user_id = :faraway_uid::uuid)) ->> 'score')::numeric
                between 60 and 90
       then 'PASS 5  one bad dimension is a dent, not a write off'
       else 'FAIL 5  got ' || (public.compute_match((select id from fam),
              (select id from nan where user_id = :faraway_uid::uuid)) ->> 'score') end;

-- ---------------------------------------------------------------------------
-- 6. Well over budget scores zero on salary
-- ---------------------------------------------------------------------------
select case when (public.compute_match((select id from fam),
                    (select id from nan where user_id = :pricey_uid::uuid)) -> 'breakdown' ->> 'salary')::numeric = 0
       then 'PASS 6  far over budget scores zero on salary'
       else 'FAIL 6  salary not penalised' end;

-- ---------------------------------------------------------------------------
-- 7. Live in against live out is a hard mismatch
-- ---------------------------------------------------------------------------
select case when (public.compute_match((select id from fam),
                    (select id from nan where user_id = :livein_uid::uuid)) -> 'breakdown' ->> 'arrangement')::numeric = 0
                and (public.compute_match((select id from fam),
                    (select id from nan where user_id = :livein_uid::uuid)) -> 'conflicts')::text like '%live in%'
       then 'PASS 7  live in versus live out is flagged'
       else 'FAIL 7  arrangement mismatch missed' end;

-- ---------------------------------------------------------------------------
-- 8. A nanny awaiting review is never scored
-- ---------------------------------------------------------------------------
select case when public.compute_match((select id from fam),
                   (select id from nan where user_id = :pending_uid::uuid)) is null
       then 'PASS 8  unapproved nanny returns no match'
       else 'FAIL 8  unapproved nanny was scored' end;

-- ---------------------------------------------------------------------------
-- 9. Refreshing stores one row per approved nanny
-- ---------------------------------------------------------------------------
select case when public.refresh_matches() = (select count(*) from public.nanny_profiles where status = 'approved')
       then 'PASS 9  refresh covers every approved nanny'
       else 'FAIL 9  wrong number refreshed' end;

-- ---------------------------------------------------------------------------
-- 10. Stored rows carry the same score the function returns
-- ---------------------------------------------------------------------------
select case when (select score from public.matches
                   where family_id = (select id from fam)
                     and nanny_id = (select id from nan where user_id = :perfect_uid::uuid))
              = round((public.compute_match((select id from fam),
                  (select id from nan where user_id = :perfect_uid::uuid)) ->> 'score')::numeric, 2)
       then 'PASS 10 stored score matches computed score'
       else 'FAIL 10 stored score drifted' end;

-- ---------------------------------------------------------------------------
-- 11. Refreshing twice updates rather than duplicates
-- ---------------------------------------------------------------------------
select public.refresh_matches();
select case when (select count(*) from public.matches
                   where family_id = (select id from fam)
                     and nanny_id = (select id from nan where user_id = :perfect_uid::uuid)) = 1
       then 'PASS 11 refresh is idempotent'
       else 'FAIL 11 duplicate match rows' end;

-- ---------------------------------------------------------------------------
-- 12. The unapproved nanny is absent from stored matches
-- ---------------------------------------------------------------------------
select case when not exists (select 1 from public.matches
                              where family_id = (select id from fam)
                                and nanny_id = (select id from nan where user_id = :pending_uid::uuid))
       then 'PASS 12 unapproved nanny is not stored'
       else 'FAIL 12 unapproved nanny stored' end;

-- ---------------------------------------------------------------------------
-- 13. A nanny who loses approval drops out on the next refresh
-- ---------------------------------------------------------------------------
do $$
begin
  set local role postgres;
  update public.nanny_profiles set status = 'suspended'
   where user_id = '32222222-2222-4222-8222-222222222223';
end $$;
set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :family_uid, 'role', 'authenticated')::text, true);
select public.refresh_matches();
select case when not exists (select 1 from public.matches
                              where family_id = (select id from fam)
                                and nanny_id = (select id from nan where user_id = :pricey_uid::uuid))
       then 'PASS 13 suspended nanny is removed'
       else 'FAIL 13 suspended nanny still matched' end;

-- ---------------------------------------------------------------------------
-- 14. A family cannot refresh someone else's matches
-- ---------------------------------------------------------------------------
do $$
declare other uuid;
begin
  -- Read as postgres: as the family, RLS hides every other family's row, and
  -- the test would silently skip itself.
  set local role postgres;
  select id into other from public.family_profiles
   where user_id <> '31111111-1111-4111-8111-111111111111' limit 1;
  set local role authenticated;

  if other is null then
    raise notice 'SKIP 14 no other family in the database';
    return;
  end if;

  begin
    perform public.refresh_matches(other);
    raise notice 'FAIL 14 refreshed another family''s matches';
  exception when others then
    raise notice 'PASS 14 refreshing another family is refused';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 15. Changing an admin weight changes the score
-- ---------------------------------------------------------------------------
do $$
declare before_score numeric; after_score numeric;
begin
  select (public.compute_match(
            (select id from public.family_profiles where user_id = '31111111-1111-4111-8111-111111111111'),
            (select id from public.nanny_profiles where user_id = '32222222-2222-4222-8222-222222222222'))
          ->> 'score')::numeric into before_score;

  set local role postgres;
  update public.matching_weights set weight = weight * 4 where dimension = 'location';

  select (public.compute_match(
            (select id from public.family_profiles where user_id = '31111111-1111-4111-8111-111111111111'),
            (select id from public.nanny_profiles where user_id = '32222222-2222-4222-8222-222222222222'))
          ->> 'score')::numeric into after_score;

  if after_score < before_score then
    raise notice 'PASS 15 weights drive the score (% to %)', before_score, after_score;
  else
    raise notice 'FAIL 15 weight change had no effect (% to %)', before_score, after_score;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 16. A family that answered everything has no unknown dimensions
-- ---------------------------------------------------------------------------
do $$
declare u jsonb;
begin
  set local role authenticated;
  select public.compute_match(
           (select id from public.family_profiles where user_id = '31111111-1111-4111-8111-111111111111'),
           (select id from public.nanny_profiles where user_id = '32222222-2222-4222-8222-222222222221'))
         -> 'unknowns' into u;

  if jsonb_array_length(u) = 0 then
    raise notice 'PASS 16 nothing marked unknown when everything was answered';
  else
    raise notice 'FAIL 16 unexpected unknowns: %', u;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 17. A question the family skipped is named, not scored as half a fit
-- ---------------------------------------------------------------------------
do $$
declare u jsonb;
begin
  set local role postgres;
  update public.family_requirements set languages = '{}'::text[]
   where family_id = (select id from public.family_profiles
                       where user_id = '31111111-1111-4111-8111-111111111111');

  select public.compute_match(
           (select id from public.family_profiles where user_id = '31111111-1111-4111-8111-111111111111'),
           (select id from public.nanny_profiles where user_id = '32222222-2222-4222-8222-222222222221'))
         -> 'unknowns' into u;

  if u ? 'language' then
    raise notice 'PASS 17 a skipped question is reported as unknown';
  else
    raise notice 'FAIL 17 skipped question was silently scored: %', u;
  end if;
end $$;

rollback;
