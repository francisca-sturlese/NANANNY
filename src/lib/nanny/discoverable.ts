/**
 * Which nanny profiles a family can find.
 *
 * A finished profile is visible before anybody has reviewed it. Approval used
 * to mean both "a human looked at this" and "families can see it", which left
 * a nanny who finished at nine in the evening invisible until somebody woke up.
 * Review now decides the badge, not the visibility.
 *
 * Draft is missing on purpose: incomplete, and she has not asked for it to be
 * shown. Rejected and suspended for the obvious reason.
 *
 * The database enforces this in its policies. This list is what the queries ask
 * for, and the two must say the same thing: see `is_discoverable()` in
 * 20260814270000_visible_before_verified.sql.
 */
export const DISCOVERABLE_STATUSES = ["submitted", "under_review", "approved"] as const;

/** Whether a profile has actually been checked by a person. */
export function isVerified(status: string | null | undefined): boolean {
  return status === "approved";
}
