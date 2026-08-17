-- The guard was flagging a column nobody can ever write, including us.
--
-- `assert_editable_columns()` names every column a signed-in user is expected
-- to edit and cannot, because a column-level refusal fails the whole statement
-- and one missing grant silently discards an entire form. It works by treating
-- anything not on a withheld list as something that ought to be editable.
--
-- `nanny_profiles.has_photo` is generated: PostgreSQL computes it and refuses an
-- UPDATE from anybody, superuser included. So the guard reported it as missing a
-- grant that cannot exist, and the answer to it was not "add the grant", it was
-- "there is nothing to add".
--
-- Left alone, the fix would have been to append `has_photo` to the withheld
-- list, and the next generated column would have failed the same way and been
-- appended too. A check that needs maintenance every time somebody adds a
-- column is a check people start ignoring, and this one exists precisely
-- because a silent failure had already cost a form.

create or replace function public.assert_editable_columns()
returns text
language plpgsql
-- Volatile, not stable. A stable function reads the calling query's snapshot,
-- so a grant changed earlier in the same transaction is invisible to it, and
-- the self check that proves this guard can fail would always pass.
volatile
as $$
declare
  -- table name -> columns a user is not meant to write
  withheld jsonb := jsonb_build_object(
    'nanny_profiles', jsonb_build_array(
      'id', 'user_id', 'status', 'profile_completion', 'search_vector',
      'rejection_reason', 'created_at', 'updated_at', 'submitted_at',
      'reviewed_at', 'reviewed_by', 'display_name'),
    'family_profiles', jsonb_build_array(
      'id', 'user_id', 'profile_completion', 'created_at', 'updated_at',
      'search_vector'),
    'family_requirements', jsonb_build_array(
      'id', 'family_id', 'created_at', 'updated_at'),
    'family_children', jsonb_build_array(
      'id', 'family_id', 'created_at', 'updated_at'),
    'jobs', jsonb_build_array(
      'id', 'family_id', 'created_at', 'updated_at', 'published_at',
      'search_vector')
  );
  problems text[] := '{}';
  t text;
  missing text[];
begin
  for t in select jsonb_object_keys(withheld) loop
    select coalesce(array_agg(c.column_name order by c.column_name), '{}')
      into missing
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = t
       -- A generated or identity column is computed by the database and
       -- refuses an UPDATE from everybody. Listing it as withheld would be a
       -- claim about intent; skipping it here is a statement of fact, and it
       -- covers the next one somebody adds without anybody remembering.
       and c.is_generated = 'NEVER'
       and c.is_identity = 'NO'
       and not (c.column_name in (
             select jsonb_array_elements_text(withheld -> t)))
       and not has_column_privilege('authenticated', 'public.' || t,
                                    c.column_name, 'UPDATE');

    if cardinality(missing) > 0 then
      problems := problems || format('%s: %s', t, array_to_string(missing, ', '));
    end if;
  end loop;

  if cardinality(problems) = 0 then
    return 'ok';
  end if;

  return array_to_string(problems, ' | ');
end;
$$;

grant execute on function public.assert_editable_columns()
  to authenticated, anon, service_role;

comment on function public.assert_editable_columns() is
  'Names every column a user is expected to edit but cannot. A column level refusal fails the whole statement, so one missing grant silently discards an entire form. Generated and identity columns are skipped: nobody can write those, so there is no grant to be missing.';

do $$
declare result text;
begin
  result := public.assert_editable_columns();
  if result <> 'ok' then
    raise notice 'Columns that are still not editable: %', result;
  end if;
end $$;
