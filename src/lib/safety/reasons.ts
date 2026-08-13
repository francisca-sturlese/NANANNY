/**
 * Report reasons.
 *
 * In its own module because a `"use server"` file may only export async
 * functions. Exporting this array from the actions file broke the whole server
 * action graph at runtime: every action in the app failed with
 * `A "use server" file can only export async functions, found object`, which
 * surfaced as the contact flow silently doing nothing.
 */
export const REPORT_REASONS = [
  "Not who they say they are",
  "Inappropriate messages",
  "Asking for money",
  "Offensive or discriminatory",
  "Spam or advertising",
  "Something else",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
