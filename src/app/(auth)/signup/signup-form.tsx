"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUpAction, type ActionState } from "@/lib/auth/actions";
import { Input, Label } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { FieldError, FormError, SubmitButton } from "@/components/auth/form-parts";

const ROLES = [
  {
    value: "family",
    title: "I'm a family",
    blurb: "Looking for a nanny",
  },
  {
    value: "nanny",
    title: "I'm a nanny",
    blurb: "Looking for a family",
  },
] as const;

export function SignUpForm({ defaultRole }: { defaultRole: "family" | "nanny" }) {
  const [state, action] = useActionState<ActionState, FormData>(signUpAction, {});
  const [role, setRole] = useState<"family" | "nanny">(defaultRole);

  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-medium">I am signing up as</legend>
        <div className="grid grid-cols-2 gap-3">
          {ROLES.map((option) => {
            const selected = role === option.value;
            return (
              <label
                key={option.value}
                className={
                  selected
                    ? "cursor-pointer rounded-lg border-2 border-foreground bg-surface p-4"
                    : "cursor-pointer rounded-lg border border-border p-4 transition-colors hover:border-border-strong"
                }
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={selected}
                  onChange={() => setRole(option.value)}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold">{option.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{option.blurb}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName" required>
            First name
          </Label>
          <Input id="firstName" name="firstName" autoComplete="given-name" required />
          <FieldError message={state.fieldErrors?.firstName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName" required>
            Last name
          </Label>
          <Input id="lastName" name="lastName" autoComplete="family-name" required />
          <FieldError message={state.fieldErrors?.lastName} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email" required>
          Email
        </Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+971 50 000 0000" />
        <p className="text-xs text-muted">Kept private. Never shown on your profile.</p>
        <FieldError message={state.fieldErrors?.phone} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" required>
          Password
        </Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
        <p className="text-xs text-muted">At least 10 characters.</p>
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <FormError message={state.error} />

      <SubmitButton size="lg" block pendingLabel="Creating your account…">
        Create account
      </SubmitButton>

      <p className="text-xs leading-relaxed text-subtle">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        . NaNanny is a technology platform and is not the employer of any nanny.
      </p>
    </form>
  );
}
