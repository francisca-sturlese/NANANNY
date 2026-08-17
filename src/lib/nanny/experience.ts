/**
 * How years of experience are said out loud.
 *
 * Zero is now an allowed answer: the rule used to require more than zero, and
 * that turned a nanny who had never been paid for this into somebody the
 * product refused to show. Federico's call, and the right one, because a family
 * reading a profile is better placed to judge than a threshold is.
 *
 * But allowing zero and printing "0 yrs" are different things. On a card among
 * a dozen others, a zero reads as an error or as a warning, and the effect of
 * publishing somebody nobody will click is the same as not publishing her. It
 * hides nothing to say it in words: a family still learns she has not done this
 * for pay before, and learns it in a form that invites a look rather than a
 * flinch.
 *
 * Short and long, because a card has room for two words and a profile has room
 * for a sentence.
 */

export function experienceShort(years: number | null | undefined): string {
  const value = years ?? 0;
  if (value <= 0) return "New to this";
  return `${value} yr${value === 1 ? "" : "s"}`;
}

export function experienceLong(years: number | null | undefined): string {
  const value = years ?? 0;
  if (value <= 0) return "New to professional childcare";
  return `${value} year${value === 1 ? "" : "s"} of experience`;
}

/**
 * For a sentence somebody else is building, like a share preview.
 *
 * Returns null when there is nothing worth claiming, so the caller can leave
 * the clause out rather than print an awkward zero inside a longer sentence.
 */
export function experienceClause(years: number | null | undefined): string | null {
  const value = years ?? 0;
  if (value <= 0) return null;
  return `${value} year${value === 1 ? "" : "s"} of childcare experience`;
}
