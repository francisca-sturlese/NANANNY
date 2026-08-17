"use client";

import { useActionState, useState } from "react";
import { updateSupportRequestAction, replySupportRequestAction, markSupportSpamAction } from "@/app/admin/actions";
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
  contactEmail,
}: {
  requestId: string;
  status: string;
  /** Where the reply goes; shown so the admin knows before they write. */
  contactEmail?: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateSupportRequestAction,
    {},
  );
  const [replyState, replyAction] = useActionState<ActionState, FormData>(
    replySupportRequestAction,
    {},
  );
  const [, spamAction] = useActionState<ActionState, FormData>(
    markSupportSpamAction,
    {},
  );
  const [noting, setNoting] = useState(false);
  const [replying, setReplying] = useState(false);

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
        <form
          action={spamAction}
          // A pitch filed as spam vanishes from every working view; the row
          // survives in the Sales archive so a mistake stays reversible.
        >
          <input type="hidden" name="requestId" value={requestId} />
          <SubmitButton size="sm" variant="outline" pendingLabel="…">
            Mark as spam
          </SubmitButton>
        </form>
        {contactEmail && status !== "closed" && (
          <Button size="sm" onClick={() => setReplying((v) => !v)}>
            {replying ? "Cancel reply" : "Reply"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setNoting((v) => !v)}>
          {noting ? "Cancel" : "Note"}
        </Button>
      </div>

      {replying && contactEmail && (
        <form action={replyAction} className="space-y-2">
          <input type="hidden" name="requestId" value={requestId} />
          <Textarea
            name="reply"
            required
            className="min-h-24 text-sm"
            placeholder={`Your reply. It is emailed to ${contactEmail} exactly as written.`}
          />
          <SubmitButton size="sm" pendingLabel="Sending…">
            Send reply
          </SubmitButton>
          <FormError message={replyState.error} />
          <FormMessage message={replyState.message} />
        </form>
      )}

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
