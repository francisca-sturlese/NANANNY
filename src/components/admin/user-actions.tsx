"use client";

import { useActionState, useState } from "react";
import { setUserStatusAction, addAdminNoteAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

/**
 * Suspend, reactivate, or leave an internal note.
 *
 * Suspending asks for a reason before it will go through: the database refuses
 * without one, and the operator reading this account in six months needs to
 * know why it happened.
 */
export function UserActions({ userId, status }: { userId: string; status: string }) {
  const [state, action] = useActionState<ActionState, FormData>(setUserStatusAction, {});
  const [noteState, noteAction] = useActionState<ActionState, FormData>(addAdminNoteAction, {});
  const [suspending, setSuspending] = useState(false);
  const [noting, setNoting] = useState(false);

  return (
    <div className="w-full max-w-sm space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "active" ? (
          <Button size="sm" variant="outline" onClick={() => setSuspending((v) => !v)}>
            {suspending ? "Cancel" : "Suspend"}
          </Button>
        ) : (
          <form action={action}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value="active" />
            <SubmitButton size="sm" variant="secondary" pendingLabel="…">
              Reactivate
            </SubmitButton>
          </form>
        )}

        <Button size="sm" variant="ghost" onClick={() => setNoting((v) => !v)}>
          {noting ? "Cancel note" : "Add note"}
        </Button>
      </div>

      {suspending && (
        <form action={action} className="space-y-2">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="status" value="suspended" />
          <Textarea
            name="reason"
            required
            className="min-h-20 text-sm"
            placeholder="Why is this account being suspended? This is recorded."
          />
          <SubmitButton size="sm" variant="danger" pendingLabel="Suspending…">
            Suspend account
          </SubmitButton>
        </form>
      )}

      {noting && (
        <form action={noteAction} className="space-y-2">
          <input type="hidden" name="subjectUserId" value={userId} />
          <Textarea
            name="body"
            required
            className="min-h-20 text-sm"
            placeholder="Internal note. Only admins see this."
          />
          <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
            Save note
          </SubmitButton>
        </form>
      )}

      <FormError message={state.error ?? noteState.error} />
      <FormMessage message={state.message ?? noteState.message} />
    </div>
  );
}
