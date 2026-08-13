"use client";

import { useActionState } from "react";
import { updatePricingAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

/**
 * The commercial model, editable.
 *
 * The free allowance is the single most sensitive number in the product: raise
 * it and revenue moves, lower it and families meet the paywall sooner. It sits
 * at the top, on its own, so nobody changes it by accident while editing a price.
 */
export function PricingForm({
  freeContacts,
  weeklyPrice,
  monthlyPrice,
  weeklyEnabled,
  monthlyEnabled,
  monthlyIsBestValue,
}: {
  freeContacts: number;
  weeklyPrice: number;
  monthlyPrice: number;
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  monthlyIsBestValue: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updatePricingAction, {});

  return (
    <form action={action} className="space-y-6">
      <Field
        label="Free nanny contacts"
        htmlFor="freeContacts"
        required
        hint="How many conversations a family can start before the paywall. Applies to every family from the moment you save."
      >
        <Input
          id="freeContacts"
          name="freeContacts"
          type="number"
          min={0}
          max={50}
          defaultValue={freeContacts}
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Weekly price (AED)" htmlFor="weeklyPrice" required>
          <Input
            id="weeklyPrice"
            name="weeklyPrice"
            type="number"
            min={0}
            step="1"
            defaultValue={weeklyPrice}
            required
          />
        </Field>
        <Field label="Monthly price (AED)" htmlFor="monthlyPrice" required>
          <Input
            id="monthlyPrice"
            name="monthlyPrice"
            type="number"
            min={0}
            step="1"
            defaultValue={monthlyPrice}
            required
          />
        </Field>
      </div>

      <fieldset className="space-y-2.5">
        <legend className="text-sm font-medium">Availability</legend>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="weeklyEnabled"
            defaultChecked={weeklyEnabled}
            className="size-4 accent-black"
          />
          <span className="text-sm">Offer the weekly plan</span>
        </label>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="monthlyEnabled"
            defaultChecked={monthlyEnabled}
            className="size-4 accent-black"
          />
          <span className="text-sm">Offer the monthly plan</span>
        </label>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="monthlyIsBestValue"
            defaultChecked={monthlyIsBestValue}
            className="size-4 accent-black"
          />
          <span className="text-sm">Mark monthly as Best Value</span>
        </label>
        <p className="text-xs text-subtle">
          At least one plan must stay available. The database refuses to turn both off,
          because then nobody could ever pay.
        </p>
      </fieldset>

      <FormError message={state.error} />
      <FormMessage message={state.message} />

      <SubmitButton size="lg" block pendingLabel="Saving…">
        Save pricing
      </SubmitButton>
    </form>
  );
}
