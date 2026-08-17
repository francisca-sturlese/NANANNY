-- The search page returns nothing to a signed-out visitor.
--
-- `nanny_profiles` is granted column by column: row level security decides the
-- rows, the grants decide the fields, and a column added later has no grant at
-- all until somebody writes one. `has_photo` was added to put the profiles with
-- a face first, and the search query orders by it.
--
-- PostgREST needs SELECT on a column it is asked to order by. `anon` did not
-- have it, so the whole query was refused, and the page a family lands on
-- before signing up said "No nannies yet" while fifteen approved profiles sat
-- in the table. Signed in it worked, because `authenticated` has a broader
-- grant, which is why it can be checked and found fine by anybody who is logged
-- in when they look.
--
-- This is the same trap as `visa_status` on the fourteenth, from the other
-- side: there a missing UPDATE grant threw away a form, here a missing SELECT
-- grant empties a page. Adding a column to this table is two changes, and the
-- second one fails somewhere other than where it was made.

grant select (has_photo) on public.nanny_profiles to anon, authenticated;

/**
 * The reading half of the guard that already exists for writing.
 *
 * `assert_editable_columns()` names columns a user should be able to write and
 * cannot. This names columns a signed-out visitor should be able to read and
 * cannot, which is the failure that empties a page rather than a form.
 *
 * The withheld list is the interesting part. Everything on it is something a
 * stranger has no business reading about a real person: her contact details,
 * her documents, the notes a reviewer left, and the timestamps that describe
 * our handling of her rather than her.
 */
create or replace function public.assert_public_nanny_columns()
returns text
language plpgsql
volatile
as $$
declare
  withheld text[] := array[
    -- Hers, and not a stranger's business.
    'user_id', 'date_of_birth', 'phone', 'whatsapp', 'email',
    'passport_number', 'visa_expiry', 'reference_contacts',
    -- Ours: how we handled her, not what she offers.
    'rejection_reason', 'reviewed_at', 'reviewed_by', 'submitted_at',
    'updated_at', 'profile_completion', 'search_vector', 'display_name',
    'previous_experience', 'notes',
    'onboarding_completed_at', 'onboarding_step',
    -- Precise enough to find somebody. A stranger gets the emirate, which is
    -- what a family filters on; the street she lives on is not part of the
    -- offer and never becomes so by being useful.
    'latitude', 'longitude', 'area',
    -- Withheld as things stand rather than as a rule of nature. Each of these
    -- would be defensible to publish and none has been decided, so the list
    -- records today's answer. Adding a column to this table means choosing a
    -- side for it, and this is where the choice gets written down: a column
    -- that belongs on neither list is the bug this function exists to find.
    'gender', 'available_hours_start', 'available_hours_end',
    'preferred_locations', 'video_url'
  ];
  missing text[];
begin
  select coalesce(array_agg(c.column_name order by c.column_name), '{}')
    into missing
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'nanny_profiles'
     and not (c.column_name = any(withheld))
     and not has_column_privilege('anon', 'public.nanny_profiles',
                                  c.column_name, 'SELECT');

  if cardinality(missing) = 0 then
    return 'ok';
  end if;

  return 'not readable by a visitor: ' || array_to_string(missing, ', ');
end;
$$;

comment on function public.assert_public_nanny_columns() is
  'Names any column a signed-out visitor is expected to read and cannot. PostgREST refuses the whole query, including an order by, so one missing grant empties the search page while it still works for anybody signed in.';

grant execute on function public.assert_public_nanny_columns()
  to authenticated, anon, service_role;

do $$
declare result text;
begin
  result := public.assert_public_nanny_columns();
  if result <> 'ok' then
    raise notice 'Columns a visitor cannot read: %', result;
  end if;
end $$;
