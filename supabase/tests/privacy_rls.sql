-- Privacy and authorization test suite.
--
-- Runs against the seeded database and asserts what each audience can and
-- cannot reach. Every check drives the real API roles (anon / authenticated)
-- with a real JWT claim, so it exercises the same path PostgREST does.
--
-- Run:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f this-file

begin;

\set ON_ERROR_STOP on

-- Two real seeded actors to test against each other.
create temp table t_actors as
select
  (select user_id from public.family_profiles order by user_id limit 1)      as family_a_user,
  (select id      from public.family_profiles order by user_id limit 1)      as family_a_id,
  (select user_id from public.family_profiles order by user_id offset 1 limit 1) as family_b_user,
  (select id      from public.family_profiles order by user_id offset 1 limit 1) as family_b_id,
  (select user_id from public.nanny_profiles where status = 'approved' order by user_id limit 1) as nanny_a_user,
  (select id      from public.nanny_profiles where status = 'approved' order by user_id limit 1) as nanny_a_id,
  (select user_id from public.nanny_profiles where status = 'approved' order by user_id offset 1 limit 1) as nanny_b_user,
  (select id      from public.nanny_profiles where status = 'approved' order by user_id offset 1 limit 1) as nanny_b_id,
  (select id      from public.nanny_profiles where status = 'draft' limit 1)    as nanny_draft_id;

-- The fixture table has to be readable while impersonating the API roles.
grant select on t_actors to anon, authenticated;

create or replace function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$$;

-- Helper: does a statement fail with insufficient_privilege?
create or replace function pg_temp.denied(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception
  when insufficient_privilege then return true;
end;
$$;

-- ===========================================================================
-- ANONYMOUS VISITORS
-- ===========================================================================

do $$
declare
  n int;
  a record;
begin
  select * into a from t_actors;

  set local role anon;
  perform set_config('request.jwt.claims', null, true);

  -- A finished profile is discoverable before anybody has reviewed it, and
  -- carries a "not reviewed yet" badge until somebody has. Approval decides the
  -- badge, not the visibility: see 20260814270000_visible_before_verified.sql.
  select count(*) into n from public.nanny_profiles;
  if n = 0 then
    raise exception 'FAIL A1: anonymous visitors cannot see any nanny at all';
  end if;

  -- What must stay hidden. A draft is unfinished and she has not asked for it
  -- to be shown; the other two are hidden for the obvious reason.
  if exists (
    select 1 from public.nanny_profiles
     where status in ('draft', 'rejected', 'suspended', 'expired')
  ) then
    raise exception 'FAIL A1: a draft, rejected or suspended profile is visible to anonymous visitors';
  end if;
  raise notice 'PASS A1 — anon sees % finished profiles, and no drafts or rejected ones', n;
end $$;

-- Every column a nanny is meant to edit must actually be editable. A column
-- level refusal fails the whole statement, so one missing grant silently
-- discards an entire form: she fills in step one, is sent to step two, and
-- step one is empty when she goes back.
select case when public.assert_editable_columns() = 'ok'
       then 'PASS — every column a user should edit is editable'
       else 'FAIL — ' || public.assert_editable_columns() end;

-- Column-level privacy. Each of these must be refused outright.
do $$
declare
  blocked text[] := '{}';
  leaked text[] := '{}';
  col text;
begin
  set local role anon;
  foreach col in array array['user_id', 'date_of_birth', 'area', 'latitude', 'longitude',
                             'video_url', 'previous_experience', 'preferred_locations',
                             'rejection_reason', 'reviewed_by', 'onboarding_step']
  loop
    if pg_temp.denied(format('select %I from public.nanny_profiles limit 1', col)) then
      blocked := blocked || col;
    else
      leaked := leaked || col;
    end if;
  end loop;

  if cardinality(leaked) > 0 then
    raise exception 'FAIL A2: anonymous visitors can read %', array_to_string(leaked, ', ');
  end if;
  raise notice 'PASS A2 — anon blocked from every private nanny column (%)',
    array_to_string(blocked, ', ');
end $$;

do $$
declare tbl text; leaked text[] := '{}';
begin
  set local role anon;
  -- None of these tables should be reachable at all without an account.
  foreach tbl in array array['users', 'family_profiles', 'family_children',
                             'family_requirements', 'nanny_documents',
                             'nanny_references', 'conversations', 'messages',
                             'family_nanny_contacts', 'subscriptions', 'payments',
                             'analytics_events', 'audit_logs', 'email_events']
  loop
    if not pg_temp.denied(format('select 1 from public.%I limit 1', tbl)) then
      leaked := leaked || tbl;
    end if;
  end loop;

  if cardinality(leaked) > 0 then
    raise exception 'FAIL A3: anonymous visitors can read %', array_to_string(leaked, ', ');
  end if;
  raise notice 'PASS A3 — anon has no access to any private table';
end $$;

do $$
declare n int;
begin
  set local role anon;
  -- Active job posts are public; drafts and paused ones are not.
  select count(*) into n from public.jobs;
  if exists (select 1 from public.jobs where status <> 'active') then
    raise exception 'FAIL A4: a non-active job is visible to anonymous visitors';
  end if;
  raise notice 'PASS A4 — anon sees % active jobs, no drafts or paused ones', n;
end $$;

-- ===========================================================================
-- ONE USER AGAINST ANOTHER
-- ===========================================================================

do $$
declare a record; n int;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.family_a_user);

  -- A family sees its own profile...
  select count(*) into n from public.family_profiles;
  if n <> 1 then
    raise exception 'FAIL B1: family A sees % family profiles, expected exactly its own', n;
  end if;
  if not exists (select 1 from public.family_profiles where id = a.family_a_id) then
    raise exception 'FAIL B1: family A cannot see its own profile';
  end if;
  raise notice 'PASS B1 — a family sees only its own profile, not other families''';
