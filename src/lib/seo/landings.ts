import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { DISCOVERABLE_STATUSES } from "@/lib/nanny/discoverable";
import { EMIRATES } from "@/lib/uae";

/**
 * The landing pages built from the filters families actually search with.
 *
 * "Filipina nannies in Dubai" and "live-in nanny Dubai" are typed into Google
 * thousands of times a month and answered here by nobody: the closest competitor
 * renders its listings in JavaScript, so as far as a crawler is concerned its
 * pages are empty. Every page here competes against a blank.
 *
 * Two rules decide what exists.
 *
 * A page is only generated when there are enough real profiles behind it. A
 * page promising Filipina nannies in Fujairah and showing none is worse than no
 * page: the visitor leaves in three seconds, and a site full of near-empty
 * pages is read by Google as a site not worth crawling. So the matrix is
 * derived from the data rather than declared, and it shrinks and grows on its
 * own.
 *
 * And nothing here invents a category. Every filter maps to one a family can
 * already apply on the search page, so a landing page is a saved search with an
 * introduction, not a separate product with its own truth to keep in step.
 */

/** How many profiles a combination needs before it earns a page of its own. */
const ENOUGH = 3;

export type LandingFilter = {
  slug: string;
  /** "Filipina nannies", "Live-in nannies". Sentence case, plural. */
  plural: string;
  kind: "nationality" | "arrangement";
  /**
   * The value the search page filters on, which is not always the slug.
   *
   * Typed as the arrangement enum where it is one, so a typo in this table is a
   * build error rather than a page that quietly returns nothing.
   */
  value: string | "live_in" | "live_out";
  /** One sentence that is true of this group and of no other. */
  note: string;
};

/**
 * Nationality slugs are what a family types, not what the database stores.
 *
 * The profiles say "Filipino", because that is the nationality. Families search
 * "Filipina", because nannies are women and that is the word in use in Dubai.
 * The slug follows the search and the filter follows the data, which is the
 * whole reason this mapping exists rather than a `toLowerCase()`.
 */
export const LANDING_FILTERS: LandingFilter[] = [
  {
    slug: "filipina",
    plural: "Filipina nannies",
    kind: "nationality",
    value: "Filipino",
    note: "Filipina nannies are the largest group in the UAE and the most likely to have worked here before, often with English good enough to help with homework.",
  },
  {
    slug: "ethiopian",
    plural: "Ethiopian nannies",
    kind: "nationality",
    value: "Ethiopian",
    note: "Many Ethiopian nannies in the UAE are live in and available at short notice, and a good number are already on a transferable visa.",
  },
  {
    slug: "kenyan",
    plural: "Kenyan nannies",
    kind: "nationality",
    value: "Kenyan",
    note: "Kenyan nannies usually speak fluent English, which matters most to families whose children are at an English speaking school.",
  },
  {
    slug: "indian",
    plural: "Indian nannies",
    kind: "nationality",
    value: "Indian",
    note: "Indian nannies often cook for the family as well, and many speak Hindi or Malayalam alongside English.",
  },
  {
    slug: "sri-lankan",
    plural: "Sri Lankan nannies",
    kind: "nationality",
    value: "Sri Lankan",
    note: "Sri Lankan nannies are a long established part of childcare in the Gulf, and many have stayed with one family for years at a time.",
  },
  {
    slug: "live-in",
    plural: "Live-in nannies",
    kind: "arrangement",
    value: "live_in",
    note: "A live in nanny has her own room in the family home. It suits households with young children or early starts, and it means the family sponsors her visa and covers her accommodation.",
  },
  {
    slug: "live-out",
    plural: "Live-out nannies",
    kind: "arrangement",
    value: "live_out",
    note: "A live out nanny has her own place and comes in for agreed hours. It costs more per hour and less in total, and it suits families who want their evenings back.",
  },
];

export function landingFilter(slug: string): LandingFilter | undefined {
  return LANDING_FILTERS.find((f) => f.slug === slug);
}

export const EMIRATE_SLUGS: Record<string, (typeof EMIRATES)[number]> = Object.fromEntries(
  EMIRATES.map((name) => [name.toLowerCase().replace(/ /g, "-"), name]),
);

export function emirateSlug(name: string): string {
  return name.toLowerCase().replace(/ /g, "-");
}

/** How many discoverable profiles sit behind one combination. */
export async function landingCount(emirate: string, filter: LandingFilter): Promise<number> {
  const supabase = createServiceClient();

  let query = supabase
    .from("nanny_profiles")
    .select("id", { count: "exact", head: true })
    .in("status", DISCOVERABLE_STATUSES)
    .eq("emirate", emirate);

  query =
    filter.kind === "nationality"
      ? query.eq("nationality", filter.value)
      : query.eq("arrangement", filter.value as "live_in" | "live_out");

  const { count } = await query;
  return count ?? 0;
}

export function landingIsWorthIt(count: number): boolean {
  return count >= ENOUGH;
}

/**
 * Every combination that currently has enough behind it.
 *
 * Read once for the sitemap rather than page by page. Counting in the database
 * instead of listing pages by hand is what keeps the sitemap honest: a page that
 * has fallen below the line stops being advertised the same day, and one that
 * has grown past it starts.
 */
export async function availableLandings(
  /**
   * One emirate, or all of them.
   *
   * All of them is forty nine counts, which is fine for the sitemap and far too
   * much for a page somebody is waiting on. The emirate pages ask about
   * themselves and pay for seven.
   */
  only?: string,
): Promise<{ emirate: string; filter: LandingFilter; count: number }[]> {
  const found: { emirate: string; filter: LandingFilter; count: number }[] = [];
  const scope = only ? EMIRATES.filter((e) => e === only) : EMIRATES;

  for (const emirate of scope) {
    for (const filter of LANDING_FILTERS) {
      const count = await landingCount(emirate, filter);
      if (landingIsWorthIt(count)) found.push({ emirate, filter, count });
    }
  }

  return found;
}
