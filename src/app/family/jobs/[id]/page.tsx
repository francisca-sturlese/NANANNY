import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { JobForm } from "@/components/jobs/job-form";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("family", `/family/jobs/${id}`);
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) redirect("/family/onboarding");

  // The family_id filter is belt and braces alongside RLS: without it a job
  // belonging to someone else would simply return nothing, which is right, but
  // being explicit keeps the intent on the page.
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("family_id", family.id)
    .maybeSingle();

  if (!job) notFound();

  return (
    <AppShell nav={FAMILY_NAV} active="/family/jobs" name="Jobs">
      <Link href="/family/jobs" className="tap-target text-sm text-muted underline underline-offset-4">
        ← Your jobs
      </Link>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Edit job</h1>

      <div className="mt-6 rounded-lg border border-border bg-background p-5 sm:p-7">
        <JobForm job={job} />
      </div>
    </AppShell>
  );
}
