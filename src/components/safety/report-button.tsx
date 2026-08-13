"use client";

import { useActionState, useState } from "react";
import { Flag, X } from "lucide-react";
import { reportContentAction, type SafetyState } from "@/lib/safety/actions";
import { REPORT_REASONS } from "@/lib/safety/reasons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { ChoiceCard } from "@/components/ui/choice";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";
import { Portal, useScrollLock } from "@/components/ui/portal";

/**
 * Report a profile, a job or a message.
 *
 * Deliberately quiet: a small text link, not a button competing with Message or
 * Save. Someone looking for it will find it, and nobody is nudged into using it.
 *
 * The sheet says plainly that the report is anonymous, because the main reason
 * people do not report is fear that the other person will find out.
 */
export function ReportButton({
  targetKind,
  targetId,
  label = "Report",
  what,
}: {
  targetKind: "profile" | "message" | "job" | "review" | "user";
  targetId: string;
  label?: string;
  /** e.g. "this profile", used in the sheet's heading. */
  what: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<SafetyState, FormData>(reportContentAction, {});
  useScrollLock(open);

  const done = Boolean(state.message);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-target inline-flex items-center gap-1.5 text-xs text-subtle underline underline-offset-4 hover:text-muted"
      >
        <Flag className="size-3.5" aria-hidden />
        {label}
      </button>

      {open && (
        <Portal>
          <div
            className="fixed inset-0 z-50"
            role="dialog"
            aria-modal="true"
            aria-label={`Report ${what}`}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/40"
            />

            <div className="pb-safe absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-xl border-t border-border bg-background sm:inset-0 sm:m-auto sm:h-fit sm:max-w-md sm:rounded-xl sm:border">
              <div className="sticky top-0 bg-background pt-2">
                <div
                  aria-hidden
                  className="mx-auto h-1 w-10 rounded-pill bg-border-strong sm:hidden"
                />
                <div className="flex items-start justify-between gap-3 px-5 py-3">
                  <h2 className="text-lg font-semibold">Report {what}</h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="-mt-1 grid size-11 shrink-0 place-items-center rounded-pill text-muted"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </div>
              </div>

              {done ? (
                <div className="space-y-4 px-5 pb-6">
                  <FormMessage message={state.message} />
                  <Button size="lg" block variant="outline" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                </div>
              ) : (
                <form action={action} className="space-y-5 px-5 pb-5">
                  <input type="hidden" name="targetKind" value={targetKind} />
                  <input type="hidden" name="targetId" value={targetId} />

                  <fieldset>
                    <legend className="text-sm font-medium">What is wrong?</legend>
                    <div className="mt-3 space-y-2">
                      {REPORT_REASONS.map((reason, i) => (
                        <ChoiceCard
                          key={reason}
                          type="radio"
                          name="reason"
                          value={reason}
                          label={reason}
                          defaultChecked={i === 0}
                        />
                      ))}
                    </div>
                  </fieldset>

                  <Textarea
                    name="details"
                    className="min-h-24"
                    placeholder="Anything else that would help us understand. Optional."
                  />

                  <FormError message={state.error} />

                  <SubmitButton size="lg" block pendingLabel="Sending…">
                    Send report
                  </SubmitButton>

                  <p className="text-center text-xs leading-relaxed text-subtle">
                    Reports are read by our team. The person you report is never told who
                    reported them.
                  </p>
                </form>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
