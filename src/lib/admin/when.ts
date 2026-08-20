/**
 * Times in the back office, read in Dubai.
 *
 * Every admin screen formatted dates with `toLocaleString("en-GB")` and no
 * timezone, inside a server component. The formatter then uses the *server's*
 * timezone, and the server is a Cloudflare worker running in UTC, so every
 * timestamp in the back office was four hours behind the person reading it.
 *
 * That is not cosmetic. Federico read a family's message as sent at 09:45 and
 * the email telling the nanny as sent at 13:45, concluded she had been told
 * four hours late, and asked why two nannies had ignored a family. They had
 * been told the same minute. The two numbers came from two different clocks.
 *
 * `lib/promo.ts` already pinned Asia/Dubai for exactly this reason, after a
 * launch window opened seven hours late. This is the same lesson applied to
 * everything an operator reads.
 */

const DUBAI = "Asia/Dubai";

/** Date and time, for a log or a message. */
export function whenExact(value: string | Date | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", { timeZone: DUBAI });
}

/** Date alone, for a list where the hour adds nothing. */
export function whenDay(value: string | Date | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { timeZone: DUBAI });
}
