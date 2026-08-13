import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { ensureFamilyProfile } from "@/lib/onboarding/family-actions";
import { FAMILY_STEPS, prevSlug, stepIndex } from "@/lib/onboarding/steps";
import { OnboardingShell } from "@/components/onboarding/shell";
import { FamilyStepForm } from "@/components/onboarding/family-step-form";

export const metadata: Metadata = { title: "Complete your family profile" };

export default async function FamilyOnboardingStep({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  const index = stepIndex(FAMILY_STEPS, step);
  if (index < 0) notFound();

  // Role check happens here, not in a layout: with partial rendering a layout
  // does not re-run on navigation, so it cannot be relied on as a gate.
  const user = await requireRole("family", `/family/onboarding/${step}`);
  if (!user.emailVerified) redirect("/verify-email");

  const familyId = await ensureFamilyProfile(user.id);
  const supabase = await createServerSupabase();

  const [{ data: profile }, { data: requirements }, { data: children }] = await Promise.all([
    supabase
      .from("family_profiles")
      .select("id, display_name, emirate, area, description, children_count, onboarding_step")
      .eq("id", familyId)
      .single(),
    supabase
      .from("family_requirements")
      .select("*")
      .eq("family_id", familyId)
      .eq("is_primary", true)
      .maybeSingle(),
    supabase
      .from("family_children")
      .select("id, age_years")
      .eq("family_id", familyId)
      .order("age_years", { ascending: true }),
  ]);

  return (
    <OnboardingShell
      steps={FAMILY_STEPS}
      currentSlug={step}
      reachedStep={profile?.onboarding_step ?? 0}
      basePath="/family/onboarding"
    >
      <FamilyStepForm
        step={step}
        isLast={index === FAMILY_STEPS.length - 1}
        backHref={
          prevSlug(FAMILY_STEPS, step)
            ? `/family/onboarding/${prevSlug(FAMILY_STEPS, step)}`
            : null
        }
        user={{ firstName: user.firstName, lastName: user.lastName }}
        profile={profile ?? null}
        requirements={requirements ?? null}
        kids={children ?? []}
      />
    </OnboardingShell>
  );
}
