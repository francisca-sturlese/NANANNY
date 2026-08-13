"use client";

import { useActionState } from "react";
import { updatePasswordAction, type ActionState } from "@/lib/auth/actions";
import { Input, Label } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { FieldError, FormError, SubmitButton } from "@/components/auth/form-parts";

export function ResetPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(updatePasswordAction, {});

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="password" required>
          New password
        </Label>
        <PasswordInput
          id="password"
          name="password"
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
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          showLabel="Show confirmation"
          hideLabel="Hide confirmation"
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
