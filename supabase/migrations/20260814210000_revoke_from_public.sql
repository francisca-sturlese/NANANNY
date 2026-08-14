-- Functions that were never meant to be callable, and were.
--
-- Every one of these was written with `revoke execute ... from anon,
-- authenticated`, which does nothing useful: PostgreSQL grants EXECUTE on a new
-- function to PUBLIC, and revoking from a role that inherits PUBLIC leaves the
-- PUBLIC grant in place. The correct incantation is `from public`.
--
-- What that meant in practice, worst first:
--
--   apply_subscription_event  a signed-in user could grant themselves an
--                             active subscription and walk through the paywall
--   record_payment            could fabricate payment history
--   consume_rate_limit        could burn another user's message allowance
--   notify_new_message        could make us email somebody on demand
--   family_provider_customer  leaked the payment customer id for any family
--   phone_already_registered  a phone number lookup service
--   record_email_result       could falsify what happened to an email
--
-- Found by a test that asserted a lookup was unreachable from a session and
-- discovered it was not. The last statement here is what stops this class of
-- mistake returning: it revokes from PUBLIC on every SECURITY DEFINER function
-- in the schema and then re-grants only the ones a client is supposed to call.

revoke execute on function public.apply_subscription_event(
  uuid, text, text, public.subscription_plan, public.subscription_status, numeric,
  timestamptz, timestamptz, text, text, boolean, jsonb) from public;

revoke execute on function public.record_payment(
  uuid, text, numeric, public.payment_status, text, text) from public;

revoke execute on function public.family_provider_customer(uuid) from public;

revoke execute on function public.consume_rate_limit(text, int, interval, uuid) from public;

revoke execute on function public.notify_new_message(uuid, uuid) from public;

revoke execute on function public.record_email_result(uuid, text, text, text) from public;

revoke execute on function public.phone_already_registered(text) from public;

-- ---------------------------------------------------------------------------
-- The general fix
-- ---------------------------------------------------------------------------

/**
 * Everything a client is allowed to call, named in one place.
 *
 * A SECURITY DEFINER function runs as its owner and ignores row level security,
 * so leaving one reachable by accident is how a paywall stops being a paywall.
 * The safe default is that none of them are callable, and that the exceptions
 * are a list somebody has to add to on purpose.
 */
do $$
declare
  fn record;
  callable text[] := array[
    -- Contact gating and messaging
    'start_conversation', 'family_contact_state', 'my_contact_state',
    'send_message', 'mark_conversation_read',
    -- Profiles and onboarding
    'nanny_profile_completion', 'family_profile_completion', 'submit_nanny_profile',
    -- Matching
    'compute_match', 'refresh_matches',
    -- Safety and support
    'report_content', 'block_user', 'unblock_user',
    -- Notifications
    'my_notifications', 'mark_notifications_read',
    -- Promotion, read only
    'promo_active', 'promo_window',
    -- Everything an admin does, each of which checks is_admin() itself
    'is_admin', 'is_family', 'is_nanny', 'my_family_id', 'my_nanny_id',
    'has_active_subscription',
    'admin_set_user_status', 'admin_set_user_role', 'admin_grant_badge',
    'admin_revoke_badge', 'admin_resolve_report', 'admin_update_pricing',
    'admin_set_job_status', 'admin_metrics', 'admin_contact_funnel',
    'admin_set_nanny_status', 'admin_update_support_request',
    'admin_mark_document_reviewed', 'admin_set_promo', 'admin_stalled_signups',
    'admin_duplicate_phones'
  ];
begin
  for fn in
    select p.oid::regprocedure as signature, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef                      -- SECURITY DEFINER only
  loop
    execute format('revoke execute on function %s from public', fn.signature);

    -- The service role keeps everything. It is the backend's own key, it
    -- already bypasses row level security entirely, and it is what the Stripe
    -- webhook, the notification sender and the sitemap run as. Revoking from
    -- PUBLIC without this took those with it: the webhook could no longer
    -- record a payment and no message notification could be sent.
    execute format('grant execute on function %s to service_role', fn.signature);

    if fn.proname = any(callable) then
      execute format('grant execute on function %s to authenticated', fn.signature);
    end if;
  end loop;
end $$;

-- Two of these are read by a signed out visitor: the pricing page and the
-- launch banner both render before anybody logs in.
grant execute on function public.promo_active() to anon;
grant execute on function public.promo_window() to anon;

/**
 * Functions used inside a row level security policy.
 *
 * These are not called by a client, but the policy that calls them is evaluated
 * as the client's role, so without EXECUTE the policy raises and the query
 * returns nothing. It does not look like a permission error: it looks like the
 * rows are not there.
 *
 * That is exactly what happened. Revoking from PUBLIC took
 * `is_conversation_participant` with it, and every message in every thread
 * became invisible to the two people in it while sitting untouched in the
 * table. Found by the paywall suite, which checks that a message shows up in
 * the thread after it is sent.
 *
 * Derived rather than listed, so a policy added later that leans on a new
 * helper does not reintroduce this.
 */
do $$
declare fn record;
begin
  for fn in
    select distinct p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and exists (
         select 1 from pg_policy pol
          where coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
                coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
                like '%' || p.proname || '(%'
       )
  loop
    execute format('grant execute on function %s to authenticated, anon', fn.signature);
  end loop;
end $$;
