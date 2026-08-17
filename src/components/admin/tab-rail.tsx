"use client";

import { useEffect, useRef } from "react";

/**
 * The scrolling tab rail's one piece of behaviour: bring the active tab into
 * view when the page opens.
 *
 * Eleven sections on a phone means most of the rail is off-screen, and the
 * browser always opens it scrolled to the start — so being on, say, Jobs
 * showed a rail whose highlighted pill was invisible and whose left edge cut
 * a tab in half, which reads as broken rather than scrollable. Centring the
 * current pill both shows where you are and, by revealing half a neighbour
 * on each side, shows that the rail moves.
 */
export function TabRail({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const current = ref.current?.querySelector('[aria-current="page"]');
    current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  return (
    <nav ref={ref} className={className} aria-label={label}>
      {children}
    </nav>
  );
}
