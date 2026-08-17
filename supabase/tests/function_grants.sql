-- Which privileged functions a signed-in user can call.
--
-- A SECURITY DEFINER function runs as its owner and ignores row level security.
-- Leaving one reachable by accident is how a paywall stops being a paywall, and
-- it is easy to do: PostgreSQL grants EXECUTE on every new function to PUBLIC,
-- so `revoke ... from authenticated` looks right and changes nothing.
--
-- Seven functions were reachable that way, one of which granted subscriptions.
-- This is the check that stops it happening again: adding a privileged function
-- fails here until somebody decides, on purpose, which side of the line it is
-- on.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file

\set QUIET on
\set ON_ERROR_STOP on
\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. Nothing outside the list is callable from a session
-- ---------------------------------------------------------------------------
do $$
declare
  unexpected text[];
  callable text[] := array[
    'start_conversation', 'family_contact_state', 'my_contact_state',
    'send_message', 'mark_conversation_read',
    'nanny_profile_completion', 'family_profile_completion', 'submit_nanny_profile',
    'compute_match', 'refresh_matches',
    'report_content', 'block_user', 'unblock_user',
    'my_notifications', 'mark_notifications_read',
    'promo_active', 'promo_window',
    'is_admin', 'is_family', 'is_nanny', 'my_family_id', 'my_nanny_id',
    'has_active_subscription',
    'admin_set_user_status', 'admin_set_user_role', 'admin_grant_badge',
    'admin_revoke_badge', 'admin_resolve_report', 'admin_update_pricing',
    'admin_set_job_status', 'admin_metrics', 'admin_contact_funnel',
    'admin_set_nanny_status', 'admin_update_support_request',
    'admin_mark_document_reviewed', 'admin_set_promo', 'admin_stalled_signups',
    'admin_duplicate_phones',
    -- Not called by a client, but named inside a row level security policy,
    -- which is evaluated as the client's role. Without EXECUTE the policy
    -- raises and the query returns nothing, which looks like missing rows
    -- rather than a permission problem.
    'is_conversation_participant',
    -- Checks is_admin() itself, like every other admin capability.
    'admin_update_reminders', 'admin_update_publishing',
    -- Checks is_admin() itself. Called from the page an admin is already on,
    -- so it has to be reachable from a session: it records the reading that is
    -- happening rather than granting one.
    'record_conversation_read',
    -- Stricter than is_admin(): both refuse anybody who is not a super_admin,
    -- and an invite is how the next administrator is appointed, so a plain
    -- admin reaching them would be the whole appointment rule undone.
    'admin_invite_create', 'admin_invite_revoke',
    -- Read only and admin gated, like the other admin_ reads. The list of
    -- everywhere people went is not something a stolen anon key should return,
    -- which is why it checks is_admin() itself rather than trusting the caller.
    'admin_traffic', 'admin_traffic_sources',
    -- Acts only on the caller, refuses anything but the typed confirmation,
    -- and is how somebody leaves. It has to be reachable from a session.
    'delete_my_account'
  ];
begin
  select coalesce(array_agg(distinct p.proname order by p.proname), '{}')
    into unexpected
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not (p.proname = any(callable));

  if cardinality(unexpected) = 0 then
    raise notice 'PASS 1  no unexpected privileged function is callable';
  else
    raise notice 'FAIL 1  reachable from a session: %', array_to_string(unexpected, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The ones that would hurt most, named individually
-- ---------------------------------------------------------------------------
do $$
declare
  leaked text[] := '{}';
  fn text;
begin
  foreach fn in array array[
    'apply_subscription_event',  -- would grant a subscription
    'record_payment',            -- would fabricate payment history
    'consume_rate_limit',        -- would burn someone else's allowance
    'notify_new_message',        -- would email somebody on demand
    'family_provider_customer',  -- would leak a payment customer id
    'phone_already_registered',  -- would be a phone lookup service
    'record_email_result'
  ] loop
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = fn
         and has_function_privilege('authenticated', p.oid, 'execute')
    ) then
      leaked := leaked || fn;
    end if;
  end loop;

  if cardinality(leaked) = 0 then
    raise notice 'PASS 2  none of the dangerous seven are reachable';
  else
    raise notice 'FAIL 2  reachable: %', array_to_string(leaked, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Anonymous visitors can call only what a public page needs
-- ---------------------------------------------------------------------------
do $$
declare unexpected text[];
begin
  select coalesce(array_agg(distinct p.proname order by p.proname), '{}')
    into unexpected
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute')
     -- The promotion window renders on a public page, and the four helpers are
     -- inside policies that anonymous visitors are evaluated against when they
     -- read an approved nanny profile.
     and p.proname not in ('promo_active', 'promo_window',
                           'is_admin', 'is_conversation_participant',
                           'my_family_id', 'my_nanny_id');

  if cardinality(unexpected) = 0 then
    raise notice 'PASS 3  anonymous callers reach only the promotion window and the policy helpers';
  else
    raise notice 'FAIL 3  anon can call: %', array_to_string(unexpected, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. And the paywall really is unreachable, not just unlisted
-- ---------------------------------------------------------------------------
do $$
declare fam uuid;
begin
  set local role postgres;
  select id into fam from public.family_profiles limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select user_id from public.family_profiles where id = fam),
                      'role', 'authenticated')::text, true);
  begin
    perform public.apply_subscription_event(
      fam, 'forged', 'forged', 'monthly'::public.subscription_plan,
      'active'::public.subscription_status, 0,
      now(), now() + interval '10 years', 'cus_forged', 'sub_forged', false, '{}'::jsonb);
    raise notice 'FAIL 4  a family granted itself a ten year subscription';
  exception when insufficient_privilege then
    raise notice 'PASS 4  a family cannot grant itself a subscription';
  end;
  set local role postgres;
end $$;
