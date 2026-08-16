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

  const openCheckout = (customer: string | null) =>
    stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [lineItemFor(plan)],
      // Read back from the webhook. Never trusted from the browser.
      client_reference_id: family.id,
      metadata: { family_id: family.id, plan: plan.key },
      subscription_data: { metadata: { family_id: family.id, plan: plan.key } },
      ...(customer ? { customer } : { customer_email: user.email }),
      // Built from the configured site URL, not from the request. These go to
      // Stripe and come back later; a Host header should not be able to decide
      // where a paying customer is returned to.
      success_url: absoluteUrl("/family/subscription?checkout=done"),
      cancel_url: absoluteUrl("/family/subscription?checkout=cancelled"),
      // The UAE charges VAT on this. Letting Stripe work it out is better than
      // hardcoding a rate that changes without telling us.
      automatic_tax: { enabled: false },
    });

  let url: string | null = null;
  try {
    const session = await openCheckout((existingCustomer as string) ?? null);
    url = session.url;
  } catch (error) {
    /**
     * A stored customer that the provider does not recognise.
     *
     * The id we keep belongs to whichever set of keys created it, and test and
     * live are separate worlds: an id minted while the account was in test mode
     * does not exist once live keys are in use. So the first real checkout by
     * anybody who was used as a test subject fails on an id that looks
     * perfectly valid, with a message about a customer, to a family who has
     * done nothing wrong.
     *
     * Starting again without it is exactly right. The only thing the id buys is
     * keeping one family's payment history under one customer record, which is
     * a convenience; being unable to pay is not. Stripe makes a new customer,
     * the webhook stores the new id, and the next attempt reuses that one.
     */
    const message = error instanceof Error ? error.message : String(error);
    const unknownCustomer = existingCustomer && /No such customer/i.test(message);

    if (!unknownCustomer) {
      console.error("[billing] could not open checkout:", error);
      return { error: "We could not open the payment page. Please try again." };
    }

    console.warn(
      "[billing] stored customer is unknown to the provider, starting a new one:",
      existingCustomer,
    );

    try {
      const session = await openCheckout(null);
      url = session.url;
    } catch (retryError) {
      console.error("[billing] could not open checkout on retry:", retryError);
      return { error: "We could not open the payment page. Please try again." };
    }
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

    /**
     * Nothing to retry here, unlike checkout.
     *
     * The portal is a view onto an existing customer, so there is no version of
     * this that works without a customer the provider recognises. What can be
     * done is say something true instead of "try again", which invites somebody
     * to press the same button until they give up.
     */
    const message = error instanceof Error ? error.message : String(error);
    if (/No such customer/i.test(message)) {
      return {
        error:
          "We cannot open your billing page. Your payment record was created before we switched providers, so it is no longer readable. Write to billing@nananny.com and we will sort it out.",
      };
    }

    return { error: "We could not open your billing page. Please try again." };
  }

  redirect(url);
}
