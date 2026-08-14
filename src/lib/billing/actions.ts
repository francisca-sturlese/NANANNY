"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { absoluteUrl } from "@/lib/seo/site";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe, billingConfigured } from "@/lib/billing/stripe";
import { getPlan, lineItemFor, type PlanKey } from "@/lib/billing/plans";

/**
 * Starting and stopping a subscription.
 *
 * Everything here re-checks the caller. A server action is a public endpoint
 * reachable by POST, and "only a family sees the subscribe button" is not a
 * check.
 *
 * Nothing in this file grants access. It sends the family to Stripe and comes
 * back; the subscription only becomes real when the webhook says it has, which
 * is the only version of events we did not learn from the browser. A user who
 * closes the tab on Stripe's page and edits the return URL by hand gets
 * nothing.
 */

export type BillingState = { error?: string };

export async function startCheckoutAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const user = await requireRole("family", "/family/subscription");
  if (!user.emailVerified) return { error: "Please confirm your email address first." };

  if (!billingConfigured()) {
    return { error: "Payments are not switched on yet. Nothing has been charged." };
  }

  const planKey = String(formData.get("plan") ?? "") as PlanKey;
  const plan = await getPlan(planKey);
  if (!plan) return { error: "That plan is not available." };

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) return { error: "Finish your family profile first." };

  // An existing subscriber should not be able to buy a second subscription.
  const { data: active } = await supabase.rpc("has_active_subscription", {
    p_family_id: family.id,
  });
  if (active) return { error: "You already have an active subscription." };

  // Reuse the provider's customer record if this family has subscribed before,
  // so their payment history stays in one place rather than scattered across
  // duplicate customers.
  const service = createServiceClient();
  const { data: existingCustomer } = await service.rpc("family_provider_customer", {
    p_family_id: family.id,
  });

  let url: string | null = null;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [lineItemFor(plan)],
      // Read back from the webhook. Never trusted from the browser.
      client_reference_id: family.id,
      metadata: { family_id: family.id, plan: plan.key },
      subscription_data: { metadata: { family_id: family.id, plan: plan.key } },
      ...(existingCustomer
        ? { customer: existingCustomer as string }
        : { customer_email: user.email }),
      // Built from the configured site URL, not from the request. These go to
      // Stripe and come back later; a Host header should not be able to decide
      // where a paying customer is returned to.
      success_url: absoluteUrl("/family/subscription?checkout=done"),
      cancel_url: absoluteUrl("/family/subscription?checkout=cancelled"),
      // The UAE charges VAT on this. Letting Stripe work it out is better than
      // hardcoding a rate that changes without telling us.
      automatic_tax: { enabled: false },
    });
    url = session.url;
  } catch (error) {
    console.error("[billing] could not open checkout:", error);
    return { error: "We could not open the payment page. Please try again." };
  }

  if (!url) return { error: "We could not open the payment page. Please try again." };

  // Outside the try: redirect() works by throwing, and catching it here would
  // turn a successful checkout into "please try again".
  redirect(url);
}

/**
 * Sends the family to Stripe's own billing page.
 *
 * Cancelling, changing a card and downloading receipts all live there. Building
 * our own version of those screens would mean holding card details in our own
 * forms, which is the thing we most want to avoid.
 */
export async function openBillingPortalAction(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  const user = await requireRole("family", "/family/subscription");

  if (!billingConfigured()) {
    return { error: "Payments are not switched on yet." };
  }

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) return { error: "No family profile found." };

  const service = createServiceClient();
  const { data: customer } = await service.rpc("family_provider_customer", {
    p_family_id: family.id,
  });

  if (!customer) return { error: "There is no billing history on this account yet." };

  let url: string | null = null;
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: customer as string,
      return_url: absoluteUrl("/family/subscription"),
    });
    url = session.url;
  } catch (error) {
    console.error("[billing] could not open the portal:", error);
    return { error: "We could not open your billing page. Please try again." };
  }

  redirect(url);
}
