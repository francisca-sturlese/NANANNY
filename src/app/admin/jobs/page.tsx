import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { JobModeration } from "@/components/admin/job-moderation";

export const metadata: Metadata = { title: "Jobs" };

const STATUS_STYLE: Record<string, "neutral" | "sage" | "peach" | "butter"> = {
  draft: "neutral",
  active: "sage",
  paused: "butter",
  closed: "neutral",
  filled: "sage",
};

const JOB_STATUSES = ["draft", "active", "paused", "closed", "filled"] as const;

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const admin = await requireAdmin("/admin/jobs");
  const supabase = await createServerSupabase();

  let query = supabase
    .from("jobs")
    .select("id, title, status, emirate, area, salary_min_aed, salary_max_aed, responsibilities, created_at, family_id")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, "")}%`);
  const chosen = JOB_STATUSES.find((v) => v === status);
  if (chosen) query = query.eq("status", chosen);

  const { data: jobs } = await query;
  const rows = jobs ?? [];

  // Applications and family names for everything on the page, two queries
  // rather than one per row. The admin question this answers is "is this post
  // working": how many applied, how far did they get, is anybody waiting.
  const jobIds = rows.map((j) => j.id);
  const familyIds = [...new Set(rows.map((j) => j.family_id))];
  // Conversations are private rows RLS keeps from everyone but the two
  // people in them; the count for the rail comes through the service client,
  // and the content lives behind its own page with the warning at the top.
  const service = createServiceClient();
  const [{ data: applications }, { data: families }, { data: children }, { data: convRows }] = await Promise.all([
    jobIds.length
      ? supabase
          .from("job_applications")
          .select("id, job_id, nanny_id, status, created_at, nanny_profiles(first_name)")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    familyIds.length
      ? supabase
          .from("family_profiles")
          .select(
            "id, display_name, emirate, area, children_count, created_at, users(email, phone, status)",
          )
          .in("id", familyIds)
      : Promise.resolve({ data: [] as never[] }),
    familyIds.length
      ? supabase.from("family_children").select("family_id, age_years").in("family_id", familyIds)
      : Promise.resolve({ data: [] as never[] }),
    familyIds.length
      ? service
          .from("conversations")
          .select("id, job_id, family_id, nanny_id")
          .in("family_id", familyIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  /**
   * A chat "belongs" to a job in the founder's sense, not the foreign key's:
   * either it was started from the post, or it is between the post's family
   * and a nanny who applied to it. The four real conversations so far all
   * started from profiles, and a strict job_id match showed nothing.
   */
  const conversationsByJob = new Map<string, number>();
  for (const job of jobs ?? []) {
    const n = ((convRows ?? []) as { family_id: string }[]).filter(
      (row) => row.family_id === job.family_id,
    ).length;
    if (n > 0) conversationsByJob.set(job.id, n);
  }

  type FamilyRow = {
    id: string;
    display_name: string;
    emirate: string | null;
    area: string | null;
    children_count: number;
    created_at: string;
    users: { email: string; phone: string | null; status: string } | null;
  };
  const familyById = new Map(((families ?? []) as FamilyRow[]).map((f) => [f.id, f]));
  const agesByFamily = new Map<string, number[]>();
  for (const c of (children ?? []) as { family_id: string; age_years: number | null }[]) {
    if (c.age_years == null) continue;
    const list = agesByFamily.get(c.family_id) ?? [];
    list.push(c.age_years);
    agesByFamily.set(c.family_id, list);
  }
  const familyName = new Map(
    ((families ?? []) as FamilyRow[]).map((f) => [f.id, f.display_name]),
  );

  type AppRow = {
    id: string;
    job_id: string;
    status: string;
    created_at: string;
    nanny_profiles: { first_name: string | null } | null;
  };
  const appsByJob = new Map<string, AppRow[]>();
  for (const app of (applications ?? []) as AppRow[]) {
    const list = appsByJob.get(app.job_id) ?? [];
    list.push(app);
    appsByJob.set(app.job_id, list);
  }

  return (
    <AdminShell active="/admin/jobs" name={admin.firstName ?? "Admin"}>
      <h1 className="text-2xl font-semibold sm:text-3xl">Jobs</h1>
      <p className="mt-1 text-sm text-muted">
        Every job post, including drafts. Closing one takes it out of search immediately.
      </p>

      <form method="get" className="mt-5 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q ?? ""} placeholder="Job title" className="min-w-48 flex-1" />
        <Select name="status" defaultValue={status ?? ""} className="w-auto min-w-32">
          <option value="">Any status</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Button type="submit">Search</Button>
      </form>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border-strong bg-background p-8 text-center text-sm text-muted">
          No jobs match that.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {rows.map((job) => (
            <li key={job.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{job.title}</h2>
                    <Badge variant={STATUS_STYLE[job.status] ?? "neutral"} size="sm">
                      {job.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {familyName.get(job.family_id) ?? "Unknown family"}
                    {` · ${[job.area, job.emirate].filter(Boolean).join(", ")}`}
                    {job.salary_min_aed != null &&
                      ` · AED ${job.salary_min_aed.toLocaleString("en-AE")}`}
                    {` · ${new Date(job.created_at).toLocaleDateString("en-GB")}`}
                  </p>
                  {job.responsibilities && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted">{job.responsibilities}</p>
                  )}
                  <p className="mt-2 flex flex-wrap gap-3 text-xs">
                    {job.status === "active" && (
                      <Link href={`/jobs/${job.id}`} className="underline underline-offset-4">
                        View as a nanny sees it
                      </Link>
                    )}
                    <Link
                      href={`/admin/jobs/${job.id}/applications`}
                      className="underline underline-offset-4"
                    >
                      View as the family sees it
                    </Link>
                    {(conversationsByJob.get(job.id) ?? 0) > 0 && (
                      <Link
                        href={`/admin/jobs/${job.id}/conversations`}
                        className="underline underline-offset-4"
                      >
                        {conversationsByJob.get(job.id)}{" "}
                        {conversationsByJob.get(job.id) === 1
                          ? "conversation"
                          : "conversations"}
                      </Link>
                    )}
                  </p>

                  {(() => {
                    const fam = familyById.get(job.family_id);
                    if (!fam) return null;
                    const ages = (agesByFamily.get(fam.id) ?? []).sort((a, b) => a - b);
                    return (
                      <details className="mt-2">
                        <summary className="tap-target cursor-pointer text-xs text-muted underline underline-offset-4">
                          About the family
                        </summary>
                        <div className="mt-2 space-y-1 border-l border-border pl-4 text-sm">
                          <p>
                            <span className="font-medium">{fam.display_name}</span>
                            {fam.users?.status === "suspended" && (
                              <Badge variant="neutral" size="sm" className="ml-2">
                                suspended
                              </Badge>
                            )}
                          </p>
                          {fam.users?.email && (
                            <p className="text-muted">{fam.users.email}</p>
                          )}
                          {fam.users?.phone && <p className="text-muted">{fam.users.phone}</p>}
                          <p className="text-muted">
                            {[fam.area, fam.emirate].filter(Boolean).join(", ") || "No area given"}
                            {` · ${fam.children_count} ${fam.children_count === 1 ? "child" : "children"}`}
                            {ages.length > 0 && ` (ages ${ages.join(", ")})`}
                            {` · joined ${new Date(fam.created_at).toLocaleDateString("en-GB")}`}
                          </p>
                          {fam.users?.email && (
                            <Link
                              href={`/admin/users?q=${encodeURIComponent(fam.users.email)}`}
                              className="inline-block text-xs underline underline-offset-4"
                            >
                              Open in Users
                            </Link>
                          )}
                        </div>
                      </details>
                    );
                  })()}

                  {(() => {
                    const apps = appsByJob.get(job.id) ?? [];
                    if (apps.length === 0) {
                      return <p className="mt-3 text-xs text-muted">No applications yet.</p>;
                    }
                    const byStatus = new Map<string, number>();
                    for (const a of apps) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);
                    const waiting = byStatus.get("applied") ?? 0;
                    return (
                      <details className="mt-3">
                        <summary className="tap-target cursor-pointer text-sm">
                          <span className="font-medium">
                            {apps.length} application{apps.length === 1 ? "" : "s"}
                          </span>
                          <span className="ml-2 text-xs text-muted">
                            {[...byStatus.entries()].map(([s, n]) => `${n} ${s}`).join(" · ")}
                          </span>
                          {waiting > 0 && (
                            <Badge variant="butter" size="sm" className="ml-2">
                              {waiting} waiting
                            </Badge>
                          )}
                        </summary>
                        <ul className="mt-2 space-y-1 border-l border-border pl-4">
                          {apps.map((a) => (
                            <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium">
                                {(a.nanny_profiles as { first_name: string | null } | null)
                                  ?.first_name ?? "Unknown nanny"}
                              </span>
                              <Badge
                                variant={
                                  a.status === "hired"
                                    ? "sage"
                                    : a.status === "rejected"
                                      ? "neutral"
                                      : "butter"
                                }
                                size="sm"
                              >
                                {a.status}
                              </Badge>
                              <span className="text-xs text-muted">
                                {new Date(a.created_at).toLocaleDateString("en-GB")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    );
                  })()}
                </div>

                <JobModeration jobId={job.id} status={job.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
