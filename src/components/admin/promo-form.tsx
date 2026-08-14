"use client";

import { useActionState, useState } from "react";
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
 * A datetime-local input submits a wall clock string with no timezone in it.
 * The server used to parse that with `new Date()`, which reads it in the
 * server's own timezone: the same typed value became 16:26 UTC on a UTC host
 * and 09:26 UTC on a machine set to Bangkok. Federico typed a Dubai time and
 * got a window that started seven hours late.
 *
 * So the conversion happens here instead, where the typed time means what the
 * person typing it thought it meant, and the server receives an instant rather
 * than a string it has to guess at.
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

  // Kept in state rather than read at submit time, so the hidden values and the
  // visible ones cannot drift apart.
  const [start, setStart] = useState(toLocalInput(startsAt));
  const [end, setEnd] = useState(toLocalInput(endsAt));

  const onlyOne = Boolean(start) !== Boolean(end);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="startsAtIso" value={toInstant(start)} />
      <input type="hidden" name="endsAtIso" value={toInstant(end)} />
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
        hint="In your own time, not UTC. Clearing both dates closes the window."
      >
        <Input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
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
          value={end}
          onChange={(e) => setEnd(e.target.value)}
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

      {/* Clearing one date and saving used to wipe it and leave the other in
          place, which is how a live promotion lost its start date and nobody
          noticed. Refused here as well as on the server. */}
      {onlyOne && (
        <p className="rounded-md border border-peach bg-peach-wash px-4 py-3 text-sm leading-relaxed text-peach-deep">
          Fill in both dates, or clear both to close the window. Saving with only
          one would leave the window in a state nobody chose.
        </p>
      )}

      <FormError message={state.error} />
      <FormMessage message={state.message} />

      <SubmitButton pendingLabel="Saving…" disabled={onlyOne}>
        Save the window
      </SubmitButton>

      <p className="text-xs leading-relaxed text-subtle">
        Clearing both dates closes the window. Contacts opened while it was open
        stay free and are never counted, so every family keeps its full allowance
        for afterwards.
      </p>
    </form>
  );
}

/**
 * A datetime-local value as the instant it means in this browser's timezone.
 * Empty stays empty, so clearing both fields still closes the window.
 */
function toInstant(local: string): string {
  if (!local) return "";
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
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
