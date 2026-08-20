"use client";

import { useActionState, useState } from "react";
import { updateReferralAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

/**
 * Invitations: the switch, what one is worth, and what it has cost so far.
 *
 * Apart from the pricing form deliberately. A price decides what somebody pays;
 * this decides how many people never reach the paywall at all, and the two
 * should be separate deliberate presses rather than one Save.
 *
 * The numbers underneath are on the same screen as the switch because they are
 * the price of it. "Contacts given away" is the line that says what this costs,
 * and putting it anywhere else would mean turning it on in one place and
 * discovering the bill in another.
 */
export function ReferralForm({
  enabled,
  bonusContacts,
  bonusMax,
  stats,
}: {
  enabled: boolean;
  bonusContacts: number;
  bonusMax: number;
  stats: { claimed: number; qualified: number; families_earning: number; contacts_granted: number };
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateReferralAction, {});
  const [on, setOn] = useState(enabled);

  return (
    <form action={action} className="space-y-5">
      <div
        className={
          enabled
            ? "rounded-md border border-sage bg-sage-wash px-4 py-3"
            : "rounded-md border border-border bg-surface px-4 py-3"
        }
      >
        <p className={`text-sm leading-relaxed ${enabled ? "text-sage-deep" : "text-muted"}`}>
          {enabled
            ? `Invitations are on. A family who invites another gets ${bonusContacts} extra free ${bonusContacts === 1 ? "contact" : "contacts"}, and so does the family they invited, once that family has finished setting up.`
            : "Invitations are off. The links still work and still record who invited whom, so nothing is lost by leaving this off. Nobody is granted anything."}
        </p>
      </div>

      {/* A switch that says what it switches. This was a checkbox labelled
          "Give the extra contacts", which reads as a sub option: Federico
          looked for the way to turn the referral program on and did not
          recognise it. The control is still the same form field. */}
      <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
        <span className="text-sm leading-relaxed">
          <span className="font-medium">Referral program</span>
          <span className="block text-muted">
            Nothing is granted until the invited family finishes setting up, which is
            what publishes their job post. A signup on its own earns nobody anything.
          </span>
        </span>
        <span className="relative inline-flex shrink-0">
          <input
            type="checkbox"
            name="enabled"
            role="switch"
            aria-checked={on}
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
            className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
          />
          <span className="block h-7 w-12 rounded-full bg-border-strong transition-colors peer-checked:bg-sage-deep" aria-hidden />
          <span className="pointer-events-none absolute left-1 top-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" aria-hidden />
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contacts per invitation" hint="Each side gets this many. 0 to 10.">
          <Input
            name="bonusContacts"
            type="number"
            min={0}
            max={10}
            defaultValue={bonusContacts}
            inputMode="numeric"
          />
        </Field>
        <Field
          label="Most one family can earn"
          hint="A reward with no ceiling is a bill nobody has priced. 0 to 100."
        >
          <Input
            name="bonusMax"
            type="number"
            min={0}
            max={100}
            defaultValue={bonusMax}
            inputMode="numeric"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Invitations claimed", value: stats.claimed },
          { label: "Of those, finished setting up", value: stats.qualified },
          { label: "Families earning", value: stats.families_earning },
          { label: "Contacts given away", value: stats.contacts_granted },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-background p-3">
            <p className="text-xl font-semibold tabular-nums">{m.value}</p>
            <p className="mt-1 text-xs leading-snug text-muted">{m.label}</p>
          </div>
        ))}
      </div>

      <FormError message={state.error} />
      <FormMessage message={state.message} />
      <SubmitButton>Save invitations</SubmitButton>
    </form>
  );
}
