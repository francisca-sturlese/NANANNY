import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell, Metric } from "@/components/admin/admin-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatAed } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

type Metrics = {
  families: number;
  families_onboarded: number;
  nannies_total: number;
  nannies_by_status: Record<string, number>;
  jobs_active: number;
  jobs_total: number;
  applications: number;
  conversations: number;
  messages: number;
  saved_profiles: number;
  reports_open: number;
  free_contacts_used: number;
  paid_contacts: number;
  subscriptions_active: number;
  subscriptions_by_plan: Record<string, number>;
  revenue_aed: number;
  pending_review: number;
};

type Funnel = {
  free_contact_limit: number;
  signed_up: number;
  profile_completed: number;
  contacted_at_least: Record<string, number>;
  exhausted_allowance: number;
  subscribed: number;
  free_to_paid_rate: number | null;
};

export default async function AdminOverviewPage() {
  const admin = await requireAdmin("/admin");
  const supabase = await createServerSupabase();

  const [{ data: rawMetrics }, { data: rawFunnel }] = await Promise.all([
    supabase.rpc("admin_metrics"),
    supabase.rpc("admin_contact_funnel"),
  ]);

  const m = rawMetrics as unknown as Metrics;
  const f = rawFunnel as unknown as Funnel;

  const limit = f.free_contact_limit;
  // One row per step of the funnel, in the order a family walks it.
  const steps = [
    { label: "Signed up", value: f.signed_up },
    { label: "Profile completed", value: f.profile_completed },
    ...Array.from({ length: limit }, (_, i) => ({
      label: `Contacted ${i + 1} ${i === 0 ? "nanny" : "nannies"}`,
      value: f.contacted_at_least[String(i + 1)] ?? 0,
    })),
    { label: `Tried a ${ordinal(limit + 1)}`, value: f.contacted_at_least[String(limit + 1)] ?? 0 },
    { label: "Subscribed", value: f.subscribed },
  ];
  const widest = Math.max(...steps.map((s) => s.value), 1);

  return (
    <AdminShell
      active="/admin"
      name={admin.firstName ?? "Admin"}
      pendingReview={m.pending_review}
      openReports={m.reports_open}
    >
      <h1 className="text-2xl font-semibold sm:text-3xl">Overview</h1>

      {(m.pending_review > 0 || m.reports_open > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {m.pending_review > 0 && (
            <Link href="/admin/review">
              <Button size="sm">
                {m.pending_review} {m.pending_review === 1 ? "profile" : "profiles"} to review
              </Button>
            </Link>
          )}
          {m.reports_open > 0 && (
            <Link href="/admin/reports">
              <Button size="sm" variant="peach">
                {m.reports_open} open {m.reports_open === 1 ? "report" : "reports"}
              </Button>
            </Link>
          )}
        </div>
      )}

      <section className="mt-6">
        <h2 className="eyebrow">Marketplace</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Metric
            label="Families"
            value={m.families}
            hint={`${m.families_onboarded} completed onboarding`}
          />
          <Metric
            label="Nannies live"
            value={m.nannies_by_status.approved ?? 0}
            hint={`${m.nannies_total} total`}
            tone="sage"
          />
          <Metric
            label="Awaiting review"
            value={m.pending_review}
            tone={m.pending_review > 0 ? "butter" : "neutral"}
          />
          <Metric label="Active jobs" value={m.jobs_active} hint={`${m.jobs_total} total`} />
          <Metric label="Applications" value={m.applications} />
          <Metric label="Conversations" value={m.conversations} />
          <Metric label="Messages" value={m.messages} />
          <Metric label="Saved profiles" value={m.saved_profiles} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="eyebrow">Revenue</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Free contacts used"
            value={m.free_contacts_used}
            hint="The leading indicator"
          />
          <Metric
            label="Contacts on a plan"
            value={m.paid_contacts}
            tone={m.paid_contacts > 0 ? "sage" : "neutral"}
          />
          <Metric label="Active subscriptions" value={m.subscriptions_active} />
          <Metric label="Revenue" value={formatAed(Number(m.revenue_aed))} />
        </div>

        {m.subscriptions_active === 0 && (
          <p className="mt-3 text-xs text-subtle">
            No subscriptions yet. Checkout is not built, so these will stay at zero until
            payments are wired up.
          </p>
        )}
      </section>

      {/* The funnel is the whole business in one picture: how many families
          reach each contact, and how many pay once the free ones run out. */}
      <section className="mt-8">
        <h2 className="eyebrow">Contact funnel</h2>

        <Card className="mt-3">
          <CardBody>
            <ol className="space-y-2.5">
              {steps.map((step, i) => {
                const previous = steps[i - 1]?.value;
                const dropped =
                  previous != null && previous > 0 ? previous - step.value : null;
                return (
                  <li key={step.label}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{step.label}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {step.value}
                        {dropped != null && dropped > 0 && (
                          <span className="ml-2 text-xs font-normal text-subtle">
                            &minus;{dropped}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-pill bg-border">
                      <div
                        className="h-full rounded-pill bg-foreground"
                        style={{ width: `${Math.round((step.value / widest) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-5 border-t border-border pt-4">
              <p className="text-sm text-muted">
                Of the {f.exhausted_allowance}{" "}
                {f.exhausted_allowance === 1 ? "family" : "families"} that used all{" "}
                {limit} free contacts,{" "}
                <span className="font-medium text-foreground">
                  {f.free_to_paid_rate == null ? "none yet" : `${f.free_to_paid_rate}%`}
                </span>{" "}
                went on to subscribe.
              </p>
              <p className="mt-1 text-xs text-subtle">
                This is the number the business lives on.
              </p>
            </div>
          </CardBody>
        </Card>
      </section>
    </AdminShell>
  );
}

function ordinal(n: number) {
  const suffix = ["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}
