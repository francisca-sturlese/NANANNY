"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { moveShortlistStageAction, type SaveResult } from "@/lib/shortlist/actions";
import { SaveButton } from "@/components/nanny/save-button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/field";

const STAGES = [
  { value: "interested", label: "Interested" },
  { value: "interview", label: "Interview" },
  { value: "finalists", label: "Finalists" },
  { value: "hired", label: "Hired" },
];

/**
 * A saved nanny, with her stage changeable in one tap.
 *
 * The stage select submits on change — no separate Save button to hunt for,
 * which on a phone is one interaction instead of two.
 */
export function ShortlistCard({
  nannyId,
  firstName,
  headline,
  emirate,
  yearsExperience,
  salaryMin,
  photoUrl,
  stage,
  stillListed,
}: {
  nannyId: string;
  firstName: string | null;
  headline: string | null;
  emirate: string | null;
  yearsExperience: number;
  salaryMin: number | null;
  photoUrl: string | null;
  stage: string;
  stillListed: boolean;
}) {
  const [state, action] = useActionState<SaveResult, FormData>(moveShortlistStageAction, {});
  // Controlled, and the choice sticks. `defaultValue` left the select showing
  // the old stage after saving, and useOptimistic reverted to the stale prop
  // once the action settled — both meant the screen disagreed with the database.
  // React's documented "adjust state when a prop changes" pattern instead: keep
  // what the user picked until the server genuinely sends something different.
  const [shownStage, setShownStage] = useState(stage);
  const [lastServerStage, setLastServerStage] = useState(stage);
  if (stage !== lastServerStage) {
    setLastServerStage(stage);
    setShownStage(stage);
  }

  // revalidatePath() alone left this card re-rendering from the router cache
  // with the pre-save stage, so the screen briefly contradicted the database.
  // Refreshing once the action resolves pulls the real row.
  const router = useRouter();
  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state, router]);

  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex gap-3.5">
        <Link href={`/nannies/${nannyId}`} className="shrink-0">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              loading="lazy"
              width={64}
              height={64}
              className="size-16 rounded-md object-cover"
            />
          ) : (
            <span className="grid size-16 place-items-center rounded-md bg-sage-wash text-sage-deep">
              {firstName?.[0] ?? "N"}
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={`/nannies/${nannyId}`} className="block">
            <h3 className="truncate font-semibold">{firstName ?? "Nanny"}</h3>
            {headline && (
              <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted">{headline}</p>
            )}
            <p className="mt-1 text-xs text-muted">
              {[
                emirate,
                `${yearsExperience} yrs`,
                salaryMin ? `from AED ${salaryMin.toLocaleString("en-AE")}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Link>
        </div>

        <SaveButton nannyId={nannyId} saved />
      </div>

      {/* A profile can be suspended after being saved — say so rather than
          leaving a dead link the family only discovers by tapping it. */}
      {!stillListed && (
        <p className="mt-3">
          <Badge variant="peach" size="sm">
            No longer listed
          </Badge>
        </p>
      )}

      <form action={action} className="mt-3 border-t border-border pt-3">
        <input type="hidden" name="nannyId" value={nannyId} />
        <label className="flex items-center gap-2.5">
          <span className="shrink-0 text-xs text-muted">Stage</span>
          <Select
            name="stage"
            value={shownStage}
            onChange={(e) => {
              setShownStage(e.target.value);
              e.currentTarget.form?.requestSubmit();
            }}
            className="h-10 text-sm"
          >
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </label>
        {state.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      </form>
    </article>
  );
}