end $$;

do $$
declare a record; n int;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.family_a_user);

  -- The users table must not become a directory of everyone's contact details.
  select count(*) into n from public.users;
  if n <> 1 then
    raise exception 'FAIL B2: a family can read % rows of public.users (email and phone live there)', n;
  end if;
  raise notice 'PASS B2 — a family reads only its own users row, so no email or phone leaks';
end $$;

do $$
declare a record; n int;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.family_a_user);

  select count(*) into n from public.family_children;
  if n = 0 then
    raise exception 'FAIL B3: family A cannot see its own children';
  end if;
  if exists (select 1 from public.family_children where family_id <> a.family_a_id) then
    raise exception 'FAIL B3: family A can see another family''s children';
  end if;

  select count(*) into n from public.family_requirements;
  if exists (select 1 from public.family_requirements where family_id <> a.family_a_id) then
    raise exception 'FAIL B3: family A can see another family''s requirements';
  end if;
  raise notice 'PASS B3 — children and requirements are visible only to their own family';
end $$;

do $$
declare a record;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.nanny_a_user);

  -- Documents are the most sensitive thing a nanny uploads.
  if exists (select 1 from public.nanny_documents where nanny_id <> a.nanny_a_id) then
    raise exception 'FAIL B4: a nanny can read another nanny''s documents';
  end if;

  -- References carry a referee's phone and email.
  if exists (select 1 from public.nanny_references where nanny_id <> a.nanny_a_id) then
    raise exception 'FAIL B4: a nanny can read another nanny''s references';
  end if;
  raise notice 'PASS B4 — documents and references stay with their owner';
end $$;

do $$
declare a record;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.family_a_user);

  if exists (select 1 from public.nanny_references) then
    raise exception 'FAIL B5: a family can read nanny reference contact details';
  end if;
  if exists (select 1 from public.nanny_documents) then
    raise exception 'FAIL B5: a family can read nanny documents';
  end if;
  raise notice 'PASS B5 — a family cannot reach nanny documents or reference contacts';
end $$;

-- ===========================================================================
-- PRIVILEGE ESCALATION
-- ===========================================================================

do $$
declare a record; escalated boolean := false;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.family_a_user);

  begin
    update public.users set role = 'admin' where id = a.family_a_user;
    -- If the write went through, the role actually changed.
    escalated := exists (
      select 1 from public.users where id = a.family_a_user and role = 'admin'
    );
  exception when insufficient_privilege or others then
    escalated := false;
  end;

  if escalated then
    raise exception 'FAIL C1: a user promoted themselves to admin';
  end if;
  raise notice 'PASS C1 — a user cannot promote themselves to admin';
end $$;

