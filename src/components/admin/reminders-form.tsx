"use client";

import { useActionState, useState } from "react";
import { updateRemindersAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

/**
 * The reminder settings.
 *
 * Every value here decides whether an email lands in somebody's inbox who did
 * not ask for it, so the form says what each one does in the sentence next to
 * it rather than in a tooltip somebody has to go and find.
 *
 * The audience is a set of three radios rather than a select, because it is the
 * one control here that can silently mean "send nothing", and a closed select
 * showing "Paying families" reads like a working feature.
 */

const AUDIENCES = [
  {
    value: "paying",
    label: "Only where a subscriber is involved",
    detail:
      "An unread message reminder goes out when the family in that conversation subscribes, whichever side is being written to. A nanny is reminded about a subscriber's message and not about anybody else's.",
  },
  {
    value: "everyone",
    label: "Everyone",
    detail:
      "Anybody who has gone quiet, including nannies whose profile never left draft.",
  },
  {
    value: "off",
    label: "Nobody",
    detail: "Nothing is sent. The scheduled run still happens and finds nothing to do.",
  },
] as const;

export function RemindersForm({
  audience,
  nudgeAfterHours,
  unreadAfterHours,
  minGapHours,
  subscriberCount,
}: {
  audience: string;
  nudgeAfterHours: number;
  unreadAfterHours: number;
  minGapHours: number;
  /** How many families are subscribed right now. */
  subscriberCount: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateRemindersAction, {});
  const [chosen, setChosen] = useState(audience);

  /**
   * The thing worth saying out loud.
   *
   * "Only where a subscriber is involved" with no subscribers is a setting that
   * sends nothing, and it looks identical on this page to one that works. While
   * the launch window is open nobody is being charged, so this is the normal
   * state rather than an error, and it should be read on the page rather than
   * discovered a fortnight later.
   */
  const reachingNobody = chosen === "paying" && subscriberCount === 0;

  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium">Who can be written to</legend>
        <div className="mt-3 space-y-2">
          {AUDIENCES.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-14 cursor-pointer gap-3 rounded-md border p-4 transition-colors ${
                chosen === option.value
                  ? "border-foreground bg-surface"
                  : "border-border hover:bg-surface"
              }`}
            >
              <input
                type="radio"
                name="audience"
                value={option.value}
                checked={chosen === option.value}
                onChange={() => setChosen(option.value)}
                className="mt-1 size-4 shrink-0"
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">
                  {option.detail}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {reachingNobody && (
        <div className="rounded-md border border-butter bg-butter-wash px-4 py-3">
          <p className="text-sm leading-relaxed text-foreground">
            No family is subscribed right now, so this setting sends nothing at all.
            That is expected while the launch window is open and everything is free.
            Choose Everyone if you want the reminders to go out in the meantime.
          </p>
        </div>
      )}

      <Field
        label="Wait before nudging somebody who has posted nothing"
        htmlFor="nudgeAfterHours"
        hint="Hours after their profile was created. A family that has posted a job or started a conversation is never nudged."
      >
        <Input
          id="nudgeAfterHours"
          name="nudgeAfterHours"
          type="number"
          min={1}
          defaultValue={nudgeAfterHours}
          inputMode="numeric"
        />
      </Field>

      <Field
        label="Wait before mentioning an unread message"
        htmlFor="unreadAfterHours"
        hint="Hours the message has sat unopened. Opening the thread marks it read, so this needs no tracking of when somebody last visited."
      >
        <Input
          id="unreadAfterHours"
          name="unreadAfterHours"
          type="number"
          min={1}
          defaultValue={unreadAfterHours}
          inputMode="numeric"
        />
      </Field>

      <Field
        label="Least time between two reminders to the same person"
        htmlFor="minGapHours"
        hint="However long somebody stays away, at most one of each per this many hours. This is the number that decides whether we are useful or a nuisance."
      >
        <Input
          id="minGapHours"
          name="minGapHours"
          type="number"
          min={1}
          defaultValue={minGapHours}
          inputMode="numeric"
        />
      </Field>

      <FormError message={state.error} />
      <FormMessage message={state.message} />
      <SubmitButton pendingLabel="Saving">Save</SubmitButton>
    </form>
  );
}
