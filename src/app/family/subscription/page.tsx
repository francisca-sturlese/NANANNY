import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPricingConfig } from "@/lib/pricing";
import { plansFrom } from "@/lib/billing/plans";
import { billingConfigured, isTestMode } from "@/lib/billing/stripe";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { PlanPicker, ManageBilling } from "@/components/billing/plan-picker";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Subscription" };

// Reflects billing state that changes from outside the app.
export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  const user = await requireRole("family", "/family/subscription");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) redirect("/family/onboarding");

  const [pricing, { data: subscription }, { data: contactState }, { data: payments }] =
    await Promise.all([
      getPricingConfig(),
      supabase
        .from("subscriptions")
        .select("plan, status, price_aed, currency, current_period_end, cancel_at_period_end")
        .eq("family_id", family.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("my_contact_state"),
      supabase
        .from("payments")
        .select("amount_aed, currency, status, paid_at, created_at")
        .eq("family_id", family.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const contacts = Array.isArray(contactState) ? contactState[0] : contactState;
  const plans = plansFrom(pricing).filter((p) => p.enabled);

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const active = Boolean(contacts?.subscription_active);

  return (
    <AppShell nav={FAMILY_NAV} active="/family/subscription" name="Subscription">
      <div className="px-4 pt-4 sm:px-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Your subscription</h1>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        {/* Said plainly, because a test card that appears to work on what looks
            like the real site is how a launch goes out charging nobody. */}
        {billingConfigured() && isTestMode() && (
          <div className="rounded-md border border-butter bg-butter-wash px-4 py-3">
            <p className="text-sm leading-relaxed text-butter-deep">
              Payments are in test mode. Nothing here charges a real card.
            </p>
          </div>
        )}

        {checkout === "done" && (
          <div className="rounded-md border border-sage bg-sage-wash px-4 py-3.5">
            <p className="text-sm leading-relaxed text-sage-deep">
              Thank you. If your subscription is not shown below yet, give it a moment
              and refresh. We wait for confirmation from the payment provider rather
              than taking your word for it, which occasionally takes a few seconds.
            </p>
          </div>
        )}

        {checkout === "cancelled" && (
          <div className="rounded-md border border-border bg-surface px-4 py-3.5">
            <p className="text-sm leading-relaxed text-muted">
              Nothing was charged. Your free contacts are untouched.
            </p>
          </div>
        )}

        {!billingConfigured() && (
          <div className="rounded-md border border-border bg-surface px-4 py-3.5">
            <p className="text-sm leading-relaxed text-muted">
              Payments are not switched on yet. Everything else on the site works, and
              your {pricing.freeContacts} free contacts are unaffected.
            </p>
          </div>
        )}

        {/* ---------------------------------------------------- current state */}
        <Card>
          <CardBody>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">
                  {active ? "Unlimited contacts" : "Free contacts"}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {active
                    ? "You can message as many nannies as you like."
                    : "Viewing, saving and shortlisting are always free."}
                </p>
              </div>
              {active ? (
                <Badge variant="sage" size="sm">
                  {subscription?.plan === "weekly" ? "Weekly" : "Monthly"}
                </Badge>
              ) : (
                <span className="shrink-0 text-2xl font-semibold tabular-nums">
                  {contacts?.free_contacts_used ?? 0}
                  <span className="text-base font-medium text-muted">
                    /{contacts?.free_contacts_limit ?? pricing.freeContacts}
                  </span>
                </span>
              )}
            </div>

            {active && periodEnd && (
              <p className="mt-4 flex gap-2 text-sm leading-snug">
                <Check className="mt-0.5 size-4 shrink-0 text-sage-deep" aria-hidden />
                <span>
                  {subscription?.cancel_at_period_end
                    ? `Cancelled. You keep access until ${formatDate(periodEnd)}, which you have already paid for.`
                    : `Renews on ${formatDate(periodEnd)} at ${subscription?.currency ?? pricing.currency} ${Number(subscription?.price_aed ?? 0).toLocaleString("en-AE")}.`}
                </span>
              </p>
            )}

            {subscription?.status === "past_due" && (
              <p className="mt-3 flex gap-2 text-sm leading-snug text-muted">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-peach-deep" aria-hidden />
                <span>
                  The last payment did not go through. We will try again, and your
                  access continues in the meantime. Updating your card below is the
                  quickest fix.
                </span>
              </p>
            )}

            {active && billingConfigured() && (
              <div className="mt-5">
                <ManageBilling />
              </div>
            )}
          </CardBody>
        </Card>

        {/* --------------------------------------------------------- the plans */}
        {!active && billingConfigured() && (
          <div>
            <h2 className="mb-3 text-base font-semibold">Continue without limits</h2>
            <PlanPicker plans={plans} />
            <p className="mt-3 text-xs leading-relaxed text-subtle">
              Cancel any time and keep access until the period you have paid for ends.
              Conversations you have already started stay open and free either way.
              There is no commission on a nanny&apos;s salary and no placement fee.
            </p>
          </div>
        )}

        {/* ------------------------------------------------------- what we took */}
        {(payments?.length ?? 0) > 0 && (
          <div>
            <h2 className="mb-3 text-base font-semibold">Payments</h2>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {payments?.map((payment, index) => (
                <li key={index} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium tabular-nums">
                      {payment.currency} {Number(payment.amount_aed).toLocaleString("en-AE")}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(new Date(payment.paid_at ?? payment.created_at))}
                    </p>
                  </div>
                  <Badge
                    variant={payment.status === "succeeded" ? "sage" : "neutral"}
                    size="sm"
                  >
                    {payment.status === "succeeded"
                      ? "Paid"
                      : payment.status === "failed"
                        ? "Not taken"
                        : payment.status === "refunded"
                          ? "Refunded"
                          : "Pending"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs leading-relaxed text-subtle">
          Questions about a charge? Write to billing@nananny.com, or read{" "}
          <Link href="/pricing" className="underline">
            how pricing works
          </Link>
          .
        </p>
      </div>
    </AppShell>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
