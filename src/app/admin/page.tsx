import type { Metadata } from "next";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage/private-assets";
import { AppShell, ADMIN_NAV } from "@/components/app/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReviewActions } from "./review-actions";

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
  const admin = await requireAdmin("/admin");
  const supabase = await createServerSupabase();

  const { data: profiles } = await supabase
    .from("nanny_profiles")
    .select(
      "id, first_name, status, photo_url, emirate, nationality, years_experience, profile_completion, headline, submitted_at, rejection_reason",
    )
    .in("status", [...QUEUE_ORDER])
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(100);

  const rows = profiles ?? [];
  const photoMap = await signedUrls(
    "nanny-photos",
    rows.map((r) => r.photo_url),
  );

  const counts = QUEUE_ORDER.map((status) => ({
    status,
    n: rows.filter((r) => r.status === status).length,
  }));

  return (
    <AppShell
      nav={ADMIN_NAV}
      active="/admin"
      name={admin.firstName ?? "Admin"}
    >
      <h1 className="text-3xl font-semibold">Nanny review queue</h1>
      <p className="mt-1 text-muted">
        Approving a profile makes it discoverable. It is not a verification claim — grant a
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
                        <Image
                          src={photo}
                          alt=""
                          width={56}
                          height={56}
                          unoptimized
                          className="size-14 rounded-full border border-border object-cover"
                        />
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
                              ? `submitted ${new Date(row.submitted_at).toLocaleDateString("en-GB")}`
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
                      </div>
                    </div>

                    <ReviewActions nannyId={row.id} status={row.status} />
                  </div>
                </CardBody>
              </Card>
            );
          })}
      </div>
    </AppShell>
  );
}
