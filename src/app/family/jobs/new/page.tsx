import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { JobForm } from "@/components/jobs/job-form";

export const metadata: Metadata = { title: "Post a job" };

export default async function NewJobPage() {
  const user = await requireRole("family", "/family/jobs/new");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();

  // Prefill from the family profile: most of a job post is information they
  // have already given us once.
  const { data: family } = await supabase
    .from("family_profiles")
    .select("emirate, area, children_count")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) redirect("/family/onboarding");

  return (
    <AppShell nav={FAMILY_NAV} active="/family/jobs" name="Jobs">
      <Link href="/family/jobs" className="tap-target text-sm text-muted underline underline-offset-4">
        ← Your jobs
      </Link>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Post a job</h1>
      <p className="mt-1 text-sm text-muted">
        Nannies apply for free. You decide who to reply to.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-background p-5 sm:p-7">
        <JobForm
          prefill={{
            emirate: family.emirate,
            area: family.area,
            childrenCount: family.children_count,
          }}
        />
      </div>
    </AppShell>
  );
}
