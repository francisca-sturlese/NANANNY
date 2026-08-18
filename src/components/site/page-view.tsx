"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Tells the server that somebody looked at this page.
 *
 * Deliberately the smallest thing that answers the question. Twenty five people
 * signed up on the day of the founder's outreach and none since, and there has
 * been no way to tell whether a thousand people saw the site that day or twenty
 * six. Those two need opposite work.
 *
 * `sendBeacon` rather than `fetch`, because a page view is most interesting on
 * the page somebody leaves from, and a fetch started during a navigation is
 * cancelled with it. The browser queues a beacon and delivers it afterwards.
 *
 * Fires on the path, so a client-side navigation counts as a view. Prefetches
 * do not run effects, so a link the browser warmed up on its own is not
 * mistaken for a person.
 *
 * Failure is silence by design. Nothing on the page depends on this, and a
 * visitor is never shown an error because a counter did not increment.
 */
export function PageView() {
  const pathname = usePathname();

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as { standalone?: boolean }).standalone === true);
    const body = JSON.stringify({ path: pathname, standalone });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/v", new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch("/api/v", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    } catch {
      // A blocked request, a disabled API, a private mode with odd rules. None
      // of it is the visitor's problem.
    }
  }, [pathname]);

  return null;
}
