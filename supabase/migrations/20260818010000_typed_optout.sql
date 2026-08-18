-- The opt-out learns what it is opting out of.
--
-- One click on "unsubscribe" used to write one row that silenced every
-- non-account email, including the one telling a family a nanny applied --
-- the link honestly promised as much, which was the stopgap. Now the row
-- carries a scope: 'reminders' stops the nudges, 'applications' stops the
-- activity mail (applications and messages), 'all' stops everything, and
-- every old row already means 'all' by default, so nobody's past choice is
-- reinterpreted.

alter table public.email_optouts
  add column scope text not null default 'all'
  check (scope in ('all', 'reminders', 'applications'));

-- One row per (person, scope): pressing the same link twice stays idempotent,
-- and 'reminders' plus 'applications' can coexist without meaning 'all'.
alter table public.email_optouts drop constraint email_optouts_pkey;
alter table public.email_optouts add primary key (user_id, scope);

create or replace function public.due_reminders(p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.reminder_config;
  v_bucket text;
  result jsonb;
begin
  select * into cfg from public.reminder_config where id;

  if cfg.audience = 'off' then
    return '[]'::jsonb;
  end if;

  -- One bucket per gap window, so the key repeats until the window rolls over.
  v_bucket := to_char(
    to_timestamp(floor(extract(epoch from now()) / (cfg.min_gap_hours * 3600))
                 * cfg.min_gap_hours * 3600),
    'YYYYMMDDHH24');

  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) into result
    from (
      -- Unread messages waiting.
      select u.id as user_id,
             u.email,
             coalesce(u.first_name, 'there') as name,
             'unread'::text as reason,
             count(distinct m.conversation_id)::int as conversations,
             count(*)::int as messages,
             format('reminder:unread:%s:%s', u.id, v_bucket) as dedupe_key
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
        join public.family_profiles f on f.id = c.family_id
        join public.nanny_profiles n on n.id = c.nanny_id
        join public.users u
          on u.id = case when m.sender_id = f.user_id then n.user_id else f.user_id end
       where m.read_at is null
         and m.created_at < now() - make_interval(hours => cfg.unread_after_hours)
         and c.blocked_at is null
         and u.status = 'active'
         and (cfg.audience = 'everyone' or public.has_active_subscription(f.id))
       group by u.id, u.email, u.first_name

      union all

      -- Applications still waiting on a family's posts, said again after the
      -- first day. The application email fires when a nanny applies and never
      -- again if the family goes quiet; a nanny who waits usually takes
      -- another job, so the silence costs the exact thing the marketplace
      -- sells. The 24-hour guard keeps the founder's rule, never more than
      -- one email a day, true across systems and not only inside each one.
      select u.id as user_id,
             u.email,
             coalesce(u.first_name, 'there') as name,
             'waiting_apps'::text as reason,
             count(distinct j.id)::int as conversations,
             count(*)::int as messages,
             format('reminder:apps:%s:%s', u.id, v_bucket) as dedupe_key
        from public.job_applications a
        join public.jobs j on j.id = a.job_id
        join public.family_profiles f on f.id = j.family_id
        join public.users u on u.id = f.user_id
       where a.status = 'applied'
         and a.created_at < now() - make_interval(hours => cfg.nudge_after_hours)
         and j.status = 'active'
         and u.status = 'active'
         and (cfg.audience = 'everyone' or public.has_active_subscription(f.id))
         and not exists (
           select 1 from public.email_events e2
            where e2.user_id = u.id
              and e2.created_at > now() - interval '24 hours'
              and e2.status = 'sent'
         )
       group by u.id, u.email, u.first_name

      union all

      -- A family that made a profile and never posted or messaged anybody.
      select u.id, u.email, coalesce(u.first_name, 'there'), 'nudge_family', 0, 0,
             format('reminder:nudge:%s:%s', u.id, v_bucket)
        from public.family_profiles f
        join public.users u on u.id = f.user_id
       where f.created_at < now() - make_interval(hours => cfg.nudge_after_hours)
         and u.status = 'active'
         and (cfg.audience = 'everyone' or public.has_active_subscription(f.id))
         and not exists (select 1 from public.jobs j where j.family_id = f.id)
         and not exists (select 1 from public.conversations c where c.family_id = f.id)

      union all

      -- A family that signed up and never opened the onboarding at all. No
      -- profile row exists, which is precisely why the arm above cannot see
      -- them, and why this arm requires its absence: one family, one arm.
      -- Never eligible while the audience is `paying`: no profile, no
      -- subscription.
      select u.id, u.email, coalesce(u.first_name, 'there'), 'nudge_family', 0, 0,
             format('reminder:nudge:%s:%s', u.id, v_bucket)
        from public.users u
       where cfg.audience = 'everyone'
         and u.role = 'family'
         and u.status = 'active'
         and u.created_at < now() - make_interval(hours => cfg.nudge_after_hours)
         and not exists (select 1 from public.family_profiles f where f.user_id = u.id)

      union all

      -- A nanny whose profile cannot be submitted yet, whatever its status.
      -- The condition is NOT "not approved": it is "cannot yet submit".
      -- Excluding approved assumed the invariant "approved implies complete",
      -- which broke the day incomplete profiles were published and approved
      -- by hand to fill the shop window -- status stopped indicating
      -- completeness, and the four most incomplete visible profiles fell out
      -- of the one email that tells them what is missing. If you are tempted
      -- to filter on status again, this is why it was wrong the first time.
      -- Only `rejected` stays out: a rejected nanny is owed an explanation,
      -- not an invitation to finish.
      -- (nanny_profile_completion runs once per candidate row per tick;
      -- fine at tens of nannies, worth a materialised flag at thousands.)
      -- Never eligible while the audience is `paying`, because a nanny does
      -- not pay.
      select u.id, u.email, coalesce(u.first_name, 'there'), 'nudge_nanny', 0, 0,
             format('reminder:nudge:%s:%s', u.id, v_bucket)
        from public.users u
        left join public.nanny_profiles n on n.user_id = u.id
       where cfg.audience = 'everyone'
         and u.role = 'nanny'
         and u.status = 'active'
         and u.created_at < now() - make_interval(hours => cfg.nudge_after_hours)
         and (n.id is null or n.status <> 'rejected')
         and (n.id is null
              or not (public.nanny_profile_completion(n.id) ->> 'can_submit')::boolean)
         and (n.id is null or n.created_at < now() - make_interval(hours => cfg.nudge_after_hours))
    ) r
   where not exists (
     select 1 from public.email_events e
      where e.idempotency_key = r.dedupe_key
   )
     and not exists (
     select 1 from public.email_optouts o
      where o.user_id = r.user_id
        and o.scope in ('all', 'reminders')
   )
   limit greatest(p_limit, 1);

  return result;
