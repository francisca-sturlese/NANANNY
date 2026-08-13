"use client";

import { useActionState, useState } from "react";
import { updateSupportRequestAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

/**
 * Move a support request along.
 *
 * Replying happens by email, from the address on the request. This tracks where
 * it got to so two people do not answer the same message.
 */
export function SupportRequestActions({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateSupportRequestAction,
    {},
  );
  const [noting, setNoting] = useState(false);

  return (
    <div className="w-full max-w-xs space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "open" && (
          <form action={action}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="status" value="in_progress" />
            <SubmitButton size="sm" pendingLabel="…">
              I&apos;m on it
            </SubmitButton>
          </form>
        )}
        {status !== "answered" && status !== "closed" && (
          <form action={action}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="status" value="answered" />
            <SubmitButton size="sm" variant="secondary" pendingLabel="…">
              Answered
            </SubmitButton>
          </form>
        )}
        {status !== "closed" && (
          <form action={action}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="status" value="closed" />
            <SubmitButton size="sm" variant="outline" pendingLabel="…">
              Close
            </SubmitButton>
          </form>
        )}
        <Button size="sm" variant="ghost" onClick={() => setNoting((v) => !v)}>
          {noting ? "Cancel" : "Note"}
        </Button>
      </div>

      {noting && (
        <form action={action} className="space-y-2">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="status" value={status} />
          <Textarea
            name="internalNote"
            required
            className="min-h-16 text-sm"
            placeholder="Internal note. The sender never sees this."
          />
          <SubmitButton size="sm" variant="outline" pendingLabel="…">
            Save note
          </SubmitButton>
        </form>
      )}

      <FormError message={state.error} />
      <FormMessage message={state.message} />
    </div>
  );
}
