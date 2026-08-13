import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role client: bypasses RLS entirely.
 *
 * Only three things are allowed to use it — verified payment webhooks, the
 * email pipeline, and admin operations that have already checked the caller's
 * role themselves. `server-only` makes importing it from a client component a
 * build error rather than a leaked key (PRD §60).
 *
 * Never pass a user-supplied id into a query here without re-checking
 * ownership: RLS is not there to catch the mistake.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — refusing to fall back to the anon key.",
    );
  }

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
