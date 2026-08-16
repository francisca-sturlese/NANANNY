-- An opt-out that covers two emails out of three is not an opt-out.
--
-- `email_optouts` landed with the reminders and silences them. The application
-- email was written the same morning in a different lane and does not consult
-- it, so a family that pressed unsubscribe would stop hearing about being quiet
-- and carry on hearing about applications. That is worse than not having the
-- link: somebody who has said no and is written to anyway does not report it as
-- a bug, they press the button their mail client offers, and that button is
-- spam.
--
-- So the check moves into the one place that cannot be forgotten by the next
-- email somebody adds: the decision function itself. Nothing else about the
-- send changes.

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

  -- Checked before anything else is worked out. A refusal is a refusal, and the
  -- cheapest place to honour it is before the query that builds the reason to
  -- write to somebody.
  if exists (select 1 from public.email_optouts o where o.user_id = v_family_user) then
    return jsonb_build_object('send', false, 'reason', 'unsubscribed');
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
    -- The sender needs this to build the unsubscribe link, and it is the
    -- caller's own id rather than anything it could have chosen.
    'user_id', v_family_user,
    'waiting', v_waiting,
    'jobs', v_jobs
  );
end;
$$;

comment on function public.notify_application_email(uuid) is
  'One email per family per Dubai day, however many applications arrive, and none at all to somebody who has unsubscribed. The cap is the unique index on idempotency_key, not a timer: nothing is shared between requests on the deployment target.';

revoke execute on function public.notify_application_email(uuid) from public, anon, authenticated;
grant execute on function public.notify_application_email(uuid) to service_role;
