-- Telling a family that somebody applied.
--
-- From the field, on the day this was written: eight real applications from
-- three nannies to four families, every one of them still sitting in `applied`,
-- and thirteen of the fourteen notifications never opened. The bell works. It
-- rings in an empty room, because a family that is not on the site does not
-- know there is anything to come back for.
--
-- This is the one event in the product that a family genuinely wants
-- interrupting them for. It is also the event the whole marketplace turns on:
-- an application nobody reads is a nanny who concludes this does not work.
--
-- One a day, and no more. Federico's requirement, and the right one: a family
-- that posts a job on a good week can receive several applications in an
-- afternoon, and an email each is how a useful notification becomes a filter
-- rule. The first application of the day sends; the rest are the bell only.
--
-- That cap is the same mechanism as everywhere else here: the unique index on
-- email_events.idempotency_key, with a daily bucket in the key. No timer, no
-- stored counter, nothing shared between requests. The second insert of the day
-- does nothing and the function says so.

/**
 * Decides whether to email a family about applications, and records it.
 *
 * Returns what the sender needs, or a reason not to. Deliberately returns an
 * aggregate rather than the application that triggered it: the email covers
 * everything that arrives for the rest of the day, so a subject naming one
 * nanny would be a lie by the second one. It never returns a cover note, for
 * the same reason the message email never carries a message.
 */
create or replace function public.notify_application_email(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_user uuid;
  v_family_id uuid;
  v_email text;
  v_name text;
  v_waiting int;
  v_jobs int;
  v_bucket text;
  v_key text;
  v_event_id uuid;
begin
  select f.id, f.user_id into v_family_id, v_family_user
    from public.jobs j
    join public.family_profiles f on f.id = j.family_id
   where j.id = p_job_id;

  if v_family_user is null then
    return jsonb_build_object('send', false, 'reason', 'no such job');
  end if;

  select u.email, coalesce(u.first_name, 'there')
    into v_email, v_name
    from public.users u
   where u.id = v_family_user and u.status = 'active';

  if v_email is null then
    return jsonb_build_object('send', false, 'reason', 'family is not active');
  end if;

  -- Everything still waiting on them, across every job they have open. This is
  -- what the email is about, not the single row that prompted it.
  select count(*), count(distinct a.job_id)
    into v_waiting, v_jobs
    from public.job_applications a
    join public.jobs j on j.id = a.job_id
   where j.family_id = v_family_id
     and a.status = 'applied';

  -- A Dubai day, not a UTC one. "One a day" means one per day where the person
  -- reading it lives, and a UTC bucket rolls over at four in the morning there,
  -- which would let two arrive in what anybody would call one day.
  v_bucket := to_char(now() at time zone 'Asia/Dubai', 'YYYYMMDD');
  v_key := format('application_email:%s:%s', v_family_user, v_bucket);

  insert into public.email_events (
    user_id, email_type, recipient, subject, metadata, status, idempotency_key
  )
  values (
    v_family_user,
    'application_received',
    v_email,
    'You have a new application on NaNanny',
    jsonb_build_object('waiting', v_waiting, 'jobs', v_jobs),
    'queued',
    v_key
  )
  -- Partial unique index, so the predicate has to be repeated here or this
  -- raises "no unique or exclusion constraint matching".
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('send', false, 'reason', 'already emailed today');
  end if;

  return jsonb_build_object(
    'send', true,
    'event_id', v_event_id,
    'to', v_email,
    'name', v_name,
    'waiting', v_waiting,
    'jobs', v_jobs
  );
end;
$$;

comment on function public.notify_application_email(uuid) is
  'One email per family per Dubai day, however many applications arrive. The cap is the unique index on idempotency_key, not a timer: nothing is shared between requests on the deployment target.';

-- Only the backend. It returns a family's email address, and it is the thing
-- that makes us send mail.
revoke execute on function public.notify_application_email(uuid) from public, anon, authenticated;
grant execute on function public.notify_application_email(uuid) to service_role;
