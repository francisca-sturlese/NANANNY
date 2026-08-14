-- Applying what the payment provider tells us.
--
-- The webhook handler runs with the service role, which bypasses RLS entirely.
-- That is unavoidable: a webhook arrives with no session. It is also exactly
-- the situation where a bug writes to the wrong family's subscription and
-- nothing stops it, so the handler does not write tables directly. It calls one
-- function, which is the only thing that changes billing state.
--
-- What that buys:
--
--   * Idempotency in one place. Stripe retries, and retries are not rare: a
--     slow response, a deploy mid-delivery, a manual resend from the dashboard.
--     Applying an event twice must be impossible, not merely unlikely.
--   * Every transition recorded in subscription_events, including the ones that
--     changed nothing, so a disputed charge can be reconstructed.
--   * One audited path to compare against `has_active_subscription()`, which is
--     what the free contact gate actually asks.

/**
 * Records a provider event and applies it, exactly once.
 *
 * Returns what happened, so the handler can answer the provider honestly
 * instead of guessing: 'applied', or 'duplicate' when this event id has been
 * seen before.
 *
 * Access is granted until `current_period_end` even after a cancellation
 * (PRD §20). A family that cancels on day two of a month has paid for that
 * month and keeps it.
 */
create or replace function public.apply_subscription_event(
  p_family_id uuid,
  p_event_id text,
  p_event_type text,
  p_plan public.subscription_plan,
  p_status public.subscription_status,
  p_price_aed numeric,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_cancel_at_period_end boolean default false,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.subscriptions;
  v_before public.subscription_status;
  v_id uuid;
begin
  if p_family_id is null then
    raise exception 'No family for this event' using errcode = 'BILL1';
  end if;

  -- Seen before? Say so and change nothing. The unique index on
  -- provider_event_id is the real guard; this is the fast path that avoids
  -- raising in the common case of a retry.
  if p_event_id is not null and exists (
    select 1 from public.subscription_events where provider_event_id = p_event_id
  ) then
    return jsonb_build_object('outcome', 'duplicate', 'event_id', p_event_id);
  end if;

  -- One subscription row per provider subscription. Matched on the provider's
  -- id rather than on the family, because a family that resubscribes after
  -- letting one lapse has two, and the old one must keep its history.
  select * into v_subscription
    from public.subscriptions
   where provider = 'stripe'
     and provider_subscription_id = p_provider_subscription_id;

  v_before := v_subscription.status;

  if v_subscription.id is null then
    insert into public.subscriptions (
      family_id, plan, status, price_aed, current_period_start, current_period_end,
      cancel_at_period_end, provider, provider_customer_id, provider_subscription_id
    )
    values (
      p_family_id, p_plan, p_status, p_price_aed, p_period_start, p_period_end,
      p_cancel_at_period_end, 'stripe', p_provider_customer_id, p_provider_subscription_id
    )
    returning id into v_id;
  else
    update public.subscriptions
       set status = p_status,
           plan = p_plan,
           price_aed = p_price_aed,
           current_period_start = p_period_start,
           current_period_end = p_period_end,
           cancel_at_period_end = p_cancel_at_period_end,
           cancelled_at = case
             when p_status = 'cancelled' and cancelled_at is null then now()
             when p_status <> 'cancelled' then null
             else cancelled_at end,
           provider_customer_id = coalesce(p_provider_customer_id, provider_customer_id)
     where id = v_subscription.id
    returning id into v_id;
  end if;

  insert into public.subscription_events (
    subscription_id, family_id, event_type, from_status, to_status,
    payload, provider_event_id
  )
  values (v_id, p_family_id, p_event_type, v_before, p_status, p_payload, p_event_id);

  return jsonb_build_object(
    'outcome', 'applied',
    'subscription_id', v_id,
    'from', v_before,
    'to', p_status
  );
end;
$$;

revoke execute on function public.apply_subscription_event(
  uuid, text, text, public.subscription_plan, public.subscription_status, numeric,
  timestamptz, timestamptz, text, text, boolean, jsonb) from anon, authenticated;

/**
 * Records a payment, exactly once.
 *
 * Separate from the subscription state on purpose. A payment failing does not
 * by itself end access: Stripe retries a failed renewal for days, and cutting a
 * family off on the first failure would lock them out of conversations they are
 * in the middle of. The subscription status arrives in its own event.
 */
create or replace function public.record_payment(
  p_family_id uuid,
  p_provider_payment_id text,
  p_amount_aed numeric,
  p_status public.payment_status,
  p_provider_intent_id text default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription_id uuid;
  v_id uuid;
begin
  if exists (
    select 1 from public.payments
     where provider = 'stripe' and provider_payment_id = p_provider_payment_id
  ) then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  select id into v_subscription_id
    from public.subscriptions
   where family_id = p_family_id
   order by created_at desc
   limit 1;

  insert into public.payments (
    family_id, subscription_id, amount_aed, status, provider,
    provider_payment_id, provider_intent_id, failure_reason,
    paid_at
  )
  values (
    p_family_id, v_subscription_id, p_amount_aed, p_status, 'stripe',
    p_provider_payment_id, p_provider_intent_id, p_failure_reason,
    case when p_status = 'succeeded' then now() else null end
  )
  returning id into v_id;

  return jsonb_build_object('outcome', 'recorded', 'payment_id', v_id);
end;
$$;

revoke execute on function public.record_payment(uuid, text, numeric, public.payment_status, text, text)
  from anon, authenticated;

/**
 * The customer id for a family, so a returning subscriber is not created twice
 * in the provider's records.
 */
create or replace function public.family_provider_customer(p_family_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select provider_customer_id
    from public.subscriptions
   where family_id = p_family_id
     and provider_customer_id is not null
   order by created_at desc
   limit 1;
$$;

revoke execute on function public.family_provider_customer(uuid) from anon, authenticated;
