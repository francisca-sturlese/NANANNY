"use client";

import { useActionState } from "react";
import { bulkForwardAction, bulkDeleteAction } from "@/app/admin/email/actions";
import type { ActionState } from "@/lib/auth/actions";
import { SubmitButton, FormError } from "@/components/auth/form-parts";

/**
 * The bar above the list. It lives inside the same form as the row
 * checkboxes, so whatever is ticked is what these act on. Forward goes to
 * the compose page with the selection quoted; nothing is sent from here.
 * Delete keeps the same one-extra-tap disclosure as everywhere else,
 * because a bulk mistake is the single mistake multiplied.
 */
export function MailBulkBar() {
  const [state, deleteAction] = useActionState<ActionState, FormData>(bulkDeleteAction, {});

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-background px-4 py-2.5">
      <span className="text-xs text-muted">With the selected:</span>
      <SubmitButton size="sm" variant="outline" formAction={bulkForwardAction} pendingLabel="…">
        Forward
      </SubmitButton>
      <details>
        <summary className="cursor-pointer list-none text-sm text-muted underline underline-offset-4">
          Delete forever
        </summary>
        <span className="mt-1 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted">No undo. The Gmail copies are all that remain.</span>
          <SubmitButton size="sm" variant="outline" formAction={deleteAction} pendingLabel="Deleting…">
            Yes, delete selected
          </SubmitButton>
        </span>
      </details>
      <FormError message={state.error} />
    </div>
  );
}
