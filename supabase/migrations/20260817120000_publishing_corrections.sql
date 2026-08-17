-- Three things the first day of automatic publishing found.
--
-- All three were caught by guards rather than by people, which is the only
-- reason they are small.

-- ---------------------------------------------------------------------------
-- 1. A new table is born readable, and nothing was stopping it
-- ---------------------------------------------------------------------------
--
-- `publishing_config` was created two hours ago and `assert_anon_reads()`
-- immediately reported that a stranger could read it. Row level security kept
-- the rows back, so nothing leaked; the grant was there because PostgreSQL
-- hands one out by default and nobody had said otherwise.
--
-- That is the same shape as the drift closed this afternoon, arriving from the
-- front instead of from the past. Revoking this one table fixes today. The
-- event trigger below fixes the category, exactly as `close_new_functions`
-- does for functions written from now on: a one-time migration cannot fix a
-- default, only changing the default can.

revoke select on public.publishing_config from anon;

create or replace function public.close_new_table_to_anon()
returns event_trigger
language plpgsql
as $$
declare obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
  loop
    if obj.command_tag = 'CREATE TABLE' and obj.schema_name = 'public' then
      execute format('revoke select on %s from anon', obj.object_identity);
    end if;
  end loop;
end;
$$;

drop event trigger if exists close_new_tables;
create event trigger close_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.close_new_table_to_anon();

comment on function public.close_new_table_to_anon() is
  'Every table created in public is closed to anon the moment it exists. A table meant to be public is opened deliberately, in anon_readable(), where the decision is written down.';

-- ---------------------------------------------------------------------------
-- 2. When a person acts on purpose, the automation gets out of the way
-- ---------------------------------------------------------------------------
--
-- Putting a published profile back to draft stopped working: the trigger saw a
-- draft above the threshold and republished it inside the same statement, so
-- `ops_set_nanny_status` reported submitted to submitted.
--
-- Consistent with how it was written, and wrong. The automation exists for
-- people nobody is attending to. When somebody is deliberately attending to a
-- profile, they are better informed than the rule is, and the rule should
-- stand aside. The alternative was to tell an operator that hiding somebody
-- means rejecting her, which is a different thing to say to a real person and
-- would end up being said for our convenience.
--
-- A transaction-local flag, so it covers the statement it was set for and
-- nothing after it.

create or replace function public.ops_set_nanny_status(
  p_nanny_id uuid,
  p_status public.nanny_profile_status,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required for an operational status change'
      using errcode = 'OPSR1';
  end if;

  select to_jsonb(n) into v_before from public.nanny_profiles n where n.id = p_nanny_id;

  if v_before is null then
    raise exception 'No such nanny profile' using errcode = 'OPSR2';
  end if;

  -- Told once, for this transaction, so the publishing trigger knows a person
  -- is doing this on purpose.
  perform set_config('nananny.operator_acting', 'on', true);

  update public.nanny_profiles
     set status = p_status,
         -- Submitting is a moment, and the review queue orders by it. Set only
         -- when it is not already there, so a second change does not make an
         -- old submission look new and jump the queue.
         submitted_at = case
           when p_status = 'submitted' then coalesce(submitted_at, now())
           else submitted_at
         end
   where id = p_nanny_id;

  perform set_config('nananny.operator_acting', 'off', true);

  select to_jsonb(n) into v_after from public.nanny_profiles n where n.id = p_nanny_id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id,
                                 before_state, after_state)
  values (
    null,
    'nanny_status_changed',
    'nanny_profile',
    p_nanny_id,
    jsonb_build_object('status', v_before ->> 'status'),
    jsonb_build_object(
      'status', v_after ->> 'status',
      'by', 'ops',
      'reason', btrim(p_reason))
  );

  return jsonb_build_object(
    'id', p_nanny_id,
    'from', v_before ->> 'status',
    'to', v_after ->> 'status');
end;
$$;

revoke execute on function public.ops_set_nanny_status(uuid, public.nanny_profile_status, text)
  from public, anon, authenticated;
grant execute on function public.ops_set_nanny_status(uuid, public.nanny_profile_status, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. The probe accounts, and the operator flag
-- ---------------------------------------------------------------------------
--
-- A probe on our own domain reached the real search page during the first live
-- test. It was removed by hand within minutes; the domain is on the skip list
-- now so the category cannot come back.

create or replace function public.publish_when_complete_enough()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.publishing_config;
  v_email text;
begin
  if new.status is distinct from 'draft' then
    return new;
  end if;

  -- Somebody is doing this deliberately. They know something the threshold
  -- does not.
  if coalesce(current_setting('nananny.operator_acting', true), 'off') = 'on' then
    return new;
  end if;

  select * into cfg from public.publishing_config where id;

  if cfg is null or not cfg.enabled then
    return new;
  end if;

  if coalesce(new.profile_completion, 0) < cfg.min_completion_percent then
    return new;
  end if;

  select u.email into v_email from public.users u where u.id = new.user_id;

  -- Ours, in every form we use them. A test account on a real search page is a
  -- family writing to somebody who does not exist. Not `example.com` and
  -- friends: the publishing suite uses one to stand for a real person, and a
  -- skip list that swallows the test is a skip list nobody is testing.
  if v_email is null
     or v_email like '%@nananny.example.test'
     or v_email like '%@nananny.com'
     or v_email like '%@test.local' then
    return new;
  end if;

  new.status := 'submitted';
  new.submitted_at := coalesce(new.submitted_at, now());

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id,
                                 before_state, after_state)
  values (
    null,
    'nanny_status_changed',
    'nanny_profile',
    new.id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'submitted',
      'by', 'automatic',
      'reason', format(
        'profile reached %s%%, at or above the %s%% publishing threshold',
        new.profile_completion, cfg.min_completion_percent)));

  return new;
end;
$$;
