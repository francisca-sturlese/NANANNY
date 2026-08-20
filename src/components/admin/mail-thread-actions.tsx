"use client";

import { useActionState } from "react";
import { deleteMailThreadAction } from "@/app/admin/email/actions";
import type { ActionState } from "@/lib/auth/actions";
import { SubmitButton, FormError } from "@/components/auth/form-parts";

/**
 * Forever means a step in between. Not a browser dialog, which the product
 * avoids everywhere; a disclosure that opens to say what will happen, with
 * the real button inside it. One extra tap, zero accidental deletions.
 */
export function DeleteThreadControl({
  threadKey,
  compact,
}: {
  threadKey: string;
  /** On a list row: a short label, and the confirmation opens under the row. */
  compact?: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(deleteMailThreadAction, {});

  return (
    <details className="group">
      <summary
        className={`cursor-pointer list-none text-muted underline underline-offset-4 ${compact ? "text-xs" : "text-sm"}`}
      >
        {compact ? "Delete" : "Delete forever"}
      </summary>
      <form
        action={action}
        className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-4 py-3"
      >
        <input type="hidden" name="threadKey" value={threadKey} />
        <p className="text-sm text-muted">
          Every message in this conversation is deleted permanently. There is no
          undo, and the Gmail copy is the only one left.
        </p>
        <SubmitButton size="sm" variant="outline" pendingLabel="Deleting…">
          Yes, delete forever
        </SubmitButton>
        <FormError message={state.error} />
      </form>
    </details>
  );
}
