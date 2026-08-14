import "server-only";

import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import type { NotificationRow } from "@/lib/notifications/copy";

export type NotificationFeed = { unread: number; items: NotificationRow[] };

const EMPTY: NotificationFeed = { unread: 0, items: [] };

/**
 * The bell's first paint, rendered on the server.
 *
 * One database function returns the count and the list together, on purpose:
 * two queries drift, the badge says three, the panel shows two, and nobody can
 * reproduce it. The client subscription adds to this afterwards, it does not
 * fetch it again.
 *
 * Cached per render, because the shell renders it and a page might want it too.
 */
export const getNotifications = cache(async (limit = 15): Promise<NotificationFeed> => {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("my_notifications", { p_limit: limit });

  // The bell is not worth a failed page. A signed-out or expired session
  // returns nothing here rather than throwing out of the shell.
  if (error || !data || typeof data !== "object") return EMPTY;

  const feed = data as { unread?: number; items?: NotificationRow[] };

  return {
    unread: typeof feed.unread === "number" ? feed.unread : 0,
    items: Array.isArray(feed.items) ? feed.items : [],
  };
});
