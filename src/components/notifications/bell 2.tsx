"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Portal, useScrollLock } from "@/components/ui/portal";
import { markNotificationsReadAction } from "@/lib/notifications/actions";
import { describe, timeAgo, type NotificationRow } from "@/lib/notifications/copy";
import { cn } from "@/lib/utils";

/**
 * The bell.
 *
 * Rendered with what the server already fetched, so the count is right on the
 * first paint rather than appearing a moment later. After that it stays right
 * three ways, in descending order of how much they can be trusted:
 *
 * A realtime subscription, which is the one that makes a message arriving feel
 * live. It is also the one most likely to be missing: a corporate network, a
 * hotel wifi or a strict extension can block the websocket, and the failure is
 * silent by design.
 *
 * So, a refetch whenever the tab is looked at again. This covers the blocked
 * websocket, the phone that was asleep, and the laptop lid that was shut, and
 * it costs one query at the moment somebody is already waiting for the page.
 *
 * And a refetch when the panel is opened, because that is the one moment the
 * number is being read closely.
 *
 * Reads run through the browser client under RLS, which is what the anon key is
 * for. The one write, marking them read, goes to a server action instead, so
 * nothing holding the anon key can write a row here at all.
 */
export function NotificationBell({
  userId,
  initialUnread,
  initialItems,
}: {
  userId: string;
  initialUnread: number;
  initialItems: NotificationRow[];
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationRow[]>(initialItems);
  const panelRef = useRef<HTMLDivElement>(null);

  useScrollLock(open);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("my_notifications", { p_limit: 15 });
    if (error || !data || typeof data !== "object") return;

    const feed = data as { unread?: number; items?: NotificationRow[] };
    if (typeof feed.unread === "number") setUnread(feed.unread);
    if (Array.isArray(feed.items)) setItems(feed.items);
  }, []);

  // Live, when the connection allows it.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      /**
       * The socket carries its own credentials and does not read the cookie.
       * Without this the subscription connects, subscribes, and receives
       * nothing at all: row level security applies to the stream too, and an
       * unauthenticated stream matches none of somebody's rows. It looks
       * exactly like "no notifications yet".
       */
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }

      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            // Belt and braces. RLS already limits the stream to this user's
            // rows; the filter keeps the other rows off the wire.
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as NotificationRow;
            setItems((current) =>
              current.some((item) => item.id === row.id) ? current : [row, ...current].slice(0, 15),
            );
            setUnread((count) => count + 1);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  // Whenever the tab is looked at again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  // Escape closes it, like every other sheet here.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function openPanel() {
    setOpen(true);
    await refresh();

    /**
     * Read on opening, and the badge clears immediately rather than after the
     * round trip. The rows keep their unread mark in the list for this one
     * viewing, so what is new is still visible while it is being read.
     */
    if (unread > 0) {
      setUnread(0);
      void markNotificationsReadAction();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void openPanel())}
        aria-expanded={open}
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : "Notifications"
        }
        className="relative grid size-11 place-items-center rounded-pill text-foreground transition-colors hover:bg-surface"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 grid min-w-[1.125rem] place-items-center rounded-pill bg-foreground px-1 text-[0.625rem] leading-[1.125rem] font-semibold text-background"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <Portal>
          {/* Portalled for the usual reason: the header has backdrop-blur, so
              a fixed child of it is anchored to the header rather than to the
              viewport and the panel gets clipped to a 56px strip. */}
          <div
            className="fixed inset-0 z-50"
            role="dialog"
            aria-label="Notifications"
            aria-modal="true"
          >
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
              className="absolute inset-0 h-full w-full cursor-default bg-foreground/20"
            />

            <div
              ref={panelRef}
              className={cn(
                "absolute inset-x-0 top-0 flex max-h-dvh flex-col bg-background shadow-lg",
                // On a phone it is a sheet from the top. On a desktop it hangs
                // under the bell it was opened from.
                "sm:inset-x-auto sm:top-3 sm:right-4 sm:max-h-[80dvh] sm:w-96 sm:rounded-lg sm:border sm:border-border",
              )}
            >
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                <h2 className="font-semibold">Notifications</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="grid size-11 place-items-center rounded-pill text-muted"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>

              {items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">
                  Nothing yet. Messages, applications and profile updates show up here.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-y-auto">
                  {items.map((item) => {
                    const { text, href } = describe(item);
                    return (
                      <li key={item.id}>
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex min-h-14 items-start gap-3 px-4 py-3 transition-colors hover:bg-surface",
                            !item.read_at && "bg-butter-wash",
                          )}
                        >
                          <span className="flex-1 text-sm">
                            {text}
                            <span className="mt-0.5 block text-xs text-muted">
                              {timeAgo(item.created_at)}
                            </span>
                          </span>
                          {!item.read_at && (
                            <span
                              aria-hidden
                              className="mt-1.5 size-2 shrink-0 rounded-pill bg-foreground"
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
