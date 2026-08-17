-- Telling somebody a message is waiting, on the day it arrives.
--
-- The immediate message email was switched off deliberately: one email per
-- message, even capped at one per fifteen minutes, is more than anybody wants
-- and becomes a filter rule within a week. What replaced it was a reminder
-- after a long silence, which is the right thing for somebody who has drifted
-- away and the wrong thing for somebody waiting on an answer.
--
-- Because the case that matters is not a stranger writing out of the blue.
-- Only a family can open a conversation, so every message is either a family
-- reaching a nanny who is looking for work, or a nanny answering a family that
-- asked her a question. Neither of those is spam, and both are the moment the
-- product either works or does not.
--
-- It happened here first: a nanny replied to a family at 13:24 and the family
-- learned nothing about it, because nothing was sent and the bell only rings
-- for somebody already looking at it. Twenty four hours is the wrong wait for
-- the answer to a question you asked yourself.
--
-- So the email comes back, at one a day per person rather than one per message,
-- which is the cadence the application email already uses and the one nobody
-- complains about.

/**
 * Decides whether to email somebody about messages waiting, and records it.
 *
 * Two changes from the version this replaces.
 *
 * The bucket is a Dubai day rather than fifteen minutes, and it is keyed on the
 * person rather than the conversation, so somebody in three threads gets one
 * email and not three.
 *
 * And it counts rather than names. The previous version carried the sender's
 * first name, which is true of the message that triggered it and stops being
 * true as soon as a second person writes, because by then the email has already
 * been sent for the day. The same trap the application email was built to
 * avoid.
 *
 * What it still refuses to carry is the message. The email says something is
 * waiting and links to it. Including the text would let any stranger put
 * arbitrary words into somebody's inbox inside an email that genuinely came
 * from us and passes every check a mail client makes.
 */
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
  if exists (select 1 from public.email_optouts o where o.user_id = v_recipient) then
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

revoke execute on function public.notify_new_message(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notify_new_message(uuid, uuid) to service_role;

comment on function public.notify_new_message(uuid, uuid) is
  'One email per person per Dubai day, however many messages arrive, counting rather than naming so the wording stays true for the rest of the day. Never carries the message itself.';