do $$
declare a record; escalated boolean := false;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.nanny_a_user);

  -- Self-approval would make an unreviewed profile publicly discoverable.
  begin
    update public.nanny_profiles set status = 'approved' where user_id = a.nanny_a_user;
    escalated := true;
  exception when insufficient_privilege or others then
    escalated := false;
  end;

  if escalated then
    raise exception 'FAIL C2: a nanny can set her own review status';
  end if;
  raise notice 'PASS C2 — a nanny cannot change her own review status';
end $$;

do $$
declare a record; ok boolean := false;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.family_a_user);

  begin
    perform public.admin_set_nanny_status(a.nanny_draft_id, 'approved', null);
  exception
    when sqlstate 'ROLE1' then ok := true;
    when others then ok := true;
  end;

  if not ok then
    raise exception 'FAIL C3: a non-admin approved a nanny profile';
  end if;
  raise notice 'PASS C3 — admin_set_nanny_status refuses a non-admin caller';
end $$;

do $$
declare a record; leaked boolean := false;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.family_a_user);

  -- Pricing must stay readable (it is public), but not writable.
  if not exists (select 1 from public.pricing_config) then
    raise exception 'FAIL C4: pricing config is unreadable';
  end if;

  begin
    update public.pricing_config set free_contacts = 99;
    leaked := exists (select 1 from public.pricing_config where free_contacts = 99);
  exception when others then
    leaked := false;
  end;

  if leaked then
    raise exception 'FAIL C4: a family rewrote the pricing configuration';
  end if;
  raise notice 'PASS C4 — pricing is readable by all, writable only by admins';
end $$;

do $$
declare a record; wrote boolean := false;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.family_a_user);

  -- Free-contact accounting must only ever be written by start_conversation().
  begin
    insert into public.family_nanny_contacts (family_id, nanny_id)
    values (a.family_a_id, a.nanny_b_id);
    wrote := true;
  exception when others then
    wrote := false;
  end;

  if wrote then
    raise exception 'FAIL C5: a family wrote its own contact row, bypassing the paywall';
  end if;
  raise notice 'PASS C5 — contact rows cannot be forged by the client';
end $$;

do $$
declare a record; wrote boolean := false;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.family_a_user);

  -- Granting itself a subscription would be free unlimited access.
  begin
    insert into public.subscriptions (family_id, plan, status, price_aed, current_period_end)
    values (a.family_a_id, 'monthly', 'active', 0, now() + interval '1 year');
    wrote := true;
  exception when others then
    wrote := false;
  end;

  if wrote then
    raise exception 'FAIL C6: a family granted itself a subscription';
  end if;
  raise notice 'PASS C6 — subscriptions are writable only by the service role';
end $$;

-- ===========================================================================
-- ADMIN
-- ===========================================================================

do $$
declare admin_user uuid; n int;
begin
  set local role postgres;
  select id into admin_user from public.users where role = 'admin' limit 1;
  if admin_user is null then
    raise exception 'FAIL D0: no admin user in the seed';
  end if;

  set local role authenticated;
  perform pg_temp.act_as(admin_user);

  select count(*) into n from public.nanny_profiles;
  if n < 20 then
    raise exception 'FAIL D1: an admin sees only % nanny profiles', n;
  end if;
  raise notice 'PASS D1 — an admin sees all % nanny profiles for review', n;
end $$;

do $$
declare admin_user uuid; target uuid; result jsonb; new_status text;
begin
  set local role postgres;
  select id into admin_user from public.users where role = 'admin' limit 1;
  select id into target from public.nanny_profiles where status = 'submitted' limit 1;

  set local role authenticated;
  perform pg_temp.act_as(admin_user);

  result := public.admin_set_nanny_status(target, 'under_review', null);
  result := public.admin_set_nanny_status(target, 'approved', null);

  select status::text into new_status from public.nanny_profiles where id = target;
  if new_status <> 'approved' then
    raise exception 'FAIL D2: status is % after approval', new_status;
  end if;

  if not exists (
    select 1 from public.audit_logs
     where entity_id = target and action = 'nanny_status_change'
  ) then
    raise exception 'FAIL D2: the status change was not written to audit_logs';
  end if;
  raise notice 'PASS D2 — admin moved submitted → under_review → approved, and it was audited';
end $$;

