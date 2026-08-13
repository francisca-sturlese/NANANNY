import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppShell, NANNY_NAV } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WithdrawButton } from "@/components/jobs/withdraw-button";

export const metadata: Metadata = { title: "Your applications" };

/** What each status means from the nanny's side, in her words not ours. */
const STATUS: Record<
  string,
  { label: string; variant: "neutral" | "sage" | "peach" | "butter"; note?: string }
> = {
  applied: { label: "Sent", variant: "butter", note: "The family has not opened it yet." },
  viewed: { label: "Viewed", variant: "butter", note: "The family has read your application." },
  shortlisted: { label: "Shortlisted", variant: "sage", note: "You are on their shortlist." },
  interview: { label: "Interview", variant: "sage", note: "They want to talk to you." },
  hired: { label: "Hired", variant: "sage" },
  rejected: { label: "Not selected", variant: "peach", note: "They went with someone else." },
  withdrawn: { label: "Withdrawn", variant: "neutral" },
};

export default async function NannyApplicationsPage() {
  const user = await requireRole("nanny", "/nanny/applications");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();
  const { data: nanny } = await supabase
    .from("nanny_profiles")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!nanny) redirect("/nanny/onboarding");

  const { data: applications } = await supabase
    .from("job_applications")
    .select(
      "id, status, cover_note, created_at, job:jobs!inner(id, title, emirate, area, salary_min_aed, salary_max_aed, status, arrangement)",
    )
    .eq("nanny_id", nanny.id)
    .order("created_at", { ascending: false });

  type Row = NonNullable<typeof applications>[number];
  const rows = (applications ?? []) as Row[];

  return (
    <AppShell nav={NANNY_NAV} active="/nanny/applications" name="Applications">
      <h1 className="text-2xl font-semibold sm:text-3xl">Your applications</h1>
      <p className="mt-1 text-sm text-muted">
        Applying is free, and always will be.
      </p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-background p-8 text-center sm:p-12">
          <h2 className="text-lg font-semibold">No applications yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            {nanny.status === "approved"
              ? "Browse open jobs and apply to the ones that suit you."
              : "You can apply as soon as your profile is approved. Families can also find and message you directly."}
          </p>
          <Link href="/jobs" className="mt-5 inline-block">
            <Button>Find jobs</Button>
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {rows.map((application) => {
            const job = application.job;
            const meta = STATUS[application.status] ?? STATUS.applied;
            const open = !["rejected", "withdrawn", "hired"].includes(application.status);

            return (
              <li key={application.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/jobs/${job.id}`} className="min-w-0">
                    <h2 className="font-semibold">{job.title}</h2>
                  </Link>
                  <Badge variant={meta.variant} size="sm">
                    {meta.label}
                  </Badge>
                </div>

                <p className="mt-1 text-xs text-muted">
                  {[
                    [job.area, job.emirate].filter(Boolean).join(", "),
                    job.salary_min_aed
                      ? `AED ${job.salary_min_aed.toLocaleString("en-AE")}${
                          job.salary_max_aed ? `–${job.salary_max_aed.toLocaleString("en-AE")}` : ""
                        }`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>

                {meta.note && <p className="mt-2 text-sm text-muted">{meta.note}</p>}

                {/* If the job itself closed, say so — otherwise "Sent" reads as
                    if it is still being considered. */}
                {job.status !== "active" && open && (
                  <p className="mt-2 text-xs text-peach-deep">
                    This job is no longer open.
                  </p>
                )}

                <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                  <Link href={`/jobs/${job.id}`}>
                    <Button variant="ghost" size="sm">
                      View job
                    </Button>
                  </Link>
                  {open && (
                    <div className="ml-auto">
                      <WithdrawButton applicationId={application.id} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
