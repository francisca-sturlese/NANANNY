"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into <body>.
 *
 * Needed because `position: fixed` is not always relative to the viewport: any
 * ancestor with `backdrop-filter`, `filter`, `transform`, `perspective` or
 * `contain` becomes the containing block instead. Our sticky headers and
 * filter bars all use `backdrop-blur`, so a sheet rendered inside one was
 * anchored to that bar — the overlay covered a strip of the page and the panel
 * was clipped to a few hundred pixels.
 *
 * Portalling to <body> puts the sheet outside every such ancestor, so `inset-0`
 * means the viewport again.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // There is no document during server rendering, and portalling on the first
  // client render would mismatch the server HTML.
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

/**
 * Locks background scrolling while a sheet is open. Without it, scrolling
 * inside the sheet on a phone hands the gesture to the page underneath as soon
 * as the sheet's own list reaches its end.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
