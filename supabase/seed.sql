-- NaNanny UAE — development seed data
--
-- ⚠️  DEVELOPMENT DATA ONLY. Everything below is invented.
--     No real person's details appear here. Every account uses the reserved
--     example.test domain and the shared password below, and every profile is
--     labelled so it can never be mistaken for a real user.
--
--     Password for every seeded account: NaNannyDev2026!
--
-- Loaded automatically by `supabase db reset`.

-- ---------------------------------------------------------------------------
-- Helper: create an auth user the same way a real signup does, so the
-- handle_new_auth_user trigger provisions public.users for us.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.seed_user(
  p_id uuid,
  p_email text,
  p_role text,
  p_first text,
  p_last text,
  p_phone text default null,
  p_location text default null
) returns uuid
language plpgsql
as $$
begin
  -- The token columns must be empty strings, never NULL. GoTrue scans them
  -- into Go strings during sign-in, and a NULL makes the whole login fail with
  -- a generic "invalid credentials" — the account looks fine in the table but
  -- can never log in.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, email_change, phone_change, phone_change_token,
    reauthentication_token
  )
  values (
    p_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    extensions.crypt('NaNannyDev2026!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', p_role, 'first_name', p_first, 'last_name', p_last,
                       'phone', p_phone, 'location', p_location, 'seed', true),
    now() - (random() * interval '90 days'),
    now(),
    '', '', '', '', '', '', '', ''
  )
  on conflict (id) do nothing;

  -- Supabase requires an identity row for password sign-in to work.
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  values (
    extensions.gen_random_uuid(),
    p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email',
    p_id::text,
    now(), now(), now()
  )
  on conflict do nothing;

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- One admin, for the review queue
-- ---------------------------------------------------------------------------

select pg_temp.seed_user(
  '00000000-0000-4000-8000-00000000ad11'::uuid,
  'admin@nananny.example.test', 'family', 'Dev', 'Admin');

-- Roles are clamped by the signup trigger; an admin is made deliberately here.
update public.users set role = 'admin'
 where id = '00000000-0000-4000-8000-00000000ad11';

-- ---------------------------------------------------------------------------
-- 20 nanny profiles — varied nationality, experience, availability and pay
-- ---------------------------------------------------------------------------

