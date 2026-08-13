import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Audit log" };

const ACTION_LABEL: Record<string, string> = {
  nanny_status_change: "Nanny review",
  user_status_change: "Account status",
  badge_granted: "Badge granted",
  badge_revoked: "Badge removed",
  report_resolved: "Report closed",
  pricing_changed: "Pricing changed",
  job_moderated: "Job moderated",
};

/**
 * Everything an admin has done, newest first.
 *
 * Read-only by design. An audit log that can be edited is not an audit log, so
 * there is deliberately no action on this page.
 */
export default async function AdminAuditPage() {
  const admin = await requireAdmin("/admin/audit");
  const supabase = await createServerSupabase();

  const { data: entries } = await supabase
    .from("audit_logs")
    .select("id, action, entity_kind, entity_id, before_state, after_state, created_at, actor_id")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = entries ?? [];

  // One lookup for the names rather than one per row.
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("users").select("id, first_name, email").in("id", actorIds)
    : { data: [] };
  const actorName = new Map(
    (actors ?? []).map((a) => [a.id, a.first_name ?? a.email]),
  );

  return (
    <AdminShell active="/admin/audit" name={admin.firstName ?? "Admin"}>
      <h1 className="text-2xl font-semibold sm:text-3xl">Audit log</h1>
      <p className="mt-1 text-sm text-muted">
        Every administrative action, written by the database itself. Read only.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border-strong bg-background p-8 text-center text-sm text-muted">
          Nothing recorded yet.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
          {rows.map((entry) => {
            const before = entry.before_state as Record<string, unknown> | null;
            const after = entry.after_state as Record<string, unknown> | null;
            return (
              <li key={entry.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral" size="sm">
                    {ACTION_LABEL[entry.action] ?? entry.action}
                  </Badge>
                  <span className="text-xs text-subtle">
                    {new Date(entry.created_at).toLocaleString("en-GB")}
                  </span>
                  <span className="text-xs text-muted">
                    by {actorName.get(entry.actor_id ?? "") ?? "system"}
                  </span>
                </div>

                {(before || after) && (
                  <p className="mt-1.5 font-mono text-xs break-all text-muted">
                    {before ? summarise(before) : ""}
                    {before && after ? " → " : ""}
                    {after ? summarise(after) : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}

function summarise(state: Record<string, unknown>): string {
  return Object.entries(state)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
    .join(" ");
}
