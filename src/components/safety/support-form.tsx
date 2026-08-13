"use client";

import { useActionState } from "react";
import { submitSupportRequestAction, type SafetyState } from "@/lib/safety/actions";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

const CATEGORIES = [
  { value: "account", label: "My account or login" },
  { value: "profile", label: "My profile" },
  { value: "billing", label: "Payments and plans" },
  { value: "safety", label: "Safety or someone's behaviour" },
  { value: "technical", label: "Something is broken" },
  { value: "other", label: "Something else" },
];

/**
 * Contact support.
 *
 * Works signed out on purpose: someone locked out of their account is exactly
 * the person who most needs to reach us, and telling them to log in first would
 * be absurd.
 */
export function SupportForm({
  defaultEmail,
  defaultName,
}: {
  defaultEmail?: string;
  defaultName?: string;
}) {
  const [state, action] = useActionState<SafetyState, FormData>(
    submitSupportRequestAction,
    {},
  );

  if (state.message) {
    return (
      <div className="space-y-4">
        <FormMessage message={state.message} />
        <p className="text-sm text-muted">
          If it is urgent, you can also write to support@nananny.ae directly.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your email" htmlFor="email" required hint="We reply to this address.">
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={defaultEmail}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" defaultValue={defaultName} autoComplete="name" />
        </Field>
      </div>

      <Field label="What is this about?" htmlFor="category" required>
        <Select id="category" name="category" defaultValue="account" required>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Subject" htmlFor="subject" required>
        <Input id="subject" name="subject" required maxLength={200} />
      </Field>

      <Field
        label="Tell us what happened"
        htmlFor="message"
        required
        hint="The more detail, the faster we can help."
      >
        <Textarea id="message" name="message" required className="min-h-32" maxLength={5000} />
      </Field>

      <FormError message={state.error} />

      <SubmitButton size="lg" block pendingLabel="Sending…">
        Send to support
      </SubmitButton>
    </form>
  );
}
