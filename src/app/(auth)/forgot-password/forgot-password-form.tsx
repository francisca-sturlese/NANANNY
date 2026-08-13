"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type ActionState } from "@/lib/auth/actions";
import { Input, Label } from "@/components/ui/field";
import { FieldError, FormError, FormMessage, SubmitButton } from "@/components/auth/form-parts";

export function ForgotPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(
    requestPasswordResetAction,
    {},
  );

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="email" required>
          Email
        </Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <FormError message={state.error} />
      <FormMessage message={state.message} />

      <SubmitButton size="lg" block pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}
