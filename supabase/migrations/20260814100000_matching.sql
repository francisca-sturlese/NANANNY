-- NaNanny UAE — matching (PRD §23, §24, §25)
--
-- The score is computed here, in the database, from the weights an admin can
-- change. It is not a number a model produced and cannot explain.
--
-- Every dimension returns a fraction between 0 and 1 and carries its own
-- sentence. The score is the weighted sum of those fractions, and the sentences
-- are what the family reads. If a dimension cannot be judged because the family
-- did not say, it scores neutral rather than zero: silence is not a mismatch.

-- ---------------------------------------------------------------------------
-- One nanny against one family
-- ---------------------------------------------------------------------------

create or replace function public.compute_match(p_family_id uuid, p_nanny_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f record;
  r record;
  n record;
  weights jsonb;
  breakdown jsonb := '{}'::jsonb;
  reasons text[] := '{}';
  conflicts text[] := '{}';
  -- Dimensions that scored neutral only because the family never answered.
  -- Kept apart from the score so the breakdown can say "you have not told us"
  -- instead of presenting a made up 50%.
  unknowns text[] := '{}';
  total_weight numeric := 0;
  earned numeric := 0;

  fraction numeric;
  weight numeric;
  child_ages int[];
begin
  select * into f from public.family_profiles where id = p_family_id;
  select * into n from public.nanny_profiles where id = p_nanny_id and status = 'approved';

  if f.id is null or n.id is null then
    return null;
  end if;

  select * into r from public.family_requirements
   where family_id = p_family_id and is_primary limit 1;

  -- Qualified: the local variable is also called `weight`, and an unqualified
  -- reference resolves to the variable rather than the column.
  select coalesce(jsonb_object_agg(mw.dimension, mw.weight), '{}'::jsonb)
    into weights from public.matching_weights mw;

  select coalesce(array_agg(age_years), '{}') into child_ages
    from public.family_children where family_id = p_family_id;

  -- ---------------------------------------------------------------- location
  weight := coalesce((weights ->> 'location')::numeric, 0);
  if f.emirate is null then
    fraction := 0.5;
    unknowns := unknowns || 'location'::text;
  elsif n.emirate = f.emirate then
    fraction := 1;
    reasons := reasons || format('Based in %s, same as you', n.emirate);
  elsif f.emirate = any(n.preferred_locations) then
    fraction := 0.8;
    reasons := reasons || format('Happy to work in %s', f.emirate);
  else
    fraction := 0.15;
    conflicts := conflicts || format('Based in %s, not %s', coalesce(n.emirate, 'the UAE'), f.emirate);
  end if;
  breakdown := breakdown || jsonb_build_object('location', round(fraction, 2));
  total_weight := total_weight + weight;
  earned := earned + weight * fraction;

  -- ------------------------------------------------------------ availability
  weight := coalesce((weights ->> 'availability')::numeric, 0);
  if r.start_date is null or n.available_from is null then
    fraction := 0.5;
    unknowns := unknowns || 'availability'::text;
  elsif n.available_from <= r.start_date then
    fraction := 1;
    reasons := reasons || 'Available before you need her'::text;
  elsif n.available_from <= r.start_date + 21 then
    fraction := 0.6;
    conflicts := conflicts || format('Free from %s, a little after your date',
      to_char(n.available_from, 'FMDD Mon'));
  else
    fraction := 0.1;
    conflicts := conflicts || format('Not free until %s', to_char(n.available_from, 'FMDD Mon'));
  end if;
  breakdown := breakdown || jsonb_build_object('availability', round(fraction, 2));
  total_weight := total_weight + weight;
  earned := earned + weight * fraction;

  -- ---------------------------------------------------------------- schedule
  weight := coalesce((weights ->> 'schedule')::numeric, 0);
  if r.working_days is null or array_length(r.working_days, 1) is null then
    fraction := 0.5;
    unknowns := unknowns || 'schedule'::text;
  else
    -- What share of the days you need can she actually work.
    fraction := (
      select count(*)::numeric / greatest(array_length(r.working_days, 1), 1)
        from unnest(r.working_days) d
       where d = any(n.available_days)
    );
    if fraction >= 1 then
      reasons := reasons || 'Free every day you need'::text;
    elsif fraction >= 0.6 then
      conflicts := conflicts || 'Free most of your days, not all'::text;
    else
      conflicts := conflicts || 'Her days do not line up with yours'::text;
    end if;
  end if;
  breakdown := breakdown || jsonb_build_object('schedule', round(fraction, 2));
  total_weight := total_weight + weight;
  earned := earned + weight * fraction;

  -- ------------------------------------------------------- child age experience
  weight := coalesce((weights ->> 'child_age')::numeric, 0);
  declare
    needed int := 0;
    met int := 0;
  begin
    -- Judged against the children's real ages when we know them, and against
    -- what the family asked for otherwise.
    if array_length(child_ages, 1) > 0 then
      if exists (select 1 from unnest(child_ages) a where a < 1) then
        needed := needed + 1;
        if n.newborn_experience then met := met + 1; end if;
      end if;
      if exists (select 1 from unnest(child_ages) a where a between 1 and 3) then
        needed := needed + 1;
        if n.toddler_experience then met := met + 1; end if;
      end if;
      if exists (select 1 from unnest(child_ages) a where a >= 4) then
        needed := needed + 1;
        if n.school_age_experience then met := met + 1; end if;
      end if;
    else
      if r.needs_newborn_care then
        needed := needed + 1;
        if n.newborn_experience then met := met + 1; end if;
      end if;
      if r.needs_toddler_care then
        needed := needed + 1;
        if n.toddler_experience then met := met + 1; end if;
      end if;
      if r.needs_school_age_care then
        needed := needed + 1;
        if n.school_age_experience then met := met + 1; end if;
      end if;
    end if;

    if r.needs_special_needs_care then
      needed := needed + 1;
      if n.special_needs_experience then met := met + 1; end if;
    end if;

    if needed = 0 then
      fraction := 0.5;
      unknowns := unknowns || 'child_age'::text;
    else
      fraction := met::numeric / needed;
      if fraction >= 1 then
        reasons := reasons || 'Has cared for children your children''s age'::text;
      elsif fraction = 0 then
        conflicts := conflicts || 'No experience with your children''s age group'::text;
      end if;
    end if;
  end;
  breakdown := breakdown || jsonb_build_object('child_age', round(fraction, 2));
  total_weight := total_weight + weight;
  earned := earned + weight * fraction;

  -- -------------------------------------------------------------- experience
  weight := coalesce((weights ->> 'experience')::numeric, 0);
  if r.required_experience_years is null then
    -- With no bar set, more experience is simply better, levelling off at ten.
    fraction := least(n.years_experience::numeric / 10, 1);
  elsif n.years_experience >= r.required_experience_years then
    fraction := 1;
    reasons := reasons || format('%s years of experience', n.years_experience);
  else
    fraction := greatest(n.years_experience::numeric / greatest(r.required_experience_years, 1), 0);
    conflicts := conflicts || format('%s years, you asked for %s',
      n.years_experience, r.required_experience_years);
  end if;
  breakdown := breakdown || jsonb_build_object('experience', round(fraction, 2));
  total_weight := total_weight + weight;
  earned := earned + weight * fraction;

  -- ---------------------------------------------------------------- language
  weight := coalesce((weights ->> 'language')::numeric, 0);
  if r.languages is null or array_length(r.languages, 1) is null then
    fraction := 0.5;
    unknowns := unknowns || 'language'::text;
  else
    fraction := (
      select count(*)::numeric / greatest(array_length(r.languages, 1), 1)
        from unnest(r.languages) l
       where l = any(n.languages)
    );
    if fraction >= 1 then
      reasons := reasons || format('Speaks %s', array_to_string(r.languages, ' and '));
    else
      -- Name the ones she does not speak. "50% on languages" tells a family
      -- nothing; "does not speak Arabic" tells them everything.
      conflicts := conflicts || format('Does not speak %s', array_to_string(
        array(select l from unnest(r.languages) l where not (l = any(n.languages))),
        ' or '));
    end if;
  end if;
  breakdown := breakdown || jsonb_build_object('language', round(fraction, 2));
  total_weight := total_weight + weight;
  earned := earned + weight * fraction;

  -- ------------------------------------------------------------- arrangement
  weight := coalesce((weights ->> 'arrangement')::numeric, 0);
  if r.arrangement is null then
    fraction := 0.5;
    unknowns := unknowns || 'arrangement'::text;
  elsif n.arrangement = 'either' or n.arrangement = r.arrangement then
    fraction := 1;
    reasons := reasons || (case r.arrangement
      when 'live_in' then 'Open to living in'
      when 'live_out' then 'Live out, as you wanted'
      else 'Flexible on live in or out' end)::text;
  else
    fraction := 0;
    conflicts := conflicts || (case n.arrangement
      when 'live_in' then 'Only wants live in'
      else 'Only wants live out' end)::text;
  end if;
  breakdown := breakdown || jsonb_build_object('arrangement', round(fraction, 2));
  total_weight := total_weight + weight;
  earned := earned + weight * fraction;

  -- ------------------------------------------------------------------ salary
  weight := coalesce((weights ->> 'salary')::numeric, 0);
  if r.salary_max_aed is null or n.salary_expectation_min_aed is null then
    fraction := 0.5;
    unknowns := unknowns || 'salary'::text;
  elsif n.salary_expectation_min_aed <= r.salary_max_aed then
    fraction := 1;
    reasons := reasons || format('Asks from AED %s, inside your budget',
      to_char(n.salary_expectation_min_aed, 'FM999,999'));
  else
    -- How far over budget, forgiving a little and falling away past 40%.
    fraction := greatest(
      1 - ((n.salary_expectation_min_aed - r.salary_max_aed)::numeric
           / greatest(r.salary_max_aed, 1)) / 0.4,
      0);
    conflicts := conflicts || format('Asks from AED %s, above your budget',
      to_char(n.salary_expectation_min_aed, 'FM999,999'));
  end if;
  breakdown := breakdown || jsonb_build_object('salary', round(fraction, 2));
  total_weight := total_weight + weight;
  earned := earned + weight * fraction;

  -- ------------------------------------------------------------------ skills
  weight := coalesce((weights ->> 'skills')::numeric, 0);
  declare
    wanted int := 0;
    has int := 0;
  begin
    if r.needs_driving then
      wanted := wanted + 1;
      if n.has_driving_licence then has := has + 1;
      else conflicts := conflicts || 'Does not drive'::text; end if;
    end if;
    if r.needs_cooking then
      wanted := wanted + 1;
      if n.can_cook then has := has + 1; end if;
    end if;
    if r.needs_housekeeping then
      wanted := wanted + 1;
      if n.can_housekeep then has := has + 1; end if;
    end if;
    if r.needs_first_aid then
      wanted := wanted + 1;
      if n.first_aid_certified then has := has + 1;
      else conflicts := conflicts || 'No first aid training listed'::text; end if;
    end if;
    if r.has_pets then
      wanted := wanted + 1;
      if n.pet_experience then has := has + 1;
      else conflicts := conflicts || 'No experience with pets'::text; end if;
    end if;

    if wanted = 0 then
      fraction := 0.5;
      unknowns := unknowns || 'skills'::text;
    else
      fraction := has::numeric / wanted;
      if fraction >= 1 then reasons := reasons || 'Has every skill you asked for'::text; end if;
    end if;
  end;
  breakdown := breakdown || jsonb_build_object('skills', round(fraction, 2));
  total_weight := total_weight + weight;
  earned := earned + weight * fraction;

  return jsonb_build_object(
    'family_id', p_family_id,
    'nanny_id', p_nanny_id,
    'score', round((earned / nullif(total_weight, 0)) * 100, 1),
    'breakdown', breakdown,
    'reasons', to_jsonb(reasons),
    'conflicts', to_jsonb(conflicts),
    'unknowns', to_jsonb(unknowns)
  );
end;
$$;

grant execute on function public.compute_match(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A family against everyone
-- ---------------------------------------------------------------------------

alter table public.matches
  add column if not exists unknown_dimensions text[] not null default '{}';

comment on column public.matches.unknown_dimensions is
  'Dimensions scored neutral because the family has not answered them yet.';

/**
 * Recomputes and stores this family's matches.
 *
 * Stored rather than computed per page load: the score is stable until either
 * side changes, a family wants to see the same ranking twice, and an admin
 * needs to look at what was shown.
 */
create or replace function public.refresh_matches(p_family_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_count int := 0;
  n record;
  m jsonb;
begin
  v_family_id := coalesce(p_family_id, public.my_family_id());

  if v_family_id is null then
    raise exception 'No family to match' using errcode = 'ROLE1';
  end if;

  -- A family may refresh its own, an admin anyone's, and the service role too:
  -- that is the backend's own key, already trusted with the whole database, and
  -- refusing it would leave no way to recompute in a scheduled job.
  if v_family_id <> coalesce(public.my_family_id(), '00000000-0000-0000-0000-000000000000'::uuid)
     and not public.is_admin()
     and current_setting('role', true) is distinct from 'service_role'
     and current_user <> 'service_role' then
    raise exception 'Not your matches' using errcode = 'ROLE1';
  end if;

  for n in select id from public.nanny_profiles where status = 'approved' loop
    m := public.compute_match(v_family_id, n.id);
    continue when m is null;

    insert into public.matches (family_id, nanny_id, score, breakdown, reasons,
                                conflicts, unknown_dimensions, computed_at)
    values (
      v_family_id,
      n.id,
      (m ->> 'score')::numeric,
      m -> 'breakdown',
      array(select jsonb_array_elements_text(m -> 'reasons')),
      array(select jsonb_array_elements_text(m -> 'conflicts')),
      array(select jsonb_array_elements_text(m -> 'unknowns')),
      now()
    )
    on conflict (family_id, nanny_id) where job_id is null
    do update set
      score = excluded.score,
      breakdown = excluded.breakdown,
      reasons = excluded.reasons,
      conflicts = excluded.conflicts,
      unknown_dimensions = excluded.unknown_dimensions,
      computed_at = now();

    v_count := v_count + 1;
  end loop;

  -- A nanny who is no longer approved should not linger in anyone's matches.
  delete from public.matches
   where family_id = v_family_id
     and nanny_id not in (select id from public.nanny_profiles where status = 'approved');

  return v_count;
end;
$$;

grant execute on function public.refresh_matches(uuid) to authenticated;

-- The matches table is written only by that function, never by a client.
revoke insert, update, delete on public.matches from authenticated;
