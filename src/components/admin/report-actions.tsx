"use client";

import { useActionState, useState } from "react";
import { resolveReportAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

export function ReportActions({ reportId, status }: { reportId: string; status: string }) {
  const [state, action] = useActionState<ActionState, FormData>(resolveReportAction, {});
  const [closing, setClosing] = useState<"actioned" | "dismissed" | null>(null);

  return (
    <div className="w-full max-w-sm space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "open" && (
          <form action={action}>
            <input type="hidden" name="reportId" value={reportId} />
            <input type="hidden" name="status" value="under_review" />
            <SubmitButton size="sm" pendingLabel="…">
              Start review
            </SubmitButton>
          </form>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setClosing(closing === "actioned" ? null : "actioned")}
        >
          Action it
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setClosing(closing === "dismissed" ? null : "dismissed")}
        >
          Dismiss
        </Button>
      </div>

      {/* Closing needs a decision written down. The database enforces it too. */}
      {closing && (
        <form action={action} className="space-y-2">
          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="status" value={closing} />
          <Textarea
            name="resolution"
            required
            className="min-h-20 text-sm"
            placeholder={
              closing === "actioned"
                ? "What did you do about it?"
                : "Why is there nothing to do here?"
            }
          />
          <SubmitButton size="sm" pendingLabel="Saving…">
            {closing === "actioned" ? "Mark actioned" : "Dismiss report"}
          </SubmitButton>
        </form>
      )}

      <FormError message={state.error} />
      <FormMessage message={state.message} />
    </div>
  );
}
