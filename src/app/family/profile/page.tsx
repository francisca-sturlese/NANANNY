import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { CompletionCard } from "@/components/app/completion-card";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FAMILY_STEPS } from "@/lib/onboarding/steps";

export const metadata: Metadata = { title: "Your profile" };

/**
 * A read-back of the family profile, with each section linking to the wizard
 * step that owns it. One editing implementation rather than two that drift.
 */
export default async function FamilyProfilePage() {
  const user = await requireRole("family", "/family/profile");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();

  const { data: profile } = await supabase
    .from("family_profiles")
    .select("id, display_name, emirate, area, description, children_count")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/family/onboarding");

  const [{ data: requirements }, { data: children }, { data: completion }] = await Promise.all([
    supabase
      .from("family_requirements")
      .select("*")
      .eq("family_id", profile.id)
      .eq("is_primary", true)
      .maybeSingle(),
    supabase
      .from("family_children")
      .select("age_years")
      .eq("family_id", profile.id)
      .order("age_years"),
    supabase.rpc("family_profile_completion", { p_family_id: profile.id }),
  ]);

  const done = completion as { percent: number; missing: string[] } | null;
  const step = (slug: string) => `/family/onboarding/${slug}`;

  return (
    <AppShell nav={FAMILY_NAV} active="/family/profile" name="Profile">
      <h1 className="text-2xl font-semibold sm:text-3xl">
        {profile.display_name ?? "Your family"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {[profile.area, profile.emirate].filter(Boolean).join(", ") || "United Arab Emirates"}
      </p>

      <div className="mt-6">
        <CompletionCard
          percent={done?.percent ?? 0}
          missing={done?.missing ?? []}
          editHref={step(FAMILY_STEPS[0].slug)}
          blurb="The more we know, the better your matches."
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <DetailCard title="About your family" href={step("about")}>
          <Row label="Name shown to nannies" value={profile.display_name} />
          <Row label="Emirate" value={profile.emirate} />
          <Row label="Area" value={profile.area} />
          {profile.description && (
            <p className="mt-3 text-sm leading-relaxed text-muted">{profile.description}</p>
          )}
        </DetailCard>

        <DetailCard title="Children" href={step("children")}>
          <Row label="How many" value={String(profile.children_count)} />
          <Row
            label="Ages"
            value={
              children && children.length > 0
                ? children.map((c) => `${c.age_years}`).join(", ") + " years"
                : null
            }
          />
        </DetailCard>

        <DetailCard title="Type of care" href={step("care")}>
          <Row
            label="Arrangement"
            value={
              requirements?.arrangement === "live_in"
                ? "Live in"
                : requirements?.arrangement === "live_out"
                  ? "Live out"
                  : requirements?.arrangement
                    ? "Either"
                    : null
            }
          />
          <Row
            label="Days"
            value={
              requirements?.working_days?.length
                ? requirements.working_days.map((d) => d.slice(0, 3)).join(", ")
                : null
            }
          />
          <Row
            label="Hours"
            value={
              requirements?.working_hours_start && requirements?.working_hours_end
                ? `${requirements.working_hours_start.slice(0, 5)} to ${requirements.working_hours_end.slice(0, 5)}`
                : null
            }
          />
        </DetailCard>

        <DetailCard title="What matters most" href={step("requirements")}>
          <Row
            label="Budget"
            value={
              requirements?.salary_max_aed
                ? `AED ${(requirements.salary_min_aed ?? 0).toLocaleString("en-AE")} to ${requirements.salary_max_aed.toLocaleString("en-AE")}`
                : null
            }
          />
          <Row
            label="Minimum experience"
            value={
              requirements?.required_experience_years
                ? `${requirements.required_experience_years}+ years`
                : null
            }
          />
          {requirements && requirements.languages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {requirements.languages.map((l) => (
                <Badge key={l} variant="neutral" size="sm">
                  {l}
                </Badge>
              ))}
            </div>
          )}
        </DetailCard>
      </div>

      <Card className="mt-5">
        <CardBody>
          <h2 className="text-base font-semibold">Account</h2>
          <Row label="Email" value={user.email} />
          <Row label="Phone" value={user.phone} />
          <p className="mt-3 text-xs text-subtle">
            Your email, phone number and address are never shown to nannies.
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
      <dd className={value ? "text-sm font-medium" : "text-sm text-subtle"}>
        {value || "Not set"}
      </dd>
    </div>
  );
}
