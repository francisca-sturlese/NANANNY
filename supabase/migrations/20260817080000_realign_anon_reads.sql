-- What a stranger can read, across the whole schema, made to match the code.
--
-- `nanny_profiles` was realigned an hour ago after production turned out to
-- grant more than the migrations describe. A census of the rest found the same
-- thing everywhere: in production an anonymous session reaches `users.email`,
-- `users.phone`, `messages.body`, `conversations`, `email_events` and
-- `audit_logs` at the grant level, none of which this repository grants.
--
-- Nothing is exposed today. Row level security holds on every one of them, and
-- was tested doing so. But that is the whole point: the design is two locks,
-- and production has been running on one. A single mistake in a policy on
-- `users` or `messages` puts email addresses, phone numbers and the text people
-- write to each other in front of anybody with the anon key, which is in every
-- page of the site by design.
--
-- The list below is not a new decision. It is what the migrations already
-- produce, read off a database built from them: two tables a stranger reads by
-- column, three small ones a stranger reads whole, and nothing else. This makes
-- production match, and gives it a way to say when it stops matching.

/**
 * The only tables a signed-out visitor may read, and how much of each.
 *
 * `jobs` and `nanny_profiles` are the product: a family should be able to look
 * before signing up, which is a deliberate decision made early and worth
 * keeping. Both are restricted column by column, because the row carries things
 * the listing does not: where somebody lives precisely, what step of onboarding
 * she reached, what a reviewer wrote about her.
 *
 * `pricing_config`, `reviews` and `nanny_badges` are read whole. They hold
 * nothing about a particular person that is not already the thing being shown.
 *
 * An empty list means the table is not readable at all. Most of them.
 */
create or replace function public.anon_readable()
returns table (table_name text, columns text[])
language sql
immutable
as $$
  select 'nanny_profiles'::text, public.public_nanny_columns()
  union all
  select 'jobs'::text, array[
    'id', 'status', 'title', 'created_at', 'published_at',
    'emirate', 'area',
    'children_count', 'children_ages', 'has_pets',
    'arrangement', 'employment_type', 'start_date',
    'working_days', 'working_hours_start', 'working_hours_end',
    'hours_per_week', 'schedule_notes',
    'salary_min_aed', 'salary_max_aed',
    'hourly_rate_min_aed', 'hourly_rate_max_aed',
    'required_experience_years', 'required_languages', 'required_skills',
    'responsibilities', 'additional_information',
    'cooking_required', 'housekeeping_required', 'driving_required',
    'visa_preference'
  ]::text[]
  union all
  select 'pricing_config'::text, '{}'::text[]
  union all
  select 'reviews'::text, '{}'::text[]
  union all
  select 'nanny_badges'::text, '{}'::text[];
$$;

grant execute on function public.anon_readable() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Setting it
-- ---------------------------------------------------------------------------

-- Everything is taken away first, including from tables not named above, so a
-- grant nobody wrote down cannot survive this. A table level revoke carries the
-- column level grants with it, which is the only way to remove one.
do $$
declare
  t record;
  wanted record;
  col text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke select on public.%I from anon', t.relname);
  end loop;

  for wanted in select * from public.anon_readable() loop
    if cardinality(wanted.columns) = 0 then
      execute format('grant select on public.%I to anon', wanted.table_name);
    else
      foreach col in array wanted.columns loop
        execute format('grant select (%I) on public.%I to anon', col, wanted.table_name);
      end loop;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Checking it
-- ---------------------------------------------------------------------------

/**
 * Everything a stranger can read, compared against everything they may.
 *
 * The half that gets noticed is a missing grant: it empties a page, loudly and
 * within hours. The half that matters is the extra one, which shows nothing at
 * all and is what production had been doing for an unknown length of time.
 *
 * Whole-schema on purpose. A guard that looks at one table finds the drift
 * somebody already suspected, and misses the table nobody thought about, which
 * is where it will be.
 */
create or replace function public.assert_anon_reads()
returns text
language plpgsql
volatile
-- Columns are read from pg_attribute against the same oid the privilege is
-- checked on. information_schema.columns is keyed by name, and this schema has
-- two tables called `messages`, one of them Supabase's own in the realtime
-- schema. Matching by name found the wrong one and asked whether a visitor
-- could read a column that does not exist here.
as $$
declare
  problems text[] := '{}';
  t record;
  allowed text[];
  extra text[];
  missing text[];
begin
  for t in
    select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    select columns into allowed from public.anon_readable() r
     where r.table_name = t.relname;

    -- Not on the list at all: nothing may be readable.
    if allowed is null then
      select coalesce(array_agg(a.attname::text order by a.attname), '{}')
        into extra
        from pg_attribute a
       where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
         and has_column_privilege('anon', t.oid, a.attname, 'SELECT');

      if cardinality(extra) > 0 then
        problems := problems || format('%s is not public at all, yet a visitor reads: %s',
                                       t.relname, array_to_string(extra, ', '));
      end if;

      continue;
    end if;

    -- On the list with no columns named: the whole table, deliberately.
    if cardinality(allowed) = 0 then
      if not has_table_privilege('anon', t.oid, 'SELECT') then
        problems := problems || format('%s should be readable and is not', t.relname);
      end if;
      continue;
    end if;

    select coalesce(array_agg(a.attname::text order by a.attname), '{}')
      into missing
      from pg_attribute a
     where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
       and a.attname::text = any(allowed)
       and not has_column_privilege('anon', t.oid, a.attname, 'SELECT');

    select coalesce(array_agg(a.attname::text order by a.attname), '{}')
      into extra
      from pg_attribute a
     where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
       and not (a.attname::text = any(allowed))
       and has_column_privilege('anon', t.oid, a.attname, 'SELECT');

    if cardinality(missing) > 0 then
      problems := problems || format('%s: a visitor cannot read %s',
                                     t.relname, array_to_string(missing, ', '));
    end if;

    if cardinality(extra) > 0 then
      problems := problems || format('%s: a visitor can read and should not %s',
                                     t.relname, array_to_string(extra, ', '));
    end if;
  end loop;

  if cardinality(problems) = 0 then
    return 'ok';
  end if;

  return array_to_string(problems, ' | ');
end;
$$;

comment on function public.assert_anon_reads() is
  'Compares what an anonymous session can read across every table in public against anon_readable(). Row level security is the other lock; this one is the reason a single policy mistake is not an exposure.';

grant execute on function public.assert_anon_reads() to authenticated, anon, service_role;

do $$
declare result text;
begin
  result := public.assert_anon_reads();
  if result <> 'ok' then
    raise notice 'Anonymous reads are out of line: %', result;
  end if;
end $$;
