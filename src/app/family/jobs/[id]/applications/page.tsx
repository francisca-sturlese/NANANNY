import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage/private-assets";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApplicationStatusControl } from "@/components/jobs/application-status-control";

export const metadata: Metadata = { title: "Applications" };

export default async function JobApplicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("family", `/family/jobs/${id}/applications`);
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) redirect("/family/onboarding");

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, status")
    .eq("id", id)
    .eq("family_id", family.id)
    .maybeSingle();

  if (!job) notFound();

  const { data: applications } = await supabase
    .from("job_applications")
    .select(
      "id, status, cover_note, created_at, nanny:nanny_profiles!inner(id, first_name, headline, emirate, nationality, years_experience, salary_expectation_min_aed, photo_url, languages)",
    )
    .eq("job_id", id)
    .order("created_at", { ascending: false });

  type Row = NonNullable<typeof applications>[number];
  const rows = (applications ?? []) as Row[];

  const photoMap = await signedUrls(
    "nanny-photos",
    rows.map((r) => r.nanny?.photo_url ?? null),
  );

  return (
    <AppShell nav={FAMILY_NAV} active="/family/jobs" name="Jobs">
      <Link
        href="/family/jobs"
        className="tap-target text-sm text-muted underline underline-offset-4"
      >
        ← Your jobs
      </Link>

      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{job.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {rows.length} {rows.length === 1 ? "application" : "applications"}
      </p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-background p-8 text-center sm:p-12">
          <h2 className="text-lg font-semibold">No applications yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            {job.status === "active"
              ? "Nannies will appear here as they apply. You can also search and reach out yourself."
              : "This job is not live, so nannies cannot see it. Publish it to start receiving applications."}
          </p>
          <Link href="/nannies" className="mt-5 inline-block">
            <Button variant="outline">Search nannies</Button>
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {rows.map((application) => {
            const nanny = application.nanny;
            const photo = nanny.photo_url ? (photoMap.get(nanny.photo_url) ?? null) : null;

            return (
              <li key={application.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex gap-3.5">
                  <Link href={`/nannies/${nanny.id}`} className="shrink-0">
                    {photo ? (
                      <img
                        src={photo}
                        alt=""
                        loading="lazy"
                        width={64}
                        height={64}
                        className="size-16 rounded-md object-cover"
                      />
                    ) : (
                      <span className="grid size-16 place-items-center rounded-md bg-sage-wash text-sage-deep">
                        {nanny.first_name?.[0] ?? "N"}
                      </span>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link href={`/nannies/${nanny.id}`}>
                      <h2 className="truncate font-semibold">{nanny.first_name ?? "Nanny"}</h2>
                    </Link>
                    {nanny.headline && (
                      <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted">
                        {nanny.headline}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {[
                        nanny.emirate,
                        nanny.nationality,
                        `${nanny.years_experience} yrs`,
                        nanny.salary_expectation_min_aed
                          ? `from AED ${nanny.salary_expectation_min_aed.toLocaleString("en-AE")}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>

                {application.cover_note && (
                  <blockquote className="mt-3 rounded-md bg-surface p-3 text-sm leading-relaxed text-muted">
                    {application.cover_note}
                  </blockquote>
                )}

                {nanny.languages.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {nanny.languages.slice(0, 4).map((l) => (
                      <Badge key={l} variant="neutral" size="sm">
                        {l}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <ApplicationStatusControl
                    applicationId={application.id}
                    status={application.status}
                  />
                  <Link href={`/nannies/${nanny.id}`} className="ml-auto">
                    <Button variant="ghost" size="sm">
                      View profile
                    </Button>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 text-xs leading-relaxed text-subtle">
        Reading an application is free and never uses one of your nanny contacts. A contact
        is only used when you start a conversation with a nanny you have not messaged before.
      </p>
    </AppShell>
  );
}