do $$
declare admin_user uuid; target uuid; ok boolean := false;
begin
  set local role postgres;
  select id into admin_user from public.users where role = 'admin' limit 1;
  select id into target from public.nanny_profiles where status = 'approved' limit 1;

  set local role authenticated;
  perform pg_temp.act_as(admin_user);

  -- A rejection with no explanation is useless to the nanny receiving it.
  begin
    perform public.admin_set_nanny_status(target, 'rejected', null);
  exception when sqlstate 'STAT2' then
    ok := true;
  end;

  if not ok then
    raise exception 'FAIL D3: a rejection without a reason was accepted';
  end if;
  raise notice 'PASS D3 — a rejection must carry a reason';
end $$;

-- ===========================================================================
-- COMPLETION AND SUBMISSION GATE
-- ===========================================================================

do $$
declare
  draft_user uuid;
  draft_id uuid;
  completion jsonb;
  ok boolean := false;
begin
  set local role postgres;
  select user_id, id into draft_user, draft_id
    from public.nanny_profiles where status = 'draft' limit 1;

  set local role authenticated;
  perform pg_temp.act_as(draft_user);

  completion := public.nanny_profile_completion(draft_id);

  if (completion ->> 'percent')::int not between 0 and 100 then
    raise exception 'FAIL E1: completion percent out of range: %', completion ->> 'percent';
  end if;

  -- The draft seed profile is deliberately missing required fields.
  if (completion ->> 'can_submit')::boolean then
    raise notice 'NOTE E1 — the draft seed profile happens to be complete; skipping the gate check';
  else
    begin
      perform public.submit_nanny_profile();
    exception when sqlstate 'INCM1' then
      ok := true;
    end;
    if not ok then
      raise exception 'FAIL E1: an incomplete profile was accepted for review';
    end if;
    raise notice 'PASS E1 — an incomplete profile cannot be submitted (%%: %, missing: %)',
      completion ->> 'percent', completion -> 'required_missing';
  end if;
end $$;

do $$
declare n int; wrong int;
begin
  set local role postgres;
  -- The stored percentage must agree with the function that computes it.
  select count(*) into n from public.nanny_profiles;
  select count(*) into wrong
    from public.nanny_profiles
   where profile_completion <> (public.nanny_profile_completion(id) ->> 'percent')::int;

  if wrong > 0 then
    raise exception 'FAIL E2: % of % profiles have a stale completion percentage', wrong, n;
  end if;
  raise notice 'PASS E2 — stored completion matches the computed value for all % profiles', n;
end $$;

do $$
declare wrong int;
begin
  set local role postgres;
  select count(*) into wrong
    from public.family_profiles
   where profile_completion <> (public.family_profile_completion(id) ->> 'percent')::int;

  if wrong > 0 then
    raise exception 'FAIL E3: % family profiles have a stale completion percentage', wrong;
  end if;
  raise notice 'PASS E3 — family completion percentages are all in step';
end $$;

-- ===========================================================================
-- STORAGE
-- ===========================================================================

do $$
declare bad int;
begin
  set local role postgres;
  select count(*) into bad from storage.buckets
   where id in ('nanny-photos', 'nanny-videos', 'nanny-documents', 'family-photos')
     and public;

  if bad > 0 then
    raise exception 'FAIL F1: % storage bucket(s) are public', bad;
  end if;
  raise notice 'PASS F1 — every storage bucket is private';
end $$;

do $$
declare a record; n int;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.nanny_a_user);

  -- A nanny may list her own folder and nobody else's.
  select count(*) into n from storage.objects
   where bucket_id = 'nanny-photos'
     and (storage.foldername(name))[1] <> a.nanny_a_user::text;

  if n > 0 then
    raise exception 'FAIL F2: a nanny can see % objects in other nannies'' folders', n;
  end if;
  raise notice 'PASS F2 — storage folders are scoped to their owner';
end $$;

do $$
declare a record; n int;
begin
  select * into a from t_actors;
  set local role authenticated;
  perform pg_temp.act_as(a.family_a_user);

  select count(*) into n from storage.objects
   where bucket_id in ('nanny-documents', 'nanny-videos');

  if n > 0 then
    raise exception 'FAIL F3: a family can list % nanny documents or videos in storage', n;
  end if;
  raise notice 'PASS F3 — a family has no direct storage access to nanny documents or videos';
end $$;

rollback;