do $$
declare
  seed_nannies jsonb := jsonb_build_array(
    -- name, nationality, emirate, area, yrs, uae_yrs, sal_min, sal_max, arrangement, english, status, newborn, toddler, school, special, driving, cook, house, pets, firstaid, langs, headline
    jsonb_build_array('Maria',    'Filipino',     'Dubai',     'Dubai Hills',      9,  7, 4500, 5500, 'live_out', 'fluent',         'approved', true,  true,  true,  false, true,  true,  true,  true,  true,  jsonb_build_array('English','Tagalog'),                    'Warm, organised nanny with nine years caring for young children in Dubai'),
    jsonb_build_array('Grace',    'Kenyan',       'Dubai',     'Al Barsha',        5,  5, 3500, 4200, 'live_in',  'fluent',         'approved', false, true,  true,  false, false, true,  true,  false, false, jsonb_build_array('English','Swahili'),                    'Patient and playful, happiest with toddlers and school runs'),
    jsonb_build_array('Anna',     'Sri Lankan',   'Dubai',     'Mirdif',          12,  9, 5000, 6000, 'live_in',  'conversational', 'approved', true,  true,  true,  true,  false, true,  true,  true,  true,  jsonb_build_array('English','Sinhala'),                    'Twelve years with families, including newborns and additional needs'),
    jsonb_build_array('Rose',     'Filipino',     'Abu Dhabi', 'Khalifa City',     3,  2, 3000, 3800, 'live_out', 'fluent',         'approved', false, true,  false, false, true,  false, false, true,  false, jsonb_build_array('English','Tagalog'),                    'Energetic nanny who loves outdoor play and messy art'),
    jsonb_build_array('Meseret',  'Ethiopian',    'Dubai',     'Jumeirah',         7,  6, 3800, 4500, 'live_in',  'conversational', 'approved', true,  true,  false, false, false, true,  true,  false, true,  jsonb_build_array('English','Amharic','Arabic'),           'Gentle with babies, seven years of live-in experience'),
    jsonb_build_array('Divya',    'Indian',       'Dubai',     'Business Bay',     6,  4, 4000, 4800, 'live_out', 'native',         'approved', false, true,  true,  true,  true,  true,  false, false, true,  jsonb_build_array('English','Hindi','Malayalam'),          'Former teacher, strong with homework and routines'),
    jsonb_build_array('Nilufar',  'Other',        'Sharjah',   'Al Majaz',         4,  3, 2800, 3400, 'live_out', 'conversational', 'approved', false, true,  true,  false, false, true,  true,  false, false, jsonb_build_array('English','Russian'),                    'Calm and reliable, available immediately in Sharjah'),
    jsonb_build_array('Fatima',   'Moroccan',     'Dubai',     'Downtown Dubai',   8,  8, 4600, 5400, 'live_out', 'fluent',         'approved', true,  true,  true,  false, true,  true,  false, false, true,  jsonb_build_array('English','Arabic','French'),            'Arabic and French speaking, eight years in Dubai'),
    jsonb_build_array('Joy',      'Ugandan',      'Dubai',     'Motor City',       2,  1, 2600, 3200, 'live_in',  'fluent',         'approved', false, true,  false, false, false, false, true,  true,  false, jsonb_build_array('English'),                              'Newly in Dubai, warm and eager, great with toddlers'),
    jsonb_build_array('Sarah',    'British',      'Dubai',     'Emirates Hills',  10,  5, 8000,10000, 'live_out', 'native',         'approved', true,  true,  true,  true,  true,  true,  false, true,  true,  jsonb_build_array('English','French'),                     'Norland-trained, ten years with families in London and Dubai'),
    jsonb_build_array('Lakshmi',  'Indian',       'Abu Dhabi', 'Al Reem Island',   5,  5, 3400, 4000, 'live_in',  'conversational', 'approved', true,  true,  false, false, false, true,  true,  false, false, jsonb_build_array('English','Hindi','Tamil'),              'Five years with newborns and toddlers in Abu Dhabi'),
    jsonb_build_array('Precious', 'South African','Dubai',     'Palm Jumeirah',    6,  3, 5500, 6500, 'live_out', 'native',         'approved', false, true,  true,  false, true,  true,  false, true,  true,  jsonb_build_array('English'),                              'Confident driver, school runs and after-school activities'),
    jsonb_build_array('Bina',     'Nepali',       'Dubai',     'Silicon Oasis',    3,  3, 2700, 3300, 'live_in',  'basic',          'approved', false, true,  true,  false, false, true,  true,  false, false, jsonb_build_array('English','Nepali'),                     'Hard-working and kind, three years with one Dubai family'),
    jsonb_build_array('Amina',    'Egyptian',     'Sharjah',   'Al Nahda',         9,  7, 3600, 4300, 'live_out', 'conversational', 'approved', true,  true,  true,  false, false, true,  true,  false, true,  jsonb_build_array('English','Arabic'),                     'Arabic-speaking nanny, nine years and excellent references'),
    jsonb_build_array('Cherry',   'Filipino',     'Dubai',     'JVC',              4,  4, 3200, 3900, 'either',   'fluent',         'approved', false, true,  true,  false, false, true,  true,  true,  false, jsonb_build_array('English','Tagalog'),                    'Cheerful and tidy, flexible about live in or live out'),
    jsonb_build_array('Selam',    'Ethiopian',    'Abu Dhabi', 'Yas Island',       7,  4, 3500, 4200, 'live_in',  'conversational', 'approved', true,  true,  false, true,  false, true,  true,  false, true,  jsonb_build_array('English','Amharic'),                    'Experienced with premature babies and additional needs'),
    -- Deliberately not approved, so the review queue is never empty in dev.
    jsonb_build_array('Halima',   'Kenyan',       'Dubai',     'Al Barsha',        5,  2, 3300, 4000, 'live_out', 'fluent',         'submitted', false, true,  true,  false, false, true,  false, false, false, jsonb_build_array('English','Swahili'),                   'Five years with families, now looking in Dubai'),
    jsonb_build_array('Ratna',    'Indonesian',   'Dubai',     'The Springs',      6,  6, 3700, 4400, 'live_in',  'conversational', 'submitted', true,  true,  true,  false, false, true,  true,  true,  false, jsonb_build_array('English','Indonesian'),                'Six years live-in, comfortable with a busy household'),
    jsonb_build_array('Aster',    'Ethiopian',    'Dubai',     'Mirdif',           2,  2, 2600, 3100, 'live_out', 'basic',          'under_review', false, true, false, false, false, true, true, false, false, jsonb_build_array('English','Amharic'),                'Two years experience, looking for a first Dubai family'),
    jsonb_build_array('Nadia',    'Pakistani',    'Ajman',     'Ajman',            1,  1, 2400, 2900, 'live_out', 'conversational', 'draft',    false, true,  false, false, false, false, false, false, false, jsonb_build_array('English','Urdu'),                       'Just starting out, warm with young children')
  );
  item jsonb;
  i int := 0;
  uid uuid;
  nid uuid;
