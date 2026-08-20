"use client";

import { useState } from "react";
import Image from "next/image";
import { X, ChevronDown } from "lucide-react";
import { Portal } from "@/components/ui/portal";

/**
 * Everything a review needs, without leaving the queue.
 *
 * The first attempt made the name and the photo open new tabs. Federico:
 * "non mi devi aprire un'altra scheda per la review e tantomeno per
 * visualizzare o ingrandire un'immagine". He is right, and it is not a
 * preference. A decision made across three tabs is made from memory, and the
 * queue exists so that looking and deciding happen in the same glance.
 *
 * So the profile unfolds in place and the photo opens over the page. The
 * buttons never move.
 */

export type ReviewProfile = {
  description: string | null;
  visa_status: string | null;
  arrangement: string | null;
  available_from: string | null;
  salary_min: number | null;
  salary_max: number | null;
  languages: string[] | null;
  english_level: string | null;
  uae_years: number | null;
  education: string | null;
  certificates: string[] | null;
  cares_for: string[];
  can: string[];
};

export function ReviewPhoto({ src, name }: { src: string; name: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Enlarge"
        className="shrink-0 rounded-full"
      >
        <Image
          src={src}
          alt=""
          width={56}
          height={56}
          unoptimized
          className="size-14 rounded-full border border-border object-cover transition-opacity hover:opacity-80"
        />
      </button>

      {/* Through the portal, not inline. Every sticky bar in this product uses
          backdrop-blur, and any blurred ancestor becomes the containing block
          for a fixed child, so an inline overlay would be clipped to the row
          it was opened from. */}
      {open && (
        <Portal>
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Photo of ${name}`}
            onClick={() => setOpen(false)}
          >
            <Image
              src={src}
              alt={`Photo of ${name}`}
              width={1200}
              height={1200}
              unoptimized
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85dvh] w-auto max-w-full rounded-lg object-contain"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-4 right-4 grid size-11 place-items-center rounded-pill bg-black/60 text-white"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </Portal>
      )}
    </>
  );
}

/**
 * The rest of what she wrote, folded away until it is wanted.
 *
 * Closed by default because the queue is also a list to scan. Open, it is
 * everything the decision rests on: her own words first, since a profile that
 * reads as a copied advert is the commonest reason to reject one.
 */
export function ReviewProfileDetail({ profile }: { profile: ReviewProfile }) {
  const [open, setOpen] = useState(false);

  const facts: [string, string][] = [
    ["Visa", profile.visa_status ?? "not given"],
    ["Live in or out", profile.arrangement ?? "not given"],
    ["Available from", profile.available_from ?? "not given"],
    [
      "Salary",
      profile.salary_min
        ? `AED ${profile.salary_min.toLocaleString("en-AE")}${profile.salary_max ? ` to ${profile.salary_max.toLocaleString("en-AE")}` : ""}`
        : "not given",
    ],
    ["In the UAE", profile.uae_years != null ? `${profile.uae_years} yrs` : "not given"],
    ["Languages", profile.languages?.length ? profile.languages.join(", ") : "not given"],
    ["English", profile.english_level ?? "not given"],
    ["Education", profile.education ?? "not given"],
    ["Ages cared for", profile.cares_for.length ? profile.cares_for.join(", ") : "none listed"],
    ["Can also", profile.can.length ? profile.can.join(", ") : "nothing listed"],
    [
      "Certificates",
      profile.certificates?.length ? profile.certificates.join(", ") : "none listed",
    ],
  ];

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tap-target inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
      >
        {open ? "Hide the full profile" : "Read the full profile"}
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium text-subtle">In her own words</p>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">
            {profile.description?.trim() || "She has not written anything yet."}
          </p>

          <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-border py-1.5">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="text-right text-xs font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
