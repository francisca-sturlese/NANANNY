"use client";

import { useActionState, useState } from "react";
import { setNannyStatusAction } from "./actions";
import type { ActionState } from "@/lib/auth/actions";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function ReviewActions({ nannyId, status }: { nannyId: string; status: string }) {
  const [state, action] = useActionState<ActionState, FormData>(setNannyStatusAction, {});
  const [rejecting, setRejecting] = useState(false);

  return (
    <div className="w-full max-w-sm space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "submitted" && (
          <StatusForm action={action} nannyId={nannyId} status="under_review" label="Start review" />
        )}
        {status !== "approved" && (
          <StatusForm
            action={action}
            nannyId={nannyId}
            status="approved"
            label="Approve"
            variant="secondary"
          />
        )}
        {status === "approved" && (
          <StatusForm
            action={action}
            nannyId={nannyId}
            status="suspended"
            label="Suspend"
            variant="outline"
          />
        )}
        {status !== "rejected" && (
          <Button size="sm" variant="outline" onClick={() => setRejecting((v) => !v)}>
            {rejecting ? "Cancel" : "Reject"}
          </Button>
        )}
      </div>

      {/* A rejection must say what to fix — the nanny reads this verbatim. */}
      {rejecting && (
        <form action={action} className="space-y-2">
          <input type="hidden" name="nannyId" value={nannyId} />
          <input type="hidden" name="status" value="rejected" />
          <Textarea
            name="reason"
            required
            className="min-h-20 text-sm"
            placeholder="What needs to change before this profile can be approved?"
          />
          <SubmitButton size="sm" variant="danger" pendingLabel="Rejecting…">
            Send rejection
          </SubmitButton>
        </form>
      )}

      <FormError message={state.error} />
      <FormMessage message={state.message} />
    </div>
  );
}

function StatusForm({
  action,
  nannyId,
  status,
  label,
  variant = "primary",
}: {
  action: (formData: FormData) => void;
  nannyId: string;
  status: string;
  label: string;
  variant?: "primary" | "secondary" | "outline";
}) {
  return (
    <form action={action}>
      <input type="hidden" name="nannyId" value={nannyId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" variant={variant} pendingLabel="Saving…">
        {label}
      </SubmitButton>
    </form>
  );
}
