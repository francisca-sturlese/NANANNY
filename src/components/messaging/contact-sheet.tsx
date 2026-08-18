"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { startConversationAction, type ContactResult } from "@/lib/messaging/actions";
import { Button } from "@/components/ui/button";
import { startCheckoutAction, type BillingState } from "@/lib/billing/actions";
import { Textarea } from "@/components/ui/field";
import { SubmitButton, FormError } from "@/components/auth/form-parts";
import { Badge } from "@/components/ui/badge";
import { Portal, useScrollLock } from "@/components/ui/portal";

export type PricingSummary = {
  freeContacts: number;
  weeklyPriceAed: number;
  monthlyPriceAed: number;
  currency: string;
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  monthlyIsBestValue: boolean;
};

/**
 * Message a nanny — the moment the product monetises.
 *
 * A sheet, not a page: the family keeps the profile in view behind it. Writing
 * the first message and spending the contact are the same action, so nobody
 * spends a credit and then abandons an empty thread.
 *
 * If the allowance is gone the server says so and the same sheet becomes the
 * paywall in place. No redirect, nothing lost, and the nanny they were writing
 * to stays named on screen.
 */
export function ContactSheet({
  nannyId,
  nannyName,
  contactsRemaining,
  subscribed,
  promoActive = false,
  pricing,
  source = "profile",
}: {
  nannyId: string;
  nannyName: string;
  contactsRemaining: number;
  subscribed: boolean;
  /** The launch window is open, so nothing costs a contact for anyone. */
  promoActive?: boolean;
  pricing: PricingSummary;
  source?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ContactResult, FormData>(
    startConversationAction,
    {},
  );
  useScrollLock(open);

  // The server decides. This only chooses which face the sheet wears.
  const showPaywall = state.paywall === true;

  return (
    <>
      <Button size="lg" block onClick={() => setOpen(true)}>
        Message {nannyName}
      </Button>

      {/* During the window the counter is not just irrelevant, it is wrong:
          nothing is being spent, so showing what is left implies it is. */}
      {promoActive ? (
        <p className="mt-1 text-center text-[0.6875rem] text-sage-deep">
          Free right now. This does not use a contact.
        </p>
      ) : (
        !subscribed &&
        contactsRemaining > 0 && (
          <p className="mt-1 text-center text-[0.6875rem] text-subtle">
            {contactsRemaining} free {contactsRemaining === 1 ? "contact" : "contacts"} left
          </p>
        )
      )}

      {open && (
        <Portal>
          <div
            className="fixed inset-0 z-50"
            role="dialog"
            aria-modal="true"
            aria-label={showPaywall ? "Continue with a plan" : `Message ${nannyName}`}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/40"
            />

            <div className="pb-safe absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-xl border-t border-border bg-background sm:inset-0 sm:m-auto sm:h-fit sm:max-w-lg sm:rounded-xl sm:border">
              <div className="sticky top-0 z-10 bg-background pt-2">
                <div
                  aria-hidden
                  className="mx-auto h-1 w-10 rounded-pill bg-border-strong sm:hidden"
                />
                <div className="flex items-start justify-between gap-3 px-5 py-3">
                  <h2 className="text-lg font-semibold">
                    {showPaywall
                      ? "You've found somebody else worth talking to."
                      : `Message ${nannyName}`}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="-mt-1 grid size-11 shrink-0 place-items-center rounded-pill text-muted"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </div>
              </div>

              {showPaywall ? (
                <Paywall pricing={pricing} used={state.freeContactsUsed ?? pricing.freeContacts} />
              ) : (
                <form action={action} className="space-y-4 px-5 pb-5">
                  <input type="hidden" name="nannyId" value={nannyId} />
                  <input type="hidden" name="source" value={source} />

                  <p className="text-sm leading-relaxed text-muted">
                    Tell her a little about your family and what you&apos;re looking for.
                    She sees this first.
                  </p>

                  <Textarea
                    name="firstMessage"
                    required
                    autoFocus
                    maxLength={5000}
                    className="min-h-32"
                    placeholder={`Hello ${nannyName}, we're a family in Dubai with two children aged 2 and 5. We're looking for someone live out, Monday to Friday. Would you be open to a chat?`}
                  />

                  <FormError message={state.error} />

                  <SubmitButton size="lg" block pendingLabel="Sending…">
                    Send message
                  </SubmitButton>

                  {/* Said before the first message, not buried in a policy:
                      the same promise of a record that protects her protects
                      the platform's right to look when something is wrong. */}
                  <p className="text-center text-[0.7rem] leading-relaxed text-subtle">
                    Conversations can be reviewed by the NaNanny team for safety
                    and dispute resolution. Every review is logged.
                  </p>

                  {promoActive ? (
                    <p className="text-center text-xs text-muted">
                      Free while we are launching. This does not use any of your{" "}
                      {pricing.freeContacts} contacts, and neither will the next one.
                    </p>
                  ) : (
                    !subscribed && (
                      <p className="text-center text-xs text-muted">
                        This uses one of your {pricing.freeContacts} free contacts. Every
                        message after this one, with her, is included.
                      </p>
                    )
                  )}
                </form>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

/**
 * The paywall. Two prices, both easy to tap, cheapest first. No pressure copy,
 * because the family already knows what they want.
 */
function Paywall({ pricing, used }: { pricing: PricingSummary; used: number }) {
  return (
    <div className="space-y-4 px-5 pb-5">
      <p className="text-sm leading-relaxed text-muted">
        You&apos;ve used your {used} free nanny contacts. Continue connecting with
        unlimited nannies.
      </p>

      <div className="grid gap-3">
        {/* Cheapest first. The smaller commitment should be the easier one to
            find, even though the monthly plan is the better deal. */}
        {pricing.weeklyEnabled && (
          <PlanOption
            plan="weekly"
            name="Weekly"
            price={pricing.weeklyPriceAed}
            period="week"
            currency={pricing.currency}
            highlighted={!pricing.monthlyIsBestValue}
          />
        )}
        {pricing.monthlyEnabled && (
          <PlanOption
            plan="monthly"
            name="Monthly"
            price={pricing.monthlyPriceAed}
            period="month"
            currency={pricing.currency}
            highlighted={pricing.monthlyIsBestValue}
          />
        )}
      </div>

      <p className="text-center text-xs leading-relaxed text-subtle">
        Conversations you have already started stay open and free. There is no commission
        on a nanny&apos;s salary and no placement fee.
      </p>

      <Link href="/pricing" className="block text-center">
        <span className="text-sm text-muted underline underline-offset-4">
          Compare plans
        </span>
      </Link>
    </div>
  );
}

function PlanOption({
  plan,
  name,
  price,
  period,
  currency,
  highlighted = false,
}: {
  plan: "weekly" | "monthly";
  name: string;
  price: number;
  period: string;
  currency: string;
  highlighted?: boolean;
}) {
  const [state, action] = useActionState<BillingState, FormData>(startCheckoutAction, {});

  return (
    <form
      action={action}
      className={
        highlighted
          ? "relative rounded-lg border-2 border-foreground p-4"
          : "relative rounded-lg border border-border p-4"
      }
    >
      <input type="hidden" name="plan" value={plan} />

      {highlighted && (
        <span className="absolute -top-3 left-4">
          <Badge variant="solid" size="sm">
            Best Value
          </Badge>
        </span>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{name}</p>
          <p className="mt-0.5 text-2xl font-semibold">
            {price}
            <span className="ml-1 text-sm font-medium text-muted">
              {currency} / {period}
            </span>
          </p>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted">Unlimited nanny contacts and messaging.</p>

      <SubmitButton size="lg" block className="mt-3" pendingLabel="Opening payment…">
        Continue with {price} {currency}
      </SubmitButton>

      <FormError message={state.error} />
    </form>
  );
}
