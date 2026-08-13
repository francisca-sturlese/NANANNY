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

  const [{ data: completion }, { data: contactState }] = await Promise.all([
    supabase.rpc("family_profile_completion", { p_family_id: profile.id }),
    supabase.rpc("my_contact_state"),
  ]);

  const done = completion as { percent: number; missing: string[]; can_match: boolean } | null;
  const contacts = Array.isArray(contactState) ? contactState[0] : contactState;

  return (
    <AppShell nav={FAMILY_NAV} active="/family" name={profile.display_name ?? user.firstName ?? "Family"}>
      {welcome && (
        <div className="mb-8 rounded-lg border border-sage bg-sage-wash p-5">
          <h2 className="font-semibold text-sage-deep">You&apos;re all set.</h2>
          <p className="mt-1 text-sm text-sage-deep/90">
            Your family profile is live. Start browsing nannies whenever you&apos;re ready.
            Viewing profiles is always free.
          </p>
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
        <Link href="/nannies">
          <Button>Find a nanny</Button>
        </Link>
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
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {[
          { href: "/nannies", title: "Search nannies", copy: "Browse every approved profile." },
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
