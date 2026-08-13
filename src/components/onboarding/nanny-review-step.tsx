"use client";

import { useActionState } from "react";
import Link from "next/link";
import Image from "next/image";
import { submitNannyProfileAction } from "@/lib/onboarding/nanny-actions";
import type { ActionState } from "@/lib/auth/actions";
import { FormError, SubmitButton } from "@/components/auth/form-parts";
import { Badge } from "@/components/ui/badge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NannyProfile = any;

type Completion = {
  percent: number;
  missing: string[];
  required_missing: string[];
  can_submit: boolean;
} | null;

/**
 * Final step: show what will be sent, then submit for review.
 *
 * The button is only enabled when the database says the profile is complete —
 * and the database re-checks anyway, so a hand-crafted POST gets nowhere.
 */
export function NannyReviewStep({
  profile,
  completion,
  photoUrl,
  backHref,
}: {
  profile: NannyProfile;
  completion: Completion;
  photoUrl: string | null;
  backHref: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(submitNannyProfileAction, {});
  const canSubmit = completion?.can_submit ?? false;
  const alreadySubmitted =
    profile?.status && !["draft", "rejected"].includes(profile.status);

  return (
    <div className="space-y-7">
      <div className="flex items-start gap-4">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            width={72}
            height={72}
            unoptimized
            className="size-18 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="grid size-18 place-items-center rounded-full bg-sage-wash text-xs text-sage-deep">
            No photo
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{profile?.first_name ?? "Your profile"}</h2>
          {profile?.headline && (
            <p className="mt-1 text-sm text-muted">{profile.headline}</p>
          )}
          <p className="mt-2 text-sm text-muted">
            {[
              profile?.emirate,
              profile?.years_experience ? `${profile.years_experience} years' experience` : null,
              profile?.salary_expectation_min_aed
                ? `From AED ${profile.salary_expectation_min_aed}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Profile completeness</span>
          <span className="text-lg font-semibold tabular-nums">
            {completion?.percent ?? 0}%
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-pill bg-border">
          <div
            className="h-full rounded-pill bg-foreground"
            style={{ width: `${completion?.percent ?? 0}%` }}
          />
        </div>

        {completion && completion.required_missing.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium">Before you can submit, please add:</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {completion.required_missing.map((item) => (
                <li
                  key={item}
                  className="rounded-pill border border-peach bg-peach-wash px-3 py-1 text-xs text-peach-deep"
                >
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href={backHref}
              className="tap-target mt-2 text-sm underline underline-offset-4"
            >
              Go back and add them
            </Link>
          </div>
        )}
      </div>

      {alreadySubmitted ? (
        <div className="rounded-lg border border-sage bg-sage-wash p-5">
          <Badge variant="sage" size="sm">
            {String(profile.status).replace("_", " ")}
          </Badge>
          <p className="mt-3 text-sm text-sage-deep">
            Your profile is with our team. We&apos;ll email you as soon as it&apos;s reviewed.
          </p>
        </div>
      ) : (
        <form action={action} className="space-y-5">
          <div className="rounded-lg border border-border p-5">
            <h3 className="text-sm font-semibold">What happens next</h3>
            <ol className="mt-3 space-y-2 text-sm text-muted">
              <li>1. Our team reviews your profile, usually within two working days.</li>
              <li>2. We may ask for a document or a reference before approving.</li>
              <li>3. Once approved, families can find you and message you.</li>
            </ol>
            <p className="mt-4 text-xs text-subtle">
              Approval means your profile is live. It is not a background check — badges
              are added separately, one for each thing we have actually verified.
            </p>
          </div>

          <FormError message={state.error} />

          <SubmitButton size="lg" block disabled={!canSubmit} pendingLabel="Submitting…">
            Submit profile for review
          </SubmitButton>

          {!canSubmit && (
            <p className="text-center text-xs text-muted">
              Add the missing information above to enable this.
            </p>
          )}
        </form>
      )}

      <div className="border-t border-border pt-6">
        <Link href={backHref} className="tap-target text-sm text-muted underline underline-offset-4">
          Back
        </Link>
      </div>
    </div>
  );
}
