"use client";

import { useActionState, useState } from "react";
import { moderateJobAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

/**
 * Take a job down, or put it back.
 *
 * Taking something down asks why. The family is not told automatically, but
 * whoever answers their email needs to be able to see the reason.
 */
export function JobModeration({ jobId, status }: { jobId: string; status: string }) {
  const [state, action] = useActionState<ActionState, FormData>(moderateJobAction, {});
  const [closing, setClosing] = useState(false);

  return (
    <div className="w-full max-w-xs space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "closed" ? (
          <Button size="sm" variant="outline" onClick={() => setClosing((v) => !v)}>
            {closing ? "Cancel" : "Take down"}
          </Button>
        ) : (
          <form action={action}>
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="status" value="active" />
            <SubmitButton size="sm" variant="secondary" pendingLabel="…">
              Restore
            </SubmitButton>
          </form>
        )}
      </div>

      {closing && (
        <form action={action} className="space-y-2">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="status" value="closed" />
          <Textarea
            name="reason"
            required
            className="min-h-16 text-sm"
            placeholder="Why is this coming down?"
          />
          <SubmitButton size="sm" variant="danger" pendingLabel="…">
            Take it down
          </SubmitButton>
        </form>
      )}

      <FormError message={state.error} />
      <FormMessage message={state.message} />
    </div>
  );
}
