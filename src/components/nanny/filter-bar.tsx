"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Portal, useScrollLock } from "@/components/ui/portal";
import { Select } from "@/components/ui/field";
import { ChoiceCard, ChoiceGroup, PillCheckbox, PillGroup } from "@/components/ui/choice";
import {
  ARRANGEMENTS,
  CHILD_AGE_BANDS,
  EMIRATES,
  EMPLOYMENT_TYPES,
  EXPERIENCE_BANDS,
  LANGUAGES,
  NATIONALITIES,
  SALARY_BANDS,
} from "@/lib/uae";
import { SKILL_FILTERS, SORT_OPTIONS } from "@/lib/search/options";

/**
 * Search controls.
 *
 * Phone: one line — where, Filters, Sort. The rest opens in a full-height sheet
 * with a sticky footer carrying "Clear all" and "Show results", so the two
 * actions are always under the thumb no matter how far the list is scrolled.
 *
 * Desktop keeps the same sheet rather than a permanent sidebar: one
 * implementation, one behaviour, no second layout to keep in step.
 */
export function FilterBar({
  activeCount,
  total,
}: {
  activeCount: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  useScrollLock(open);

  const value = (key: string) => params.get(key) ?? "";
  const skills = params.getAll("skills");

  function updateOne(key: string, next: string) {
    const search = new URLSearchParams(params.toString());
    if (next) search.set(key, next);
    else search.delete(key);
    search.delete("page");
    router.push(`/nannies?${search.toString()}`, { scroll: false });
  }

  function applySheet(formData: FormData) {
    const search = new URLSearchParams();
    for (const [key, raw] of formData.entries()) {
      const v = String(raw);
      if (v) search.append(key, v);
    }
    // Sort lives outside the sheet, so carry it across.
    const sort = params.get("sort");
    if (sort) search.set("sort", sort);
    setOpen(false);
    router.push(`/nannies?${search.toString()}`, { scroll: false });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 sm:max-w-56">
          <span className="sr-only">Where</span>
          <Select value={value("emirate")} onChange={(e) => updateOne("emirate", e.target.value)}>
            <option value="">Anywhere in the UAE</option>
            {EMIRATES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </label>

        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className="shrink-0"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 grid size-5 place-items-center rounded-pill bg-foreground text-[0.6875rem] font-semibold text-background">
              {activeCount}
            </span>
          )}
        </Button>

        <label className="shrink-0">
          <span className="sr-only">Sort by</span>
          <Select
            value={value("sort") || "relevance"}
            onChange={(e) => updateOne("sort", e.target.value)}
            className="w-auto pr-9 pl-3 text-sm"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {open && (
        <Portal>
        {/* Portalled to <body>: this sheet lives inside a sticky bar with
            backdrop-blur, which would otherwise become the containing block for
            `fixed` and clip the panel to the bar's own box. */}
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Filters">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/35"
          />

          <form
            action={applySheet}
            className="pb-safe absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-xl border-t border-border bg-background sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[26rem] sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l"
          >
            <div className="shrink-0 border-b border-border pt-2 sm:pt-0">
              <div aria-hidden className="mx-auto h-1 w-10 rounded-pill bg-border-strong sm:hidden" />
              <div className="flex items-center justify-between px-5 py-3">
                <h2 className="text-base font-semibold">Filters</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid size-11 place-items-center rounded-pill text-muted"
                  aria-label="Close filters"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
              {/* Location repeats inside the sheet so the sheet alone is a
                  complete set of filters — applying it must never silently drop
                  what was chosen outside. */}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Where</span>
                <Select name="emirate" defaultValue={value("emirate")}>
                  <option value="">Anywhere in the UAE</option>
                  {EMIRATES.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </Select>
              </label>

              <ChoiceGroup legend="Live in or live out" columns={1}>
                {ARRANGEMENTS.filter((a) => a.value !== "either").map((a) => (
                  <ChoiceCard
                    key={a.value}
                    type="radio"
                    name="arrangement"
                    value={a.value}
                    label={a.label}
                    defaultChecked={value("arrangement") === a.value}
                  />
                ))}
              </ChoiceGroup>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Schedule</span>
                <Select name="employment" defaultValue={value("employment")}>
                  <option value="">Any schedule</option>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Experience with</span>
                <Select name="child_age" defaultValue={value("child_age")}>
                  <option value="">Any age group</option>
                  {CHILD_AGE_BANDS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Years of experience</span>
                <Select name="experience" defaultValue={value("experience")}>
                  <option value="">Any experience</option>
                  {EXPERIENCE_BANDS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Your budget</span>
                <Select name="salary_max" defaultValue={value("salary_max")}>
                  <option value="">Any budget</option>
                  {SALARY_BANDS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Language</span>
                <Select name="language" defaultValue={value("language")}>
                  <option value="">Any language</option>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </label>

              <PillGroup legend="Must be able to">
                {SKILL_FILTERS.map((s) => (
                  <PillCheckbox
                    key={s.value}
                    name="skills"
                    value={s.value}
                    label={s.label}
                    defaultChecked={skills.includes(s.value)}
                  />
                ))}
              </PillGroup>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Nationality</span>
                <Select name="nationality" defaultValue={value("nationality")}>
                  <option value="">Any nationality</option>
                  {NATIONALITIES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="pb-safe flex shrink-0 gap-2 border-t border-border bg-background px-5 py-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => {
                  setOpen(false);
                  router.push("/nannies", { scroll: false });
                }}
              >
                Clear all
              </Button>
              <Button type="submit" size="lg" className="flex-[2]">
                Show {total} {total === 1 ? "nanny" : "nannies"}
              </Button>
            </div>
          </form>
        </div>
        </Portal>
      )}
    </>
  );
}

/** Removable chips for what is currently filtering the list. */
export function ActiveFilterChips() {
  const router = useRouter();
  const params = useSearchParams();

  const labels: Record<string, (v: string) => string> = {
    emirate: (v) => v,
    arrangement: (v) => ARRANGEMENTS.find((a) => a.value === v)?.label ?? v,
    employment: (v) => EMPLOYMENT_TYPES.find((t) => t.value === v)?.label ?? v,
    child_age: (v) => CHILD_AGE_BANDS.find((b) => b.value === v)?.label ?? v,
    experience: (v) => `${v}+ years`,
    language: (v) => v,
    salary_max: (v) => `Up to AED ${Number(v).toLocaleString("en-AE")}`,
    nationality: (v) => v,
    skills: (v) => ({ driving: "Drives", cooking: "Cooks", housekeeping: "Housekeeps", first_aid: "First aid" })[v] ?? v,
  };

  const chips: { key: string; value: string; label: string }[] = [];
  for (const [key, format] of Object.entries(labels)) {
    for (const value of params.getAll(key)) {
      if (value) chips.push({ key, value, label: format(value) });
    }
  }

  if (chips.length === 0) return null;

  function remove(key: string, value: string) {
    const search = new URLSearchParams(params.toString());
    const remaining = search.getAll(key).filter((v) => v !== value);
    search.delete(key);
    for (const v of remaining) search.append(key, v);
    search.delete("page");
    router.push(`/nannies?${search.toString()}`, { scroll: false });
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <li key={`${chip.key}:${chip.value}`}>
          <button
            type="button"
            onClick={() => remove(chip.key, chip.value)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-border bg-surface px-3 text-xs text-muted transition-colors hover:text-foreground"
          >
            {chip.label}
            <X className="size-3.5" aria-hidden />
            <span className="sr-only">Remove filter</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export { ArrowUpDown };
