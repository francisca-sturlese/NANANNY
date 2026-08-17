import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { SupportRequestActions } from "@/components/admin/support-request-actions";

export const metadata: Metadata = { title: "Support" };

const STATUS_STYLE: Record<string, "neutral" | "sage" | "peach" | "butter"> = {
  open: "peach",
  in_progress: "butter",
  answered: "sage",
  closed: "neutral",
};

const CATEGORY_LABEL: Record<string, string> = {
  account: "Account",
  profile: "Profile",
  billing: "Billing",
  safety: "Safety",
  technical: "Technical",
  other: "Other",
};

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const admin = await requireAdmin("/admin/support");
  const supabase = await createServerSupabase();

  const STATUSES = ["open", "in_progress", "answered", "closed"] as const;
  const chosen = STATUSES.find((v) => v === status);

  let query = supabase
    .from("support_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status === "all") {
    // no filter
  } else if (chosen) {
    query = query.eq("status", chosen);
  } else {
    query = query.in("status", ["open", "in_progress"]);
  }

  const { data: requests } = await query;
  const rows = requests ?? [];

  const { count: openCount } = await supabase
    .from("support_requests")
    .select("*", { count: "exact", head: true })
    .in("status", ["open", "in_progress"]);

  return (
    <AdminShell
      active="/admin/support"
      name={admin.firstName ?? "Admin"}
      openSupport={openCount ?? 0}
    >
      <h1 className="text-2xl font-semibold sm:text-3xl">Support</h1>
      <p className="mt-1 text-sm text-muted">
        Messages from the contact form. Anyone can send one, signed in or not.
      </p>

      <nav className="mt-5 flex flex-wrap gap-2">
        {[
          { value: "", label: "Needs a reply" },
          { value: "answered", label: "Answered" },
          { value: "closed", label: "Closed" },
          { value: "all", label: "All" },
        ].map((tab) => {
          const current = (status ?? "") === tab.value;
          return (
            <a
              key={tab.value || "open"}
              href={tab.value ? `/admin/support?status=${tab.value}` : "/admin/support"}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "inline-flex min-h-11 shrink-0 items-center rounded-pill bg-foreground px-4 text-sm font-medium text-background"
                  : "inline-flex min-h-11 shrink-0 items-center rounded-pill border border-border bg-background px-4 text-sm font-medium text-muted"
              }
            >
              {tab.label}
            </a>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border-strong bg-background p-8 text-center text-sm text-muted">
          Nothing waiting for a reply.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {rows.map((request) => (
            <li key={request.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{request.subject}</h2>
                    <Badge variant={STATUS_STYLE[request.status] ?? "neutral"} size="sm">
                      {request.status.replace("_", " ")}
                    </Badge>
                    <Badge variant="neutral" size="sm">
                      {CATEGORY_LABEL[request.category] ?? request.category}
                    </Badge>
                  </div>

                  <p className="mt-1 text-xs text-muted">
                    {request.contact_name ? `${request.contact_name} · ` : ""}
                    <a
                      href={`mailto:${request.contact_email}?subject=Re: ${encodeURIComponent(request.subject)}`}
                      className="underline underline-offset-4"
                    >
                      {request.contact_email}
                    </a>
                    {" · "}
                    {new Date(request.created_at).toLocaleString("en-GB")}
                    {!request.user_id && " · not logged in"}
                  </p>

                  <p className="mt-2 leading-relaxed whitespace-pre-line text-sm text-muted">
                    {request.message}
                  </p>

                  {request.internal_note && (
                    <p className="mt-2 rounded-md bg-surface p-2.5 text-xs text-muted">
                      Internal: {request.internal_note}
                    </p>
                  )}
                </div>

                <SupportRequestActions
                  requestId={request.id}
                  status={request.status}
                  contactEmail={request.contact_email}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
