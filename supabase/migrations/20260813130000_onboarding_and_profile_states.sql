-- NaNanny UAE — Milestone 2: profile states, requirements, completion scoring
--
-- Three changes:
--   1. The nanny review workflow gets the exact state names the product uses.
--   2. The family "what we're looking for" brief moves out of family_profiles
--      into its own table, so a household fact and a search requirement stop
--      living in the same row.
--   3. Profile completion becomes a database-computed value, not something the
--      UI guesses, so a nanny can never be discoverable while incomplete.

-- ---------------------------------------------------------------------------
-- 1. Profile states
-- ---------------------------------------------------------------------------

-- 'pending' was ambiguous — it read as "pending review" but was also the state
-- of a profile nobody had submitted yet. The product word is 'submitted'.
alter type public.nanny_profile_status rename value 'pending' to 'submitted';

comment on type public.nanny_profile_status is
  'draft → submitted → under_review → approved | rejected. suspended and expired are administrative end states.';

-- ---------------------------------------------------------------------------
-- 2. Family requirements
-- ---------------------------------------------------------------------------

create table public.family_requirements (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.family_profiles (id) on delete cascade,
  label text not null default 'Our requirements',
  is_primary boolean not null default true,
  arrangement public.care_arrangement,
  employment_types public.employment_type[] not null default '{}',
  working_days text[] not null default '{}',
  working_hours_start time,
  working_hours_end time,
  schedule_notes text,
  salary_min_aed int check (salary_min_aed >= 0),
  salary_max_aed int check (salary_max_aed >= 0),
  languages text[] not null default '{}',
  required_experience_years int check (required_experience_years >= 0),
  needs_newborn_care boolean not null default false,
  needs_toddler_care boolean not null default false,
  needs_school_age_care boolean not null default false,
  needs_special_needs_care boolean not null default false,
  needs_driving boolean not null default false,
  needs_cooking boolean not null default false,
  needs_housekeeping boolean not null default false,
  needs_first_aid boolean not null default false,
  has_pets boolean not null default false,
  start_date date,
  additional_requirements text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_requirements_salary_valid
    check (salary_min_aed is null or salary_max_aed is null or salary_min_aed <= salary_max_aed)
);

comment on table public.family_requirements is
  'What a family is looking for. Separate from family_profiles (who the household is) so a family can keep more than one brief and so matching reads one place.';

create index family_requirements_family_idx on public.family_requirements (family_id);

-- Exactly one primary brief per family.
create unique index family_requirements_one_primary
  on public.family_requirements (family_id)
  where is_primary;

create trigger family_requirements_set_updated_at
  before update on public.family_requirements
  for each row execute function public.set_updated_at();

-- Move any existing brief data across before dropping the columns.
insert into public.family_requirements (
  family_id, arrangement, employment_types, working_days, working_hours_start,
  working_hours_end, salary_min_aed, salary_max_aed, languages,
  required_experience_years, needs_newborn_care, needs_toddler_care,
  needs_school_age_care, needs_special_needs_care, needs_driving, needs_cooking,
  needs_housekeeping, has_pets, start_date, additional_requirements
)
select
  id, arrangement, employment_types, working_days, working_hours_start,
  working_hours_end, salary_min_aed, salary_max_aed, languages,
  required_experience_years, needs_newborn_care, needs_toddler_care,
  needs_school_age_care, needs_special_needs_care, needs_driving, needs_cooking,
  needs_housekeeping, has_pets, start_date, additional_requirements
from public.family_profiles;

alter table public.family_profiles
  drop column arrangement,
  drop column employment_types,
  drop column working_days,
  drop column working_hours_start,
  drop column working_hours_end,
  drop column salary_min_aed,
  drop column salary_max_aed,
  drop column languages,
  drop column required_experience_years,
  drop column needs_newborn_care,
  drop column needs_toddler_care,
  drop column needs_school_age_care,
  drop column needs_special_needs_care,
  drop column needs_driving,
  drop column needs_cooking,
  drop column needs_housekeeping,
  drop column has_pets,
  drop column start_date,
  drop column additional_requirements;

