import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { ReportActions } from "@/components/admin/report-actions";
import { whenExact } from "@/lib/admin/when";

export const metadata: Metadata = { title: "Reports" };

const STATUS_STYLE: Record<string, "neutral" | "sage" | "peach" | "butter"> = {
  open: "peach",
  under_review: "butter",
  actioned: "sage",
  dismissed: "neutral",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const admin = await requireAdmin("/admin/reports");
  const supabase = await createServerSupabase();

  let query = supabase
    .from("reports")
    .select("id, target_kind, target_id, reason, details, status, resolution, created_at, reporter_id, reported_user_id")
    .order("created_at", { ascending: false })
    .limit(100);

  // Open work first by default: a queue that shows resolved items at the top is
  // a queue nobody trusts.
  const REPORT_STATUSES = ["open", "under_review", "actioned", "dismissed"] as const;
  const chosen = REPORT_STATUSES.find((v) => v === status);

  if (status === "all") {
    // no filter
  } else if (chosen) {
    query = query.eq("status", chosen);
  } else {
    query = query.in("status", ["open", "under_review"]);
  }

  const { data: reports } = await query;
  const rows = reports ?? [];

  const { count: openCount } = await supabase
    .from("reports")
    .select("*", { count: "exact", head: true })
    .in("status", ["open", "under_review"]);

  return (
    <AdminShell
      active="/admin/reports"
      name={admin.firstName ?? "Admin"}
      openReports={openCount ?? 0}
    >
      <h1 className="text-2xl font-semibold sm:text-3xl">Reports</h1>
      <p className="mt-1 text-sm text-muted">
        Reports never reach the person reported. Closing one needs a note saying what was
        decided.
      </p>

      <nav className="mt-5 flex flex-wrap gap-2">
        {[
          { value: "", label: "Needs attention" },
          { value: "actioned", label: "Actioned" },
          { value: "dismissed", label: "Dismissed" },
          { value: "all", label: "All" },
        ].map((tab) => {
          const current = (status ?? "") === tab.value;
          return (
            <Link
              key={tab.value || "open"}
              href={tab.value ? `/admin/reports?status=${tab.value}` : "/admin/reports"}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "inline-flex min-h-11 shrink-0 items-center rounded-pill bg-foreground px-4 text-sm font-medium text-background"
                  : "inline-flex min-h-11 shrink-0 items-center rounded-pill border border-border bg-background px-4 text-sm font-medium text-muted"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border-strong bg-background p-8 text-center text-sm text-muted">
          Nothing here. That is the good outcome.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {rows.map((report) => (
            <li key={report.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{report.reason}</h2>
                    <Badge variant={STATUS_STYLE[report.status] ?? "neutral"} size="sm">
                      {report.status.replace("_", " ")}
                    </Badge>
                    <Badge variant="neutral" size="sm">
                      {report.target_kind}
                    </Badge>
                  </div>
                  {report.details && (
                    <p className="mt-2 text-sm leading-relaxed text-muted">{report.details}</p>
                  )}
                  <p className="mt-2 text-xs text-subtle">
                    Reported {whenExact(report.created_at)}
                  </p>
                  {report.resolution && (
                    <p className="mt-2 rounded-md bg-surface p-2.5 text-xs text-muted">
                      Decision: {report.resolution}
                    </p>
                  )}
                </div>

                {["open", "under_review"].includes(report.status) && (
                  <ReportActions reportId={report.id} status={report.status} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
