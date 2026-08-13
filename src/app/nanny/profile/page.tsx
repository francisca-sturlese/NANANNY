import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage/private-assets";
import { AppShell, NANNY_NAV } from "@/components/app/app-shell";
import { CompletionCard } from "@/components/app/completion-card";
import { Card, CardBody } from "@/components/ui/card";
import {
  Badge,
  VerificationBadge,
  type VerificationBadgeKey,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Your profile" };

export default async function NannyProfilePage() {
  const user = await requireRole("nanny", "/nanny/profile");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("nanny_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/nanny/onboarding");

  const [photoUrl, { data: badges }, { data: completion }] = await Promise.all([
    signedUrl("nanny-photos", profile.photo_url),
    supabase.from("nanny_badges").select("badge").eq("nanny_id", profile.id),
    supabase.rpc("nanny_profile_completion", { p_nanny_id: profile.id }),
  ]);

  const done = completion as {
    percent: number;
    missing: string[];
    required_missing: string[];
  } | null;

  const step = (slug: string) => `/nanny/onboarding/${slug}`;
  const live = profile.status === "approved";

  return (
    <AppShell nav={NANNY_NAV} active="/nanny/profile" name="Profile">
      <div className="flex items-start gap-4">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            width={72}
            height={72}
            className="size-18 rounded-lg object-cover"
          />
        ) : (
          <span className="grid size-18 shrink-0 place-items-center rounded-lg bg-sage-wash text-sage-deep">
            {profile.first_name?.[0] ?? "N"}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{profile.first_name ?? "Your profile"}</h1>
          {profile.headline && (
            <p className="mt-0.5 text-sm leading-snug text-muted">{profile.headline}</p>
          )}
          <p className="mt-1.5">
            <Badge variant={live ? "sage" : "butter"} size="sm">
              {profile.status.replace("_", " ")}
            </Badge>
          </p>
        </div>
      </div>

      {live && (
        <Link href={`/nannies/${profile.id}`} className="mt-4 inline-block">
          <Button variant="outline" size="sm">
            See how families see you
          </Button>
        </Link>
      )}

      <div className="mt-6">
        <CompletionCard
          percent={done?.percent ?? 0}
          missing={done?.missing ?? []}
          requiredMissing={done?.required_missing ?? []}
          editHref={step("about")}
          blurb="Complete profiles appear higher and get more replies."
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <DetailCard title="About you" href={step("about")}>
          <Row label="First name" value={profile.first_name} />
          <Row label="Nationality" value={profile.nationality} />
          <Row label="Based in" value={profile.emirate} />
          <Row label="Photo" value={profile.photo_url ? "Uploaded" : null} />
        </DetailCard>

        <DetailCard title="Experience" href={step("experience")}>
          <Row label="Total" value={`${profile.years_experience} years`} />
          <Row label="In the UAE" value={`${profile.uae_experience_years} years`} />
          <Row
            label="Ages"
            value={
              [
                profile.newborn_experience && "Newborn",
                profile.toddler_experience && "Toddler",
                profile.school_age_experience && "School age",
                profile.special_needs_experience && "Special needs",
              ]
                .filter(Boolean)
                .join(", ") || null
            }
          />
        </DetailCard>

        <DetailCard title="Languages & skills" href={step("skills")}>
          <Row label="English" value={profile.english_level} />
          <Row label="Arabic" value={profile.arabic_level} />
          {profile.languages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.languages.map((l) => (
                <Badge key={l} variant="neutral" size="sm">
                  {l}
                </Badge>
              ))}
            </div>
          )}
        </DetailCard>

        <DetailCard title="Availability & pay" href={step("availability")}>
          <Row
            label="Arrangement"
            value={
              profile.arrangement === "live_in"
                ? "Live in"
                : profile.arrangement === "live_out"
                  ? "Live out"
                  : "Either"
            }
          />
          <Row label="Available from" value={profile.available_from} />
          <Row
            label="Salary"
            value={
              profile.salary_expectation_min_aed
                ? `From AED ${profile.salary_expectation_min_aed.toLocaleString("en-AE")}`
                : null
            }
          />
        </DetailCard>
      </div>

      <Card className="mt-5">
        <CardBody>
          <h2 className="text-base font-semibold">Verified on your profile</h2>
          {badges && badges.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {badges.map((b) => (
                <VerificationBadge key={b.badge} badge={b.badge as VerificationBadgeKey} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">
              None yet. Badges are added by our team once we have seen the document itself.
              They are not automatic.
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="mt-5">
        <CardBody>
          <h2 className="text-base font-semibold">Private</h2>
          <Row label="Email" value={user.email} />
          <Row label="Surname" value={user.lastName} />
          <Row label="Date of birth" value={profile.date_of_birth} />
          <Row label="Area" value={profile.area} />
          <p className="mt-3 text-xs text-subtle">
            None of this is shown to families. They see your first name and emirate only.
          </p>
        </CardBody>
      </Card>
    </AppShell>
  );
}

function DetailCard({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <Link href={href}>
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          </Link>
        </div>
        <dl className="mt-2">{children}</dl>
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={value ? "text-sm font-medium capitalize" : "text-sm text-subtle"}>
        {value || "Not set"}
      </dd>
    </div>
  );
}