-- ---------------------------------------------------------------------------
-- 3. Onboarding progress
-- ---------------------------------------------------------------------------

-- Each wizard step writes its own fields straight to the profile row, so
-- progress is saved by construction. This column only records where to resume.
alter table public.family_profiles add column onboarding_step int not null default 0;
alter table public.family_profiles add column onboarding_completed_at timestamptz;
alter table public.nanny_profiles  add column onboarding_step int not null default 0;
alter table public.nanny_profiles  add column onboarding_completed_at timestamptz;

-- Nanny extras collected during onboarding that had no home yet.
alter table public.nanny_profiles add column certificates text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- 4. Profile completion, computed in the database
-- ---------------------------------------------------------------------------

-- Returns { percent, missing[], required_missing[], can_submit }.
-- `required` fields gate discoverability; the rest only move the percentage.
create or replace function public.nanny_profile_completion(p_nanny_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n record;
  required_missing text[] := '{}';
  optional_missing text[] := '{}';
  earned numeric := 0;
  total numeric := 0;
  -- weight, is_required, label
  checks jsonb;
begin
  select * into n from public.nanny_profiles where id = p_nanny_id;
  if n.id is null then
    return jsonb_build_object('percent', 0, 'missing', '[]'::jsonb,
                              'required_missing', '[]'::jsonb, 'can_submit', false);
  end if;

  checks := jsonb_build_array(
    jsonb_build_array('First name',            n.first_name is not null and btrim(n.first_name) <> '', 10, true),
    jsonb_build_array('Profile photo',         n.photo_url is not null,                                10, true),
    jsonb_build_array('Location',              n.emirate is not null,                                  10, true),
    jsonb_build_array('Nationality',           n.nationality is not null,                               5, true),
    jsonb_build_array('Date of birth',         n.date_of_birth is not null,                             5, true),
    jsonb_build_array('Years of experience',   n.years_experience > 0,                                 10, true),
    jsonb_build_array('Languages',             array_length(n.languages, 1) > 0,                        8, true),
    jsonb_build_array('English level',         n.english_level <> 'none',                               5, true),
    jsonb_build_array('Availability',          n.available_from is not null,                            7, true),
    jsonb_build_array('Salary expectation',    n.salary_expectation_min_aed is not null,                8, true),
    jsonb_build_array('About you',             n.description is not null and length(btrim(n.description)) >= 80, 12, true),
    jsonb_build_array('Video introduction',    n.video_url is not null,                                 4, false),
    jsonb_build_array('UAE experience',        n.uae_experience_years > 0,                              2, false),
    jsonb_build_array('Education',             n.education is not null,                                 2, false),
    jsonb_build_array('Certificates',          array_length(n.certificates, 1) > 0,                     1, false),
    jsonb_build_array('Preferred locations',   array_length(n.preferred_locations, 1) > 0,              1, false)
  );

  declare
    item jsonb;
    label text;
    ok boolean;
    weight numeric;
    is_required boolean;
  begin
    for item in select * from jsonb_array_elements(checks) loop
      label       := item ->> 0;
      ok          := (item ->> 1)::boolean;
      weight      := (item ->> 2)::numeric;
      is_required := (item ->> 3)::boolean;

      total := total + weight;
      if ok then
        earned := earned + weight;
      elsif is_required then
        required_missing := required_missing || label;
      else
        optional_missing := optional_missing || label;
      end if;
    end loop;
  end;

  -- References are counted from their own table.
  total := total + 3;
  if exists (select 1 from public.nanny_references where nanny_id = p_nanny_id) then
    earned := earned + 3;
  else
    -- The ::text cast is load-bearing: against an untyped literal Postgres
    -- picks array || array and tries to parse the string as an array literal.
    optional_missing := optional_missing || 'At least one reference'::text;
  end if;

  return jsonb_build_object(
    'percent', round((earned / nullif(total, 0)) * 100)::int,
    'missing', to_jsonb(required_missing || optional_missing),
    'required_missing', to_jsonb(required_missing),
    'can_submit', cardinality(required_missing) = 0
  );
end;
$$;

create or replace function public.family_profile_completion(p_family_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f record;
  missing text[] := '{}';
  earned numeric := 0;
  total numeric := 0;
  children_recorded boolean;
  -- Read into scalars rather than a record: when a family has no requirements
  -- row yet, SELECT INTO leaves a record variable unassigned and touching its
  -- fields raises. Scalars just stay null, which is what the checks expect.
  req_arrangement public.care_arrangement;
  req_days text[];
  req_salary_max int;
  req_languages text[];
  req_start_date date;
  req_any_childcare boolean;
begin
  select * into f from public.family_profiles where id = p_family_id;
  if f.id is null then
    return jsonb_build_object('percent', 0, 'missing', '[]'::jsonb, 'can_match', false);
  end if;

  select arrangement, working_days, salary_max_aed, languages, start_date,
         (needs_newborn_care or needs_toddler_care or needs_school_age_care
          or needs_special_needs_care)
    into req_arrangement, req_days, req_salary_max, req_languages, req_start_date,
         req_any_childcare
    from public.family_requirements
   where family_id = p_family_id and is_primary
   limit 1;

  children_recorded := (
    select count(*) from public.family_children where family_id = p_family_id
  ) >= greatest(f.children_count, 1);

  declare
    checks jsonb := jsonb_build_array(
      jsonb_build_array('Your name',            f.display_name is not null,                       12),
      jsonb_build_array('Location',             f.emirate is not null,                            12),
      jsonb_build_array('Area',                 f.area is not null,                                6),
      jsonb_build_array('Number of children',   f.children_count > 0,                             10),
      jsonb_build_array('Children ages',        children_recorded,                                10),
      jsonb_build_array('Live in or live out',  req_arrangement is not null,                      10),
      jsonb_build_array('Schedule',             array_length(req_days, 1) > 0,                    10),
      jsonb_build_array('Salary range',         req_salary_max is not null,                       10),
      jsonb_build_array('Required languages',   array_length(req_languages, 1) > 0,                6),
      jsonb_build_array('Childcare experience', req_any_childcare,                                 6),
      jsonb_build_array('Preferred start date', req_start_date is not null,                        4),
      jsonb_build_array('About your family',    f.description is not null
                                                and length(btrim(f.description)) >= 40,            4)
    );
    item jsonb;
  begin
    for item in select * from jsonb_array_elements(checks) loop
      total := total + (item ->> 2)::numeric;
      if coalesce((item ->> 1)::boolean, false) then
        earned := earned + (item ->> 2)::numeric;
      else
        missing := missing || (item ->> 0);
      end if;
    end loop;
  end;

  return jsonb_build_object(
    'percent', round((earned / nullif(total, 0)) * 100)::int,
    'missing', to_jsonb(missing),
    -- Enough signal to generate meaningful matches.
    'can_match', f.emirate is not null and f.children_count > 0 and req_arrangement is not null
  );
end;
$$;

-- Keep the denormalised percentage on the row in step, so listings and the
-- dashboard do not each recompute it.
create or replace function public.refresh_nanny_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  v_id := coalesce(new.id, old.id);
  update public.nanny_profiles
     set profile_completion = (public.nanny_profile_completion(v_id) ->> 'percent')::int
   where id = v_id;
  return null;
end;
$$;

create trigger nanny_profiles_refresh_completion
  after insert or update on public.nanny_profiles
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.refresh_nanny_completion();

create or replace function public.refresh_family_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_family_id uuid;
begin
  -- Separate branches, not a CASE expression: PL/pgSQL resolves every field
  -- reference in an expression against the actual record, so `new.family_id`
  -- in an untaken branch still fails when the row came from family_profiles.
  if tg_table_name = 'family_profiles' then
    v_family_id := coalesce(new.id, old.id);
  else
    v_family_id := coalesce(new.family_id, old.family_id);
  end if;

  update public.family_profiles
     set profile_completion = (public.family_profile_completion(v_family_id) ->> 'percent')::int
   where id = v_family_id;
  return null;
end;
$$;

create trigger family_profiles_refresh_completion
  after insert or update on public.family_profiles
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.refresh_family_completion();

create trigger family_requirements_refresh_completion
  after insert or update or delete on public.family_requirements
  for each row execute function public.refresh_family_completion();

create trigger family_children_refresh_completion
  after insert or update or delete on public.family_children
  for each row execute function public.refresh_family_completion();

grant execute on function public.nanny_profile_completion(uuid) to authenticated;
grant execute on function public.family_profile_completion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Submission and review transitions
-- ---------------------------------------------------------------------------

-- A nanny submits her own profile. The completeness gate lives here, in the
-- database, so an incomplete profile cannot reach the review queue no matter
-- what the client sends.
create or replace function public.submit_nanny_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nanny_id uuid;
  v_status public.nanny_profile_status;
  v_completion jsonb;
begin
  select id, status into v_nanny_id, v_status
    from public.nanny_profiles where user_id = auth.uid();

  if v_nanny_id is null then
    raise exception 'No nanny profile for this account' using errcode = 'ROLE1';
  end if;

  if v_status not in ('draft', 'rejected') then
    raise exception 'Profile is already % and cannot be resubmitted', v_status
      using errcode = 'STAT1';
  end if;

  v_completion := public.nanny_profile_completion(v_nanny_id);

  if not (v_completion ->> 'can_submit')::boolean then
    raise exception 'Profile is missing required information: %',
      array_to_string(
        array(select jsonb_array_elements_text(v_completion -> 'required_missing')), ', ')
      using errcode = 'INCM1';
  end if;

  update public.nanny_profiles
     set status = 'submitted',
         submitted_at = now(),
         rejection_reason = null,
         onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = v_nanny_id;

  return jsonb_build_object('status', 'submitted', 'completion', v_completion);
end;
$$;

grant execute on function public.submit_nanny_profile() to authenticated;

-- Admin-only transition. Every change is written to audit_logs; approving is
-- explicitly NOT a verification claim (PRD §12) — badges are granted
-- separately, one per thing that was actually checked.
create or replace function public.admin_set_nanny_status(
  p_nanny_id uuid,
  p_status public.nanny_profile_status,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.nanny_profile_status;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  if p_status not in ('under_review', 'approved', 'rejected', 'suspended', 'draft') then
    raise exception 'Unsupported target status %', p_status using errcode = 'STAT1';
  end if;

  if p_status = 'rejected' and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'A rejection must say what needs fixing' using errcode = 'STAT2';
  end if;

  select status into v_before from public.nanny_profiles where id = p_nanny_id;
  if v_before is null then
    raise exception 'Nanny profile not found' using errcode = 'STAT1';
  end if;

  update public.nanny_profiles
     set status = p_status,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         rejection_reason = case when p_status = 'rejected' then p_reason else null end
   where id = p_nanny_id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, before_state, after_state)
  values (
    auth.uid(),
    'nanny_status_change',
    'nanny_profile',
    p_nanny_id,
    jsonb_build_object('status', v_before),
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );

  return jsonb_build_object('status', p_status, 'previous', v_before);
end;
$$;

grant execute on function public.admin_set_nanny_status(uuid, public.nanny_profile_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Grants for the new surface
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.family_requirements to authenticated;

-- Certificates belong on the public discovery card. onboarding_step does not:
-- how far through signup someone is, is nobody else's business.
grant select (certificates) on public.nanny_profiles to anon;
