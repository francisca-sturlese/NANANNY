"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One tap to hand a link to somebody: native share sheet on a phone,
 * clipboard everywhere else. The generic half of what the nanny's
 * "Share my profile" button does; the words come from the call site,
 * because what a share is FOR differs per surface.
 */
export function ShareLink({
  url,
  text,
  label,
  size = "sm",
}: {
  url: string;
  /** The sentence pasted alongside the link. */
  text: string;
  label: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch {
        // Cancelled or unsupported mid-flight: the clipboard still works.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard refused: nothing sensible left to do.
    }
  }

  return (
    <Button size={size} variant="outline" onClick={share}>
      {copied ? (
        <>
          <Check className="mr-1.5 size-4" aria-hidden /> Link copied
        </>
      ) : (
        <>
          <Share2 className="mr-1.5 size-4" aria-hidden /> {label}
        </>
      )}
    </Button>
  );
}
