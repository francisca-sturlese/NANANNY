-- Finishing onboarding is posting.
--
-- Family onboarding already asks for everything a job post needs: where they
-- are, live in or out, which days and hours, budget, languages, the children's
-- ages, whether they need driving or cooking, when they want to start. Then the
-- product asked them to write all of it again in a job post, on a page that was
-- not in the navigation.
--
-- The first real family did not manage it. That is not a discoverability
-- problem with a button, it is a form asked twice.
--
-- So the requirements a family filled in become their post. They can still
-- write more posts by hand, and they can edit or close this one like any other.
-- What they cannot do any more is finish onboarding and be invisible to every
-- nanny on the site.

/**
 * Builds a job from what a family already told us.
 *
 * Returns the job id, or the existing one: a family that has posted something
 * already does not need this, and re-running must not produce a second copy.
 *
 * Published rather than left as a draft. A draft would repeat the original
 * mistake in a quieter way, leaving the family thinking they were findable when
 * they were not.
 */
create or replace function public.publish_job_from_requirements(p_family_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  r record;
  v_children int[];
  v_skills text[] := '{}';
  v_job_id uuid;
  v_title text;
begin
  select * into f from public.family_profiles where id = p_family_id;
  if f.id is null then
    return null;
  end if;

  -- Already has one. Never a second copy.
  select id into v_job_id from public.jobs
   where family_id = p_family_id
   order by created_at
   limit 1;
  if v_job_id is not null then
    return v_job_id;
  end if;

  select * into r from public.family_requirements
   where family_id = p_family_id and is_primary
   limit 1;

  -- Nothing to build a post out of.
  if r.id is null then
    return null;
  end if;

  select coalesce(array_agg(age_years order by age_years), '{}') into v_children
    from public.family_children where family_id = p_family_id;

  if r.needs_driving then v_skills := v_skills || 'driving'::text; end if;
  if r.needs_cooking then v_skills := v_skills || 'cooking'::text; end if;
  if r.needs_housekeeping then v_skills := v_skills || 'housekeeping'::text; end if;
  if r.needs_first_aid then v_skills := v_skills || 'first_aid'::text; end if;

  -- Written the way a family would say it, so the listing does not read as
  -- something a machine assembled.
  v_title := format('%s nanny needed%s',
    case r.arrangement
      when 'live_in' then 'Live in'
      when 'live_out' then 'Live out'
      else 'Live in or out'
    end,
    case when f.area is not null then ' in ' || f.area
         when f.emirate is not null then ' in ' || f.emirate
         else '' end);

  insert into public.jobs (
    family_id, title, status, emirate, area, arrangement, employment_type,
    start_date, working_days, working_hours_start, working_hours_end,
    schedule_notes, salary_min_aed, salary_max_aed, children_count,
    children_ages, responsibilities, required_experience_years,
    required_languages, required_skills, driving_required, cooking_required,
    housekeeping_required, has_pets, additional_information, published_at
  )
  values (
    p_family_id,
    v_title,
    'active',
    f.emirate,
    f.area,
    coalesce(r.arrangement, 'either'),
    coalesce(r.employment_types[1], 'full_time'),
    r.start_date,
    coalesce(r.working_days, '{}'),
    r.working_hours_start,
    r.working_hours_end,
    r.schedule_notes,
    r.salary_min_aed,
    r.salary_max_aed,
    coalesce(f.children_count, coalesce(array_length(v_children, 1), 0)),
    v_children,
    r.additional_requirements,
    r.required_experience_years,
    coalesce(r.languages, '{}'),
    v_skills,
    coalesce(r.needs_driving, false),
    coalesce(r.needs_cooking, false),
    coalesce(r.needs_housekeeping, false),
    coalesce(r.has_pets, false),
    r.additional_requirements,
    now()
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke execute on function public.publish_job_from_requirements(uuid) from public;
grant execute on function public.publish_job_from_requirements(uuid) to service_role, authenticated;

/**
 * Posts it the moment onboarding is finished.
 *
 * On the transition only, so editing a completed profile later does not create
 * anything, and so a family who has since closed their post does not have it
 * silently reopened.
 */
create or replace function public.publish_job_on_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.onboarding_completed_at is not null
     and old.onboarding_completed_at is null then
    perform public.publish_job_from_requirements(new.id);
  end if;
  return null;
end;
$$;

create trigger family_profiles_publish_job
  after update of onboarding_completed_at on public.family_profiles
  for each row execute function public.publish_job_on_onboarding();

-- ---------------------------------------------------------------------------
-- Retroactively, for everybody already registered
-- ---------------------------------------------------------------------------

do $$
declare f record; created int := 0;
begin
  for f in
    select fp.id
      from public.family_profiles fp
     where fp.onboarding_completed_at is not null
       and not exists (select 1 from public.jobs j where j.family_id = fp.id)
  loop
    if public.publish_job_from_requirements(f.id) is not null then
      created := created + 1;
    end if;
  end loop;

  raise notice 'Published % job posts from existing family onboarding', created;
end $$;
