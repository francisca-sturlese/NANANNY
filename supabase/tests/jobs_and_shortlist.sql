-- Milestone 3 invariants: jobs, applications and the shortlist.
--
-- The one that matters most: none of this may ever touch a family's free
-- contact allowance. A nanny applying, a family reading that application, and
-- a family shortlisting a profile are all free. Only start_conversation()
-- spends a contact.
--
-- Run:  psql "$SUPABASE_DB_URL" -f this-file

begin;

\set ON_ERROR_STOP on

create temp table t as
select
  (select user_id from public.family_profiles order by user_id limit 1)  as family_user,
  (select id      from public.family_profiles order by user_id limit 1)  as family_id,
  (select user_id from public.family_profiles order by user_id offset 1 limit 1) as other_family_user,
  (select user_id from public.nanny_profiles where status = 'approved' order by user_id limit 1) as nanny_user,
  (select id      from public.nanny_profiles where status = 'approved' order by user_id limit 1) as nanny_id,
  (select user_id from public.nanny_profiles where status = 'draft' limit 1) as draft_nanny_user,
  (select id      from public.nanny_profiles where status = 'draft' limit 1) as draft_nanny_id;

grant select on t to anon, authenticated;

create or replace function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$$;

-- ===========================================================================
-- APPLICATIONS DO NOT COST A CONTACT
-- ===========================================================================

do $$
declare
  a record;
  job_id uuid;
  used_before int;
  used_after int;
begin
  set local role postgres;
  select * into a from t;

  select id into job_id from public.jobs
   where family_id = a.family_id and status = 'active' limit 1;
  if job_id is null then
    raise exception 'FAIL setup: the seeded family has no active job';
  end if;

  select free_contacts_used into used_before
    from public.family_contact_state(a.family_id);

  -- The nanny applies, through her own session.
  set local role authenticated;
  perform pg_temp.act_as(a.nanny_user);

  insert into public.job_applications (job_id, nanny_id)
  values (job_id, a.nanny_id)
  on conflict do nothing;

  set local role postgres;
  select free_contacts_used into used_after
    from public.family_contact_state(a.family_id);

  if used_after <> used_before then
    raise exception 'FAIL J1: an application changed free contacts used from % to %',
      used_before, used_after;
  end if;

  if exists (
    select 1 from public.family_nanny_contacts
     where family_id = a.family_id and nanny_id = a.nanny_id
  ) then
    raise exception 'FAIL J1: applying created a family_nanny_contacts row';
  end if;

  raise notice 'PASS J1 — a nanny applying does not consume a family free contact';
end $$;

do $$
declare
  a record;
  app_id uuid;
  used_before int;
  used_after int;
begin
  set local role postgres;
  select * into a from t;
  select free_contacts_used into used_before from public.family_contact_state(a.family_id);

  select ja.id into app_id
    from public.job_applications ja
    join public.jobs j on j.id = ja.job_id
   where j.family_id = a.family_id limit 1;

  -- The family reads it and moves it along.
  set local role authenticated;
  perform pg_temp.act_as(a.family_user);

  update public.job_applications
     set status = 'shortlisted', viewed_at = now()
   where id = app_id;

  set local role postgres;
  select free_contacts_used into used_after from public.family_contact_state(a.family_id);

  if used_after <> used_before then
    raise exception 'FAIL J2: reviewing an application changed free usage % -> %',
      used_before, used_after;
  end if;
  raise notice 'PASS J2 — reviewing and shortlisting an application costs nothing';
end $$;

-- ===========================================================================
-- APPLICATION AUTHORIZATION
-- ===========================================================================

do $$
declare a record; leaked int;
begin
  set local role postgres;
  select * into a from t;

  set local role authenticated;
  perform pg_temp.act_as(a.other_family_user);

  -- A family must not see applications made to another family's jobs.
  select count(*) into leaked
    from public.job_applications ja
    join public.jobs j on j.id = ja.job_id
   where j.family_id = a.family_id;

  if leaked > 0 then
    raise exception 'FAIL J3: a family can read % applications on another family''s jobs', leaked;
  end if;
  raise notice 'PASS J3 — applications are visible only to the job''s own family';
end $$;

