"use client";

import { useActionState } from "react";
import { updatePasswordAction, type ActionState } from "@/lib/auth/actions";
import { Input, Label } from "@/components/ui/field";
import { FieldError, FormError, SubmitButton } from "@/components/auth/form-parts";

export function ResetPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(updatePasswordAction, {});

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="password" required>
          New password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          autoFocus
        />
        <p className="text-xs text-muted">At least 10 characters.</p>
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword" required>
          Confirm new password
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError message={state.fieldErrors?.confirmPassword} />
      </div>

      <FormError message={state.error} />

      <SubmitButton size="lg" block pendingLabel="Updating…">
        Update password
      </SubmitButton>
    </form>
  );
}
