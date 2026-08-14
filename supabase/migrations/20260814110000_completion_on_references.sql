-- The stored completion percentage went stale whenever a reference changed.
--
-- `nanny_profile_completion()` counts references from their own table, but the
-- only trigger that wrote the percentage back fired on `nanny_profiles`. Adding
-- a reference therefore raised the real completion by three points and left the
-- stored number behind, so a nanny saw the wrong figure until she next edited
-- something else. Every freshly seeded profile showed it too, which is how the
-- privacy suite caught it.

create or replace function public.refresh_nanny_completion_from_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_nanny_id uuid;
begin
  v_nanny_id := coalesce(new.nanny_id, old.nanny_id);

  update public.nanny_profiles
     set profile_completion = (public.nanny_profile_completion(v_nanny_id) ->> 'percent')::int
   where id = v_nanny_id;

  return null;
end;
$$;

create trigger nanny_references_refresh_completion
  after insert or update or delete on public.nanny_references
  for each row
  execute function public.refresh_nanny_completion_from_reference();

-- Bring existing rows in line, including everything the seed created before
-- this trigger existed.
update public.nanny_profiles
   set profile_completion = (public.nanny_profile_completion(id) ->> 'percent')::int
 where profile_completion <> (public.nanny_profile_completion(id) ->> 'percent')::int;
