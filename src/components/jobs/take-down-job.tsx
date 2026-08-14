"use client";

import { useActionState, useState } from "react";
import { setJobStatusAction } from "@/lib/jobs/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-parts";

/**
 * Taking a post down.
 *
 * A button, because it is what somebody reaches for the moment they have hired
 * a nanny and want the replies to stop. It was previously an option inside a
 * status dropdown, which is exactly where Post a job was hiding when the first
 * family could not find it.
 *
 * Confirmed in place rather than in a dialog: one extra tap, no overlay, and
 * the row stays where their thumb already is.
 */
export function TakeDownJob({ jobId }: { jobId: string }) {
  const [asking, setAsking] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(setJobStatusAction, {});

  if (!asking) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
        Take it down
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="status" value="closed" />
      <span className="text-sm text-muted">Stop showing this to nannies?</span>
      <Button type="submit" size="sm" variant="outline">
        Yes, take it down
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>
        Keep it up
      </Button>
      <FormError message={state.error} />
    </form>
  );
}
