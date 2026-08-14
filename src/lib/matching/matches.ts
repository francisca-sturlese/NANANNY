import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage/private-assets";
import type { NannyCardData } from "@/lib/search/nannies";

/**
 * Matches for the signed-in family.
 *
 * The score comes from the database, not from here and not from a model. This
 * module only reads what `refresh_matches()` stored and pairs it with enough of
 * the nanny's profile to draw a card. Nothing about the ranking is decided in
 * TypeScript, so what a family sees and what an admin can audit are the same
 * numbers.
 */

export type MatchedNanny = {
  nanny: NannyCardData;
  score: number;
  reasons: string[];
  conflicts: string[];
  breakdown: Record<string, number>;
  /** Dimensions the family has not answered. Named, never scored as half a fit. */
  unknown: string[];
  computedAt: string;
};

/** The dimensions, in the order a family cares about them. */
export const DIMENSION_LABELS: Record<string, string> = {
  location: "Location",
  availability: "Start date",
  schedule: "Schedule",
  child_age: "Ages",
  experience: "Experience",
  language: "Languages",
  arrangement: "Live in or out",
  salary: "Budget",
  skills: "Skills",
};

const NANNY_COLUMNS = [
  "id",
  "first_name",
  "headline",
  "emirate",
  "nationality",
  "visa_status",
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
].join(", ");

type MatchRow = {
  nanny_id: string;
  score: number;
  reasons: string[] | null;
  conflicts: string[] | null;
  breakdown: Record<string, number> | null;
  unknown_dimensions: string[] | null;
  computed_at: string;
};

/**
 * Recomputes this family's matches, then reads them back.
 *
 * Recomputing on every visit rather than on a schedule: a family that has just
 * changed its budget expects the list to have moved, and a few hundred rows is
 * cheap. If the refresh fails we still show whatever was stored last time,
 * because a stale list beats an empty page.
 */
export async function loadMatches(limit = 30): Promise<{
  matches: MatchedNanny[];
  refreshedAt: string | null;
  savedIds: Set<string>;
}> {
  const supabase = await createServerSupabase();

  // No argument means "mine": the function resolves the family from the
  // caller's session rather than trusting an id sent from the client.
  const { error: refreshError } = await supabase.rpc("refresh_matches", {});
  if (refreshError) {
    console.error("[matching] refresh failed:", refreshError.message);
  }

  const { data: matchRows, error } = await supabase
    .from("matches")
    .select("nanny_id, score, reasons, conflicts, breakdown, unknown_dimensions, computed_at")
    .is("job_id", null)
    .is("dismissed_at", null)
    .order("score", { ascending: false })
    .limit(limit);

  if (error || !matchRows?.length) {
    if (error) console.error("[matching] read failed:", error.message);
    return { matches: [], refreshedAt: null, savedIds: new Set() };
  }

  const rows = matchRows as unknown as MatchRow[];
  const ids = rows.map((r) => r.nanny_id);

  const [{ data: nannies }, badgeMap, savedIds] = await Promise.all([
    supabase.from("nanny_profiles").select(NANNY_COLUMNS).in("id", ids),
    loadBadges(ids),
    loadSaved(ids),
  ]);

  // `select()` with a column string loses inference, so the shape is declared
  // once below rather than cast at every field.
  const nannyRows = (nannies ?? []) as unknown as NannyProfileRow[];
  const photoMap = await signedUrls(
    "nanny-photos",
    nannyRows.map((r) => r.photo_url),
  );

  const byId = new Map<string, NannyCardData>();
  for (const row of nannyRows) {
    byId.set(row.id, {
      id: row.id,
      firstName: row.first_name,
      headline: row.headline,
      emirate: row.emirate,
      nationality: row.nationality,
      visaStatus: row.visa_status ?? "not_said",
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
    });
  }

  const matches: MatchedNanny[] = [];
  for (const row of rows) {
    const nanny = byId.get(row.nanny_id);
    // A stored match whose profile is no longer readable is simply skipped:
    // the refresh above already dropped anyone unapproved.
    if (!nanny) continue;

    matches.push({
      nanny,
      score: Math.round(Number(row.score)),
      reasons: row.reasons ?? [],
      conflicts: row.conflicts ?? [],
      breakdown: row.breakdown ?? {},
      unknown: row.unknown_dimensions ?? [],
      computedAt: row.computed_at,
    });
  }

  return { matches, refreshedAt: rows[0]?.computed_at ?? null, savedIds };
}

type NannyProfileRow = {
  id: string;
  first_name: string | null;
  headline: string | null;
  emirate: string | null;
  nationality: string | null;
  visa_status: NannyCardData["visaStatus"];
  years_experience: number;
  uae_experience_years: number;
  arrangement: NannyCardData["arrangement"];
  employment_types: NannyCardData["employmentTypes"];
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
};

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

async function loadSaved(nannyIds: string[]): Promise<Set<string>> {
  if (nannyIds.length === 0) return new Set();

  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("saved_profiles")
    .select("nanny_id")
    .in("nanny_id", nannyIds);

  return new Set((data ?? []).map((r) => r.nanny_id));
}

/**
 * Whether the family has told us enough for the score to mean anything.
 *
 * With an empty requirements row every dimension falls back to neutral and the
 * ranking is close to arbitrary. Better to say so than to present a confident
 * looking list built on nothing.
 */
export async function requirementsCoverage(): Promise<{
  answered: number;
  total: number;
  missing: string[];
}> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("family_requirements")
    .select(
      "arrangement, working_days, languages, salary_max_aed, required_experience_years, start_date",
    )
    .eq("is_primary", true)
    .maybeSingle();

  const checks: { label: string; answered: boolean }[] = [
    { label: "live in or live out", answered: Boolean(data?.arrangement) },
    { label: "which days", answered: (data?.working_days?.length ?? 0) > 0 },
    { label: "languages", answered: (data?.languages?.length ?? 0) > 0 },
    { label: "budget", answered: data?.salary_max_aed != null },
    { label: "start date", answered: data?.start_date != null },
  ];

  return {
    answered: checks.filter((c) => c.answered).length,
    total: checks.length,
    missing: checks.filter((c) => !c.answered).map((c) => c.label),
  };
}
