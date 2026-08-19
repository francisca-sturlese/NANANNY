import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage/private-assets";
import { AppShell, NANNY_NAV } from "@/components/app/app-shell";
import { CompletionCard } from "@/components/app/completion-card";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, VerificationBadge, type VerificationBadgeKey } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShareCard } from "@/components/referral/invite-card";
import { absoluteUrl } from "@/lib/seo/site";
import { DISCOVERABLE_STATUSES } from "@/lib/nanny/discoverable";
import { ShareProfile } from "@/components/nanny/share-profile";

export const metadata: Metadata = { title: "Your dashboard" };

/** How each review state is explained to the nanny herself. */
const STATUS_COPY: Record<
  string,
  { badge: "neutral" | "sage" | "peach" | "butter"; title: string; body: string }
> = {
  draft: {
    badge: "neutral",
    title: "Your profile is a draft",
    body: "Families cannot see it yet. Finish the required sections and submit it for review.",
  },
  submitted: {
    badge: "butter",
    title: "Submitted, waiting for review",
    body: "Our team has your profile. We usually get to it within two working days.",
  },
  under_review: {
    badge: "butter",
    title: "Under review",
    body: "Someone is looking at your profile right now. We'll email you when it's done.",
  },
  approved: {
    badge: "sage",
    title: "Your profile is live",
    body: "Families across the UAE can now find you and message you.",
  },
  rejected: {
    badge: "peach",
    title: "Changes needed",
    body: "We couldn't approve your profile yet. See what to fix, then submit it again.",
  },
  suspended: {
    badge: "peach",
    title: "Profile suspended",
    body: "Your profile is hidden from families. Contact support if you think this is a mistake.",
  },
  expired: {
    badge: "neutral",
    title: "Profile expired",
    body: "Update your availability and resubmit to appear in search again.",
  },
};

export default async function NannyDashboard({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;
  const user = await requireRole("nanny", "/nanny");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();

  const { data: profile } = await supabase
    .from("nanny_profiles")
    .select(
      "id, first_name, headline, status, photo_url, emirate, years_experience, salary_expectation_min_aed, rejection_reason, onboarding_completed_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/nanny/onboarding");

  const [{ data: completion }, { data: badges }] = await Promise.all([
    supabase.rpc("nanny_profile_completion", { p_nanny_id: profile.id }),
    supabase.from("nanny_badges").select("badge").eq("nanny_id", profile.id),
  ]);

  const done = completion as {
    percent: number;
    missing: string[];
    required_missing: string[];
    can_submit: boolean;
  } | null;

  const photoUrl = await signedUrl("nanny-photos", profile.photo_url);
  const status = STATUS_COPY[profile.status] ?? STATUS_COPY.draft;

  return (
    <AppShell nav={NANNY_NAV} active="/nanny" name={profile.first_name ?? user.firstName ?? "Nanny"}>
      {submitted && (
        <div className="mb-8 rounded-lg border border-sage bg-sage-wash p-5">
          <h2 className="font-semibold text-sage-deep">Thank you. Your profile is in.</h2>
          <p className="mt-1 text-sm text-sage-deep/90">
            We&apos;ll email you as soon as our team has reviewed it.
          </p>
        </div>
      )}

      <div className="flex items-start gap-4">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            width={64}
            height={64}
            unoptimized
            className="size-16 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-sage-wash text-xs text-sage-deep">
            Photo
          </span>
        )}
        <div>
          <h1 className="text-3xl font-semibold">
            Hello{profile.first_name ? `, ${profile.first_name}` : ""}
          </h1>
          <p className="mt-1 text-muted">
            {[
              profile.emirate,
              profile.years_experience ? `${profile.years_experience} years' experience` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Let's finish your profile"}
          </p>
          {/* Only once families can actually open the link: sharing a hidden
              profile hands out a dead end with her name on it. */}
          {(DISCOVERABLE_STATUSES as readonly string[]).includes(profile.status) && (
            <div className="mt-3">
              <ShareProfile
                url={`https://nananny.com/nannies/${profile.id}`}
                name={profile.first_name}
              />
            </div>
          )}
        </div>
      </div>

      {/* Review state — the single most important thing on this page. */}
      <Card className="mt-8">
        <CardBody>
          <Badge variant={status.badge} size="sm">
            {profile.status.replace("_", " ")}
          </Badge>
          <h2 className="mt-3 text-lg font-semibold">{status.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{status.body}</p>

          {profile.status === "rejected" && profile.rejection_reason && (
            <div className="mt-4 rounded-md border border-peach bg-peach-wash p-4">
              <p className="text-xs font-medium text-peach-deep">What needs fixing</p>
              <p className="mt-1 text-sm text-peach-deep/90">{profile.rejection_reason}</p>
            </div>
          )}

          {["draft", "rejected"].includes(profile.status) && (
            <Link href="/nanny/onboarding/review" className="mt-5 inline-block">
              <Button size="sm">
                {profile.status === "rejected" ? "Update and resubmit" : "Review and submit"}
              </Button>
            </Link>
          )}

          {badges && badges.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-medium text-muted">Verified on your profile</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {badges.map((b) => (
                  <VerificationBadge key={b.badge} badge={b.badge as VerificationBadgeKey} />
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <CompletionCard
          percent={done?.percent ?? 0}
          missing={done?.missing ?? []}
          requiredMissing={done?.required_missing ?? []}
          visible={DISCOVERABLE_STATUSES.includes(profile.status as never)}
          editHref="/nanny/onboarding"
          blurb="Complete profiles appear higher and get more replies."
        />

        <Card>
          <CardBody>
            <h2 className="text-base font-semibold">NaNanny is free for you</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              You never pay to create a profile, appear in search, be found by
              families, apply to jobs or reply to them. There is no commission
              on your salary.
            </p>
            <p className="mt-4 text-xs text-subtle">
              NaNanny is a technology platform, not your employer. Any job you take is agreed
              directly between you and the family.
            </p>
          </CardBody>
        </Card>

        {/* No reward on this side, and that is the honest shape of it: a nanny
            pays for nothing, so a free contact would buy her nothing. What she
            gets is the same one tap way to pass the site on, which is how most
            of this side of the marketplace has arrived so far. */}
        <ShareCard url={absoluteUrl("/for-nannies")} />
      </div>
    </AppShell>
  );
}
