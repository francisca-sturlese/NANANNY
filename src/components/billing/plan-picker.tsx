"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Plan } from "@/lib/billing/plans";
import {
  startCheckoutAction,
  openBillingPortalAction,
  type BillingState,
} from "@/lib/billing/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/auth/form-parts";

/**
 * Choosing a plan.
 *
 * Each plan is its own form posting its own key, rather than a radio group and
 * one submit. On a phone that means the whole card is the tap target and there
 * is no second step between choosing and going: fewer taps, and no state to get
 * out of sync with what is highlighted.
 *
 * The prices come from the server, which read them from `pricing_config`.
 * Nothing here knows what a subscription costs.
 */
export function PlanPicker({ plans }: { plans: Plan[] }) {
  const [state, action] = useActionState<BillingState, FormData>(startCheckoutAction, {});

  return (
    <div className="space-y-3">
      <FormError message={state.error} />

      {plans.map((plan) => (
        <form key={plan.key} action={action}>
          <input type="hidden" name="plan" value={plan.key} />
          <PlanButton plan={plan} />
        </form>
      ))}
    </div>
  );
}

function PlanButton({ plan }: { plan: Plan }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={[
        "relative flex w-full items-center justify-between gap-4 rounded-lg p-4 text-left transition-shadow",
        plan.bestValue
          ? "border-2 border-foreground"
          : "border border-border hover:shadow-card",
        pending ? "opacity-60" : "",
      ].join(" ")}
    >
      {plan.bestValue && (
        <Badge variant="butter" size="sm" className="absolute -top-2.5 left-4">
          Best value
        </Badge>
      )}

      <span>
        <span className="block text-sm font-semibold">{plan.label}</span>
        <span className="mt-0.5 block text-xs text-muted">
          Unlimited contacts, billed every {plan.interval}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-lg font-semibold tabular-nums">
          {plan.currency} {plan.amount.toLocaleString("en-AE")}
        </span>
        <span className="block text-xs text-muted">per {plan.interval}</span>
      </span>
    </button>
  );
}

/**
 * Cancelling, changing a card and receipts all live on the provider's own
 * pages. Rebuilding them here would mean handling card details in our forms,
 * which is the one thing worth avoiding above convenience.
 */
export function ManageBilling() {
  const [state, action] = useActionState<BillingState, FormData>(
    openBillingPortalAction,
    {},
  );

  return (
    <form action={action}>
      <FormError message={state.error} />
      <Button variant="outline" size="sm" type="submit">
        Manage billing or cancel
      </Button>
    </form>
  );
}
