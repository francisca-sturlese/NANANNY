-- Hourly work, and what a family will accept on visas.
--
-- Both come from the UAE market rather than from us. Families write "own visa
-- only" into the free text of a post because there is nowhere else to put it,
-- where it cannot be filtered on and a nanny only finds it after reading. And
-- plenty of families want somebody two afternoons a week, which is not part
-- time in any sense the current list captures.

-- ---------------------------------------------------------------------------
-- Hourly
-- ---------------------------------------------------------------------------

alter type public.employment_type add value if not exists 'hourly';

-- A rate rather than a salary. Kept in its own columns because the monthly and
-- the hourly number are not the same quantity, and one field holding either
-- depending on a second field is how a family ends up advertising 25 dirhams a
-- month.
alter table public.jobs
  add column if not exists hourly_rate_min_aed int check (hourly_rate_min_aed >= 0),
  add column if not exists hourly_rate_max_aed int check (hourly_rate_max_aed >= 0),
  add column if not exists hours_per_week int check (hours_per_week between 1 and 80);

comment on column public.jobs.hourly_rate_min_aed is
  'Only meaningful when employment_type is hourly. Separate from salary_min_aed because a monthly figure and an hourly one are different quantities.';

alter table public.nanny_profiles
  add column if not exists hourly_rate_min_aed int check (hourly_rate_min_aed >= 0);

comment on column public.nanny_profiles.hourly_rate_min_aed is
  'What she asks per hour, for the families looking for a few afternoons rather than a full week.';

-- ---------------------------------------------------------------------------
-- What a family will accept on visas
-- ---------------------------------------------------------------------------

create type public.visa_preference as enum (
  'any',              -- Happy either way
  'own_visa_only',    -- Will not sponsor
  'will_sponsor'      -- Prepared to sponsor, which is worth saying out loud
);

alter table public.jobs
  add column if not exists visa_preference public.visa_preference not null default 'any';

comment on column public.jobs.visa_preference is
  'Optional in the form, unlike the nanny side which is required: a family that has not decided should not be forced to pretend it has.';

-- The nanny side is required, the family side is not, and that asymmetry is
-- deliberate. A nanny always knows her own status. A family often has not
-- worked out whether it would sponsor until it meets somebody worth
-- sponsoring, and making them choose would turn a real "we are open to it"
-- into a wrong answer.

create index if not exists jobs_active_visa_idx
  on public.jobs (visa_preference)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- Writable by the family that owns the post
-- ---------------------------------------------------------------------------

grant update (hourly_rate_min_aed, hourly_rate_max_aed, hours_per_week, visa_preference)
  on public.jobs to authenticated;
grant insert (hourly_rate_min_aed, hourly_rate_max_aed, hours_per_week, visa_preference)
  on public.jobs to authenticated;
grant select (hourly_rate_min_aed, hourly_rate_max_aed, hours_per_week, visa_preference)
  on public.jobs to anon, authenticated;

grant update (hourly_rate_min_aed) on public.nanny_profiles to authenticated;
grant select (hourly_rate_min_aed) on public.nanny_profiles to anon, authenticated;
