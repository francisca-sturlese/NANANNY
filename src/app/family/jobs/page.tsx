import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobStatusControl } from "@/components/jobs/job-status-control";
import { TakeDownJob } from "@/components/jobs/take-down-job";
import { ShareLink } from "@/components/ui/share-link";

export const metadata: Metadata = { title: "Your jobs" };

const STATUS_STYLE: Record<string, "neutral" | "sage" | "peach" | "butter"> = {
  draft: "neutral",
  active: "sage",
  paused: "butter",
  closed: "neutral",
  filled: "sage",
};

export default async function FamilyJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string }>;
}) {
  const { published } = await searchParams;
  const user = await requireRole("family", "/family/jobs");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) redirect("/family/onboarding");

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, emirate, area, salary_min_aed, salary_max_aed, created_at")
    .eq("family_id", family.id)
    .order("created_at", { ascending: false });

  const rows = jobs ?? [];

  // One query for all application counts rather than one per job.
  const { data: applications } = await supabase
    .from("job_applications")
    .select("job_id, status")
    .in("job_id", rows.map((j) => j.id).length ? rows.map((j) => j.id) : ["00000000-0000-0000-0000-000000000000"]);

  const counts = new Map<string, { total: number; unseen: number }>();
  for (const a of applications ?? []) {
    const c = counts.get(a.job_id) ?? { total: 0, unseen: 0 };
    c.total += 1;
    if (a.status === "applied") c.unseen += 1;
    counts.set(a.job_id, c);
  }

  return (
    <AppShell nav={FAMILY_NAV} active="/family/jobs" name="Jobs">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Your jobs</h1>
          <p className="mt-1 text-sm text-muted">
            Post a job and let nannies come to you. Applications are free for them.
          </p>
        </div>
      </div>

      {published && (
        <div className="mt-5 rounded-lg border border-sage bg-sage-wash p-4">
          <p className="text-sm text-sage-deep">
            Your job is live. Nannies can find it and apply now.
          </p>
        </div>
      )}

      <Link href="/family/jobs/new" className="mt-5 block sm:inline-block">
        <Button size="lg" block className="sm:w-auto sm:px-6">
          <Plus className="size-4" aria-hidden />
          Post a job
        </Button>
      </Link>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-background p-8 text-center sm:p-12">
          <h2 className="text-lg font-semibold">No jobs yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            A job post reaches nannies who are not browsing right now. You can still
            search and contact nannies directly at any time.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {rows.map((job) => {
            const c = counts.get(job.id) ?? { total: 0, unseen: 0 };
            return (
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
                        ` · AED ${job.salary_min_aed.toLocaleString("en-AE")}${
                          job.salary_max_aed != null
                            ? ` to ${job.salary_max_aed.toLocaleString("en-AE")}`
                            : ""
                        }`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Link href={`/family/jobs/${job.id}/applications`} className="shrink-0">
                    <Button variant="outline" size="sm">
                      {c.total} {c.total === 1 ? "application" : "applications"}
                      {c.unseen > 0 && (
                        <span className="ml-1 grid size-5 place-items-center rounded-pill bg-foreground text-[0.6875rem] font-semibold text-background">
                          {c.unseen}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link href={`/family/jobs/${job.id}`} className="shrink-0">
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  </Link>
                  {/* Taking a post down was only reachable through the status
                      dropdown, which is where the Post a job button used to be
                      too. A thing somebody needs to do in a hurry, because they
                      have hired somebody, should be a button. */}
                  {job.status === "active" && (
                    /* The founder's growth loop: a family that shares its own
                       post recruits applicants we never had to find. */
                    <ShareLink
                      url={`https://nananny.com/jobs/${job.id}`}
                      text="We're looking for a nanny. The full post, and how to apply, is here:"
                      label="Share this job"
                    />
                  )}
                  {(job.status === "active" || job.status === "paused") && (
                    <TakeDownJob jobId={job.id} />
                  )}
                  <div className="ml-auto">
                    <JobStatusControl jobId={job.id} status={job.status} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
