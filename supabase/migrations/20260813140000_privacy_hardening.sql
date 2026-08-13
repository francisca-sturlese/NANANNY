-- NaNanny UAE — privacy hardening
--
-- Three real holes, all found by supabase/tests/privacy_rls.sql rather than by
-- reading the code. Each one is fixed at the database level, so no application
-- bug can reopen it.
--
--   1. family_requirements had no RLS at all. The table was created in a later
--      migration than the one that turns RLS on table by table, so it was born
--      wide open: any signed-in user could read every family's brief — budget,
--      schedule, children's needs.
--
--   2. A user could promote themselves to admin. `users_update_self` allows a
--      row update where id = auth.uid(), and `role` is a column on that row.
--      One UPDATE and an ordinary family account had the admin bit.
--
--   3. A nanny could approve her own profile. `nanny_profiles_owner` is FOR ALL
--      on her own row, and `status` lives there — so she could skip review
--      entirely and become publicly discoverable.
--
-- The fix for 2 and 3 is column-level privileges. RLS decides which ROWS you
-- may touch; it says nothing about which COLUMNS. For a table where the row is
-- yours but some fields are the system's, only a column grant separates them.

-- ---------------------------------------------------------------------------
-- 1. family_requirements
-- ---------------------------------------------------------------------------

alter table public.family_requirements enable row level security;

create policy family_requirements_owner on public.family_requirements
  for all to authenticated
  using (family_id = public.my_family_id())
  with check (family_id = public.my_family_id());

create policy family_requirements_admin on public.family_requirements
  for select to authenticated
  using (public.is_admin());

-- A nanny sees the brief attached to a job she applied to, or to a family she
-- is already in conversation with — never the whole table.
create policy family_requirements_connected_nanny on public.family_requirements
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
       where c.family_id = family_requirements.family_id
         and c.nanny_id = public.my_nanny_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. public.users — a user may edit their contact details, not their identity
-- ---------------------------------------------------------------------------

revoke update on public.users from authenticated;

grant update (
  first_name,
  last_name,
  phone,
  location,
  avatar_url,
  last_seen_at
) on public.users to authenticated;

comment on column public.users.role is
  'Not updatable by the authenticated role — see the column grants in 20260813140000. Set at signup by handle_new_auth_user (family or nanny only) and changed thereafter only by the service role.';

-- ---------------------------------------------------------------------------
-- 3. nanny_profiles — she owns the content, the platform owns the verdict
-- ---------------------------------------------------------------------------

revoke update on public.nanny_profiles from authenticated;

grant update (
  photo_url,
  video_url,
  headline,
  description,
  first_name,
  nationality,
  date_of_birth,
  gender,
  emirate,
  area,
  latitude,
  longitude,
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
  available_hours_start,
  available_hours_end,
  salary_expectation_min_aed,
  salary_expectation_max_aed,
  has_driving_licence,
  can_cook,
  can_housekeep,
  pet_experience,
  first_aid_certified,
  education,
  certificates,
  preferred_locations,
  previous_experience,
  onboarding_step,
  onboarding_completed_at
) on public.nanny_profiles to authenticated;

-- Deliberately withheld: status, submitted_at, reviewed_at, reviewed_by,
-- rejection_reason, profile_completion, user_id, search_vector.
--
-- status moves only through submit_nanny_profile() and admin_set_nanny_status(),
-- both SECURITY DEFINER, both with their own checks. profile_completion is
-- maintained by a trigger — a nanny cannot inflate her own score.

-- ---------------------------------------------------------------------------
-- 4. family_profiles — same separation
-- ---------------------------------------------------------------------------

revoke update on public.family_profiles from authenticated;

grant update (
  display_name,
  photo_url,
  description,
  emirate,
  area,
  latitude,
  longitude,
  children_count,
  ai_brief,
  ai_structured,
  onboarding_step,
  onboarding_completed_at
) on public.family_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Belt and braces on the role column
-- ---------------------------------------------------------------------------

-- Column grants are the gate; this trigger is the alarm. If a future migration
-- widens the grants by accident, a self-promotion attempt still fails loudly
-- instead of succeeding quietly.
create or replace function public.guard_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- The service role and superuser paths do not run as `authenticated`.
    if current_setting('role', true) = 'authenticated' and not public.is_admin() then
      raise exception 'Changing your own role is not permitted' using errcode = 'ROLE2';
    end if;
  end if;

  if new.status is distinct from old.status
     and current_setting('role', true) = 'authenticated'
     and not public.is_admin() then
    raise exception 'Changing your own account status is not permitted' using errcode = 'ROLE2';
  end if;

  return new;
end;
$$;

create trigger users_guard_role_change
  before update on public.users
  for each row execute function public.guard_user_role_change();

-- ---------------------------------------------------------------------------
-- 6. Admin-only tables were unreachable even by admins
-- ---------------------------------------------------------------------------

-- These four have admin-only RLS policies but were never granted to the
-- `authenticated` role, so the policy never got a chance to run — the grant
-- check fails first. RLS still restricts every row to admins; the grant just
-- lets the query reach the policy.
grant select on
  public.audit_logs,
  public.analytics_events,
  public.email_events
to authenticated;

grant select, insert, update, delete on public.admin_notes to authenticated;
