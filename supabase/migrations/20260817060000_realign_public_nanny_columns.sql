-- One list of what a stranger may read, and a check that runs both ways.
--
-- Production had a broader grant than the migrations describe. An anonymous
-- session could read `onboarding_step` and `latitude`, neither of which is any
-- of a stranger's business. Nothing was actually exposed, because every
-- latitude in the table is null and `users` is closed by row level security,
-- so this was the shape of a leak rather than a leak. It is still worth closing
-- at the root, because the next column that gets a value would have been
-- exposed by the same grant without anybody doing anything.
--
-- The deeper problem is that the schema and the migrations had drifted, and
-- nothing could tell. `assert_public_nanny_columns()` as first written only
-- looked for columns a visitor should read and cannot, which is the failure
-- that empties a page and gets noticed. The opposite failure, a column a
-- visitor can read and should not, shows nothing at all and is the one that
-- matters.
--
-- So: one canonical list, used to set the grants and to check them. A column
-- missing from the grants and a column granted beyond the list are both
-- reported by the same function, and adding a column to this table now means
-- choosing a side for it here.

/**
 * Everything a signed-out visitor may read on a nanny profile.
 *
 * This is the offer: what she can do, where she works, what she asks for, and
 * what she looks like. Everything else is either hers (contact details,
 * documents, date of birth), ours (how we reviewed her, what step she reached),
 * or precise enough to find her at home.
 *
 * A function rather than a constant, so the grants and the check cannot come
 * apart. There is exactly one place to edit.
 */
create or replace function public.public_nanny_columns()
returns text[]
language sql
immutable
as $$
  select array[
    'id', 'status', 'created_at',
    'first_name', 'headline', 'description', 'photo_url', 'has_photo',
    'nationality', 'emirate', 'visa_status',
    'years_experience', 'uae_experience_years',
    'newborn_experience', 'toddler_experience', 'school_age_experience',
    'special_needs_experience', 'pet_experience',
    'languages', 'english_level', 'arabic_level', 'education',
    'certificates', 'first_aid_certified', 'has_driving_licence',
    'can_cook', 'can_housekeep',
    'arrangement', 'employment_types', 'available_days', 'available_from',
    'salary_expectation_min_aed', 'salary_expectation_max_aed',
    'hourly_rate_min_aed'
  ]::text[];
$$;

grant execute on function public.public_nanny_columns() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Setting them
-- ---------------------------------------------------------------------------

-- A table level revoke clears the column level grants too, so this is the only
-- way to remove a grant nobody wrote down. Then the list is applied. Running it
-- twice changes nothing, which is what makes it a repair rather than a patch.
do $$
declare col text;
begin
  revoke select on public.nanny_profiles from anon;

  foreach col in array public.public_nanny_columns() loop
    execute format('grant select (%I) on public.nanny_profiles to anon', col);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Checking them
-- ---------------------------------------------------------------------------

/**
 * Both directions, against the one list.
 *
 * Too little is the failure that empties the search page for everybody not
 * signed in, which is how this was found: PostgREST refuses a whole query when
 * it cannot read a column in an ORDER BY, and it kept working for anybody
 * logged in, who is who checks.
 *
 * Too much is the failure that shows nothing at all. That is the one that had
 * been true in production for an unknown length of time.
 */
create or replace function public.assert_public_nanny_columns()
returns text
language plpgsql
volatile
as $$
declare
  allowed text[] := public.public_nanny_columns();
  missing text[];
  extra text[];
  problems text[] := '{}';
begin
  select coalesce(array_agg(c.column_name order by c.column_name), '{}')
    into missing
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'nanny_profiles'
     and c.column_name = any(allowed)
     and not has_column_privilege('anon', 'public.nanny_profiles',
                                  c.column_name, 'SELECT');

  select coalesce(array_agg(c.column_name order by c.column_name), '{}')
    into extra
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'nanny_profiles'
     and not (c.column_name = any(allowed))
     and has_column_privilege('anon', 'public.nanny_profiles',
                              c.column_name, 'SELECT');

  if cardinality(missing) > 0 then
    problems := problems || ('a visitor cannot read: ' || array_to_string(missing, ', '));
  end if;

  if cardinality(extra) > 0 then
    problems := problems || ('a visitor can read and should not: ' || array_to_string(extra, ', '));
  end if;

  if cardinality(problems) = 0 then
    return 'ok';
  end if;

  return array_to_string(problems, ' | ');
end;
$$;

comment on function public.assert_public_nanny_columns() is
  'Compares what a signed-out visitor can read against public_nanny_columns(), in both directions. Too little empties the search page and gets noticed; too much shows nothing and is the one that matters.';

grant execute on function public.assert_public_nanny_columns()
  to authenticated, anon, service_role;

do $$
declare result text;
begin
  result := public.assert_public_nanny_columns();
  if result <> 'ok' then
    raise notice 'Public columns are out of line: %', result;
  end if;
end $$;
