import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage/private-assets";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NannyPhotoFallback } from "@/components/nanny/photo-fallback";
import { whenDay } from "@/lib/admin/when";

export const metadata: Metadata = { title: "Applications as the family sees them" };

/**
 * The family's applications page, rendered for an admin.
 *
 * Same cards, same order, same information, one deliberate difference: no
 * status controls. An admin reads the family's hiring pipeline, they do not
 * run it. The cover notes are shown because moderating what nannies write to
 * families is exactly an admin's business.
 */
export default async function AdminJobApplicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin(`/admin/jobs/${id}/applications`);
  const supabase = await createServerSupabase();

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, status, family_profiles(display_name)")
    .eq("id", id)
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

  const familyName =
    (job.family_profiles as { display_name: string } | null)?.display_name ?? "the family";

  return (
    <AdminShell active="/admin/jobs" name={admin.firstName ?? "Admin"}>
      <Link
        href="/admin/jobs"
        className="tap-target text-sm text-muted underline underline-offset-4"
      >
        ← All jobs
      </Link>

      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{job.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {rows.length} {rows.length === 1 ? "application" : "applications"} · this is what{" "}
        {familyName} sees, minus the buttons to act on them.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border-strong bg-background p-8 text-center text-sm text-muted">
          No applications yet.
        </p>
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
                      <NannyPhotoFallback className="size-16 rounded-md" />
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/nannies/${nanny.id}`}>
                        <h2 className="truncate font-semibold">{nanny.first_name ?? "Nanny"}</h2>
                      </Link>
                      <Badge
                        variant={
                          application.status === "hired"
                            ? "sage"
                            : application.status === "rejected"
                              ? "neutral"
                              : "butter"
                        }
                        size="sm"
                      >
                        {application.status}
                      </Badge>
                      <span className="text-xs text-muted">
                        {whenDay(application.created_at)}
                      </span>
                    </div>
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

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                  <Link href={`/nannies/${nanny.id}`}>
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
    </AdminShell>
  );
}
