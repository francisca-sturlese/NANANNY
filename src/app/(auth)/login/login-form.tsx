"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type ActionState } from "@/lib/auth/actions";
import { Input, Label } from "@/components/ui/field";
import { FieldError, FormError, SubmitButton } from "@/components/auth/form-parts";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}

      <div className="space-y-1.5">
        <Label htmlFor="email" required>
          Email
        </Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password" required>
            Password
          </Label>
          <Link href="/forgot-password" className="tap-target text-xs text-muted underline">
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <FormError message={state.error} />

      <SubmitButton size="lg" block pendingLabel="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
