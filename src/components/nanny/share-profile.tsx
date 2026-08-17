"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A nanny's profile is her business card; this makes handing it over one tap.
 *
 * The families she meets in WhatsApp threads and Facebook groups ask the same
 * question every time, and "my profile with my photo and badges is here" is a
 * better answer than typing her story again. On a phone the native share sheet
 * opens straight into WhatsApp; anywhere else the link lands on the clipboard.
 * Marketing that costs the platform nothing and gives her something first.
 */
export function ShareProfile({ url, name }: { url: string; name?: string | null }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const text = `${name ? `I'm ${name}, a` : "I'm a"} nanny on NaNanny. My profile, with my photo and reviewed badges, is here:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My NaNanny profile", text, url });
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
      // Clipboard refused (very old browser): nothing sensible left to do.
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={share}>
      {copied ? (
        <>
          <Check className="mr-1.5 size-4" aria-hidden /> Link copied
        </>
      ) : (
        <>
          <Share2 className="mr-1.5 size-4" aria-hidden /> Share my profile
        </>
      )}
    </Button>
  );
}
