import type { Metadata } from "next";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage/private-assets";
import { AdminShell } from "@/components/admin/admin-shell";
import { ReviewPhoto, ReviewProfileDetail } from "@/components/admin/review-card";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReviewActions } from "@/components/admin/review-actions";
import { whenDay } from "@/lib/admin/when";

export const metadata: Metadata = { title: "Review queue" };

const QUEUE_ORDER = ["submitted", "under_review", "rejected", "approved"] as const;

const BADGE_FOR: Record<string, "neutral" | "sage" | "peach" | "butter"> = {
  draft: "neutral",
  submitted: "butter",
  under_review: "butter",
  approved: "sage",
  rejected: "peach",
  suspended: "peach",
  expired: "neutral",
};

/**
 * The minimum internal capability Milestone 2 calls for: move a nanny profile
 * through the review states. Nothing else — no analytics, no user management.
 */
export default async function AdminPage() {
  const admin = await requireAdmin("/admin/review");
  const supabase = await createServerSupabase();

  const { data: profiles } = await supabase
    .from("nanny_profiles")
    .select(
      "id, user_id, first_name, status, photo_url, emirate, nationality, years_experience, profile_completion, headline, submitted_at, rejection_reason, description, visa_status, arrangement, available_from, salary_expectation_min_aed, salary_expectation_max_aed, languages, english_level, uae_experience_years, education, certificates, newborn_experience, toddler_experience, school_age_experience, special_needs_experience, has_driving_licence, can_cook, can_housekeep, first_aid_certified",
    )
    .in("status", [...QUEUE_ORDER])
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(100);

  const rows = profiles ?? [];

  // Documents are the whole point of a review, so they are loaded with the
  // queue rather than behind another click.
  const { data: documents } = await supabase
    .from("nanny_documents")
    .select("id, nanny_id, kind, label, original_filename, storage_path, reviewed")
    .in("nanny_id", rows.length ? rows.map((r) => r.id) : ["00000000-0000-0000-0000-000000000000"]);

  const documentsByNanny = new Map<string, NonNullable<typeof documents>>();
  for (const document of documents ?? []) {
    const list = documentsByNanny.get(document.nanny_id) ?? [];
    list.push(document);
    documentsByNanny.set(document.nanny_id, list);
  }
  const photoMap = await signedUrls(
    "nanny-photos",
    rows.map((r) => r.photo_url),
  );

  const counts = QUEUE_ORDER.map((status) => ({
    status,
    n: rows.filter((r) => r.status === status).length,
  }));

  return (
    <AdminShell
      active="/admin/review"
      name={admin.firstName ?? "Admin"}
      pendingReview={rows.filter((r) => ["submitted", "under_review"].includes(r.status)).length}
    >
      <h1 className="text-3xl font-semibold">Nanny review queue</h1>
      <p className="mt-1 text-muted">
        Approving a profile makes it discoverable. It is not a verification claim. Grant a
        badge only for what you have actually seen.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {counts.map((c) => (
          <Badge key={c.status} variant={BADGE_FOR[c.status]} size="sm">
            {c.status.replace("_", " ")}: {c.n}
          </Badge>
        ))}
      </div>

      <div className="mt-8 space-y-4">
        {rows.length === 0 && (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">Nothing in the queue.</p>
            </CardBody>
          </Card>
        )}

        {rows
          .slice()
          .sort(
            (a, b) =>
              QUEUE_ORDER.indexOf(a.status as (typeof QUEUE_ORDER)[number]) -
              QUEUE_ORDER.indexOf(b.status as (typeof QUEUE_ORDER)[number]),
          )
          .map((row) => {
            const photo = row.photo_url ? photoMap.get(row.photo_url) : null;
            return (
              <Card key={row.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-5">
                    <div className="flex min-w-0 items-start gap-4">
                      {photo ? (
                        <ReviewPhoto src={photo} name={row.first_name ?? "this nanny"} />
                      ) : (
                        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-surface text-[0.6rem] text-subtle">
                          No photo
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold">{row.first_name ?? "Unnamed"}</h2>
                                                    <Badge variant={BADGE_FOR[row.status]} size="sm">
                            {row.status.replace("_", " ")}
                          </Badge>
                          <span className="text-xs text-muted">
                            {row.profile_completion}% complete
                          </span>
                        </div>
                        {row.headline && (
                          <p className="mt-1 text-sm text-muted">{row.headline}</p>
                        )}
                        <p className="mt-1 text-xs text-subtle">
                          {[
                            row.emirate,
                            row.nationality,
                            row.years_experience ? `${row.years_experience} yrs` : null,
                            row.submitted_at
                              ? `submitted ${whenDay(row.submitted_at)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {row.rejection_reason && (
                          <p className="mt-2 text-xs text-peach-deep">
                            Last rejection: {row.rejection_reason}
                          </p>
                        )}

                        <ReviewProfileDetail
                          profile={{
                            description: row.description,
                            visa_status: row.visa_status,
                            arrangement: row.arrangement,
                            available_from: row.available_from,
                            salary_min: row.salary_expectation_min_aed,
                            salary_max: row.salary_expectation_max_aed,
                            languages: row.languages,
                            english_level: row.english_level,
                            uae_years: row.uae_experience_years,
                            education: row.education,
                            certificates: row.certificates,
                            cares_for: [
                              row.newborn_experience ? "newborn" : null,
                              row.toddler_experience ? "toddler" : null,
                              row.school_age_experience ? "school age" : null,
                              row.special_needs_experience ? "special needs" : null,
                            ].filter(Boolean) as string[],
                            can: [
                              row.has_driving_licence ? "drive" : null,
                              row.can_cook ? "cook" : null,
                              row.can_housekeep ? "housekeep" : null,
                              row.first_aid_certified ? "first aid" : null,
                            ].filter(Boolean) as string[],
                          }}
                        />
                      </div>
                    </div>

                    <ReviewActions
                      nannyId={row.id}
                      status={row.status}
                      documents={documentsByNanny.get(row.id) ?? []}
                    />
                  </div>
                </CardBody>
              </Card>
            );
          })}
      </div>
    </AdminShell>
  );
}