begin
  for item in select * from jsonb_array_elements(seed_nannies) loop
    i := i + 1;
    uid := ('00000000-0000-4000-8000-0000000a' || lpad(i::text, 4, '0'))::uuid;

    perform pg_temp.seed_user(
      uid,
      'nanny' || i || '@nananny.example.test',
      'nanny',
      item ->> 0,
      'Testprofile',
      '+9715000000' || lpad(i::text, 2, '0'),
      item ->> 2
    );

    insert into public.nanny_profiles (
      user_id, first_name, status, nationality, emirate, area,
      years_experience, uae_experience_years,
      salary_expectation_min_aed, salary_expectation_max_aed,
      arrangement, english_level, arabic_level,
      newborn_experience, toddler_experience, school_age_experience, special_needs_experience,
      has_driving_licence, can_cook, can_housekeep, pet_experience, first_aid_certified,
      languages, headline, description,
      employment_types, available_days, available_hours_start, available_hours_end,
      available_from, date_of_birth, education, certificates, preferred_locations,
      onboarding_step, onboarding_completed_at, submitted_at
    )
    values (
      uid,
      item ->> 0,
      (item ->> 10)::public.nanny_profile_status,
      item ->> 1,
      item ->> 2,
      item ->> 3,
      (item ->> 4)::int,
      (item ->> 5)::int,
      (item ->> 6)::int,
      (item ->> 7)::int,
      (item ->> 8)::public.care_arrangement,
      (item ->> 9)::public.language_level,
      case when (item -> 20) ? 'Arabic' then 'fluent'::public.language_level
           else 'none'::public.language_level end,
      (item ->> 11)::boolean,
      (item ->> 12)::boolean,
      (item ->> 13)::boolean,
      (item ->> 14)::boolean,
      (item ->> 15)::boolean,
      (item ->> 16)::boolean,
      (item ->> 17)::boolean,
      (item ->> 18)::boolean,
      (item ->> 19)::boolean,
      array(select jsonb_array_elements_text(item -> 20)),
      item ->> 21,
      -- Long enough to satisfy the completion check, and obviously synthetic.
      'DEVELOPMENT SEED PROFILE. ' || (item ->> 21) ||
      '. I have ' || (item ->> 4) || ' years of childcare experience, ' || (item ->> 5) ||
      ' of them in the UAE. I am reliable, patient and I enjoy being part of a family routine. ' ||
      'This description exists so local development has realistic-length content to lay out.',
      case when i % 4 = 0 then array['part_time']::public.employment_type[]
           else array['full_time']::public.employment_type[] end,
      case when i % 5 = 0
           then array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
           else array['Monday','Tuesday','Wednesday','Thursday','Friday'] end,
      (case when i % 3 = 0 then '08:00' else '07:30' end)::time,
      (case when i % 3 = 0 then '17:00' else '18:00' end)::time,
      current_date + ((i % 6) * 14),
      current_date - interval '1 year' * (24 + (i * 7) % 30),
      case when i % 3 = 0 then 'High school diploma'
           when i % 3 = 1 then 'Diploma in early childhood care'
           else 'Nursing assistant certificate' end,
      case when (item ->> 19)::boolean then array['Paediatric first aid']
           else '{}'::text[] end,
      array[item ->> 2],
      5,
      case when (item ->> 10) = 'draft' then null else now() - (i * interval '2 days') end,
      case when (item ->> 10) in ('submitted', 'under_review', 'approved')
           then now() - (i * interval '2 days') else null end
    )
    returning id into nid;

    -- A reference each, so the completion score reflects a realistic profile.
    if (item ->> 10) <> 'draft' then
      insert into public.nanny_references (nanny_id, referee_name, relationship, period, note, verified)
      values (nid, 'Seed Reference ' || i, 'Previous employer',
              '2021–2025', 'Development seed reference. Not a real person.',
              (item ->> 10) = 'approved');
    end if;

    -- Badges only where something specific was "reviewed" — never a blanket claim.
    if (item ->> 10) = 'approved' then
      insert into public.nanny_badges (nanny_id, badge) values (nid, 'identity_verified');
      if (item ->> 19)::boolean then
        insert into public.nanny_badges (nanny_id, badge) values (nid, 'first_aid_certificate');
      end if;
      if (item ->> 15)::boolean then
        insert into public.nanny_badges (nanny_id, badge) values (nid, 'driving_licence');
      end if;
      if i % 3 = 0 then
        insert into public.nanny_badges (nanny_id, badge) values (nid, 'reference_provided');
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5 families, each with children, requirements and jobs
-- ---------------------------------------------------------------------------

