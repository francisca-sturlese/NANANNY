-- Finishing onboarding posts the job.
--
-- Written for a real failure: the first family to try could not find the job
-- form, because it lived on a page that was not in the navigation. The deeper
-- problem was that the form existed at all, asking again for what onboarding
-- had already collected.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on
\set uid '''81111111-1111-4111-8111-111111111111'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values (:uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'publish-family@test.local', '', now(), '{}'::jsonb,
        '{"role":"family","first_name":"Faya","last_name":"Test"}'::jsonb, now(), now());

insert into public.family_profiles (user_id, emirate, area, children_count, display_name)
values (:uid::uuid, 'Dubai', 'Jumeirah', 2, 'The Test family');

insert into public.family_children (family_id, age_years)
select id, unnest(array[2, 5]) from public.family_profiles where user_id = :uid::uuid;

insert into public.family_requirements (
  family_id, label, is_primary, arrangement, employment_types, working_days,
  working_hours_start, working_hours_end, languages, salary_min_aed,
  salary_max_aed, required_experience_years, needs_driving, needs_cooking,
  has_pets, start_date, additional_requirements)
select id, 'Main', true, 'live_out', array['full_time']::public.employment_type[],
       array['mon','tue','wed','thu','fri']::text[], '07:30', '18:00',
       array['English','Arabic']::text[], 4000, 6000, 3, true, true, true,
       current_date + 14, 'We would like someone calm and used to school runs.'
  from public.family_profiles where user_id = :uid::uuid;

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. Nothing is posted while onboarding is unfinished
-- ---------------------------------------------------------------------------
select case when not exists (
         select 1 from public.jobs
          where family_id = (select id from public.family_profiles where user_id = :uid::uuid))
       then 'PASS 1  an unfinished profile posts nothing'
       else 'FAIL 1  a job appeared before onboarding was finished' end;

-- ---------------------------------------------------------------------------
-- 2. Finishing onboarding posts it, live
-- ---------------------------------------------------------------------------
do $$
declare fam uuid; j record;
begin
  select id into fam from public.family_profiles
   where user_id = '81111111-1111-4111-8111-111111111111';

  update public.family_profiles set onboarding_completed_at = now() where id = fam;

  select * into j from public.jobs where family_id = fam;

  if j.id is null then
    raise notice 'FAIL 2  finishing onboarding posted nothing';
  elsif j.status <> 'active' then
    raise notice 'FAIL 2  posted as % rather than active', j.status;
  else
    raise notice 'PASS 2  finishing onboarding posts a live job: %', j.title;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. It carries what the family actually said
-- ---------------------------------------------------------------------------
do $$
declare j record; wrong text[] := '{}';
begin
  select * into j from public.jobs
   where family_id = (select id from public.family_profiles
                       where user_id = '81111111-1111-4111-8111-111111111111');

  if j.emirate is distinct from 'Dubai' then wrong := wrong || 'emirate'; end if;
  if j.area is distinct from 'Jumeirah' then wrong := wrong || 'area'; end if;
  if j.arrangement::text <> 'live_out' then wrong := wrong || 'arrangement'; end if;
  if j.salary_min_aed <> 4000 or j.salary_max_aed <> 6000 then wrong := wrong || 'salary'; end if;
  if j.children_ages <> array[2, 5] then wrong := wrong || 'children'; end if;
  if not (j.required_languages @> array['English','Arabic']) then wrong := wrong || 'languages'; end if;
  if not j.driving_required or not j.cooking_required then wrong := wrong || 'skills'; end if;
  if not j.has_pets then wrong := wrong || 'pets'; end if;
  if array_length(j.working_days, 1) <> 5 then wrong := wrong || 'days'; end if;

  if cardinality(wrong) = 0 then
    raise notice 'PASS 3  every answer carried across to the post';
  else
    raise notice 'FAIL 3  wrong: %', array_to_string(wrong, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A nanny can find it
-- ---------------------------------------------------------------------------
-- At the top level rather than inside a DO block: `set local role` inside one
-- applies to the transaction but the block's own plan is already prepared as
-- the outer role, and the mix produces a permission error that says nothing
-- useful.
set local role anon;
select set_config('request.jwt.claims', null, true);

select case when count(id) = 1
       then 'PASS 4  the post is visible to somebody looking for work'
       else 'FAIL 4  ' || count(id) || ' posts visible to an anonymous visitor' end
  from public.jobs
 where title = 'Live out nanny needed in Jumeirah';

set local role postgres;

-- ---------------------------------------------------------------------------
-- 5. Editing the profile afterwards does not post a second one
-- ---------------------------------------------------------------------------
do $$
declare fam uuid; n int;
begin
  select id into fam from public.family_profiles
   where user_id = '81111111-1111-4111-8111-111111111111';

  update public.family_profiles set area = 'Umm Suqeim' where id = fam;
  update public.family_profiles set onboarding_completed_at = now() where id = fam;

  select count(*) into n from public.jobs where family_id = fam;

  if n = 1 then
    raise notice 'PASS 5  editing later posts nothing new';
  else
    raise notice 'FAIL 5  % posts after an edit', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. A family that closed their post does not get it reopened
-- ---------------------------------------------------------------------------
do $$
declare fam uuid; n int;
begin
  select id into fam from public.family_profiles
   where user_id = '81111111-1111-4111-8111-111111111111';

  update public.jobs set status = 'closed' where family_id = fam;
  perform public.publish_job_from_requirements(fam);

  select count(*) into n from public.jobs where family_id = fam and status = 'active';

  if n = 0 then
    raise notice 'PASS 6  a closed post stays closed';
  else
    raise notice 'FAIL 6  a closed post was reopened or duplicated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Retroactively, a family who finished before this existed gets one
-- ---------------------------------------------------------------------------
do $$
declare uid uuid := '81111111-1111-4111-8111-111111111112'; fam uuid; created uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'publish-old@test.local', '', now(), '{}'::jsonb,
          '{"role":"family","first_name":"Older"}'::jsonb, now(), now());

  -- Completed in the same statement, so the trigger never fires: exactly the
  -- state every family registered before today is in.
  insert into public.family_profiles (user_id, emirate, area, children_count, onboarding_completed_at)
  values (uid, 'Sharjah', 'Al Majaz', 1, now())
  returning id into fam;

  insert into public.family_requirements (family_id, label, is_primary, arrangement, working_days)
  values (fam, 'Main', true, 'live_in', array['mon','tue','wed']::text[]);

  if exists (select 1 from public.jobs where family_id = fam) then
    raise notice 'FAIL 7  the trigger fired when it should not have';
    return;
  end if;

  created := public.publish_job_from_requirements(fam);

  if created is not null then
    raise notice 'PASS 7  an existing family can be given a post retroactively';
  else
    raise notice 'FAIL 7  nothing was created';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. A family with no requirements at all is left alone
-- ---------------------------------------------------------------------------
do $$
declare uid uuid := '81111111-1111-4111-8111-111111111113'; fam uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'publish-empty@test.local', '', now(), '{}'::jsonb,
          '{"role":"family","first_name":"Empty"}'::jsonb, now(), now());

  insert into public.family_profiles (user_id, emirate, children_count)
  values (uid, 'Dubai', 1) returning id into fam;

  if public.publish_job_from_requirements(fam) is null
     and not exists (select 1 from public.jobs where family_id = fam) then
    raise notice 'PASS 8  nothing is invented for a family who said nothing';
  else
    raise notice 'FAIL 8  a post was created out of nothing';
  end if;
end $$;

rollback;
