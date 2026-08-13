import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { ensureNannyProfile } from "@/lib/onboarding/nanny-actions";
import { NANNY_STEPS, resumeSlug } from "@/lib/onboarding/steps";

export default async function NannyOnboardingIndex() {
  const user = await requireRole("nanny", "/nanny/onboarding");
  if (!user.emailVerified) redirect("/verify-email");

  const nannyId = await ensureNannyProfile(user.id);
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("nanny_profiles")
    .select("onboarding_step")
    .eq("id", nannyId)
    .single();

  redirect(`/nanny/onboarding/${resumeSlug(NANNY_STEPS, data?.onboarding_step ?? 0)}`);
}