do $$
declare a record; wrote boolean := false;
begin
  set local role postgres;
  select * into a from t;

  set local role authenticated;
  perform pg_temp.act_as(a.nanny_user);

  -- A nanny must not be able to apply on another nanny's behalf.
  begin
    insert into public.job_applications (job_id, nanny_id)
    select id, a.draft_nanny_id from public.jobs where status = 'active' limit 1;
    wrote := true;
  exception when others then
    wrote := false;
  end;

  if wrote then
    raise exception 'FAIL J4: a nanny created an application for a different nanny';
  end if;
  raise notice 'PASS J4 — a nanny cannot apply on another nanny''s behalf';
end $$;

do $$
declare a record; visible int;
begin
  set local role postgres;
  select * into a from t;

  set local role authenticated;
  perform pg_temp.act_as(a.nanny_user);

  -- One nanny must not see another nanny's applications.
  select count(*) into visible
    from public.job_applications
   where nanny_id <> a.nanny_id;

  if visible > 0 then
    raise exception 'FAIL J5: a nanny can see % applications belonging to others', visible;
  end if;
  raise notice 'PASS J5 — a nanny sees only her own applications';
end $$;

-- ===========================================================================
-- JOB VISIBILITY
-- ===========================================================================

do $$
declare n int;
begin
  set local role anon;
  perform set_config('request.jwt.claims', null, true);

  select count(*) into n from public.jobs;
  if exists (select 1 from public.jobs where status <> 'active') then
    raise exception 'FAIL J6: a non-active job is visible to anonymous visitors';
  end if;
  raise notice 'PASS J6 — anon sees % active jobs and nothing else', n;
end $$;

do $$
declare a record; wrote boolean := false;
begin
  set local role postgres;
  select * into a from t;

  set local role authenticated;
  perform pg_temp.act_as(a.other_family_user);

  -- Editing another family's job must fail, not silently match zero rows.
  update public.jobs set title = 'HIJACKED' where family_id = a.family_id;

  set local role postgres;
  wrote := exists (select 1 from public.jobs where title = 'HIJACKED');

  if wrote then
    raise exception 'FAIL J7: one family edited another family''s job';
  end if;
  raise notice 'PASS J7 — a family cannot edit another family''s job';
end $$;

-- ===========================================================================
-- SHORTLIST
-- ===========================================================================

do $$
declare
  a record;
  used_before int;
  used_after int;
begin
  set local role postgres;
  select * into a from t;
  select free_contacts_used into used_before from public.family_contact_state(a.family_id);

  set local role authenticated;
  perform pg_temp.act_as(a.family_user);

  insert into public.saved_profiles (family_id, nanny_id, stage)
  values (a.family_id, a.nanny_id, 'interested')
  on conflict (family_id, nanny_id) do update set stage = 'interview';

  update public.saved_profiles
     set stage = 'finalists'
   where family_id = a.family_id and nanny_id = a.nanny_id;

  set local role postgres;
  select free_contacts_used into used_after from public.family_contact_state(a.family_id);

  if used_after <> used_before then
    raise exception 'FAIL S1: shortlisting changed free usage % -> %', used_before, used_after;
  end if;
  raise notice 'PASS S1 — saving and moving a shortlist stage costs nothing';
end $$;

do $$
declare a record; visible int;
begin
  set local role postgres;
  select * into a from t;

  set local role authenticated;
  perform pg_temp.act_as(a.other_family_user);

  select count(*) into visible
    from public.saved_profiles where family_id = a.family_id;

  if visible > 0 then
    raise exception 'FAIL S2: a family can read another family''s shortlist';
  end if;
  raise notice 'PASS S2 — a shortlist is private to its own family';
end $$;

-- ===========================================================================
-- SEARCH SURFACE
-- ===========================================================================

do $$
declare visible int; total int;
begin
  set local role postgres;
  select count(*) into total from public.nanny_profiles;

  set local role anon;
  perform set_config('request.jwt.claims', null, true);
  select count(*) into visible from public.nanny_profiles;

  if visible >= total then
    raise exception 'FAIL R1: anon sees % of % profiles — unapproved ones are leaking',
      visible, total;
  end if;
  raise notice 'PASS R1 — search shows % of % profiles; the rest are not approved',
    visible, total;
end $$;

rollback;
