import "server-only";

import { absoluteUrl } from "@/lib/seo/site";

/**
 * Unsubscribe links that need no database at send time.
 *
 * The link carries the user id and an HMAC of it under CRON_SECRET. Whoever
 * has the link can act on it, which is exactly the property an unsubscribe
 * link in an email must have: the recipient is not signed in, and asking her
 * to log in before she may refuse email is how you get marked as spam
 * instead. The secret never leaves the server, so nobody can mint a link for
 * a user id they guessed.
 *
 * Its own secret, not CRON_SECRET: rotating the scheduler's credential must
 * not invalidate every unsubscribe link already sitting in an inbox. The two
 * have different lifetimes, so they get different keys.
 *
 * Web Crypto rather than node:crypto, because this runs on the worker.
 */

async function hmacHex(value: string): Promise<string | null> {
  const secret = process.env.EMAIL_LINK_SECRET;
  if (!secret) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The full link to put at the bottom of a reminder email. Null when the secret is unset (local builds). */
export async function unsubscribeUrl(userId: string): Promise<string | null> {
  const token = await hmacHex(userId);
  if (!token) return null;
  return absoluteUrl(`/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`);
}

/** Constant-time-ish check of a presented token. */
export async function verifyUnsubscribeToken(userId: string, token: string): Promise<boolean> {
  const expected = await hmacHex(userId);
  if (!expected || expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
