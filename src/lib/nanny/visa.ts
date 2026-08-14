/**
 * Visa status, in one place.
 *
 * No `server-only`: the filter sheet and the onboarding form are both client
 * components, and this has to be readable from either side.
 *
 * The wording is doing real work. "Needs sponsorship" is a fact about paperwork,
 * not a warning, and a nanny reading her own profile should not find a label
 * that makes her look like a problem. Each one says what it is and, where it
 * helps a family, what it means for them.
 */

export const VISA_STATUSES = [
  {
    value: "own_visa",
    label: "Own visa",
    forFamilies: "Holds her own residence visa. Nothing for you to sponsor.",
    forNannies: "I hold my own residence visa.",
  },
  {
    value: "family_visa",
    label: "Family visa",
    forFamilies: "On a husband's or family visa. Nothing for you to sponsor.",
    forNannies: "I am on my husband's or my family's visa.",
  },
  {
    value: "cancelled_visa",
    label: "Visa cancelled",
    forFamilies: "Between jobs. Ask her about timing when you speak.",
    forNannies: "My visa is cancelled or ending, and I am looking for my next role.",
  },
  {
    value: "needs_sponsorship",
    label: "Needs sponsorship",
    forFamilies: "Would need you to sponsor her visa.",
    forNannies: "I would need the family to sponsor my visa.",
  },
] as const;

export type VisaStatus = (typeof VISA_STATUSES)[number]["value"] | "not_said";

const BY_VALUE = new Map(VISA_STATUSES.map((v) => [v.value, v]));

export function visaLabel(status: string | null | undefined): string | null {
  if (!status || status === "not_said") return null;
  return BY_VALUE.get(status as never)?.label ?? null;
}

export function visaNote(status: string | null | undefined): string | null {
  if (!status || status === "not_said") return null;
  return BY_VALUE.get(status as never)?.forFamilies ?? null;
}

/**
 * A visa status is never a verification badge, so it never gets a badge's
 * colours. Sage and peach are what this codebase uses for "we checked this",
 * and borrowing them here would say something untrue.
 */
export const VISA_BADGE_VARIANT = "neutral" as const;