do $$
declare
  seed_families jsonb := jsonb_build_array(
    -- display_name, emirate, area, children_count, ages, arrangement, sal_min, sal_max, langs
    jsonb_build_array('The Al Marri family',  'Dubai',     'Dubai Hills',    2, jsonb_build_array(2, 5),    'live_out', 4000, 5000, jsonb_build_array('English','Arabic')),
    jsonb_build_array('The Hassan family',    'Dubai',     'Arabian Ranches',3, jsonb_build_array(1, 4, 8), 'live_in',  4500, 6000, jsonb_build_array('English')),
    jsonb_build_array('The Okoro family',     'Abu Dhabi', 'Saadiyat Island',1, jsonb_build_array(0),       'live_out', 3500, 4500, jsonb_build_array('English')),
    jsonb_build_array('The Verma family',     'Dubai',     'Jumeirah',       2, jsonb_build_array(3, 6),    'either',   3800, 4800, jsonb_build_array('English','Hindi')),
    jsonb_build_array('The Novak family',     'Sharjah',   'Al Majaz',       2, jsonb_build_array(5, 9),    'live_out', 3000, 3800, jsonb_build_array('English'))
  );
  item jsonb;
  i int := 0;
  uid uuid;
  fid uuid;
  age_val jsonb;
begin
  for item in select * from jsonb_array_elements(seed_families) loop
    i := i + 1;
    uid := ('00000000-0000-4000-8000-0000000b' || lpad(i::text, 4, '0'))::uuid;

    perform pg_temp.seed_user(
      uid,
      'family' || i || '@nananny.example.test',
      'family',
      split_part(item ->> 0, ' ', 2),
      'Testfamily',
      '+9715011111' || lpad(i::text, 2, '0'),
      item ->> 1
    );

    insert into public.family_profiles (
      user_id, display_name, emirate, area, children_count, description,
      onboarding_step, onboarding_completed_at
    )
    values (
      uid,
      item ->> 0,
      item ->> 1,
      item ->> 2,
      (item ->> 3)::int,
      'DEVELOPMENT SEED FAMILY. We live in ' || (item ->> 2) ||
      ' and are looking for someone warm and reliable to join our routine.',
      4,
      now() - (i * interval '3 days')
    )
    returning id into fid;

    for age_val in select * from jsonb_array_elements(item -> 4) loop
      insert into public.family_children (family_id, age_years)
      values (fid, (age_val #>> '{}')::int);
    end loop;

    -- Primary requirements (created by the trigger-free path, so insert here).
    insert into public.family_requirements (
      family_id, is_primary, label, arrangement, employment_types, working_days,
      working_hours_start, working_hours_end, salary_min_aed, salary_max_aed,
      languages, required_experience_years,
      needs_newborn_care, needs_toddler_care, needs_school_age_care,
      needs_driving, needs_cooking, needs_housekeeping, needs_first_aid,
      has_pets, start_date, additional_requirements
    )
    values (
      fid, true, 'Our requirements',
      (item ->> 5)::public.care_arrangement,
      array['full_time']::public.employment_type[],
      array['Monday','Tuesday','Wednesday','Thursday','Friday'],
      '07:30'::time, '18:00'::time,
      (item ->> 6)::int, (item ->> 7)::int,
      array(select jsonb_array_elements_text(item -> 8)),
      2 + (i % 4),
      exists (select 1 from jsonb_array_elements(item -> 4) a where (a #>> '{}')::int <= 1),
      exists (select 1 from jsonb_array_elements(item -> 4) a where (a #>> '{}')::int between 1 and 3),
      exists (select 1 from jsonb_array_elements(item -> 4) a where (a #>> '{}')::int >= 4),
      i % 2 = 0, true, i % 3 <> 0, i % 2 = 1,
      i % 4 = 0,
      current_date + (i * 10),
      'Development seed requirements. School runs and a settled evening routine matter to us.'
    );

    -- A second, non-primary brief for two of the families, so the multi-brief
    -- shape is exercised in dev (10 requirement rows in total).
    if i <= 5 then
      insert into public.family_requirements (
        family_id, is_primary, label, arrangement, employment_types, working_days,
        salary_min_aed, salary_max_aed, languages, start_date, additional_requirements
      )
      values (
        fid, false, 'Weekend and evening cover',
        'live_out',
        array['part_time','weekend']::public.employment_type[],
        array['Saturday','Sunday'],
        greatest((item ->> 6)::int / 3, 800), greatest((item ->> 7)::int / 3, 1200),
        array(select jsonb_array_elements_text(item -> 8)),
        current_date + 30,
        'Development seed. Occasional weekend and babysitting cover.'
      );
    end if;

    -- Two job posts per family: one active, one draft or paused.
    insert into public.jobs (
      family_id, title, status, emirate, area, arrangement, employment_type,
      start_date, working_days, working_hours_start, working_hours_end,
      salary_min_aed, salary_max_aed, children_count, children_ages,
      responsibilities, required_experience_years, required_languages,
      driving_required, cooking_required, housekeeping_required, has_pets,
      additional_information, published_at
    )
    values (
      fid,
      (case (item ->> 5) when 'live_in' then 'Live-in nanny' else 'Live-out nanny' end)
        || ' needed in ' || (item ->> 2),
      'active',
      item ->> 1, item ->> 2,
      (item ->> 5)::public.care_arrangement,
      'full_time',
      current_date + (i * 10),
      array['Monday','Tuesday','Wednesday','Thursday','Friday'],
      '07:30'::time, '18:00'::time,
      (item ->> 6)::int, (item ->> 7)::int,
      (item ->> 3)::int,
      array(select (a #>> '{}')::int from jsonb_array_elements(item -> 4) a),
      'DEVELOPMENT SEED JOB. School runs, meals, play and the bedtime routine.',
      2 + (i % 4),
      array(select jsonb_array_elements_text(item -> 8)),
      i % 2 = 0, true, i % 3 <> 0, i % 4 = 0,
      'Development seed job post.',
      now() - (i * interval '2 days')
    );

    insert into public.jobs (
      family_id, title, status, emirate, area, arrangement, employment_type,
      salary_min_aed, salary_max_aed, children_count,
      responsibilities, required_languages
    )
    values (
      fid,
      'Weekend babysitter in ' || (item ->> 2),
      (case when i % 2 = 0 then 'draft' else 'paused' end)::public.job_status,
      item ->> 1, item ->> 2, 'live_out', 'weekend',
      greatest((item ->> 6)::int / 3, 800), greatest((item ->> 7)::int / 3, 1200),
      (item ->> 3)::int,
      'DEVELOPMENT SEED JOB. Occasional Saturday and Sunday cover.',
      array(select jsonb_array_elements_text(item -> 8))
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Summary, printed by `supabase db reset`
-- ---------------------------------------------------------------------------

do $$
declare
  n_nannies int; n_approved int; n_families int; n_reqs int; n_jobs int; n_children int;
begin
  select count(*) into n_nannies  from public.nanny_profiles;
  select count(*) into n_approved from public.nanny_profiles where status = 'approved';
  select count(*) into n_families from public.family_profiles;
  select count(*) into n_reqs     from public.family_requirements;
  select count(*) into n_jobs     from public.jobs;
  select count(*) into n_children from public.family_children;

  raise notice 'SEED: % nannies (% approved), % families, % requirement briefs, % jobs, % children',
    n_nannies, n_approved, n_families, n_reqs, n_jobs, n_children;
  raise notice 'SEED: every account is @nananny.example.test, password NaNannyDev2026!';
end $$;
