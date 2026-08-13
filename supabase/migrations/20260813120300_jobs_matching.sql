-- NaNanny UAE — jobs, applications, shortlist, matching (PRD §9, §24, §25, §27, §28)

create table public.jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.family_profiles (id) on delete cascade,
  title text not null,
  status public.job_status not null default 'draft',
  emirate text,
  area text,
  arrangement public.care_arrangement not null default 'live_out',
  employment_type public.employment_type not null default 'full_time',
  start_date date,
  working_days text[] not null default '{}',
  working_hours_start time,
  working_hours_end time,
  schedule_notes text,
  salary_min_aed int check (salary_min_aed >= 0),
  salary_max_aed int check (salary_max_aed >= 0),
  children_count int not null default 0,
  children_ages int[] not null default '{}',
  responsibilities text,
  required_experience_years int,
  required_languages text[] not null default '{}',
  required_skills text[] not null default '{}',
  driving_required boolean not null default false,
  cooking_required boolean not null default false,
  housekeeping_required boolean not null default false,
  has_pets boolean not null default false,
  additional_information text,
  expires_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_salary_range_valid
    check (salary_min_aed is null or salary_max_aed is null or salary_min_aed <= salary_max_aed)
);

create index jobs_status_idx on public.jobs (status);
create index jobs_family_idx on public.jobs (family_id);
create index jobs_emirate_idx on public.jobs (emirate) where status = 'active';

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create table public.job_applications (
  id uuid primary key default extensions.gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  nanny_id uuid not null references public.nanny_profiles (id) on delete cascade,
  status public.application_status not null default 'applied',
  cover_note text,
  viewed_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, nanny_id)
);

comment on table public.job_applications is 'A nanny applying never consumes a family free contact (PRD §61). Only a family-initiated conversation does.';

create index job_applications_job_idx on public.job_applications (job_id);
create index job_applications_nanny_idx on public.job_applications (nanny_id);

create trigger job_applications_set_updated_at
  before update on public.job_applications
  for each row execute function public.set_updated_at();

-- Shortlist / saved profiles. Always free (PRD §28).
create table public.saved_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.family_profiles (id) on delete cascade,
  nanny_id uuid not null references public.nanny_profiles (id) on delete cascade,
  stage public.shortlist_stage not null default 'interested',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, nanny_id)
);

create index saved_profiles_family_idx on public.saved_profiles (family_id);

create trigger saved_profiles_set_updated_at
  before update on public.saved_profiles
  for each row execute function public.set_updated_at();

-- Admin-tunable matching weights (PRD §25). One active row set, keyed by dimension.
create table public.matching_weights (
  dimension text primary key,
  weight numeric(5, 2) not null check (weight >= 0 and weight <= 100),
  label text not null,
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.matching_weights (dimension, weight, label) values
  ('location',      15, 'Location compatibility'),
  ('availability',  15, 'Availability'),
  ('schedule',      15, 'Schedule'),
  ('child_age',     15, 'Child age experience'),
  ('experience',    10, 'Experience'),
  ('language',      10, 'Language'),
  ('arrangement',    5, 'Live in or live out'),
  ('salary',        10, 'Salary compatibility'),
  ('skills',         5, 'Skills');

-- Computed matches. `breakdown` keeps the per-dimension detail so the score
-- is explainable rather than a number invented by a model (PRD §24).
create table public.matches (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.family_profiles (id) on delete cascade,
  nanny_id uuid not null references public.nanny_profiles (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete cascade,
  score numeric(5, 2) not null check (score >= 0 and score <= 100),
  breakdown jsonb not null default '{}'::jsonb,
  reasons text[] not null default '{}',
  conflicts text[] not null default '{}',
  computed_at timestamptz not null default now(),
  dismissed_at timestamptz,
  unique (family_id, nanny_id, job_id)
);

create index matches_family_score_idx on public.matches (family_id, score desc);
create index matches_nanny_idx on public.matches (nanny_id);

-- A partial unique index is needed because NULL job_id would otherwise allow duplicates.
create unique index matches_family_nanny_nojob_uniq
  on public.matches (family_id, nanny_id)
  where job_id is null;
