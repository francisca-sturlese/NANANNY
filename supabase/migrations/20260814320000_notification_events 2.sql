-- The other things worth being told about.
--
-- `notifications` has been written to by exactly one thing since it was
-- created: a new message. Everything else that happens to somebody here has
-- been silent. A nanny applies and the family finds out by opening the page. A
-- family shortlists her and she finds out the same way, if she thinks to look.
--
-- These are triggers rather than calls in the actions that do the work. The
-- same reasoning as the rate limits: the row is what actually happened, an
-- action is one of several ways it can be written, and a notification added to
-- one code path is a notification missing from the next one somebody adds.
--
-- Each is SECURITY DEFINER because the person being told is never the person
-- doing the thing. A nanny inserting an application has no way to write a row
-- into the family's notifications, and should not: there is no INSERT policy on
-- that table for anybody, which is the correct answer for a table whose whole
-- meaning is "the system said this".
--
-- Nothing here stores a sentence. `title` stays null and the text is built when
-- it is read, so it can be shown in the reader's language, and so no row ever
-- holds text one user typed at another.

-- ---------------------------------------------------------------------------
-- A nanny applied to a job
-- ---------------------------------------------------------------------------

create or replace function public.notify_application_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_user uuid;
  v_job_title text;
  v_nanny_name text;
begin
  select f.user_id, j.title
    into v_family_user, v_job_title
    from public.jobs j
    join public.family_profiles f on f.id = j.family_id
   where j.id = new.job_id;

  if v_family_user is null then
    return new;
  end if;

  select n.first_name into v_nanny_name
    from public.nanny_profiles n where n.id = new.nanny_id;

  insert into public.notifications (user_id, kind, title, href, metadata)
  values (
    v_family_user,
    'application_received',
    null,
    '/family/jobs/' || new.job_id || '/applications',
    jsonb_build_object(
      'job_id', new.job_id,
      'job_title', v_job_title,
      'nanny_name', coalesce(v_nanny_name, 'A nanny'))
  );

  return new;
end;
$$;

drop trigger if exists job_applications_notify_family on public.job_applications;
create trigger job_applications_notify_family
  after insert on public.job_applications
  for each row execute function public.notify_application_received();

-- ---------------------------------------------------------------------------
-- A family moved an application along
-- ---------------------------------------------------------------------------

-- 'viewed' is deliberately not in this list. It fires when a family opens a
-- page, which is not a decision, and a notification for it would train her to
-- ignore the bell.
create or replace function public.notify_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nanny_user uuid;
  v_job_title text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('shortlisted', 'interview', 'rejected', 'hired') then
    return new;
  end if;

  select n.user_id into v_nanny_user
    from public.nanny_profiles n where n.id = new.nanny_id;

  if v_nanny_user is null then
    return new;
  end if;

  select j.title into v_job_title from public.jobs j where j.id = new.job_id;

  insert into public.notifications (user_id, kind, title, href, metadata)
  values (
    v_nanny_user,
    'application_' || new.status,
    null,
    '/nanny/applications',
    jsonb_build_object('job_id', new.job_id, 'job_title', v_job_title)
  );

  return new;
end;
$$;

drop trigger if exists job_applications_notify_nanny on public.job_applications;
create trigger job_applications_notify_nanny
  after update of status on public.job_applications
  for each row execute function public.notify_application_status();

-- ---------------------------------------------------------------------------
-- A profile was reviewed
-- ---------------------------------------------------------------------------

/**
 * The one notification somebody is actually waiting for.
 *
 * She is findable from the moment she submits, so approval is no longer the
 * thing that makes her visible. It is still the thing that removes "profile not
 * verified yet" from her card, and being told it happened is the difference
 * between checking the page every day and getting on with her week.
 *
 * A rejection carries no reason in the row. The reason is on her profile page,
 * written by a person, and copying it here would mean maintaining it in two
 * places and showing a stale version in one of them.
 */
create or replace function public.notify_profile_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, href, metadata)
  values (
    new.user_id,
    'profile_' || new.status,
    null,
    '/nanny/profile',
    '{}'::jsonb
  );

  return new;
end;
$$;

drop trigger if exists nanny_profiles_notify_review on public.nanny_profiles;
create trigger nanny_profiles_notify_review
  after update of status on public.nanny_profiles
  for each row execute function public.notify_profile_reviewed();

-- ---------------------------------------------------------------------------
-- Reading them
-- ---------------------------------------------------------------------------

-- `my_notifications()` and `mark_notifications_read()` were written with the
-- message notification and are what the bell calls. Nothing to add here, and
-- deliberately no overload of either: `mark_notifications_read()` and
-- `mark_notifications_read(uuid[] default null)` can both be called with no
-- arguments, and PostgreSQL refuses the call as ambiguous rather than picking
-- one. An overload with a defaulted parameter is not a compatible addition.

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- The bell subscribes to inserts on this table, which does nothing at all
-- unless the table is in the publication realtime reads from. Row level
-- security still applies to the stream, so a subscriber is sent their own rows
-- and no others.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'notifications')
  then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
