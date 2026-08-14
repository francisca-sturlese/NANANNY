-- Every column somebody is supposed to be able to edit, across every table.
--
-- The visa column was added and its UPDATE grant was not, and because a column
-- level refusal fails the whole statement, an entire form was silently
-- discarded. The nanny filled in step one, was sent to step two, and step one
-- was empty when she went back. No error anywhere.
--
-- The specific fix was one grant. This is the general one: the same trap exists
-- on every table with column level grants, and it will be sprung again by
-- whoever adds the next column. So instead of a list of columns to remember,
-- here is a list of the ones deliberately withheld, and anything else that is
-- not editable is a mistake by definition.

/**
 * Names every column a signed-in user should be able to write and cannot.
 *
 * Returns 'ok' or a description. Read only, so it is safe to call from a test,
 * a health check, or by hand while wondering why a form is not saving.
 *
 * The withheld lists are the interesting part of this file. Each entry is
 * something a user must not set for a reason, and the reason is worth knowing:
 * `status` and `role` decide what somebody is allowed to do, the completion
 * percentages are derived, and the timestamps are the record of what happened
 * rather than a claim about it.
 */
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
  'Names every column a user is expected to edit but cannot. A column level refusal fails the whole statement, so one missing grant silently discards an entire form.';

-- What the check finds today, fixed rather than recorded as expected.
do $$
declare result text;
begin
  result := public.assert_editable_columns();
  if result <> 'ok' then
    raise notice 'Columns that were not editable: %', result;
  end if;
end $$;
