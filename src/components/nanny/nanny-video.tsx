"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/**
 * Video introduction — loaded only when asked for.
 *
 * `preload="none"` and no `<video>` at all until the play button is tapped:
 * a nanny's introduction can be tens of megabytes, and a phone on mobile data
 * must never spend that just because the visitor scrolled past.
 */
export function NannyVideo({ src, posterAlt }: { src: string; posterAlt: string }) {
  const [playing, setPlaying] = useState(false);

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-sage-wash"
      >
        <span className="grid size-16 place-items-center rounded-full bg-background/90 shadow-card transition-transform group-hover:scale-105">
          <Play className="size-6 translate-x-0.5 fill-current" aria-hidden />
        </span>
        <span className="absolute bottom-3 left-3 rounded-pill bg-background/85 px-3 py-1 text-xs font-medium backdrop-blur">
          Watch {posterAlt}&apos;s introduction
        </span>
      </button>
    );
  }

  return (
    <video
      src={src}
      controls
      autoPlay
      playsInline
      preload="none"
      className="aspect-video w-full rounded-lg bg-black"
    >
      Your browser cannot play this video.
    </video>
  );
}