end;
$$;

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
  if exists (select 1 from public.email_optouts o where o.user_id = v_family_user and o.scope in ('all', 'applications')) then
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

create or replace function public.notify_new_message(
  p_conversation_id uuid,
  p_sender_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv record;
  v_recipient uuid;
  v_recipient_email text;
  v_recipient_name text;
  v_waiting int;
  v_threads int;
  v_bucket text;
  v_key text;
  v_event_id uuid;
begin
  select c.id, c.family_id, c.nanny_id, c.blocked_at,
         f.user_id as family_user_id, n.user_id as nanny_user_id
    into v_conv
    from public.conversations c
    join public.family_profiles f on f.id = c.family_id
    join public.nanny_profiles n on n.id = c.nanny_id
   where c.id = p_conversation_id;

  if v_conv.id is null then
    return jsonb_build_object('send', false, 'reason', 'no such conversation');
  end if;

  -- Blocking is how one person stops hearing from another. An email would walk
  -- straight around it.
  if v_conv.blocked_at is not null then
    return jsonb_build_object('send', false, 'reason', 'conversation is blocked');
  end if;

  v_recipient := case
    when p_sender_id = v_conv.family_user_id then v_conv.nanny_user_id
    when p_sender_id = v_conv.nanny_user_id then v_conv.family_user_id
    else null
  end;

  if v_recipient is null then
    return jsonb_build_object('send', false, 'reason', 'sender is not a participant');
  end if;

  select u.email, coalesce(u.first_name, 'there')
    into v_recipient_email, v_recipient_name
    from public.users u
   where u.id = v_recipient and u.status = 'active';

  if v_recipient_email is null then
    return jsonb_build_object('send', false, 'reason', 'recipient is not active');
  end if;

  -- Somebody who has said no to our email says no to this too.
  if exists (select 1 from public.email_optouts o where o.user_id = v_recipient and o.scope in ('all', 'applications')) then
    return jsonb_build_object('send', false, 'reason', 'unsubscribed');
  end if;

  -- The in app record. Always written, even when no email goes out, because
  -- the bell and the email answer different questions.
  insert into public.notifications (user_id, kind, title, href, metadata)
  values (
    v_recipient,
    'new_message',
    null,
    '/messages/' || p_conversation_id,
    jsonb_build_object('conversation_id', p_conversation_id)
  );

  -- Everything still waiting on them, which is what the email is about rather
  -- than the one message that prompted it.
  select count(*), count(distinct m.conversation_id)
    into v_waiting, v_threads
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
   where m.read_at is null
     and m.sender_id <> v_recipient
     and c.blocked_at is null
     and (c.family_id in (select id from public.family_profiles where user_id = v_recipient)
          or c.nanny_id in (select id from public.nanny_profiles where user_id = v_recipient));

  -- A Dubai day, and keyed on the person: three conversations are one email.
  v_bucket := to_char(now() at time zone 'Asia/Dubai', 'YYYYMMDD');
  v_key := format('new_message:%s:%s', v_recipient, v_bucket);

  insert into public.email_events (
    user_id, email_type, recipient, subject, metadata, status, idempotency_key
  )
  values (
    v_recipient,
    'new_message',
    v_recipient_email,
    'You have a message waiting on NaNanny',
    jsonb_build_object('waiting', v_waiting, 'threads', v_threads),
    'queued',
    v_key
  )
  -- The index is partial, and a partial unique index only matches an ON
  -- CONFLICT that repeats its predicate.
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('send', false, 'reason', 'already emailed today');
  end if;

  return jsonb_build_object(
    'send', true,
    'event_id', v_event_id,
    'to', v_recipient_email,
    'name', v_recipient_name,
    'user_id', v_recipient,
    'waiting', greatest(v_waiting, 1),
    'threads', greatest(v_threads, 1)
  );
end;
$$;
