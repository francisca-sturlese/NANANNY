"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

/**
 * The invite card a family sees on its dashboard.
 *
 * One tap on a phone, which is where this is used: the native share sheet if
 * the browser has one, and a copy button everywhere else. No text to select by
 * hand, because selecting a URL on a phone is the step where somebody gives up
 * and the invitation never gets sent.
 *
 * The message is written out rather than left to the share sheet, so what
 * arrives in WhatsApp says what the link is for. A bare URL in a chat is
 * indistinguishable from spam, and this one is going to somebody's friends.
 */
export function InviteCard({
  code,
  url,
  reward,
  qualified,
  bonus,
  max,
}: {
  code: string;
  url: string;
  reward: number;
  qualified: number;
  bonus: number;
  max: number;
}) {
  const [copied, setCopied] = useState(false);

  const message = `I am using NaNanny to find a nanny in the UAE. Families post what they need and talk to nannies directly, no agency. If you sign up with my link we both get an extra free contact: ${url}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "NaNanny", text: message, url });
        return;
      } catch {
        // Dismissed, or refused by the browser. Fall through to copying, which
        // always works and never leaves the button doing nothing.
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard refused, usually an insecure context. The code is on screen
      // and can still be typed, which is why it is short and readable.
    }
  }

  const atCeiling = bonus >= max;

  return (
    <Card>
      <CardBody>
        <h2 className="text-base font-semibold">Invite another family</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {atCeiling
            ? "You have earned every extra contact this offer gives. Thank you for the introductions."
            : `When a family you invite finishes setting up, you both get ${reward} extra free ${
                reward === 1 ? "contact" : "contacts"
              }.`}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-lg tracking-[0.2em]">
            {code}
          </span>
          <Button onClick={share} size="sm">
            {copied ? (
              <>
                <Check className="size-4" aria-hidden /> Copied
              </>
            ) : (
              <>
                <Share2 className="size-4" aria-hidden /> Share your link
              </>
            )}
          </Button>
        </div>

        {qualified > 0 && (
          <p className="mt-3 text-sm text-muted">
            {qualified} {qualified === 1 ? "family has" : "families have"} joined through
            you. That is {bonus} extra {bonus === 1 ? "contact" : "contacts"}.
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-subtle">
          The extra contacts arrive once they have finished setting up their
          account, not when they sign up.
        </p>
      </CardBody>
    </Card>
  );
}

/**
 * The nanny's version. No reward, by decision.
 *
 * A nanny pays for nothing here, so a free contact would buy her nothing, and
 * inventing a different prize would mean inventing a cost. What she does get is
 * the same one tap way to send the site to somebody who is looking for work,
 * which is how most of this side of the marketplace has arrived so far.
 */
export function ShareCard({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const message = `I found work through NaNanny. Families in the UAE post jobs and message you directly, and it is free for nannies: ${url}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "NaNanny", text: message, url });
        return;
      } catch {
        // Fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Nothing to do, and nothing broken.
    }
  }

  return (
    <Card>
      <CardBody>
        <h2 className="text-base font-semibold">Know somebody looking for work?</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Send them NaNanny. It is free for nannies, and the families here are
          looking right now.
        </p>
        <Button onClick={share} size="sm" variant="outline" className="mt-4">
          {copied ? (
            <>
              <Check className="size-4" aria-hidden /> Copied
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden /> Share NaNanny
            </>
          )}
        </Button>
      </CardBody>
    </Card>
  );
}
