-- A nanny published her mobile number and her email address on a public page.
--
-- She wrote them into the free text of her own profile, at the bottom of a
-- careful advert she had clearly spent time on, ending "serious families
-- looking for a reliable nanny are welcome to contact me". She was doing
-- exactly what she does on every other board she has ever used.
--
-- Three separate problems, and the first is hers rather than ours.
--
-- Her number is now readable by anyone, and `description` is one of the columns
-- an anonymous session may read, so it is not only on the page: it is in the
-- API, available to anything that ever asks. A woman looking for work in a
-- foreign country, with her mobile in public, is the person who gets the calls
-- nobody wants. She cannot know that, and we can.
--
-- Second, it walks around the whole reason the product exists. Contact goes
-- through here so that both sides have a record and either can stop it.
--
-- Third, it is the kind of thing that has to be handled where it is stored and
-- not where it is displayed. Hiding it at render time leaves it in the table
-- and in every API response, which is most of the exposure and all of the
-- permanence.

/**
 * Takes contact details out of a piece of free text.
 *
 * A phone number is any run of nine or more digits, however somebody spaces,
 * dots or brackets it. A UAE mobile is ten with the leading zero and twelve
 * written internationally, and a landline is nine.
 *
 * Nine rather than seven, which was the first attempt and was wrong: "08.00 -
 * 17.00" is eight digits and is somebody's working hours, and a date written
 * 17/08/2026 is eight as well. Both would have been erased out of the middle of
 * a sentence, which is worse than the thing being prevented, because it happens
 * to people who did nothing wrong and they cannot tell why.
 *
 * The replacement is visible rather than silent. A gap teaches nobody anything
 * and looks like a bug; a marker tells her what happened, which is the only way
 * she stops doing it.
 */
create or replace function public.redact_contact_details(p_text text)
returns text
language plpgsql
immutable
as $$
declare
  result text := p_text;
  candidate text;
  digits int;
begin
  if result is null or btrim(result) = '' then
    return result;
  end if;

  -- Email addresses first: they contain no long digit runs, so order does not
  -- matter, but doing them first keeps the second pass simpler to read.
  result := regexp_replace(
    result,
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
    '[email removed]',
    'g');

  /**
   * Then the numbers.
   *
   * Every candidate run is collected first and the qualifying ones replaced
   * afterwards. Walking left to right and stopping at the first run that is too
   * short would hide a real number sitting behind a set of working hours, which
   * is exactly the shape of the advert this was written for.
   */
  for candidate in
    select distinct m[1]
      from regexp_matches(result, '\+?[0-9][0-9 ()./-]{5,}[0-9]', 'g') as m
  loop
    digits := length(regexp_replace(candidate, '[^0-9]', '', 'g'));

    if digits >= 9 then
      result := replace(result, candidate, '[number removed]');
    end if;
  end loop;

  return result;
end;
$$;

grant execute on function public.redact_contact_details(text) to authenticated, service_role;

comment on function public.redact_contact_details(text) is
  'Removes email addresses and phone numbers from free text. Applied where the text is stored rather than where it is shown: `description` is readable by an anonymous session, so hiding it at render leaves it in every API response.';

-- ---------------------------------------------------------------------------
-- Where it applies
-- ---------------------------------------------------------------------------

/**
 * The free text fields on a profile, cleaned on the way in.
 *
 * Not the whole row: names, emirates and languages are chosen from lists and a
 * number in one of them is a mistake of a different kind.
 */
create or replace function public.redact_nanny_free_text()
returns trigger
language plpgsql
as $$
begin
  new.headline := public.redact_contact_details(new.headline);
  new.description := public.redact_contact_details(new.description);
  return new;
end;
$$;

drop trigger if exists nanny_profiles_redact on public.nanny_profiles;
create trigger nanny_profiles_redact
  before insert or update on public.nanny_profiles
  for each row execute function public.redact_nanny_free_text();

/**
 * And on a job post, which is the same problem from the other side.
 *
 * A family putting its own number in an advert is publishing a home phone to
 * anybody browsing, and skipping the record of who contacted whom that both
 * sides rely on if something goes wrong.
 */
create or replace function public.redact_job_free_text()
returns trigger
language plpgsql
as $$
begin
  new.title := public.redact_contact_details(new.title);
  new.responsibilities := public.redact_contact_details(new.responsibilities);
  new.additional_information := public.redact_contact_details(new.additional_information);
  new.schedule_notes := public.redact_contact_details(new.schedule_notes);
  return new;
end;
$$;

drop trigger if exists jobs_redact on public.jobs;
create trigger jobs_redact
  before insert or update on public.jobs
  for each row execute function public.redact_job_free_text();

-- ---------------------------------------------------------------------------
-- What is already published
-- ---------------------------------------------------------------------------

-- The rows that are live right now, including the one that prompted this. An
-- update is enough: the triggers above do the work, and touching every row is
-- cheap at this size.
update public.nanny_profiles
   set description = description
 where description is not null
   and (description ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
        or description ~ '\+?[0-9][0-9 ()./-]{5,}[0-9]');

update public.nanny_profiles
   set headline = headline
 where headline is not null
   and (headline ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
        or headline ~ '\+?[0-9][0-9 ()./-]{5,}[0-9]');

update public.jobs
   set title = title
 where title is not null
   and (title ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
        or title ~ '\+?[0-9][0-9 ()./-]{5,}[0-9]');

update public.jobs
   set responsibilities = responsibilities
 where responsibilities is not null
   and (responsibilities ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
        or responsibilities ~ '\+?[0-9][0-9 ()./-]{5,}[0-9]');

update public.jobs
   set additional_information = additional_information
 where additional_information is not null
   and (additional_information ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
        or additional_information ~ '\+?[0-9][0-9 ()./-]{5,}[0-9]');
