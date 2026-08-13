"use client";

import { useActionState, useOptimistic, startTransition } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { toggleSaveAction, type SaveResult } from "@/lib/shortlist/actions";
import { cn } from "@/lib/utils";

/**
 * Save to shortlist. Free, and it must stay free — this never records a
 * contact.
 *
 * Optimistic: the heart fills on tap rather than after a round trip, because on
 * a phone a 300ms delay reads as "it didn't work" and invites a second tap.
 */
export function SaveButton({
  nannyId,
  saved,
  withLabel = false,
}: {
  nannyId: string;
  saved: boolean;
  withLabel?: boolean;
}) {
  const [state, action] = useActionState<SaveResult, FormData>(toggleSaveAction, {});
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(
    state.saved ?? saved,
    (_current: boolean, next: boolean) => next,
  );

  if (state.needsAuth) {
    return (
      <Link
        href="/signup"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-background/90 px-3 text-xs font-medium shadow-card backdrop-blur"
      >
        <Heart className="size-4" aria-hidden />
        Sign up to save
      </Link>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(() => setOptimisticSaved(!optimisticSaved));
        action(formData);
      }}
    >
      <input type="hidden" name="nannyId" value={nannyId} />
      <button
        type="submit"
        aria-pressed={optimisticSaved}
        aria-label={optimisticSaved ? "Remove from saved" : "Save this profile"}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border bg-background/90 backdrop-blur transition-colors",
          withLabel ? "px-4 text-sm font-medium" : "size-11",
          optimisticSaved
            ? "border-peach-deep/30 text-peach-deep"
            : "border-border text-muted hover:text-foreground",
        )}
      >
        <Heart
          className="size-[1.15rem] shrink-0"
          fill={optimisticSaved ? "currentColor" : "none"}
          strokeWidth={1.8}
          aria-hidden
        />
        {withLabel && (optimisticSaved ? "Saved" : "Save")}
      </button>
    </form>
  );
}
