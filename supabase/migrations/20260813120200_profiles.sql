-- NaNanny UAE — family and nanny profiles (PRD §8, §11)

create table public.family_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  display_name text,
  photo_url text,
  description text,
  emirate text,
  area text,
  latitude double precision,
  longitude double precision,
  children_count int not null default 0 check (children_count >= 0 and children_count <= 12),
  arrangement public.care_arrangement,
  employment_types public.employment_type[] not null default '{}',
  languages text[] not null default '{}',
  salary_min_aed int check (salary_min_aed >= 0),
  salary_max_aed int check (salary_max_aed >= 0),
  start_date date,
  required_experience_years int check (required_experience_years >= 0),
  needs_driving boolean not null default false,
  needs_cooking boolean not null default false,
  needs_housekeeping boolean not null default false,
  has_pets boolean not null default false,
  needs_newborn_care boolean not null default false,
  needs_toddler_care boolean not null default false,
  needs_school_age_care boolean not null default false,
  needs_special_needs_care boolean not null default false,
  working_days text[] not null default '{}',
  working_hours_start time,
  working_hours_end time,
  additional_requirements text,
  -- Free-text brief captured by the AI family assistant (PRD §37).
  ai_brief text,
  ai_structured jsonb not null default '{}'::jsonb,
  profile_completion int not null default 0 check (profile_completion between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_salary_range_valid
    check (salary_min_aed is null or salary_max_aed is null or salary_min_aed <= salary_max_aed)
);

create index family_profiles_emirate_idx on public.family_profiles (emirate);
create trigger family_profiles_set_updated_at
  before update on public.family_profiles
  for each row execute function public.set_updated_at();

create table public.family_children (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.family_profiles (id) on delete cascade,
  name text,
  age_years int check (age_years >= 0 and age_years <= 21),
  age_months int check (age_months >= 0 and age_months <= 11),
  notes text,
  created_at timestamptz not null default now()
);

create index family_children_family_idx on public.family_children (family_id);

create table public.nanny_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  status public.nanny_profile_status not null default 'draft',
  photo_url text,
  video_url text,
  headline text,
  description text,
  nationality text,
  date_of_birth date,
  gender text,
  emirate text,
  area text,
  latitude double precision,
  longitude double precision,
  years_experience int not null default 0 check (years_experience >= 0 and years_experience <= 60),
  uae_experience_years int not null default 0 check (uae_experience_years >= 0),
  newborn_experience boolean not null default false,
  toddler_experience boolean not null default false,
  school_age_experience boolean not null default false,
  special_needs_experience boolean not null default false,
  english_level public.language_level not null default 'none',
  arabic_level public.language_level not null default 'none',
  languages text[] not null default '{}',
  arrangement public.care_arrangement not null default 'either',
  employment_types public.employment_type[] not null default '{}',
  available_from date,
  available_days text[] not null default '{}',
  available_hours_start time,
  available_hours_end time,
  salary_expectation_min_aed int check (salary_expectation_min_aed >= 0),
  salary_expectation_max_aed int check (salary_expectation_max_aed >= 0),
  has_driving_licence boolean not null default false,
  can_cook boolean not null default false,
  can_housekeep boolean not null default false,
  pet_experience boolean not null default false,
  first_aid_certified boolean not null default false,
  education text,
  preferred_locations text[] not null default '{}',
  previous_experience jsonb not null default '[]'::jsonb,
  profile_completion int not null default 0 check (profile_completion between 0 and 100),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users (id) on delete set null,
  rejection_reason text,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nanny_salary_range_valid
    check (salary_expectation_min_aed is null or salary_expectation_max_aed is null
           or salary_expectation_min_aed <= salary_expectation_max_aed)
);

comment on column public.nanny_profiles.status is 'Only approved profiles are discoverable by families (PRD §12).';

create index nanny_profiles_status_idx on public.nanny_profiles (status);
create index nanny_profiles_emirate_idx on public.nanny_profiles (emirate) where status = 'approved';
create index nanny_profiles_available_from_idx on public.nanny_profiles (available_from);
create index nanny_profiles_search_idx on public.nanny_profiles using gin (search_vector);

create or replace function public.nanny_profiles_refresh_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.headline, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.nationality, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.emirate, '') || ' ' || coalesce(new.area, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(new.languages, ' ')), 'C') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'D');
  return new;
end;
$$;

create trigger nanny_profiles_search_vector
  before insert or update on public.nanny_profiles
  for each row execute function public.nanny_profiles_refresh_search_vector();

create trigger nanny_profiles_set_updated_at
  before update on public.nanny_profiles
  for each row execute function public.set_updated_at();

-- Verification badges are explicit and specific (PRD §12: never claim a check we did not run).
create table public.nanny_badges (
  id uuid primary key default extensions.gen_random_uuid(),
  nanny_id uuid not null references public.nanny_profiles (id) on delete cascade,
  badge text not null check (badge in (
    'identity_verified',
    'documents_reviewed',
    'video_reviewed',
    'reference_provided',
    'first_aid_certificate',
    'driving_licence'
  )),
  granted_by uuid references public.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  note text,
  unique (nanny_id, badge)
);

create table public.nanny_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  nanny_id uuid not null references public.nanny_profiles (id) on delete cascade,
  kind text not null check (kind in ('id', 'passport', 'visa', 'certificate', 'reference', 'first_aid', 'other')),
  storage_path text not null,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  reviewed boolean not null default false,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.nanny_documents is 'Storage paths only. Files live in a private bucket and are served through signed URLs (PRD §41).';

create index nanny_documents_nanny_idx on public.nanny_documents (nanny_id);

create table public.nanny_references (
  id uuid primary key default extensions.gen_random_uuid(),
  nanny_id uuid not null references public.nanny_profiles (id) on delete cascade,
  referee_name text not null,
  relationship text,
  contact_email text,
  contact_phone text,
  period text,
  note text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index nanny_references_nanny_idx on public.nanny_references (nanny_id);
