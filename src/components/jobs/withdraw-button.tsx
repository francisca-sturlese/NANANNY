"use client";

import { useActionState, useState } from "react";
import { withdrawApplicationAction } from "@/lib/jobs/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/form-parts";

/**
 * Withdraw an application. Two taps rather than one: withdrawing cannot be
 * undone, and an accidental tap on a phone should not end a candidacy.
 */
export function WithdrawButton({ applicationId }: { applicationId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    withdrawApplicationAction,
    {},
  );
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Withdraw
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <span className="text-xs text-muted">Sure?</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        No
      </Button>
      <SubmitButton variant="danger" size="sm" pendingLabel="…">
        Yes, withdraw
      </SubmitButton>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
