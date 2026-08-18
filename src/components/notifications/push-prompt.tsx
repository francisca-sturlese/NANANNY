"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canAskForPush,
  pushAlreadyOn,
  pushRefused,
  subscribeToPush,
} from "@/lib/notifications/subscribe";

/**
 * Asking to send notifications, at the one moment it is a fair question.
 *
 * The bell only rings for somebody already looking at the page, which is the
 * gap this closes: a nanny replied at half past one and the family found out
 * the next day. What makes this worth asking for is that the answer to "has
 * anybody written to me" stops requiring her to come and check.
 *
 * Everything here is about not burning the one chance. A browser prompts once;
 * a refusal is permanent and cannot be undone from inside the product, so the
 * prompt is never fired on page load and never without a tap. What she sees
 * first is our own card, in our words, saying what it is for. The system dialog
 * only appears after she has said yes to that.
 *
 * On iOS none of it exists until the site is on the home screen, so the card
 * simply does not render in Safari and the install hint speaks instead. Two
 * asks stacked on one screen is how both get dismissed.
 */

const DISMISSED = "nananny.push-prompt.dismissed";

export function PushPrompt({
  /**
   * Optional, and read from the environment when it is not passed.
   *
   * `NEXT_PUBLIC_` variables are inlined at build time, so a client component
   * can read this directly and the component can be dropped anywhere with no
   * argument. That matters because it belongs in more than one shell: the
   * founder reads the site from his phone signed in as an administrator, and a
   * component that only works where somebody remembered to thread a prop
   * through is a component that is missing from the third place.
   */
  publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
}: {
  publicKey?: string;
} = {}) {
  const [state, setState] = useState<"hidden" | "asking" | "working" | "on" | "failed">(
    "hidden",
  );

  useEffect(() => {
    if (!publicKey || !canAskForPush()) return;
    if (pushAlreadyOn() || pushRefused()) return;

    try {
      if (localStorage.getItem(DISMISSED) === "1") return;
    } catch {
      // Private browsing refuses localStorage. Better to ask than to crash.
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- push support detection can only run client-side after mount; one synchronous set, verified on real phones
    setState("asking");
  }, [publicKey]);

  if (state === "hidden") return null;

  async function turnOn() {
    setState("working");
    const result = await subscribeToPush(publicKey);
    setState(result.ok ? "on" : "failed");
  }

  function dismiss() {
    setState("hidden");
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // It comes back next visit, which is the tolerable failure.
    }
  }

  if (state === "on") {
    return (
      <div className="mb-4 rounded-md border border-sage bg-sage-wash px-4 py-3">
        <p className="text-sm leading-relaxed text-sage-deep">
          Notifications are on. We will tell you when somebody writes to you or
          applies, and nothing else.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-md border border-border bg-surface px-4 py-3">
      <Bell className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Know when somebody writes to you</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {state === "failed"
            ? "Your phone did not allow it. You can turn notifications on for NaNanny in your phone settings, and everything still works without them."
            : "We will tell you about a message or an application, and nothing else. No news, no offers."}
        </p>
        {state !== "failed" && (
          <Button
            size="sm"
            className="mt-3"
            onClick={turnOn}
            disabled={state === "working"}
          >
            {state === "working" ? "Just a moment" : "Turn on notifications"}
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-pill text-muted"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
