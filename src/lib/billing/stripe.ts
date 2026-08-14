import "server-only";

import Stripe from "stripe";

/**
 * The Stripe client.
 *
 * `server-only` so importing it from a client component is a build error
 * rather than a secret key in a JavaScript bundle.
 *
 * The HTTP client is set explicitly. Stripe's default uses Node's `http`
 * module, which does not exist on Cloudflare Workers; the fetch client works on
 * both. Getting this wrong fails at the first API call in production, not at
 * build time, which is the worst place to find out.
 */
let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Billing cannot run without it.",
    );
  }

  client = new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
    // Pinned. An unpinned version means Stripe can change the shape of a
    // webhook payload under a running deployment.
    apiVersion: "2026-07-29.dahlia",
  });

  return client;
}

/** Whether billing is configured at all. Lets pages degrade rather than throw. */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * True while the account is in test mode.
 *
 * Used to put a visible marker on the billing screens. A test card that
 * silently "works" on what looks like the live site is how a launch goes out
 * with nothing actually being charged.
 */
export function isTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}
