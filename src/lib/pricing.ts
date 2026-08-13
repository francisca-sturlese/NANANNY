import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Pricing is server-side configuration (PRD §39, §61): the UI never hardcodes
 * 3 / 89 / 250. Everything that renders a price reads it from here.
 */
export type PricingConfig = {
  freeContacts: number;
  weeklyPriceAed: number;
  monthlyPriceAed: number;
  currency: string;
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  monthlyIsBestValue: boolean;
};

/**
 * Last-resort values, used only when the database is unreachable. They must
 * stay in sync with the pricing_config defaults in the migration — a marketing
 * page that renders a stale price is worse than one that renders none, so any
 * fallback render is also logged.
 */
const FALLBACK: PricingConfig = {
  freeContacts: 3,
  weeklyPriceAed: 89,
  monthlyPriceAed: 250,
  currency: "AED",
  weeklyEnabled: true,
  monthlyEnabled: true,
  monthlyIsBestValue: true,
};

export async function getPricingConfig(): Promise<PricingConfig> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("pricing_config")
    .select(
      "free_contacts, weekly_price_aed, monthly_price_aed, currency, weekly_enabled, monthly_enabled, monthly_is_best_value",
    )
    .single();

  if (error || !data) {
    console.error("[pricing] falling back to defaults:", error?.message ?? "no row");
    return FALLBACK;
  }

  return {
    freeContacts: data.free_contacts,
    weeklyPriceAed: Number(data.weekly_price_aed),
    monthlyPriceAed: Number(data.monthly_price_aed),
    currency: data.currency,
    weeklyEnabled: data.weekly_enabled,
    monthlyEnabled: data.monthly_enabled,
    monthlyIsBestValue: data.monthly_is_best_value,
  };
}
