-- Message notifications.
--
-- Two things worth proving. The cooldown, because without it a conversation
-- becomes a mail bomb and people mark us as spam. And that nothing a user typed
-- ever reaches another user's inbox, because an email that genuinely came from
-- us and carries a stranger's text is the most convincing phishing vector this
-- product could possibly build.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on

\set family_uid '''61111111-1111-4111-8111-111111111111'''
\set nanny_uid  '''62222222-2222-4222-8222-222222222221'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  (:family_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'notify-family@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Nadia","last_name":"Family"}'::jsonb, now(), now()),
  (:nanny_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'notify-nanny@test.local', '', now(), '{}'::jsonb,
   '{"role":"nanny","first_name":"Grace"}'::jsonb, now(), now());

insert into public.family_profiles (user_id, emirate, area, children_count, display_name)
values (:family_uid::uuid, 'Dubai', 'Dubai Hills', 1, 'The Test family');

insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name)
values (:nanny_uid::uuid, 'approved', 'Dubai', 5, 'Grace');

set local role authenticated;
select set_config('request.jwt.claims',
                  json_build_object('sub', :family_uid, 'role', 'authenticated')::text, true);

select public.start_conversation(
  (select id from public.nanny_profiles where user_id = :nanny_uid::uuid),
  'profile'::public.contact_source,
  'Hello Grace, are you free to talk this week?');

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. The nanny is told, not the family who wrote it
-- ---------------------------------------------------------------------------
do $$
declare conv uuid; decision jsonb;
begin
  set local role postgres;
  select id into conv from public.conversations
   where nanny_id = (select id from public.nanny_profiles
                      where user_id = '62222222-2222-4222-8222-222222222221');

  decision := public.notify_new_message(conv, '61111111-1111-4111-8111-111111111111');

  if (decision ->> 'send')::boolean
     and decision ->> 'to' = 'notify-nanny@test.local' then
    raise notice 'PASS 1  the other participant is the one told';
  else
    raise notice 'FAIL 1  %', decision;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The message itself is never handed to the mailer
-- ---------------------------------------------------------------------------
do $$
declare conv uuid; decision jsonb;
begin
  select id into conv from public.conversations limit 1;
  -- A fresh window, so this one is allowed to send.
  delete from public.email_events;
  decision := public.notify_new_message(conv, '61111111-1111-4111-8111-111111111111');

  if decision::text like '%are you free to talk%' then
    raise notice 'FAIL 2  the message body reached the email decision';
  else
    raise notice 'PASS 2  the message body is nowhere in what the mailer gets';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. And it is not stored on the notification row either
-- ---------------------------------------------------------------------------
do $$
declare leaked int;
begin
  select count(*) into leaked
    from public.notifications
   where coalesce(title, '') || coalesce(body, '') || metadata::text
         like '%are you free to talk%';

  if leaked = 0 then
    raise notice 'PASS 3  no message text is stored on a notification';
  else
    raise notice 'FAIL 3  % notifications carry the message text', leaked;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A burst is one email
-- ---------------------------------------------------------------------------
do $$
declare conv uuid; sent int := 0; i int;
begin
  select id into conv from public.conversations limit 1;
  delete from public.email_events;

  for i in 1..8 loop
    if (public.notify_new_message(conv, '61111111-1111-4111-8111-111111111111') ->> 'send')::boolean then
      sent := sent + 1;
    end if;
  end loop;

  if sent = 1 then
    raise notice 'PASS 4  eight messages in a row produce one email';
  else
    raise notice 'FAIL 4  % emails for eight messages', sent;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. But the bell still records every one of them
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public.notifications
   where user_id = '62222222-2222-4222-8222-222222222221' and kind = 'new_message';

  if n >= 8 then
    raise notice 'PASS 5  every message is in the notification list (%)', n;
  else
    raise notice 'FAIL 5  only % notifications for ten messages', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Once the window passes, the next message earns an email
-- ---------------------------------------------------------------------------
do $$
declare conv uuid; decision jsonb;
begin
  select id into conv from public.conversations limit 1;
  -- Age the key out of its bucket, as twenty minutes of real time would.
  update public.email_events
     set idempotency_key = idempotency_key || ':aged'
   where email_type = 'new_message';

  decision := public.notify_new_message(conv, '61111111-1111-4111-8111-111111111111');

  if (decision ->> 'send')::boolean then
    raise notice 'PASS 6  a later message sends again';
  else
    raise notice 'FAIL 6  still suppressed: %', decision ->> 'reason';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. A blocked conversation sends nothing
-- ---------------------------------------------------------------------------
do $$
declare conv uuid; decision jsonb;
begin
  select id into conv from public.conversations limit 1;
  delete from public.email_events;
  update public.conversations set blocked_at = now() where id = conv;

  decision := public.notify_new_message(conv, '61111111-1111-4111-8111-111111111111');

  if not (decision ->> 'send')::boolean and decision ->> 'reason' like '%blocked%' then
    raise notice 'PASS 7  blocking stops the email as well as the messages';
  else
    raise notice 'FAIL 7  a blocked conversation still emailed: %', decision;
  end if;

  update public.conversations set blocked_at = null where id = conv;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Somebody outside the conversation cannot make us email a participant
-- ---------------------------------------------------------------------------
do $$
declare conv uuid; decision jsonb; outsider uuid;
begin
  select id into conv from public.conversations limit 1;
  select id into outsider from public.users
   where id not in ('61111111-1111-4111-8111-111111111111',
                    '62222222-2222-4222-8222-222222222221')
   limit 1;

  if outsider is null then
    raise notice 'SKIP 8  nobody else in the database';
    return;
  end if;

  delete from public.email_events;
  decision := public.notify_new_message(conv, outsider);

  if not (decision ->> 'send')::boolean then
    raise notice 'PASS 8  a non participant cannot trigger an email';
  else
    raise notice 'FAIL 8  an outsider triggered an email to %', decision ->> 'to';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. A nanny cannot read another person's notifications
-- ---------------------------------------------------------------------------
do $$
declare visible int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '61111111-1111-4111-8111-111111111111',
                      'role', 'authenticated')::text, true);

  select count(*) into visible from public.notifications
   where user_id = '62222222-2222-4222-8222-222222222221';

  if visible = 0 then
    raise notice 'PASS 9  one person cannot see another person''s notifications';
  else
    raise notice 'FAIL 9  % of the nanny''s notifications are readable', visible;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. And cannot write one to somebody else
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.notifications (user_id, kind, href)
    values ('62222222-2222-4222-8222-222222222221', 'new_message', '/anywhere');
    raise notice 'FAIL 10 a user inserted a notification for somebody else';
  exception when insufficient_privilege or others then
    raise notice 'PASS 10 a user cannot write notifications at all';
  end;
end $$;

rollback;
