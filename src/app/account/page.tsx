import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { homeForRole, onboardingForRole, requireUser } from "@/lib/auth/dal";

/**
 * Role router. Nothing renders here — it exists so that links which cannot know
 * the caller's role (the proxy, a password-reset redirect, an emailed link)
 * have one destination to point at.
 */
export default async function AccountPage() {
  const user = await requireUser("/account");

  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();
  const table = user.role === "nanny" ? "nanny_profiles" : "family_profiles";

  if (user.role === "family" || user.role === "nanny") {
    const { data: profile } = await supabase
      .from(table)
      .select("onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.onboarding_completed_at) redirect(onboardingForRole(user.role));
  }

  redirect(homeForRole(user.role));
}
