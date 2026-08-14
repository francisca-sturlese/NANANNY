-- Telling somebody they have a message.
--
-- Two tables already existed for this and neither had ever been written to:
-- `notifications` for the in app record, and `email_events` with a unique
-- `idempotency_key` whose own comment says it guards against double sends.
-- This wires them up rather than inventing a third thing.
--
-- The cooldown is that unique index, not a timer. Nothing is shared between
-- requests on the deployment target, so an in-memory "last sent at" would reset
-- constantly and limit nothing. The key carries a fifteen minute bucket, so a
-- burst of messages produces the same key, the second insert does nothing, and
-- no second email goes out. The same property makes a retried request safe.

alter table public.notifications
  alter column title drop not null;

comment on column public.notifications.title is
  'Optional. Text is built when the notification is read, not when it is written, so it can be shown in the reader''s language and so nothing another user typed is ever copied into a row.';

-- ---------------------------------------------------------------------------

/**
 * Decides whether to email somebody about a new message, and records it.
 *
 * Returns what the caller needs to send, or a reason not to. The decision and
 * the record of having decided are one atomic insert, so they cannot disagree
 * with each other under a retry.
 *
 * What it deliberately does not return is the message. The email says a message
 * arrived and links to it, and never carries text one user typed into another
 * user's inbox. That is the whole phishing surface of a marketplace: a stranger
 * who can put arbitrary text in front of you, in an email that genuinely came
 * from us.
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
  v_sender_name text;
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

  -- Blocking is how one person stops hearing from another. An email would
  -- walk straight around it.
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

  -- The sender's own first name, which is theirs and not free text: a nanny's
  -- comes from her profile, a family's is its display name.
  select coalesce(
           (select n.first_name from public.nanny_profiles n where n.user_id = p_sender_id),
           (select f.display_name from public.family_profiles f where f.user_id = p_sender_id),
           'Someone')
    into v_sender_name;

  -- The in app record. Always written, even when no email goes out, because the
  -- bell and the email answer different questions.
  insert into public.notifications (user_id, kind, title, href, metadata)
  values (
    v_recipient,
    'new_message',
    null,
    '/messages/' || p_conversation_id,
    jsonb_build_object('conversation_id', p_conversation_id, 'from', v_sender_name)
  );

  -- Fifteen minute buckets. A burst is one email; a reply an hour later earns
  -- a new one.
  v_bucket := to_char(
    date_trunc('hour', now())
      + (floor(extract(minute from now()) / 15) * interval '15 minutes'),
    'YYYYMMDDHH24MI');
  v_key := format('new_message:%s:%s:%s', p_conversation_id, v_recipient, v_bucket);

  insert into public.email_events (
    user_id, email_type, recipient, subject, metadata, status, idempotency_key
  )
  values (
    v_recipient,
    'new_message',
    v_recipient_email,
    'You have a new message on NaNanny',
    jsonb_build_object('conversation_id', p_conversation_id, 'from', v_sender_name),
    'queued',
    v_key
  )
  -- The index is partial (`where idempotency_key is not null`), and a partial
  -- unique index only matches an ON CONFLICT that repeats its predicate.
  -- Without the WHERE this raises "no unique or exclusion constraint matching".
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('send', false, 'reason', 'already emailed recently');
  end if;

  return jsonb_build_object(
    'send', true,
    'event_id', v_event_id,
    'to', v_recipient_email,
    'name', v_recipient_name,
    'from_name', v_sender_name,
    'conversation_id', p_conversation_id
  );
end;
$$;

revoke execute on function public.notify_new_message(uuid, uuid) from anon, authenticated;

/**
 * Records what happened to a send.
 *
 * A failure stays visible rather than disappearing: `status` moves to failed
 * and the error is kept, so "she never got the email" is a question with an
 * answer.
 */
create or replace function public.record_email_result(
  p_event_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.email_events
     set status = p_status,
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         error = p_error,
         sent_at = case when p_status = 'sent' then now() else sent_at end
   where id = p_event_id;
$$;

revoke execute on function public.record_email_result(uuid, text, text, text)
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reading them
-- ---------------------------------------------------------------------------

-- Row level security, the owner read and the owner update policy already exist
-- from 20260813120800_rls.sql. Adding my own alongside them would leave four
-- policies saying two things, which is how a reader concludes the rule is more
-- complicated than it is.
--
-- Only the admin one is new, and only for reading: moderation sometimes needs
-- to see what somebody was told.
create policy notifications_admin on public.notifications
  for select to authenticated
  using (public.is_admin());

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

/**
 * The bell and its panel, from one query.
 *
 * One call rather than a count and a list, because two queries drift: the badge
 * says three and the panel shows two, and nobody can reproduce it.
 */
create or replace function public.my_notifications(p_limit int default 20)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'unread', (
      select count(*) from public.notifications
       where user_id = auth.uid() and read_at is null
    ),
    'items', (
      select coalesce(jsonb_agg(row_to_json(n) order by n.created_at desc), '[]'::jsonb)
        from (
          select id, kind, href, metadata, read_at, created_at
            from public.notifications
           where user_id = auth.uid()
           order by created_at desc
           limit greatest(p_limit, 1)
        ) n
    )
  );
$$;

grant execute on function public.my_notifications(int) to authenticated;

/** Marks everything read. Used when the panel is opened. */
create or replace function public.mark_notifications_read()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_notifications_read() to authenticated;
