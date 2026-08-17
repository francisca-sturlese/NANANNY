-- A profile that is complete enough publishes itself.
--
-- Federico's rule: half a profile is worth showing, because a family reading it
-- judges better than a threshold does, and a marketplace with nothing in it
-- helps nobody. It ran as a poll on an operator's laptop until today, which
-- stopped when the lid closed and left a nanny unpublished for an afternoon
-- with nobody able to tell.
--
-- What has to hold is narrow and worth stating: it publishes, it publishes once,
-- it only ever touches a draft, and it can be switched off without a deploy.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on

\set uid '''6e222222-2222-4222-8222-22222222222e'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values (:uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'publish-me@real.example', '', now(), '{}'::jsonb,
        '{"role":"nanny","first_name":"Ready"}'::jsonb, now(), now());

insert into public.nanny_profiles (user_id, status, first_name)
values (:uid::uuid, 'draft', 'Ready');

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. An empty draft is nobody's business yet
-- ---------------------------------------------------------------------------
do $$
declare st text; pct int;
begin
  select status, profile_completion into st, pct from public.nanny_profiles
   where user_id = '6e222222-2222-4222-8222-22222222222e';

  if st = 'draft' then
    raise notice 'PASS 1  a nearly empty draft stays hidden, at %%%', pct;
  else
    raise notice 'FAIL 1  % at %%%', st, pct;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Crossing the line publishes it, there and then
-- ---------------------------------------------------------------------------
-- The poll this replaces ran hourly. For somebody who has just finished filling
-- in her profile, that is the difference between being found today and tomorrow.
do $$
declare v_id uuid; st text; pct int;
begin
  select id into v_id from public.nanny_profiles
   where user_id = '6e222222-2222-4222-8222-22222222222e';

  update public.nanny_profiles
     set emirate = 'Dubai', years_experience = 3, languages = array['English'],
         english_level = 'fluent', photo_url = 'x/y.jpg', nationality = 'Kenyan',
         date_of_birth = '1995-01-01', description = 'I love working with children.'
   where id = v_id;

  select status, profile_completion into st, pct from public.nanny_profiles where id = v_id;

  if st = 'submitted' then
    raise notice 'PASS 2  it published itself on crossing the line, at %%%', pct;
  else
    raise notice 'FAIL 2  still % at %%%', st, pct;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. And said why, in the same shape as every other status change
-- ---------------------------------------------------------------------------
do $$
declare audited int;
begin
  select count(*) into audited from public.audit_logs a
   where a.action = 'nanny_status_changed'
     and a.after_state ->> 'by' = 'automatic'
     and a.after_state ->> 'reason' like '%publishing threshold%';

  if audited = 1 then
    raise notice 'PASS 3  one audit row, with the number that caused it';
  else
    raise notice 'FAIL 3  % rows', audited;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A decision a person made is never undone
-- ---------------------------------------------------------------------------
-- Approved and rejected are human judgements. Nothing automatic gets to reverse
-- one because somebody edited a sentence afterwards.
do $$
declare v_id uuid; st text;
begin
  select id into v_id from public.nanny_profiles
   where user_id = '6e222222-2222-4222-8222-22222222222e';

  update public.nanny_profiles set status = 'rejected' where id = v_id;
  update public.nanny_profiles set description = 'edited after the rejection' where id = v_id;

  select status into st from public.nanny_profiles where id = v_id;

  if st = 'rejected' then
    raise notice 'PASS 4  an edit after a rejection does not republish her';
  else
    raise notice 'FAIL 4  became %', st;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. It can be switched off without a deploy
-- ---------------------------------------------------------------------------
-- The alternative to a switch is a release, and if this ever publishes somebody
-- it should not, the fix has to be available to whoever notices rather than to
-- whoever can deploy.
do $$
declare v_id uuid; st text;
begin
  update public.publishing_config set enabled = false where id;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('6e333333-3333-4333-8333-33333333333e', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'switched-off@real.example', '', now(),
          '{}'::jsonb, '{"role":"nanny","first_name":"Off"}'::jsonb, now(), now());

  insert into public.nanny_profiles (user_id, status, first_name)
  values ('6e333333-3333-4333-8333-33333333333e', 'draft', 'Off')
  returning id into v_id;

  update public.nanny_profiles
     set emirate = 'Dubai', years_experience = 3, languages = array['English'],
         english_level = 'fluent', photo_url = 'x/y.jpg', nationality = 'Kenyan',
         date_of_birth = '1995-01-01', description = 'Also complete enough.'
   where id = v_id;

  select status into st from public.nanny_profiles where id = v_id;

  if st = 'draft' then
    raise notice 'PASS 5  with the switch off, a complete profile stays a draft';
  else
    raise notice 'FAIL 5  published anyway, as %', st;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Only an admin moves the threshold
-- ---------------------------------------------------------------------------
do $$
declare reachable boolean;
begin
  select has_function_privilege('anon',
    'public.admin_update_publishing(boolean, int)', 'execute') into reachable;

  if not reachable then
    raise notice 'PASS 6  a visitor cannot change when profiles go public';
  else
    raise notice 'FAIL 6  reachable without an account';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. A person acting on purpose beats the rule
-- ---------------------------------------------------------------------------
-- Putting a published profile back to draft stopped working the day the trigger
-- landed: it saw a draft above the threshold and republished it inside the same
-- statement. The automation is for people nobody is attending to, and somebody
-- deliberately attending to a profile knows more than a threshold does.
do $$
declare v_id uuid; st text; result jsonb;
begin
  update public.publishing_config set enabled = true where id;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('6e444444-4444-4444-8444-44444444444e', '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'hide-me@real.example', '', now(),
          '{}'::jsonb, '{"role":"nanny","first_name":"Hide"}'::jsonb, now(), now());

  insert into public.nanny_profiles (user_id, status, first_name, emirate,
                                     years_experience, languages, english_level,
                                     photo_url, nationality, date_of_birth, description)
  values ('6e444444-4444-4444-8444-44444444444e', 'draft', 'Hide', 'Dubai', 3,
          array['English'], 'fluent', 'x/y.jpg', 'Kenyan', '1995-01-01',
          'Complete enough to be published.')
  returning id into v_id;

  result := public.ops_set_nanny_status(v_id, 'draft', 'hidden at her request while she travels');
  select status into st from public.nanny_profiles where id = v_id;

  if st = 'draft' and (result ->> 'to') = 'draft' then
    raise notice 'PASS 7  an operator can take a published profile down again';
  else
    raise notice 'FAIL 7  status % result %', st, result;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. And that hiding lasts until she next edits, which is a limitation
-- ---------------------------------------------------------------------------
-- Pinned rather than fixed, so nobody discovers it by relying on it. `draft`
-- means "not finished, and she has not asked to be shown", and it is being
-- borrowed here to mean "hidden on purpose". The borrowing works for an
-- afternoon and stops working the moment she edits anything. If hiding somebody
-- indefinitely is ever a real need, it wants a state of its own rather than a
-- cleverer trigger.
do $$
declare v_id uuid; st text;
begin
  select id into v_id from public.nanny_profiles
   where user_id = '6e444444-4444-4444-8444-44444444444e';

  update public.nanny_profiles set description = 'she comes back and edits it'
   where id = v_id;

  select status into st from public.nanny_profiles where id = v_id;

  if st = 'submitted' then
    raise notice 'PASS 8  her next edit republishes her, which is the known limit of this';
  else
    raise notice 'FAIL 8  stayed %, so the limitation has changed and the note is stale', st;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. A table created from now on is closed to a stranger
-- ---------------------------------------------------------------------------
-- `publishing_config` was readable by anon on the day it was created, because
-- PostgreSQL grants that by default and nobody had said otherwise. A one-time
-- revoke fixes one table; only changing the default fixes the category.
do $$
declare cols int;
begin
  create table public.a_table_created_now (id int primary key, secret text);

  select count(*) into cols from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'a_table_created_now'
     and grantee = 'anon' and privilege_type = 'SELECT';

  if not has_table_privilege('anon', 'public.a_table_created_now', 'SELECT') and cols = 0 then
    raise notice 'PASS 9  a table created now is born closed to a stranger';
  else
    raise notice 'FAIL 9  readable, with % column grants', cols;
  end if;
end $$;

rollback;
