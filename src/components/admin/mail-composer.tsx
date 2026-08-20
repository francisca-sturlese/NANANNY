"use client";

import { useActionState } from "react";
import { sendMailAction } from "@/app/admin/email/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

/**
 * Compose and reply are the same form. A reply arrives with the counterpart
 * and the subject already filled in and locked to the thread, because a
 * "reply" whose subject drifts starts a new thread on both sides.
 */
export function MailComposer({
  to,
  subject,
  compact,
}: {
  to?: string;
  subject?: string;
  compact?: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(sendMailAction, {});
  const locked = Boolean(to && subject);

  return (
    <form action={action} className="space-y-4 rounded-lg border border-border bg-background p-5">
      {locked ? (
        <>
          <input type="hidden" name="to" value={to} />
          <input type="hidden" name="subject" value={subject} />
          <p className="text-sm text-muted">
            Replying to <span className="font-medium text-foreground">{to}</span>
          </p>
        </>
      ) : (
        <>
          <Field label="To" htmlFor="mail-to" required error={state.fieldErrors?.to}>
            <Input
              id="mail-to"
              name="to"
              type="email"
              required
              defaultValue={to ?? ""}
              placeholder="name@example.com"
            />
          </Field>
          <Field label="Subject" htmlFor="mail-subject" required error={state.fieldErrors?.subject}>
            <Input id="mail-subject" name="subject" required defaultValue={subject ?? ""} />
          </Field>
        </>
      )}

      <Field
        label={locked ? "Your reply" : "Message"}
        htmlFor="mail-body"
        required
        error={state.fieldErrors?.body}
      >
        <Textarea id="mail-body" name="body" required rows={compact ? 5 : 10} />
      </Field>

      <FormError message={state.error} />
      <FormMessage message={state.message} />

      <SubmitButton pendingLabel="Sending…">{locked ? "Send reply" : "Send"}</SubmitButton>
    </form>
  );
}
