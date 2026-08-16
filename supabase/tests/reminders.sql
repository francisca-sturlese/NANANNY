-- Who gets reminded, and who is left alone.
--
-- The reminder is the one feature here that reaches out to somebody who did not
-- ask for anything. Getting it wrong is not a broken page, it is mail arriving
-- at a person who has already stopped using the product, which is how a domain
-- earns a spam reputation it does not lose again.
--
-- So the interesting assertions are all about restraint: the audience rule, the
-- gap between two reminders to the same person, and the cases that must never
-- produce one at all.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on

\set paying_uid   '''6b111111-1111-4111-8111-11111111111b'''
\set free_uid     '''6b222222-2222-4222-8222-22222222222b'''
\set nanny_uid    '''6b333333-3333-4333-8333-33333333333b'''
\set quiet_uid    '''6b444444-4444-4444-8444-44444444444b'''
\set nanny2_uid   '''6b555555-5555-4555-8555-55555555555b'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  (:paying_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rem-paying@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Paula"}'::jsonb, now(), now()),
  (:free_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rem-free@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Fay"}'::jsonb, now(), now()),
  (:nanny_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rem-nanny@test.local', '', now(), '{}'::jsonb,
   '{"role":"nanny","first_name":"Nora"}'::jsonb, now(), now()),
  (:quiet_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rem-quiet@test.local', '', now(), '{}'::jsonb,
   '{"role":"family","first_name":"Quinn"}'::jsonb, now(), now()),
  (:nanny2_uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rem-nanny2@test.local', '', now(), '{}'::jsonb,
   '{"role":"nanny","first_name":"Mary"}'::jsonb, now(), now());

insert into public.family_profiles (user_id, emirate, area, children_count, display_name, created_at)
values
  (:paying_uid::uuid, 'Dubai', 'Marina', 1, 'The Paying family', now() - interval '10 days'),
  (:free_uid::uuid,   'Dubai', 'JLT',    1, 'The Free family',   now() - interval '10 days'),
  (:quiet_uid::uuid,  'Dubai', 'Barsha', 1, 'The Quiet family',  now() - interval '10 days');

insert into public.nanny_profiles (user_id, status, emirate, years_experience, first_name, created_at)
values
  (:nanny_uid::uuid,  'approved', 'Dubai', 4, 'Nora', now() - interval '10 days'),
  (:nanny2_uid::uuid, 'approved', 'Dubai', 3, 'Mary', now() - interval '10 days');

-- Only one of the two families pays.
insert into public.subscriptions (family_id, plan, status, price_aed, currency,
                                  current_period_start, current_period_end,
                                  cancel_at_period_end)
values (
  (select id from public.family_profiles where user_id = :paying_uid::uuid),
  'monthly', 'active', 89, 'AED',
  now() - interval '5 days', now() + interval '25 days', false);

-- Two nannies, one written to by the family that pays and one by the family
-- that does not. Neither has opened her message. The pair is the whole point:
-- the two differ only in who is on the other end of the conversation.
insert into public.conversations (family_id, nanny_id, created_at)
values
  ((select id from public.family_profiles where user_id = :paying_uid::uuid),
   (select id from public.nanny_profiles where user_id = :nanny_uid::uuid),
   now() - interval '2 days'),
  ((select id from public.family_profiles where user_id = :free_uid::uuid),
   (select id from public.nanny_profiles where user_id = :nanny2_uid::uuid),
   now() - interval '2 days');

insert into public.messages (conversation_id, sender_id, body, created_at)
select c.id, f.user_id, 'Are you available?', now() - interval '2 days'
  from public.conversations c
  join public.family_profiles f on f.id = c.family_id
 where f.user_id in (:paying_uid::uuid, :free_uid::uuid);

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. Off means off
-- ---------------------------------------------------------------------------
do $$
declare due jsonb;
begin
  update public.reminder_config set audience = 'off';
  due := public.due_reminders(100);

  if jsonb_array_length(due) = 0 then
    raise notice 'PASS 1  nothing is due while reminders are off';
  else
    raise notice 'FAIL 1  % due with the switch off', jsonb_array_length(due);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. `paying` is about the conversation, not about the recipient
-- ---------------------------------------------------------------------------
-- This is the rule that is easiest to get wrong in the reading, so it is
-- pinned here in both directions.
--
-- A nanny never pays and never will. If `paying` meant "only write to people
-- who pay", the unread message reminder could never reach the side of the
-- marketplace that most needs it, and a family that paid to contact somebody
-- would be the one losing by it.
--
-- So the test is on the family in the conversation: a nanny sitting on an
-- unread message from a subscriber is written to, and a nanny sitting on an
-- identical message from a family that does not pay is not. Both nannies here
-- are in exactly the same state. The only difference is who wrote to them.
do $$
declare due jsonb; paid_side int; free_side int;
begin
  update public.reminder_config set audience = 'paying';
  due := public.due_reminders(100);

  select count(*) into paid_side from jsonb_array_elements(due) d
   where d ->> 'email' = 'rem-nanny@test.local';
  select count(*) into free_side from jsonb_array_elements(due) d
   where d ->> 'email' = 'rem-nanny2@test.local';

  if paid_side = 1 and free_side = 0 then
    raise notice 'PASS 2  the nanny a subscriber wrote to is reminded, the other one is not';
  else
    raise notice 'FAIL 2  paid side=% free side=%  %', paid_side, free_side, due;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. And it does reach the family that pays
-- ---------------------------------------------------------------------------
do $$
declare due jsonb; paying_due int; free_due int;
begin
  -- Both families have gone quiet: a profile older than the threshold, no job
  -- posted. Only one of them pays.
  update public.reminder_config set audience = 'paying', nudge_after_hours = 48;
  -- Cleared so the two families count as having done nothing at all, which is
  -- what the nudge is about. The unread case above is a different reminder.
  delete from public.conversations
   where family_id in (select id from public.family_profiles
                        where user_id in ('6b111111-1111-4111-8111-11111111111b',
                                          '6b222222-2222-4222-8222-22222222222b'));

  due := public.due_reminders(100);

  select count(*) into paying_due from jsonb_array_elements(due) d
   where d ->> 'email' = 'rem-paying@test.local';
  select count(*) into free_due from jsonb_array_elements(due) d
   where d ->> 'email' = 'rem-free@test.local';

  if paying_due = 1 and free_due = 0 then
    raise notice 'PASS 3  the paying family is nudged and the free one is not';
  else
    raise notice 'FAIL 3  paying=% free=%', paying_due, free_due;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. `everyone` is what reaches the side that cannot pay
-- ---------------------------------------------------------------------------
do $$
declare due jsonb; free_due int;
begin
  update public.reminder_config set audience = 'everyone';
  due := public.due_reminders(100);

  select count(*) into free_due from jsonb_array_elements(due) d
   where d ->> 'email' = 'rem-free@test.local';

  if free_due = 1 then
    raise notice 'PASS 4  everyone reaches the family that does not pay';
  else
    raise notice 'FAIL 4  the free family was still not due: %', due;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. A family that did post is left alone
-- ---------------------------------------------------------------------------
-- The nudge exists to say "you signed up and stopped". Somebody who posted a
-- job did the thing, and being told to do it again is the reminder that gets a
-- product marked as spam.
do $$
declare due jsonb; quiet_due int;
begin
  insert into public.jobs (family_id, title, emirate, area, status)
  values ((select id from public.family_profiles where user_id = '6b444444-4444-4444-8444-44444444444b'),
          'Weekday help in Barsha', 'Dubai', 'Barsha', 'active');

  due := public.due_reminders(100);

  select count(*) into quiet_due from jsonb_array_elements(due) d
   where d ->> 'email' = 'rem-quiet@test.local';

  if quiet_due = 0 then
    raise notice 'PASS 5  a family that posted a job is not nudged to post one';
  else
    raise notice 'FAIL 5  the family with a job was still due';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Claiming is once, whoever asks second
-- ---------------------------------------------------------------------------
do $$
declare first_claim uuid; second_claim uuid; key text;
begin
  select d ->> 'dedupe_key' into key
    from jsonb_array_elements(public.due_reminders(100)) d
   where d ->> 'email' = 'rem-free@test.local';

  first_claim := public.claim_reminder(
    '6b222222-2222-4222-8222-22222222222b', 'rem-free@test.local', 'nudge_family', key);
  second_claim := public.claim_reminder(
    '6b222222-2222-4222-8222-22222222222b', 'rem-free@test.local', 'nudge_family', key);

  if first_claim is not null and second_claim is null then
    raise notice 'PASS 6  two schedulers firing at once send one email';
  else
    raise notice 'FAIL 6  first=% second=%', first_claim, second_claim;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. And once claimed, they drop out of the list
-- ---------------------------------------------------------------------------
-- The gap between two reminders is the whole difference between a reminder and
-- a nuisance. It is enforced by the same unique index the message notification
-- uses, so somebody who stays away for a month gets one a week, not one an hour.
do $$
declare free_due int;
begin
  select count(*) into free_due
    from jsonb_array_elements(public.due_reminders(100)) d
   where d ->> 'email' = 'rem-free@test.local';

  if free_due = 0 then
    raise notice 'PASS 7  somebody just written to is not due again';
  else
    raise notice 'FAIL 7  the same person came back around immediately';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. A suspended account is never written to
-- ---------------------------------------------------------------------------
do $$
declare due jsonb; suspended_due int;
begin
  update public.users set status = 'suspended'
   where id = '6b111111-1111-4111-8111-11111111111b';

  due := public.due_reminders(100);

  select count(*) into suspended_due from jsonb_array_elements(due) d
   where d ->> 'email' = 'rem-paying@test.local';

  if suspended_due = 0 then
    raise notice 'PASS 8  a suspended account is not reminded to come back';
  else
    raise notice 'FAIL 8  a suspended account was due';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Nobody but the backend can read the list or claim from it
-- ---------------------------------------------------------------------------
-- The list is every quiet person's name and email address in one call.
do $$
declare reachable int;
begin
  select count(*) into reachable
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('due_reminders', 'claim_reminder')
     and has_function_privilege('authenticated', p.oid, 'execute');

  if reachable = 0 then
    raise notice 'PASS 9  the list of quiet people is not reachable from a session';
  else
    raise notice 'FAIL 9  % of them are callable by a signed in user', reachable;
  end if;
end $$;

rollback;
