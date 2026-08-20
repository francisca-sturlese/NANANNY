import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell, Metric } from "@/components/admin/admin-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAed } from "@/lib/utils";
import { whenDay } from "@/lib/admin/when";

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

/**
 * Accounts that signed up and stopped.
 *
 * Every other number here counts profile rows, and a profile is only created
 * when somebody opens onboarding. Without this, an account that signed up and
 * went no further is invisible: the panel reads "0 nannies" while a real nanny
 * has an account, and there is no way to tell nobody signing up apart from
 * everybody stopping at the first step.
 */
type Stalled = {
  families_no_profile: number;
  nannies_no_profile: number;
  families_incomplete: number;
  nannies_draft: number;
  unverified_emails: number;
  stalled: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
    created_at: string;
    stage: string;
  }[];
};

/**
 * Accounts sharing a phone number.
 *
 * Grouped rather than flagged one by one, because the answer is nearly always
 * "this is one person who got stuck" and what an operator needs is to see the
 * whole story at once.
 */
type DuplicatePhone = {
  phone: string;
  accounts: number;
  people: {
    id: string;
    email: string;
    role: string;
    name: string;
    created_at: string;
  }[];
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

  const [
    { data: rawMetrics },
    { data: rawFunnel },
    { data: rawStalled },
    { data: rawDuplicates },
  ] = await Promise.all([
    supabase.rpc("admin_metrics"),
    supabase.rpc("admin_contact_funnel"),
    supabase.rpc("admin_stalled_signups"),
    supabase.rpc("admin_duplicate_phones"),
  ]);

  const m = rawMetrics as unknown as Metrics;
  const f = rawFunnel as unknown as Funnel;
  const stalled = rawStalled as unknown as Stalled;
  const duplicates = (rawDuplicates ?? []) as unknown as DuplicatePhone[];

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
            No subscriptions yet. Checkout is built and waiting on a payment key, so
            these stay at zero until one is set.
          </p>
        )}
      </section>

      {duplicates.length > 0 && (
        <section className="mt-8">
          <h2 className="eyebrow">Same phone, more than one account</h2>

          <Card className="mt-3">
            <CardBody>
              <ul className="space-y-4">
                {duplicates.map((group) => (
                  <li key={group.phone}>
                    <p className="text-sm font-medium tabular-nums">
                      {group.phone}
                      <span className="ml-2 font-normal text-muted">
                        {group.accounts} accounts
                      </span>
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {group.people.map((person) => (
                        <li
                          key={person.id}
                          className="flex flex-wrap items-baseline gap-x-3 text-sm text-muted"
                        >
                          <span>{person.name || person.email}</span>
                          <Badge variant="neutral" size="sm">
                            {person.role}
                          </Badge>
                          <span className="text-xs text-subtle">{person.email}</span>
                          <span className="ml-auto text-xs text-subtle">
                            {whenDay(person.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-xs leading-relaxed text-subtle">
                Usually one person who thought the first attempt had not worked and
                started again. The oldest account is normally the one to keep. Signing
                up with a number that already has an account is now refused, so this
                list should stop growing.
              </p>
            </CardBody>
          </Card>
        </section>
      )}

      {/* Where people stopped, above the funnel on purpose: in the first weeks
          this is the bigger number and the one somebody can act on today. The
          funnel starts at families who already have a profile, so everybody in
          here is upstream of even its first bar. */}
      {stalled.stalled.length > 0 && (
        <section className="mt-8">
          <h2 className="eyebrow">Signed up and stopped</h2>

          <Card className="mt-3">
            <CardBody>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric
                  label="Never opened onboarding"
                  value={stalled.families_no_profile + stalled.nannies_no_profile}
                />
                <Metric label="Family onboarding unfinished" value={stalled.families_incomplete} />
                <Metric label="Nanny profile still a draft" value={stalled.nannies_draft} />
                <Metric label="Email never confirmed" value={stalled.unverified_emails} />
              </div>

              {/* The names stay behind a click: this list grows with every
                  signup that stalls, and an overview page that scrolls forever
                  stops being an overview. Closed by default, most recent first,
                  and never more than a screenful even when open. */}
              <details className="mt-5 border-t border-border pt-4">
                <summary className="tap-target cursor-pointer text-sm font-medium underline underline-offset-4">
                  Show who they are
                </summary>
                <ul className="mt-2 divide-y divide-border">
                  {stalled.stalled.slice(0, 12).map((person) => (
                    <li
                      key={person.id}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                    >
                      <Link
                        href={`/admin/users/${person.id}`}
                        className="text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {[person.first_name, person.last_name].filter(Boolean).join(" ") ||
                          person.email}
                      </Link>
                      <Badge variant="neutral" size="sm">
                        {person.role}
                      </Badge>
                      <span className="text-sm text-muted">{person.stage}</span>
                      <span className="ml-auto text-xs text-subtle">{person.email}</span>
                    </li>
                  ))}
                </ul>
                {stalled.stalled.length > 12 && (
                  <p className="mt-2 text-sm text-muted">
                    …and {stalled.stalled.length - 12} more. The{" "}
                    <Link href="/admin/users" className="underline underline-offset-4">
                      Users page
                    </Link>{" "}
                    has all of them, searchable.
                  </p>
                )}
              </details>

              <p className="mt-4 text-xs leading-relaxed text-subtle">
                None of these appear in any other number on this page, because those
                count profiles and a profile is only created once somebody opens
                onboarding. Somebody who signed up and stopped is invisible everywhere
                else.
              </p>
            </CardBody>
          </Card>
        </section>
      )}

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
                        {/* "0 −1" read as a negative count. It is a number of
                            people who stopped here, so it says so. */}
                        {dropped != null && dropped > 0 && (
                          <span className="ml-2 text-xs font-normal text-subtle">
                            {dropped} stopped here
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
