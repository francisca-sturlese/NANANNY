"use client";

import { useActionState } from "react";
import { updatePromoAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

/**
 * The launch window.
 *
 * This switches the paywall off for every family at once, so it is kept apart
 * from the pricing form and says plainly what it does. Clearing both dates
 * closes it.
 *
 * Datetime inputs work in the browser's own timezone and submit a local string,
 * which the action converts. That is the right behaviour here: whoever sets
 * this is thinking in Dubai time, not in UTC.
 */
export function PromoForm({
  startsAt,
  endsAt,
  label,
  active,
}: {
  startsAt: string | null;
  endsAt: string | null;
  label: string | null;
  active: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updatePromoAction, {});

  return (
    <form action={action} className="space-y-5">
      <div
        className={
          active
            ? "rounded-md border border-sage bg-sage-wash px-4 py-3"
            : "rounded-md border border-border bg-surface px-4 py-3"
        }
      >
        <p className={`text-sm leading-relaxed ${active ? "text-sage-deep" : "text-muted"}`}>
          {active
            ? "The window is open. Contacting a nanny is free for every family right now, and none of it counts against their free contacts."
            : "No window is open. The paywall is working normally."}
        </p>
      </div>

      <Field
        label="Starts"
        htmlFor="startsAt"
        hint="Leave empty to start straight away. Your local time."
      >
        <Input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          defaultValue={toLocalInput(startsAt)}
        />
      </Field>

      <Field
        label="Ends"
        htmlFor="endsAt"
        hint="Leave empty to run until you close it by hand. The banner counts down to this."
      >
        <Input
          id="endsAt"
          name="endsAt"
          type="datetime-local"
          defaultValue={toLocalInput(endsAt)}
        />
      </Field>

      <Field
        label="What the banner says"
        htmlFor="label"
        hint="A short phrase. For example: free for our first three weeks."
      >
        <Input
          id="label"
          name="label"
          maxLength={80}
          defaultValue={label ?? ""}
          placeholder="Free for our first three weeks"
        />
      </Field>

      <FormError message={state.error} />
      <FormMessage message={state.message} />

      <SubmitButton pendingLabel="Saving…">Save the window</SubmitButton>

      <p className="text-xs leading-relaxed text-subtle">
        Clearing both dates closes the window. Contacts opened while it was open
        stay free and are never counted, so every family keeps its full allowance
        for afterwards.
      </p>
    </form>
  );
}

/** An ISO timestamp as the value a datetime-local input expects. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
