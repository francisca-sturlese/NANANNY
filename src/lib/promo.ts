import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The launch window.
 *
 * Read from the same table the prices live in, so opening and closing it is a
 * configuration change and not a deploy. Everything that mentions the
 * promotion asks here; nothing hardcodes a date.
 */
export type Promo = {
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  label: string | null;
  /** Whole days left, rounded up. Null when the window has no end. */
  daysLeft: number | null;
};

const NO_PROMO: Promo = {
  active: false,
  startsAt: null,
  endsAt: null,
  label: null,
  daysLeft: null,
};

export async function getPromo(): Promise<Promo> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("promo_window");

  if (error || !data) {
    // Silence rather than a broken banner. A promotion nobody sees is a
    // smaller problem than a page that will not render.
    if (error) console.error("[promo] could not read the window:", error.message);
    return NO_PROMO;
  }

  const window = data as {
    active: boolean;
    starts_at: string | null;
    ends_at: string | null;
    label: string | null;
  };

  return {
    active: Boolean(window.active),
    startsAt: window.starts_at,
    endsAt: window.ends_at,
    label: window.label,
    daysLeft: window.ends_at ? daysUntil(window.ends_at) : null,
  };
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * How the ending is described.
 *
 * Vague while there is plenty of time, precise once there is not. "Ends in 2
 * days" is useful; "ends in 19 days" is noise that trains people to ignore the
 * banner before it matters.
 */
export function endsPhrase(promo: Promo): string | null {
  if (!promo.endsAt) return null;
  if (promo.daysLeft === null) return null;

  if (promo.daysLeft <= 1) return "Ends today";
  if (promo.daysLeft <= 7) return `Ends in ${promo.daysLeft} days`;

  return `Ends on ${new Date(promo.endsAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  })}`;
}
