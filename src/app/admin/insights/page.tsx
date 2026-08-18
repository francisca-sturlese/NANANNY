import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, CardBody } from "@/components/ui/card";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Traffic" };
export const dynamic = "force-dynamic";

type Day = { day: string; visitors: number; views: number; signups: number };
type Source = { source: string; visitors: number };
type Page = { path: string; visitors: number; views: number };

/**
 * How many people came, and how many of them signed up.
 *
 * Built to answer one question that has been unanswerable: whether a quiet week
 * means nobody visited, or means everybody visited and left. Those two need
 * opposite work, and every plan made without knowing which was a guess.
 *
 * So the page leads with visitors against signups on the same row, and resists
 * showing anything else prominently. A dashboard full of numbers nobody acts on
 * is how a real signal gets lost.
 */
export default async function AdminInsightsPage() {
  const admin = await requireAdmin("/admin/insights");
  const supabase = await createServerSupabase();

  const [{ data: traffic }, { data: breakdown }, subsRes, standaloneRes] = await Promise.all([
    supabase.rpc("admin_traffic", { p_days: 14 }),
    supabase.rpc("admin_traffic_sources", { p_days: 14 }),
    // The app metrics: private rows, so the service client, the same pattern
    // as every admin read of things a session cannot see.
    createServiceClient()
      .from("push_subscriptions")
      .select("user_id", { count: "exact", head: false }),
    createServiceClient()
      .from("analytics_events")
      .select("session_id, created_at, properties")
      .eq("event", "page_view")
      // eslint-disable-next-line react-hooks/purity -- server component rendered per request: the current time is the input of the query, not a render impurity
      .gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString())
      .filter("properties->>standalone", "eq", "true"),
  ]);

  const days = (Array.isArray(traffic) ? traffic : []) as Day[];
  const parts = (breakdown ?? {}) as { sources?: Source[]; pages?: Page[] };
  const sources = parts.sources ?? [];
  const pages = parts.pages ?? [];

  const peak = Math.max(1, ...days.map((d) => d.visitors));
  const totalVisitors = days.reduce((sum, d) => sum + Number(d.visitors), 0);
  const totalSignups = days.reduce((sum, d) => sum + Number(d.signups), 0);

  /**
   * Only worth showing once there is enough to divide by.
   *
   * A conversion rate over four visitors is a number that moves twenty points
   * when one more person signs up, and reading it as a trend is worse than not
   * having it.
   */
  const rate = totalVisitors >= 20 ? Math.round((totalSignups / totalVisitors) * 100) : null;

  return (
    <AdminShell active="/admin/insights" name={admin.firstName ?? "Admin"}>
      <h1 className="text-2xl font-semibold sm:text-3xl">Traffic</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
        People, not page views. Counting views makes five people reading one page
        look the same as one person reading five, and only the first of those
        means anything is working. The last fourteen days, in Dubai time.
      </p>

      {/* ---- The installed app: is anybody living in it? ---- */}
      {(() => {
        const subs = subsRes.data ?? [];
        const devices = subs.length;
        const people = new Set(subs.map((r) => r.user_id)).size;
        const rows = (standaloneRes.data ?? []) as { session_id: string | null; created_at: string; properties: unknown }[];
        const appVisitors14 = new Set(rows.map((r) => r.session_id).filter(Boolean)).size;
        // eslint-disable-next-line react-hooks/purity -- server component rendered per request: the current time is the input of the query, not a render impurity
        const dayAgo = Date.now() - 864e5;
        const appVisitorsToday = new Set(
          rows.filter((r) => new Date(r.created_at).getTime() > dayAgo).map((r) => r.session_id).filter(Boolean),
        ).size;
        return (
          <section className="mt-6">
            <h2 className="eyebrow">The installed app</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "People with notifications on", value: people },
                { label: "Devices subscribed", value: devices },
                { label: "App visitors, 14 days", value: appVisitors14 },
                { label: "App visitors, today", value: appVisitorsToday },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-border bg-background p-4">
                  <p className="text-2xl font-semibold tabular-nums">{m.value}</p>
                  <p className="mt-1 text-xs leading-snug text-muted">{m.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-subtle">
              An app visitor is somebody who opened NaNanny from their home
              screen. On iPhone that is the only install signal that exists, and
              it is the one that matters: installed and used, not merely added.
            </p>
          </section>
        );
      })()}

      {totalVisitors === 0 && (
        <div className="mt-6 max-w-2xl rounded-md border border-butter bg-butter-wash px-4 py-3">
          <p className="text-sm leading-relaxed">
            Nothing recorded yet. Counting starts from the moment this was
            deployed, so an empty table on the first day is expected rather than
            a fault. Give it a day before reading anything into it.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-sm text-muted">Visitors, 14 days</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{totalVisitors}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-muted">Signed up</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{totalSignups}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-muted">Of those who came</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {rate === null ? "too few" : `${rate}%`}
            </p>
            {rate === null && (
              <p className="mt-1 text-xs leading-relaxed text-subtle">
                Shown once twenty people have visited. Below that it swings on
                one person and reads as a trend.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardBody>
            <h2 className="text-base font-semibold">By day</h2>
            <ul className="mt-4 space-y-2">
              {days.map((d) => (
                <li key={d.day} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-muted tabular-nums">
                    {new Date(d.day).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="h-5 flex-1 overflow-hidden rounded-sm bg-surface">
                    <span
                      className="block h-full bg-sage"
                      style={{ width: `${Math.round((Number(d.visitors) / peak) * 100)}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums">
                    <span className="font-medium">{d.visitors}</span>
                    <span className="text-muted"> here</span>
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                    <span className={Number(d.signups) > 0 ? "font-medium" : "text-subtle"}>
                      {d.signups}
                    </span>
                    <span className="text-muted"> joined</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="text-base font-semibold">Where they came from</h2>
            <p className="mt-1 text-sm text-muted">
              The site they arrived from, never the address. Direct means a typed
              address, a bookmark, or a link in a messaging app, which is most of
              what a WhatsApp share looks like from here.
            </p>
            {sources.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {sources.map((s) => (
                  <li key={s.source} className="flex justify-between gap-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{s.source}</span>
                    <span className="shrink-0 tabular-nums">{s.visitors}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="text-base font-semibold">What they looked at</h2>
            <p className="mt-1 text-sm text-muted">
              A profile is counted as a profile, never as which one. How many
              people read a nanny&apos;s page is useful. Which nanny a particular
              visitor read is not ours to keep.
            </p>
            {pages.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {pages.map((p) => (
                  <li key={p.path} className="flex justify-between gap-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-mono text-xs">{p.path}</span>
                    <span className="shrink-0 tabular-nums">
                      {p.visitors}
                      <span className="text-muted"> / {p.views}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
