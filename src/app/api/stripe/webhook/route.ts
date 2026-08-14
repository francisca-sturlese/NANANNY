import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { fromMinorUnits } from "@/lib/billing/plans";

/**
 * Where a subscription actually becomes real.
 *
 * The browser never grants access. It can be closed, replayed, or pointed at
 * the success URL by hand; this endpoint is the only account of what Stripe
 * believes happened, and it is the one the database follows.
 *
 * Three rules this file exists to keep.
 *
 * The signature is verified before anything is read. Without that, this is an
 * unauthenticated endpoint that grants paid access to whoever posts the right
 * JSON, and it is a URL an attacker can find.
 *
 * The raw body is used for that verification. Any reserialisation, including
 * the round trip through `await request.json()`, changes bytes and the
 * signature stops matching. That failure looks like a Stripe problem and is
 * not.
 *
 * Applying is idempotent. Stripe retries on a slow response, on a deploy
 * landing mid-delivery, and whenever someone resends from the dashboard. The
 * database function is where that is enforced, on a unique index, not on this
 * side with a lookup and a race between the two.
 */

// Reads the raw request body and talks to Stripe: nothing to prerender.
export const dynamic = "force-dynamic";

/** Events we act on. Anything else is acknowledged and ignored. */
const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set. Refusing the event.");
    return new Response("Billing is not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("No signature", { status: 400 });

  const raw = await request.text();

  let event: Stripe.Event;
  try {
    // Async: the Node crypto version is synchronous, but the Web Crypto one is
    // not, and Web Crypto is what exists on Workers.
    event = await stripe().webhooks.constructEventAsync(raw, signature, secret);
  } catch (error) {
    // Deliberately terse. A detailed reply helps whoever is probing.
    console.error("[stripe] signature check failed:", error);
    return new Response("Bad signature", { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    return Response.json({ received: true, handled: false });
  }

  try {
    const outcome = await apply(event);
    return Response.json({ received: true, ...outcome });
  } catch (error) {
    // A 500 asks Stripe to retry, which is what we want for a transient
    // database problem. Idempotency is what makes that retry safe.
    console.error(`[stripe] could not apply ${event.type}:`, error);
    return new Response("Could not apply the event", { status: 500 });
  }
}

async function apply(event: Stripe.Event): Promise<Record<string, unknown>> {
  const service = createServiceClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      // Only subscriptions are sold here. A one-off payment arriving would be
      // someone else's session or a misconfiguration, not something to act on.
      if (session.mode !== "subscription") return { handled: false };

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (!subscriptionId) return { handled: false, reason: "no subscription on the session" };

      // Re-read from Stripe rather than trusting the summary in the session:
      // the period dates and the real status live on the subscription.
      const subscription = await stripe().subscriptions.retrieve(subscriptionId);
      return applySubscription(service, event, subscription, familyIdFrom(session, subscription));
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      return applySubscription(service, event, subscription, familyIdFrom(null, subscription));
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const familyId = invoice.metadata?.family_id ?? (await familyIdForCustomer(invoice));

      if (!familyId) return { handled: false, reason: "no family on the invoice" };

      const { data, error } = await service.rpc("record_payment", {
        p_family_id: familyId,
        p_provider_payment_id: invoice.id,
        p_amount_aed: fromMinorUnits(invoice.amount_paid || invoice.amount_due || 0),
        p_status: event.type === "invoice.paid" ? "succeeded" : "failed",
        p_failure_reason:
          event.type === "invoice.payment_failed"
            ? "The card was declined or the payment could not be completed."
            : undefined,
      });

      if (error) throw new Error(error.message);
      return (data as Record<string, unknown>) ?? {};
    }

    default:
      return { handled: false };
  }
}

async function applySubscription(
  service: ReturnType<typeof createServiceClient>,
  event: Stripe.Event,
  subscription: Stripe.Subscription,
  familyId: string | null,
): Promise<Record<string, unknown>> {
  if (!familyId) {
    // Loud, because the money has moved and we cannot say whose it is. Answering
    // 200 would let Stripe stop retrying and the family would never get access.
    throw new Error(`No family_id on subscription ${subscription.id}`);
  }

  const item = subscription.items.data[0];
  const interval = item?.price?.recurring?.interval;

  const { data, error } = await service.rpc("apply_subscription_event", {
    p_family_id: familyId,
    p_event_id: event.id,
    p_event_type: event.type,
    p_plan: interval === "week" ? "weekly" : "monthly",
    p_status: statusFrom(subscription.status),
    p_price_aed: fromMinorUnits(item?.price?.unit_amount ?? 0),
    p_period_start: new Date(item.current_period_start * 1000).toISOString(),
    p_period_end: new Date(item.current_period_end * 1000).toISOString(),
    p_provider_customer_id:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    p_provider_subscription_id: subscription.id,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_payload: { status: subscription.status, event: event.type },
  });

  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>) ?? {};
}

/**
 * Stripe's statuses mapped onto ours.
 *
 * `past_due` deliberately does not end access. Stripe retries a failed renewal
 * for days, and most of those succeed. Cutting a family off on the first
 * failure would drop them out of a conversation they are in the middle of,
 * over a card that expired.
 */
function statusFrom(status: Stripe.Subscription.Status) {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "expired";
    default:
      return "expired";
  }
}

/** Our own id, carried through metadata rather than inferred. */
function familyIdFrom(
  session: Stripe.Checkout.Session | null,
  subscription: Stripe.Subscription,
): string | null {
  return (
    subscription.metadata?.family_id ??
    session?.metadata?.family_id ??
    session?.client_reference_id ??
    null
  );
}

/** Last resort for an invoice: find the family by the customer we recorded. */
async function familyIdForCustomer(invoice: Stripe.Invoice): Promise<string | null> {
  const customer =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customer) return null;

  const service = createServiceClient();
  const { data } = await service
    .from("subscriptions")
    .select("family_id")
    .eq("provider_customer_id", customer)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.family_id ?? null;
}
