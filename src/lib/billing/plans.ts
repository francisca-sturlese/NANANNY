import "server-only";

import type Stripe from "stripe";
import { getPricingConfig, type PricingConfig } from "@/lib/pricing";

/**
 * Turning our prices into Stripe's shape.
 *
 * The price is built per checkout from `pricing_config` rather than pointing at
 * a Price object created in the Stripe dashboard. Two reasons, and the second
 * is the one that matters.
 *
 * A dashboard Price is a second place the number lives, and the repository's
 * rule is that 3 / 89 / 250 exist in one table and nowhere else. With a
 * dashboard Price, an admin changing the monthly price in our admin screen
 * would change what the pricing page advertises and not what the card is
 * charged, and nothing would report the mismatch.
 *
 * The cost is that Stripe's dashboard has no tidy list of products to report
 * on. Our own `subscriptions` and `payments` tables carry that, and they are
 * the ones an admin already reads.
 */

export type PlanKey = "weekly" | "monthly";

export type Plan = {
  key: PlanKey;
  label: string;
  /** What the family is charged, in the currency pricing_config names. */
  amount: number;
  currency: string;
  interval: "week" | "month";
  enabled: boolean;
  bestValue: boolean;
};

/**
 * Cheapest first, always.
 *
 * Sorted by amount rather than listed in a fixed order, so the rule survives a
 * price change made from the admin screen. Which plan carries the "best value"
 * badge is a separate question and stays with `monthly_is_best_value`.
 */
export function plansFrom(pricing: PricingConfig): Plan[] {
  return [
    {
      key: "monthly" as const,
      label: "Monthly",
      amount: pricing.monthlyPriceAed,
      currency: pricing.currency,
      interval: "month" as const,
      enabled: pricing.monthlyEnabled,
      bestValue: pricing.monthlyIsBestValue,
    },
    {
      key: "weekly" as const,
      label: "Weekly",
      amount: pricing.weeklyPriceAed,
      currency: pricing.currency,
      interval: "week" as const,
      enabled: pricing.weeklyEnabled,
      bestValue: !pricing.monthlyIsBestValue,
    },
  ].sort((a, b) => a.amount - b.amount);
}

export async function getPlans(): Promise<Plan[]> {
  return plansFrom(await getPricingConfig());
}

export async function getPlan(key: PlanKey): Promise<Plan | null> {
  return (await getPlans()).find((p) => p.key === key && p.enabled) ?? null;
}

/**
 * Stripe counts in the currency's smallest unit.
 *
 * AED has two decimal places, so 250.00 is 25000 fils. Rounding rather than
 * truncating: `Math.trunc(89.99 * 100)` is 8998 in floating point, and
 * undercharging by a fil on every renewal is the kind of bug that is noticed
 * by an accountant a year later.
 */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinorUnits(minor: number): number {
  return minor / 100;
}

/** The line item for a checkout session, built from our own configuration. */
export function lineItemFor(plan: Plan): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    quantity: 1,
    price_data: {
      currency: plan.currency.toLowerCase(),
      unit_amount: toMinorUnits(plan.amount),
      recurring: { interval: plan.interval },
      product_data: {
        name: `NaNanny UAE, ${plan.label.toLowerCase()} access`,
        description:
          "Unlimited nanny contacts while the subscription is active. Cancel any time and keep access until the period you have paid for ends.",
      },
    },
  };
}
