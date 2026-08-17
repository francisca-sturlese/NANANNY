import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage/private-assets";
import type { Database } from "@/lib/supabase/types";
import { PAGE_SIZE, VISA_FILTERS, type NannyFilters } from "@/lib/search/options";
import { DISCOVERABLE_STATUSES, isVerified } from "@/lib/nanny/discoverable";

export type { NannyFilters };

type VisaFilterValue = (typeof VISA_FILTERS)[number]["value"];
export { PAGE_SIZE };

/**
 * Nanny search.
 *
 * Runs through the caller's own Supabase client, so RLS is what decides which
 * rows come back: an anonymous visitor sees approved profiles with a narrow set
 * of columns, a signed-in user sees the full approved row. The query below adds
 * the product's filters on top of that — it never widens what the database
 * already allows.
 */

export type NannyCardData = {
  id: string;
  firstName: string | null;
  headline: string | null;
  emirate: string | null;
  nationality: string | null;
  /** Self declared by the nanny. Never a verification. */
  visaStatus: Database["public"]["Enums"]["visa_status"];
  /** Whether a person has reviewed this profile yet. */
  verified: boolean;
  yearsExperience: number;
  uaeExperienceYears: number;
  arrangement: Database["public"]["Enums"]["care_arrangement"];
  employmentTypes: Database["public"]["Enums"]["employment_type"][];
  availableFrom: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  languages: string[];
  englishLevel: string;
  newborn: boolean;
  toddler: boolean;
  schoolAge: boolean;
  specialNeeds: boolean;
  driving: boolean;
  cooking: boolean;
  housekeeping: boolean;
  firstAid: boolean;
  photoUrl: string | null;
  badges: string[];
};

/** Columns an anonymous visitor is granted. Asking for more returns a 403. */
const PUBLIC_COLUMNS = [
  "id",
  "first_name",
  "headline",
  "emirate",
  "nationality",
  "visa_status",
  "status",
  "years_experience",
  "uae_experience_years",
  "arrangement",
  "employment_types",
  "available_from",
  "salary_expectation_min_aed",
  "salary_expectation_max_aed",
  "languages",
  "english_level",
  "newborn_experience",
  "toddler_experience",
  "school_age_experience",
  "special_needs_experience",
  "has_driving_licence",
  "can_cook",
  "can_housekeep",
  "first_aid_certified",
  "photo_url",
  "created_at",
].join(", ");

/** Mirrors PUBLIC_COLUMNS above — keep the two in step. */
type SearchRow = {
  id: string;
  first_name: string | null;
  headline: string | null;
  emirate: string | null;
  nationality: string | null;
  visa_status: Database["public"]["Enums"]["visa_status"];
  status: string;
  years_experience: number;
  uae_experience_years: number;
  arrangement: Database["public"]["Enums"]["care_arrangement"];
  employment_types: Database["public"]["Enums"]["employment_type"][];
  available_from: string | null;
  salary_expectation_min_aed: number | null;
  salary_expectation_max_aed: number | null;
  languages: string[];
  english_level: string;
  newborn_experience: boolean;
  toddler_experience: boolean;
  school_age_experience: boolean;
  special_needs_experience: boolean;
  has_driving_licence: boolean;
  can_cook: boolean;
  can_housekeep: boolean;
  first_aid_certified: boolean;
  photo_url: string | null;
  created_at: string;
};

