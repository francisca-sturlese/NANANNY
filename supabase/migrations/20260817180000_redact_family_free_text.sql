-- The same rule on the family's own free text.
--
-- `nanny_profiles` and `jobs` were covered this morning, after a nanny
-- published her mobile number on a page anybody can read. `family_profiles`
-- has a `description` too, written in the same kind of box, and it was left
-- out for no reason other than that the screenshot happened to be of a nanny.
--
-- A family publishing its own number is a smaller problem than a nanny
-- publishing hers, and it is the same problem: it is a home phone on a public
-- page, and it skips the record of who contacted whom that both sides rely on
-- when something goes wrong.
--
-- `ai_brief` is covered as well. Nothing writes it today, and a column that
-- exists and is empty is exactly the one that gets filled in later by somebody
-- who does not know this rule exists.

create or replace function public.redact_family_free_text()
returns trigger
language plpgsql
as $$
begin
  new.description := public.redact_contact_details(new.description);
  new.ai_brief := public.redact_contact_details(new.ai_brief);
  return new;
end;
$$;

drop trigger if exists family_profiles_redact on public.family_profiles;
create trigger family_profiles_redact
  before insert or update on public.family_profiles
  for each row execute function public.redact_family_free_text();

-- What is already there.
update public.family_profiles
   set description = description
 where description is not null
   and (description ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
        or description ~ '\+?[0-9][0-9 ()./-]{5,}[0-9]');

-- ---------------------------------------------------------------------------
-- Saying so to the person it happened to
-- ---------------------------------------------------------------------------

/**
 * Whether a piece of text has had something taken out of it.
 *
 * The form now warns before somebody types, which helps everybody who arrives
 * from today. It does nothing for the nanny whose advert was edited this
 * morning: from where she is standing, somebody changed her words and told her
 * nothing. This is what lets her own screens explain it, and only to her.
 */
create or replace function public.was_redacted(p_text text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_text like '%[number removed]%' or p_text like '%[email removed]%', false);
$$;

grant execute on function public.was_redacted(text) to authenticated, service_role;

comment on function public.was_redacted(text) is
  'True when redact_contact_details() has taken something out. Used to explain the edit to the person whose text it was, rather than leaving her to find it.';
