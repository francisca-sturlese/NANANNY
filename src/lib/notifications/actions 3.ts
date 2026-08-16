"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/dal";

/**
 * Marks everything read.
 *
 * No id is passed and none is accepted. `mark_notifications_read()` takes the
 * user from `auth.uid()` inside the database, so the worst this endpoint can do
 * for a caller is mark their own notifications read. That is the whole reason
 * it is a function rather than an update: an update would need the row ids to
 * come from somewhere, and the somewhere is a request.
 *
 * Nothing is revalidated. The panel already shows the rows it just marked, and
 * revalidating the page underneath it would rerender it while somebody is
 * reading.
 */
export async function markNotificationsReadAction(): Promise<{ read: number }> {
  const user = await getSession();
  if (!user) return { read: 0 };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("mark_notifications_read");

  if (error) return { read: 0 };
  return { read: typeof data === "number" ? data : 0 };
}
