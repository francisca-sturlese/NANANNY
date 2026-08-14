-- A nanny could not save her own visa status, and neither could she save
-- anything else on that step.
--
-- `nanny_profiles` is granted column by column: RLS decides the rows, the
-- grants decide the fields, and `status` and a few others are deliberately
-- withheld so nobody can approve themselves. `visa_status` was added later and
-- nobody added it to the UPDATE grant.
--
-- A column-level refusal fails the whole statement, not just the column. So the
-- update that carried her name, nationality, date of birth, emirate and visa
-- status was rejected entirely, PostgREST reported nothing the app looked at,
-- and the form moved cheerfully to the next step having saved none of it. She
-- filled in step one, was sent to step two, and step one was still empty when
-- she went back.
--
-- The lesson is not "grant this column". It is that adding a column to this
-- table is two changes, and the second one is silent when it is missed.

grant update (visa_status) on public.nanny_profiles to authenticated;

/**
 * The guard against it happening again.
 *
 * Every column a nanny is meant to be able to edit, checked against what she
 * can actually edit. The withheld ones are named so the list says what it means
 * rather than being a copy of the current state.
 */
create or replace function public.assert_nanny_columns_updatable()
returns text
language plpgsql
stable
as $$
declare
  withheld text[] := array[
    'id', 'user_id', 'status', 'profile_completion', 'search_vector',
    'rejection_reason', 'created_at', 'updated_at', 'submitted_at',
    'reviewed_at', 'reviewed_by', 'display_name'
  ];
  missing text[];
begin
  select coalesce(array_agg(c.column_name order by c.column_name), '{}')
    into missing
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'nanny_profiles'
     and not (c.column_name = any(withheld))
     and not has_column_privilege('authenticated', 'public.nanny_profiles',
                                  c.column_name, 'UPDATE');

  if cardinality(missing) = 0 then
    return 'ok';
  end if;

  return 'not updatable by a nanny: ' || array_to_string(missing, ', ');
end;
$$;

comment on function public.assert_nanny_columns_updatable() is
  'Names any column a nanny is expected to edit but cannot. A column level refusal fails the whole statement, so one missing grant silently discards the entire form.';

-- Not SECURITY DEFINER, so the event trigger does not close it, but the sweep
-- in 20260814210000 revoked from PUBLIC across the schema and this is read only.
grant execute on function public.assert_nanny_columns_updatable()
  to authenticated, anon, service_role;
