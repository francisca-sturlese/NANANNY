import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
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
                    {[job.area, job.emirate].filter(Boolean).join(", ")}
                    {job.salary_min_aed != null &&
                      ` · AED ${job.salary_min_aed.toLocaleString("en-AE")}`}
                    {` · ${new Date(job.created_at).toLocaleDateString("en-GB")}`}
                  </p>
                  {job.responsibilities && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted">{job.responsibilities}</p>
                  )}
                  {job.status === "active" && (
                    <Link
                      href={`/jobs/${job.id}`}
                      className="mt-2 inline-block text-xs underline underline-offset-4"
                    >
                      View as a nanny sees it
                    </Link>
                  )}
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