export async function searchNannies(filters: NannyFilters): Promise<{
  results: NannyCardData[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const supabase = await createServerSupabase();
  const page = filters.page ?? 1;
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("nanny_profiles")
    .select(PUBLIC_COLUMNS, { count: "exact" })
    .in("status", DISCOVERABLE_STATUSES);

  if (filters.emirate) query = query.eq("emirate", filters.emirate);
  if (filters.nationality) query = query.eq("nationality", filters.nationality);
  // Checked against the vocabulary rather than passed through: this comes
  // straight from a query string, and an unknown value should return the
  // unfiltered list rather than an error.
  if (filters.visa && VISA_FILTERS.some((v) => v.value === filters.visa)) {
    query = query.eq("visa_status", filters.visa as VisaFilterValue);
  }

  // "Live out" should also surface nannies open to either — excluding them
  // would hide willing candidates for no reason.
  if (filters.arrangement === "live_in" || filters.arrangement === "live_out") {
    query = query.in("arrangement", [filters.arrangement, "either"]);
  }

  if (filters.employment) {
    query = query.contains("employment_types", [filters.employment]);
  }

  if (filters.language) {
    query = query.contains("languages", [filters.language]);
  }

  if (filters.experience) {
    const years = Number(filters.experience);
    if (Number.isFinite(years)) query = query.gte("years_experience", years);
  }

  // A family's budget is a ceiling: show anyone whose minimum fits inside it.
  if (filters.salaryMax) {
    const max = Number(filters.salaryMax);
    if (Number.isFinite(max)) query = query.lte("salary_expectation_min_aed", max);
  }

  const ageColumn: Record<string, string> = {
    newborn: "newborn_experience",
    toddler: "toddler_experience",
    school_age: "school_age_experience",
    special_needs: "special_needs_experience",
  };
  if (filters.childAge && ageColumn[filters.childAge]) {
    query = query.eq(ageColumn[filters.childAge], true);
  }

  const skillColumn: Record<string, string> = {
    driving: "has_driving_licence",
    cooking: "can_cook",
    housekeeping: "can_housekeep",
    first_aid: "first_aid_certified",
  };
  for (const skill of filters.skills ?? []) {
    if (skillColumn[skill]) query = query.eq(skillColumn[skill], true);
  }

  // A face outranks a placeholder in every sort, before the sort itself:
  // with half-finished profiles published to fill the window, the top rows
  // must not be a wall of brand marks. `has_photo` is generated in the
  // database from photo_url.
  query = query.order("has_photo", { ascending: false });

  switch (filters.sort) {
    case "experience":
      query = query.order("years_experience", { ascending: false });
      break;
    case "salary_low":
      query = query.order("salary_expectation_min_aed", { ascending: true, nullsFirst: false });
      break;
    case "available":
      query = query.order("available_from", { ascending: true, nullsFirst: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      // "Relevance" without a match model yet: the most complete, most
      // experienced profiles first. Honest ordering rather than a fake score.
      query = query
        .order("years_experience", { ascending: false })
        .order("created_at", { ascending: false });
  }

  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    console.error("[search] nanny query failed:", error.message);
    return { results: [], total: 0, page, pageCount: 0 };
  }

  // `select()` with a column string loses inference, so the shape is declared
  // once here rather than cast at every field below.
  const rows = (data ?? []) as unknown as SearchRow[];
  const ids = rows.map((r) => r.id);

  const [photoMap, badgeMap] = await Promise.all([
    signedUrls(
      "nanny-photos",
      rows.map((r) => r.photo_url),
    ),
    loadBadges(ids),
  ]);

  const results: NannyCardData[] = rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    headline: row.headline,
    emirate: row.emirate,
    nationality: row.nationality,
    visaStatus: row.visa_status ?? "not_said",
    verified: isVerified(row.status),
    yearsExperience: row.years_experience ?? 0,
    uaeExperienceYears: row.uae_experience_years ?? 0,
    arrangement: row.arrangement,
    employmentTypes: row.employment_types ?? [],
    availableFrom: row.available_from,
    salaryMin: row.salary_expectation_min_aed,
    salaryMax: row.salary_expectation_max_aed,
    languages: row.languages ?? [],
    englishLevel: row.english_level ?? "none",
    newborn: row.newborn_experience,
    toddler: row.toddler_experience,
    schoolAge: row.school_age_experience,
    specialNeeds: row.special_needs_experience,
    driving: row.has_driving_licence,
    cooking: row.can_cook,
    housekeeping: row.can_housekeep,
    firstAid: row.first_aid_certified,
    photoUrl: row.photo_url ? (photoMap.get(row.photo_url) ?? null) : null,
    badges: badgeMap.get(row.id) ?? [],
  }));

  const total = count ?? 0;

  return {
    results,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

async function loadBadges(nannyIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (nannyIds.length === 0) return out;

  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("nanny_badges")
    .select("nanny_id, badge")
    .in("nanny_id", nannyIds);

  for (const row of data ?? []) {
    const list = out.get(row.nanny_id) ?? [];
    list.push(row.badge);
    out.set(row.nanny_id, list);
  }
  return out;
}
