import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { ensureFamilyProfile } from "@/lib/onboarding/family-actions";
import { FAMILY_STEPS, resumeSlug } from "@/lib/onboarding/steps";

/** Entry point: resumes wherever the family left off. */
export default async function FamilyOnboardingIndex() {
  const user = await requireRole("family", "/family/onboarding");
  if (!user.emailVerified) redirect("/verify-email");

  const familyId = await ensureFamilyProfile(user.id);
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("family_profiles")
    .select("onboarding_step")
    .eq("id", familyId)
    .single();

  redirect(`/family/onboarding/${resumeSlug(FAMILY_STEPS, data?.onboarding_step ?? 0)}`);
}
