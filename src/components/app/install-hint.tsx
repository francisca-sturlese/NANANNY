"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

/**
 * How somebody puts this on their home screen, said once, on iPhone only.
 *
 * Android does this itself: the browser offers the install, and notifications
 * work whether or not anybody accepts. iOS does neither. There is no prompt to
 * trigger, the only route is Share then Add to Home Screen, and until somebody
 * has walked it, web push does not work at all. So the people who would most
 * benefit from being told are exactly the ones nobody can tell automatically.
 *
 * Which makes this a real trade rather than a nag: on the platform most Dubai
 * families use, a person who never finds this menu never gets notified that a
 * nanny applied, and finds out days later or not at all.
 *
 * Shown everywhere on iOS, including to somebody who has not signed up, which
 * was Federico's call and reverses how this shipped. The reason it was scoped
 * to signed-in pages was that the only honest argument for installing is one
 * you cannot make to a stranger: notifications, which on iOS do not work until
 * this is on the home screen. So the argument changes with the reader rather
 * than the placement, and a visitor is told the plain truth instead, that it
 * opens without a browser bar.
 *
 * Dismissed once, gone for good, and gone if it is already installed. The
 * answer to "no" is not to ask again next week.
 */

const DISMISSED = "nananny.install-hint.dismissed";

export function InstallHint({
  /**
   * Whether the reader has an account.
   *
   * The reason to install differs, and the wrong one is worse than none. To
   * somebody signed in, the honest reason is notifications: on iOS web push
   * does not work until this is on the home screen, so a family that skips it
   * never hears that a nanny applied. To somebody who has not signed up, that
   * sentence describes a thing they do not have, which reads as a product
   * talking to itself.
   */
  signedIn = false,
}: {
  signedIn?: boolean;
} = {}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Rendered only when all of these hold, so it is decided here rather than
    // in a media query: iOS, Safari, not already installed, not refused before.
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

    setShow(isIOS && isSafari && !installed && !refused);
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Nothing to do. It reappears next visit, which is the tolerable failure.
    }
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-md border border-border bg-surface px-4 py-3">
      <Share className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Keep NaNanny on your home screen</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Tap the share button at the bottom of Safari, then Add to Home Screen.
          {signedIn
            ? " It opens like an app, and it is how we can tell you about a new application without you having to check."
            : " It opens like an app, without the browser bar in the way."}
        </p>
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
