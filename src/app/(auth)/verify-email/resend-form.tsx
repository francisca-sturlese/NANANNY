"use client";

import { useActionState } from "react";
import { resendVerificationAction, type ActionState } from "@/lib/auth/actions";
import { Input, Label } from "@/components/ui/field";
import { FieldError, FormError, FormMessage, SubmitButton } from "@/components/auth/form-parts";

export function ResendVerificationForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(resendVerificationAction, {});

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email" required>
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          required
        />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <FormError message={state.error} />
      <FormMessage message={state.message} />

      <SubmitButton variant="outline" block pendingLabel="Sending…">
        Resend verification email
      </SubmitButton>
      <p className="text-center text-xs text-muted">
        Just asked for one? Wait a minute before trying again, or the request may be
        refused. When a new email arrives, only its link works.
      </p>
    </form>
  );
}
