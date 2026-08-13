import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { ensureNannyProfile } from "@/lib/onboarding/nanny-actions";
import { NANNY_STEPS, prevSlug, stepIndex } from "@/lib/onboarding/steps";
import { OnboardingShell } from "@/components/onboarding/shell";
import { NannyStepForm } from "@/components/onboarding/nanny-step-form";
import { NannyReviewStep } from "@/components/onboarding/nanny-review-step";
import { signedUrl } from "@/lib/storage/private-assets";

export const metadata: Metadata = { title: "Complete your nanny profile" };

export default async function NannyOnboardingStep({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  const index = stepIndex(NANNY_STEPS, step);
  if (index < 0) notFound();

  const user = await requireRole("nanny", `/nanny/onboarding/${step}`);
  if (!user.emailVerified) redirect("/verify-email");

  const nannyId = await ensureNannyProfile(user.id);
  const supabase = await createServerSupabase();

  const { data: profile } = await supabase
    .from("nanny_profiles")
    .select("*")
    .eq("id", nannyId)
    .single();

  const { data: completion } = await supabase.rpc("nanny_profile_completion", {
    p_nanny_id: nannyId,
  });

  // The stored value is a storage key, never a URL. Signing happens here,
  // server-side, after we know the profile belongs to this user.
  const photoUrl = await signedUrl("nanny-photos", profile?.photo_url);

  return (
    <OnboardingShell
      steps={NANNY_STEPS}
      currentSlug={step}
      reachedStep={profile?.onboarding_step ?? 0}
      basePath="/nanny/onboarding"
    >
      {step === "review" ? (
        <NannyReviewStep
          profile={profile}
          completion={
            completion as {
              percent: number;
              missing: string[];
              required_missing: string[];
              can_submit: boolean;
            } | null
          }
          photoUrl={photoUrl}
          backHref={`/nanny/onboarding/${prevSlug(NANNY_STEPS, step)}`}
        />
      ) : (
        <NannyStepForm
          step={step}
          isLast={false}
          backHref={
            prevSlug(NANNY_STEPS, step)
              ? `/nanny/onboarding/${prevSlug(NANNY_STEPS, step)}`
              : null
          }
          user={{ firstName: user.firstName, lastName: user.lastName }}
          profile={profile}
          photoUrl={photoUrl}
        />
      )}
    </OnboardingShell>
  );
}
