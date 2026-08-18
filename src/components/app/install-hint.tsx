"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * How somebody puts this on their home screen.
 *
 * The two platforms need opposite things, and that asymmetry is the whole
 * component. Android offers the install itself and delivers push whether or not
 * anybody accepts; iOS offers neither, and web push does not work at all until
 * a page is on the home screen. So the people who most need telling are exactly
 * the ones no browser will tell, and on the platform most Dubai families use.
 *
 * On iOS the words were not enough. "Tap the share button, then Add to Home
 * Screen" is accurate and asks somebody to find a small icon they have never
 * looked for, in a bar they ignore, in a second language. Two drawn steps do
 * what a sentence cannot.
 *
 * On Android the browser hands us `beforeinstallprompt`, so there is nothing to
 * explain: one button, the native dialog, done. Catching that event is also the
 * only way to keep it, because the browser fires it once and forgets it.
 *
 * Signed-in areas only, and that placement has been decided three times now.
 * The only honest argument for installing this is notifications, and that
 * argument cannot be made to somebody without an account: it describes
 * something they do not have.
 *
 * Dismissed once, gone for good, and gone once installed. The answer to "no" is
 * not to ask again next week.
 */

const DISMISSED = "nananny.install-hint.dismissed";

/** What the browser hands over, which TypeScript does not know about yet. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallHint({
  /**
   * Whether anything has happened to this person yet.
   *
   * The argument for installing is "this is how we tell you about a message or
   * an application", and it is a promise about the future when nothing has ever
   * arrived. Shown to somebody two screens into signing up it is a product
   * asking for a commitment before it has given a reason; shown the day her
   * first application lands it is describing something she has just felt the
   * absence of.
   *
   * Derived from the notifications the shell has already loaded, so it costs no
   * query. One notification means something happened, which is the whole test.
   */
  afterSomethingHappened = true,
}: {
  afterSomethingHappened?: boolean;
} = {}) {
  const [platform, setPlatform] = useState<"none" | "ios" | "android">("none");
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

    // `standalone` is the iOS way of saying "already on the home screen". The
    // display-mode query covers everything else.
    const installed =
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone) ||
      window.matchMedia("(display-mode: standalone)").matches;

    let refused = false;
    try {
      refused = localStorage.getItem(DISMISSED) === "1";
    } catch {
      // Private browsing refuses localStorage. Better to show it than to crash.
    }

    if (installed || refused || !afterSomethingHappened) return;

    if (isIOS && isSafari) {
      setPlatform("ios");
      return;
    }

    /**
     * Android tells us it is installable, once, and only if it feels like it.
     *
     * The event fires early and is not repeated, so it has to be caught and
     * held rather than asked for later. Preventing the default is what stops
     * Chrome showing its own bar at the bottom, which we replace with a button
     * that appears where somebody is already looking.
     */
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
      setPlatform("android");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [afterSomethingHappened]);

  if (platform === "none") return null;

  function dismiss() {
    setPlatform("none");
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Nothing to do. It reappears next visit, which is the tolerable failure.
    }
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    // A no here is the browser's own dialog, not ours. Asking again through our
    // card afterwards would be arguing with an answer somebody just gave.
    if (outcome === "dismissed") dismiss();
    else setPlatform("none");
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-md border border-border bg-surface px-4 py-3">
      <Share className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Keep NaNanny on your home screen</p>

        {platform === "android" ? (
          <>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              It opens like an app, and it is how we tell you about a message or an
              application without you having to check.
            </p>
            <Button size="sm" className="mt-3" onClick={install}>
              Install the app
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              It opens like an app, and it is how we tell you about a message or an
              application without you having to check. Two steps:
            </p>

            {/* Drawn, not described. The share icon is the thing people cannot
                find: it is small, it is in a bar they ignore, and its name is
                not written next to it. Showing it is the difference between an
                instruction somebody follows and one they abandon. */}
            <ol className="mt-3 space-y-2.5">
              <li className="flex items-center gap-2.5 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-pill bg-foreground text-xs font-semibold text-background">
                  1
                </span>
                <span className="flex items-center gap-1.5">
                  Tap
                  <span className="grid size-7 place-items-center rounded-md border border-border bg-background">
                    <Share className="size-4" aria-hidden />
                  </span>
                  at the bottom of the screen
                </span>
              </li>
              <li className="flex items-center gap-2.5 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-pill bg-foreground text-xs font-semibold text-background">
                  2
                </span>
                <span className="flex items-center gap-1.5">
                  Choose
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs">
                    <SquarePlus className="size-3.5" aria-hidden />
                    Add to Home Screen
                  </span>
                </span>
              </li>
            </ol>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide this"
        className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-pill text-muted"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
