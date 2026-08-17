-- The redaction tells the person, instead of somebody remembering to.
--
-- Three nannies had their adverts cleaned this morning and were told about it
-- by three rows inserted by hand. That worked, and it worked because somebody
-- was watching at the time. The fourth person it happens to, next Tuesday,
-- would have found "[number removed]" in her own words with no explanation,
-- which reads as being told off by a machine.
--
-- Same shape as every other guard here: a one-time action fixes the people it
-- was aimed at, and only moving it into the mechanism fixes the category. The
-- notification is now written by the thing doing the redacting, in the same
-- statement, so it cannot be forgotten and cannot drift out of step with what
-- was actually removed.

/**
 * Tells somebody we took contact details out of their text.
 *
 * Only when something actually changed, and only when there is not already an
 * unread one waiting: somebody editing her profile four times in an afternoon
 * should not collect four identical notifications about the same habit.
 *
 * `href` differs by side because the two people land on different screens, and
 * a notification that opens the wrong page is worse than none: it says we did
 * not know who we were talking to.
 */
create or replace function public.tell_about_redaction(
  p_user_id uuid,
  p_href text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if exists (
    select 1 from public.notifications
     where user_id = p_user_id
       and kind = 'contact_details_removed'
       and read_at is null
  ) then
    return;
  end if;

  insert into public.notifications (user_id, kind, title, href, metadata)
  values (p_user_id, 'contact_details_removed', null, p_href,
          jsonb_build_object('by', 'automatic'));
end;
$$;

revoke execute on function public.tell_about_redaction(uuid, text) from public, anon, authenticated;
grant execute on function public.tell_about_redaction(uuid, text) to service_role;

-- ---------------------------------------------------------------------------

create or replace function public.redact_nanny_free_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_headline text := public.redact_contact_details(new.headline);
  clean_description text := public.redact_contact_details(new.description);
begin
  if clean_headline is distinct from new.headline
     or clean_description is distinct from new.description then
    perform public.tell_about_redaction(new.user_id, '/nanny/profile');
  end if;

  new.headline := clean_headline;
  new.description := clean_description;
  return new;
end;
$$;

create or replace function public.redact_family_free_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_description text := public.redact_contact_details(new.description);
  clean_brief text := public.redact_contact_details(new.ai_brief);
begin
  if clean_description is distinct from new.description
     or clean_brief is distinct from new.ai_brief then
    perform public.tell_about_redaction(new.user_id, '/family/profile');
  end if;

  new.description := clean_description;
  new.ai_brief := clean_brief;
  return new;
end;
$$;

/**
 * A job post belongs to a family, so the family is the one told.
 *
 * Reached through `family_profiles` rather than trusted from the row, because
 * `jobs.family_id` is a profile id and the notification needs the person.
 */
create or replace function public.redact_job_free_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_title text := public.redact_contact_details(new.title);
  clean_responsibilities text := public.redact_contact_details(new.responsibilities);
  clean_additional text := public.redact_contact_details(new.additional_information);
  clean_schedule text := public.redact_contact_details(new.schedule_notes);
  v_user uuid;
begin
  if clean_title is distinct from new.title
     or clean_responsibilities is distinct from new.responsibilities
     or clean_additional is distinct from new.additional_information
     or clean_schedule is distinct from new.schedule_notes then
    select f.user_id into v_user
      from public.family_profiles f where f.id = new.family_id;
    perform public.tell_about_redaction(v_user, '/family/jobs');
  end if;

  new.title := clean_title;
  new.responsibilities := clean_responsibilities;
  new.additional_information := clean_additional;
  new.schedule_notes := clean_schedule;
  return new;
end;
$$;

comment on function public.tell_about_redaction(uuid, text) is
  'Written by the redaction triggers themselves. The three people it happened to first were told by rows inserted by hand, which worked because somebody was watching; the fourth would not have been.';
