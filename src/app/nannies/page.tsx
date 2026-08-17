import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { canonical } from "@/lib/seo/site";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { NannyCard } from "@/components/nanny/nanny-card";
import { FilterBar, ActiveFilterChips } from "@/components/nanny/filter-bar";
import { Button } from "@/components/ui/button";
import { searchNannies } from "@/lib/search/nannies";
import { countActiveFilters, parseFilters } from "@/lib/search/options";
import { loadSavedIds } from "@/lib/shortlist/actions";
import { getSession } from "@/lib/auth/dal";
import { getPricingConfig } from "@/lib/pricing";
import { getPromo, endsPhrase } from "@/lib/promo";

export const metadata: Metadata = {
  alternates: canonical("/nannies"),
  title: "Find a nanny in the UAE",
  description:
    "Browse approved nanny profiles across Dubai, Abu Dhabi, Sharjah and the rest of the UAE. Viewing profiles is always free.",
};

export default async function NanniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const [{ results, total, page, pageCount }, user, pricing, promo] = await Promise.all([
    searchNannies(filters),
    getSession(),
    getPricingConfig(),
    getPromo(),
  ]);

  const savedIds = await loadSavedIds(results.map((r) => r.id));
  const isFamily = user?.role === "family";
  const activeCount = countActiveFilters(filters);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-5 pt-6 pb-16 sm:px-8 sm:pt-10">
        <h1 className="text-2xl font-semibold sm:text-4xl">Find a nanny</h1>
        <p className="mt-1.5 text-sm text-muted sm:text-base">
          Browsing and viewing profiles is always free.
          {!user && (
            <>
              {" "}
              <Link href="/signup" className="underline underline-offset-4">
                Create an account
              </Link>{" "}
              to save profiles and message nannies.
            </>
          )}
        </p>

        {/* Sticky so the controls stay reachable however far the list scrolls —
            the phone equivalent of a filter sidebar that is always in view. */}
        <div className="sticky top-14 z-30 -mx-5 mt-5 border-b border-border bg-background/95 px-5 py-3 backdrop-blur-md sm:top-16 sm:-mx-8 sm:px-8">
          <Suspense fallback={<div className="h-11" />}>
            <FilterBar activeCount={activeCount} total={total} />
          </Suspense>
        </div>

        <div className="mt-4 space-y-3">
          <Suspense fallback={null}>
            <ActiveFilterChips />
          </Suspense>

          <p className="text-sm text-muted" aria-live="polite">
            {total === 0
              ? "No nannies match those filters"
              : `${total} ${total === 1 ? "nanny" : "nannies"} available`}
          </p>
        </div>

        {results.length === 0 ? (
          <EmptyState hasFilters={activeCount > 0} />
        ) : (
          <>
            {/* One column on a phone. Two from `sm`, three on a wide screen —
                never so narrow that a card stops being readable. */}
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((nanny) => (
                <li key={nanny.id} className="h-full">
                  <NannyCard
                    nanny={nanny}
                    saved={savedIds.has(nanny.id)}
                    canSave={isFamily}
                  />
                </li>
              ))}
            </ul>

            <Pagination page={page} pageCount={pageCount} params={params} />
          </>
        )}

        {!user && results.length > 0 && (
          <aside className="mt-10 rounded-xl border border-border bg-surface p-6 text-center sm:p-8">
            {/* Same rule as the homepage pricing block: while the launch window
                is open, the allowance is not the current state, and telling a
                visitor she is on a meter when nothing is being counted is the
                third place this exact mistake was found. */}
            <h2 className="text-lg font-semibold sm:text-xl">
              {promo.active
                ? "Right now contacting nannies is free for everyone"
                : `Your first ${pricing.freeContacts} nanny contacts are free`}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              {promo.active ? (
                <>
                  Create an account and message as many nannies as you like while we
                  are launching{endsPhrase(promo) ? `. ${endsPhrase(promo)}` : ""}. No
                  commission on her salary, no placement fee.
                </>
              ) : (
                <>
                  Create an account to save profiles and message nannies directly. No
                  commission on her salary, no placement fee.
                </>
              )}
            </p>
            <Link href="/signup" className="mt-5 inline-block w-full sm:w-auto">
              <Button size="lg" block className="sm:w-auto sm:px-8">
                Create a free account
              </Button>
            </Link>
          </aside>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center sm:p-12">
      <h2 className="text-lg font-semibold">
        {hasFilters ? "Nothing matches all of those" : "No nannies yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
        {hasFilters
          ? "Try widening one filter at a time. Budget and years of experience are usually the ones narrowing it most."
          : "Approved profiles will appear here as nannies join."}
      </p>
      {hasFilters && (
        <Link href="/nannies" className="mt-5 inline-block">
          <Button variant="outline">Clear all filters</Button>
        </Link>
      )}
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  params,
}: {
  page: number;
  pageCount: number;
  params: Record<string, string | string[] | undefined>;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page" || value == null) continue;
      for (const v of Array.isArray(value) ? value : [value]) search.append(key, v);
    }
    if (target > 1) search.set("page", String(target));
    const qs = search.toString();
    return qs ? `/nannies?${qs}` : "/nannies";
  };

  return (
    <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)}>
          <Button variant="outline">Previous</Button>
        </Link>
      ) : (
        <span />
      )}

      <span className="text-sm text-muted">
        Page {page} of {pageCount}
      </span>

      {page < pageCount ? (
        <Link href={href(page + 1)}>
          <Button variant="outline">Next</Button>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
