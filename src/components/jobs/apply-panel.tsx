"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { applyToJobAction } from "@/lib/jobs/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  viewed: "Viewed by the family",
  shortlisted: "Shortlisted",
  interview: "Interview",
  rejected: "Not selected",
  hired: "Hired",
  withdrawn: "Withdrawn",
};

/**
 * Apply to a job.
 *
 * Applying never costs anything and never uses a family's contact — the family
 * decides separately whether to open a conversation. The cover note is
 * optional, because forcing typing on a phone loses applications.
 */
export function ApplyPanel({
  jobId,
  alreadyApplied,
  applicationStatus,
  profileApproved,
}: {
  jobId: string;
  alreadyApplied: boolean;
  applicationStatus: string | null;
  profileApproved: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(applyToJobAction, {});
  const [open, setOpen] = useState(false);

  if (alreadyApplied || state.message === "Application sent.") {
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <Badge variant="sage" size="sm">
            {STATUS_LABEL[applicationStatus ?? "applied"] ?? "Applied"}
          </Badge>
          <p className="mt-1 text-xs text-muted">
            The family will be in touch if it&apos;s a fit.
          </p>
        </div>
        <Link href="/nanny/applications">
          <Button variant="outline">My applications</Button>
        </Link>
      </div>
    );
  }

  if (!profileApproved) {
    return (
      <div className="text-center">
        <Button size="lg" block disabled>
          Apply
        </Button>
        <p className="mt-1.5 text-xs text-muted">
          You can apply as soon as your profile is approved.{" "}
          <Link href="/nanny" className="underline underline-offset-4">
            Check your status
          </Link>
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <Button size="lg" block onClick={() => setOpen(true)}>
        Apply for this job
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="jobId" value={jobId} />
      <Textarea
        name="coverNote"
        placeholder="Optional: a line or two about why this family suits you."
        className="min-h-20 text-sm"
        maxLength={2000}
      />
      <FormError message={state.error} />
      <FormMessage message={state.message} />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <SubmitButton size="lg" className="flex-1" pendingLabel="Sending…">
          Send application
        </SubmitButton>
      </div>
    </form>
  );
}
