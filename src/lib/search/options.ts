/**
 * Pure search vocabulary — no imports, no `server-only`.
 *
 * The filter sheet is a client component, and importing any of this from the
 * server module would drag the service-role client into the browser bundle.
 * Constants and types live here so both sides can share them safely.
 */

export type NannyFilters = {
  emirate?: string;
  arrangement?: string;
  employment?: string;
  childAge?: string;
  experience?: string;
  language?: string;
  salaryMax?: string;
  skills?: string[];
  nationality?: string;
  visa?: string;
  sort?: string;
  page?: number;
};

export const PAGE_SIZE = 12;

export const SORT_OPTIONS = [
  { value: "relevance", label: "Most relevant" },
  { value: "experience", label: "Most experienced" },
  { value: "salary_low", label: "Salary: low to high" },
  { value: "available", label: "Available soonest" },
  { value: "newest", label: "Recently joined" },
] as const;

/**
 * The first thing a family in the UAE wants to narrow by, because it decides
 * what hiring actually involves. Self declared, which the sheet says out loud.
 */
export const VISA_FILTERS = [
  { value: "own_visa", label: "Own visa" },
  { value: "family_visa", label: "Family visa" },
  { value: "cancelled_visa", label: "Visa cancelled" },
  { value: "needs_sponsorship", label: "Needs sponsorship" },
] as const;

export const SKILL_FILTERS = [
  { value: "driving", label: "Drive" },
  { value: "cooking", label: "Cook" },
  { value: "housekeeping", label: "Housekeep" },
  { value: "first_aid", label: "First aid" },
] as const;

export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): NannyFilters {
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  const many = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

  const page = Number(one(params.page) ?? 1);

  return {
    emirate: one(params.emirate),
    arrangement: one(params.arrangement),
    employment: one(params.employment),
    childAge: one(params.child_age),
    experience: one(params.experience),
    language: one(params.language),
    salaryMax: one(params.salary_max),
    nationality: one(params.nationality),
    visa: one(params.visa),
    skills: many(params.skills),
    sort: one(params.sort) ?? "relevance",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 200) : 1,
  };
}

/** How many filters are active — drives the count badge on the Filters button. */
export function countActiveFilters(f: NannyFilters): number {
  return (
    [
      f.emirate,
      f.arrangement,
      f.employment,
      f.childAge,
      f.experience,
      f.language,
      f.salaryMax,
      f.nationality,
    ].filter(Boolean).length + (f.skills?.length ?? 0)
  );
}
