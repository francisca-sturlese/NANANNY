"use client";

import { useState } from "react";
import { SlidersHorizontal, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import {
  ARRANGEMENTS,
  CHILD_AGE_BANDS,
  EMIRATES,
  EMPLOYMENT_TYPES,
  EXPERIENCE_BANDS,
  LANGUAGES,
  SALARY_BANDS,
} from "@/lib/uae";

/**
 * Search entry point — built for a thumb.
 *
 * On a phone this is deliberately two controls: where, and a Filters button.
 * Seven dropdowns stacked down a phone screen is a form, not a search, and the
 * mobile spec rules it out. The extra filters live in a bottom sheet that slides
 * up, is dismissible, and can be cleared in one tap.
 *
 * From `sm` upwards the same fields lay out as a grid, because there the space
 * genuinely exists. Same form, same query params, same results URL either way.
 */
export function SearchModule() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <form
      action="/nannies"
      method="get"
      className="rounded-xl border border-border bg-surface-raised p-4 shadow-raised sm:p-6"
    >
      {/* ---- Always visible: where ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="mb-1.5 block text-xs font-medium text-muted">Where</span>
          <Select name="emirate" defaultValue="">
            <option value="">Anywhere in the UAE</option>
            {EMIRATES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </label>

        {/* Mobile: Filters + Search side by side, both thumb-sized. */}
        <div className="flex gap-2 sm:hidden">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setSheetOpen(true)}
            className="flex-1"
            aria-expanded={sheetOpen}
            aria-controls="search-filters-sheet"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Filters
          </Button>
          <Button type="submit" size="lg" className="flex-1">
            <Search className="size-4" aria-hidden />
            Search
          </Button>
        </div>

        <Button type="submit" size="lg" className="hidden sm:inline-flex">
          Find Matches
        </Button>
      </div>

      {/* ---- Desktop: the rest of the filters, laid out inline ---- */}
      <div className="mt-4 hidden gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-4">
        <FilterFields />
      </div>

      {/* ---- Mobile: the same fields in a bottom sheet ---- */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/35"
          />

          <div
            id="search-filters-sheet"
            className="pb-safe absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-xl border-t border-border bg-background"
          >
            {/* Grab handle, so it reads as a sheet rather than a stuck panel. */}
            <div className="sticky top-0 z-10 bg-background pt-2">
              <div aria-hidden className="mx-auto h-1 w-10 rounded-pill bg-border-strong" />
              <div className="flex items-center justify-between px-5 py-3">
                <h2 className="text-base font-semibold">Filters</h2>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="grid size-11 place-items-center rounded-pill text-muted"
                  aria-label="Close filters"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
            </div>

            <div className="grid gap-4 px-5 pb-4">
              <FilterFields />
            </div>

            <div className="pb-safe sticky bottom-0 flex gap-2 border-t border-border bg-background px-5 py-3">
              {/* type="reset" clears the sheet's own fields without a round trip. */}
              <Button type="reset" variant="outline" size="lg" className="flex-1">
                Clear all
              </Button>
              <Button type="submit" size="lg" className="flex-[2]">
                Show results
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-subtle">
        Browsing and viewing profiles is always free.
      </p>
    </form>
  );
}

/** The secondary filters, rendered identically in the sheet and the desktop grid. */
function FilterFields() {
  return (
    <>
      <FilterField label="Live in or live out" name="arrangement" placeholder="Either">
        {ARRANGEMENTS.filter((a) => a.value !== "either").map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </FilterField>

      <FilterField label="Availability" name="employment" placeholder="Any schedule">
        {EMPLOYMENT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </FilterField>

      <FilterField label="Children age" name="child_age" placeholder="Any age">
        {CHILD_AGE_BANDS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </FilterField>

      <FilterField label="Experience" name="experience" placeholder="Any experience">
        {EXPERIENCE_BANDS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </FilterField>

      <FilterField label="Language" name="language" placeholder="Any language">
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </FilterField>

      <FilterField label="Salary" name="salary_max" placeholder="Any budget">
        {SALARY_BANDS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </FilterField>
    </>
  );
}

function FilterField({
  label,
  name,
  placeholder,
  children,
}: {
  label: string;
  name: string;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <Select name={name} defaultValue="">
        <option value="">{placeholder}</option>
        {children}
      </Select>
    </label>
  );
}
