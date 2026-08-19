import "server-only";

import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Attaches a pending invitation to the family who is now signed in.
 *
 * Called on the family dashboard, which every family reaches, rather than
 * anywhere in the signup path: at signup there is no family row yet, and a
 * mechanism that has to run at exactly one moment is a mechanism that misses
 * the family who confirmed their email on a different device.
 *
 * Safe to call on every load. The database refuses a second claim by primary
 * key, so this is at worst one cheap statement, and the cookie is cleared
 * whatever the answer: a code that does not resolve is a mistyped link, not
 * something to retry for thirty days.
 */
export async function claimPendingReferral(): Promise<void> {
  const jar = await cookies();
  const code = jar.get("nananny.ref")?.value;
  if (!code) return;

  try {
    const supabase = await createServerSupabase();
    await supabase.rpc("claim_referral", { p_code: code });
  } catch {
    // An invitation is a courtesy, not a dependency. Nobody's dashboard fails
    // to render because we could not record who told them about us.
  } finally {
    jar.delete("nananny.ref");
  }
}
