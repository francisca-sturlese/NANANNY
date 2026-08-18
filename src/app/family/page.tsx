import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { CompletionCard } from "@/components/app/completion-card";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Your dashboard" };

export default async function FamilyDashboard({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const user = await requireRole("family", "/family");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();

  const { data: profile } = await supabase
    .from("family_profiles")
    .select("id, display_name, emirate, area, children_count, onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/family/onboarding");

  const [{ data: completion }, { data: contactState }, { data: waiting }] = await Promise.all([
    supabase.rpc("family_profile_completion", { p_family_id: profile.id }),
    supabase.rpc("my_contact_state"),
    /**
     * Nannies who applied and have had no answer.
     *
     * The dashboard said nothing about them, which is the wrong silence: a
     * family that logs in has already made the effort, and the one thing worth
     * telling them is that somebody is waiting. Seventeen applications sat in
     * the database while the first screen a family sees showed a completeness
     * bar and two buttons.
     */
    supabase
      .from("job_applications")
      .select("id, job_id, jobs!inner(id, title, family_id)")
      .eq("status", "applied")
      .eq("jobs.family_id", profile.id),
  ]);

  const done = completion as { percent: number; missing: string[]; can_match: boolean } | null;
  const contacts = Array.isArray(contactState) ? contactState[0] : contactState;

  const applications = waiting ?? [];
  const jobsWithApplications = new Set(applications.map((a) => a.job_id));
  const onlyJob = jobsWithApplications.size === 1 ? applications[0] : null;

  return (
    <AppShell nav={FAMILY_NAV} active="/family" name={profile.display_name ?? user.firstName ?? "Family"}>
      {welcome && (
        <div className="mb-8 rounded-lg border border-sage bg-sage-wash p-5">
          <h2 className="font-semibold text-sage-deep">You&apos;re all set.</h2>
          <p className="mt-1 text-sm text-sage-deep/90">
            What you told us is now a post that nannies can find and reply to. You do
            not need to write it again. Edit or close it any time from your job posts,
            and start browsing whenever you are ready.
          </p>
          <Link
            href="/family/jobs"
            className="mt-2 inline-block text-sm text-sage-deep underline underline-offset-4"
          >
            See your post
          </Link>
        </div>
      )}

      {/* Above everything, including the welcome. Somebody is waiting for an
          answer, and that outranks a progress bar. */}
      {applications.length > 0 && (
        <div className="mb-6 rounded-lg border border-peach bg-peach-wash p-5">
          <h2 className="text-lg font-semibold text-peach-deep">
            {applications.length === 1
              ? "A nanny applied to your job"
              : `${applications.length} nannies are waiting to hear from you`}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-peach-deep/90">
            {applications.length === 1
              ? "She has not heard back yet. Her profile, experience and languages are on the application."
              : `They have applied${
                  jobsWithApplications.size > 1
                    ? ` across ${jobsWithApplications.size} of your job posts`
                    : ""
                } and none of them have heard back yet. Nannies looking for work talk to several families at once, and the ones who reply first are the ones who hire.`}
          </p>
          <Link
            href={onlyJob ? `/family/jobs/${onlyJob.job_id}/applications` : "/family/jobs"}
            className="mt-4 inline-block"
          >
            <Button size="sm">Read the applications</Button>
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            Welcome{user.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="mt-1 text-muted">
            {profile.area ? `${profile.area}, ` : ""}
            {profile.emirate ?? "United Arab Emirates"}
            {profile.children_count > 0 &&
              ` · ${profile.children_count} ${profile.children_count === 1 ? "child" : "children"}`}
          </p>
        </div>
        {/* Two ways to start, side by side, because they are two different
            intentions and a family arriving with the second one had nowhere to
            go: posting a job lived behind a page that is not in the navigation,
            so the only way to reach it was to know the URL. */}
        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
          <Link href="/nannies" className="sm:w-auto">
            <Button block>Find a nanny</Button>
          </Link>
          <Link href="/family/jobs/new" className="sm:w-auto">
            <Button block variant="outline">
              Post a job
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <CompletionCard
          percent={done?.percent ?? 0}
          missing={done?.missing ?? []}
          editHref="/family/onboarding"
          blurb="The more we know, the better your matches."
        />

        {/* The free-contact counter, shown discreetly (PRD §17). */}
        <Card>
          <CardBody>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Nanny contacts</h2>
                <p className="mt-1 text-sm text-muted">
                  Viewing and saving profiles is always free.
                </p>
              </div>
              {contacts?.subscription_active ? (
                <Badge variant="sage" size="sm">
                  Unlimited
                </Badge>
              ) : (
                <span className="text-2xl font-semibold tabular-nums">
                  {contacts?.free_contacts_used ?? 0}
                  <span className="text-base font-medium text-muted">
                    /{contacts?.free_contacts_limit ?? 3}
                  </span>
                </span>
              )}
            </div>

            <p className="mt-5 text-sm">
              {contacts?.subscription_active
                ? "You can contact as many nannies as you like."
                : (contacts?.free_contacts_remaining ?? 0) > 0
                  ? `${contacts?.free_contacts_remaining} free ${
                      contacts?.free_contacts_remaining === 1 ? "contact" : "contacts"
                    } remaining.`
                  : "You've used all your free contacts."}
            </p>

            <Link
              href="/family/subscription"
              className="mt-3 inline-block text-sm underline underline-offset-4"
            >
              {contacts?.subscription_active ? "Manage your subscription" : "See the plans"}
            </Link>
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            href: "/family/matches",
            title: "Your best fits",
            copy: "Scored against what you asked for, with the reasons shown.",
          },
          { href: "/nannies", title: "Search nannies", copy: "Browse every approved profile." },
          {
            href: "/family/jobs",
            title: "Your job posts",
            copy: "What you told us at signup is already one of these.",
          },
          { href: "/family/saved", title: "Saved profiles", copy: "Your shortlist, always free." },
          { href: "/family/profile", title: "Your profile", copy: "Update what you're looking for." },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card interactive className="h-full">
              <CardBody>
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted">{item.copy}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
