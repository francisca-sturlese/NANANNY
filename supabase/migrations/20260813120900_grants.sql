-- NaNanny UAE — explicit Data API privileges
--
-- Supabase no longer auto-exposes new tables to the API roles, and the legacy
-- `auto_expose_new_tables` flag is removed on 2026-10-30. Granting explicitly is
-- the better posture anyway: GRANT decides which TABLES a role can touch at all,
-- RLS decides which ROWS. Both have to be right.
--
-- Anonymous visitors get a deliberately narrow slice: enough to browse and be
-- indexed, never enough to harvest a nanny's identity or whereabouts.

-- ---------------------------------------------------------------------------
-- service_role — backend only (webhooks, email pipeline, admin jobs)
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- ---------------------------------------------------------------------------
-- authenticated — full table access, every row filtered by RLS
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.family_profiles,
  public.family_children,
  public.nanny_profiles,
  public.nanny_documents,
  public.nanny_references,
  public.jobs,
  public.job_applications,
  public.saved_profiles,
  public.interviews,
  public.reviews,
  public.reports,
  public.blocks
to authenticated;

grant select, update on public.users, public.notifications, public.conversations to authenticated;

-- Read-only for the client. These are written by SECURITY DEFINER functions or
-- by the service role from verified webhooks — never directly from a browser.
grant select on
  public.family_nanny_contacts,
  public.subscriptions,
  public.subscription_events,
  public.payments,
  public.matches,
  public.matching_weights,
  public.pricing_config,
  public.nanny_badges
to authenticated;

-- Messages: insert is allowed so Realtime optimistic sends work, but the RLS
-- INSERT policy still requires participation and an unblocked thread.
grant select, insert on public.messages to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- anon — public discovery only
-- ---------------------------------------------------------------------------
grant usage on schema public to anon;

grant select on public.pricing_config to anon;
grant select on public.reviews to anon;

-- Column-level grant: an anonymous visitor sees the discovery card, not the
-- person. Withheld on purpose — user_id (links a profile to an auth identity),
-- date_of_birth, area, latitude/longitude (where she actually lives),
-- video_url, previous_experience, preferred_locations, and every review-workflow
-- column. The full profile requires an account.
grant select (
  id,
  status,
  photo_url,
  headline,
  description,
  nationality,
  emirate,
  years_experience,
  uae_experience_years,
  newborn_experience,
  toddler_experience,
  school_age_experience,
  special_needs_experience,
  english_level,
  arabic_level,
  languages,
  arrangement,
  employment_types,
  available_from,
  available_days,
  salary_expectation_min_aed,
  salary_expectation_max_aed,
  has_driving_licence,
  can_cook,
  can_housekeep,
  pet_experience,
  first_aid_certified,
  education,
  created_at
) on public.nanny_profiles to anon;

grant select (id, nanny_id, badge, granted_at) on public.nanny_badges to anon;

-- Active job posts are public so nannies can browse before signing up. Family
-- identity is not on this table; it lives behind family_id.
grant select (
  id,
  title,
  status,
  emirate,
  area,
  arrangement,
  employment_type,
  start_date,
  working_days,
  working_hours_start,
  working_hours_end,
  schedule_notes,
  salary_min_aed,
  salary_max_aed,
  children_count,
  children_ages,
  responsibilities,
  required_experience_years,
  required_languages,
  required_skills,
  driving_required,
  cooking_required,
  housekeeping_required,
  has_pets,
  additional_information,
  published_at,
  created_at
) on public.jobs to anon;

-- Matching RLS policies for the anonymous audience.
create policy nanny_profiles_anon_read on public.nanny_profiles
  for select to anon
  using (status = 'approved');

create policy nanny_badges_anon_read on public.nanny_badges
  for select to anon
  using (exists (
    select 1 from public.nanny_profiles n
     where n.id = nanny_badges.nanny_id and n.status = 'approved'
  ));

create policy jobs_anon_read on public.jobs
  for select to anon
  using (status = 'active');

-- Future migrations create tables owned by postgres; keep the defaults tight so
-- a new table is unreachable until someone grants it on purpose.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
