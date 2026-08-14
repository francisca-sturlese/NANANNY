import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadMatches, requirementsCoverage } from "@/lib/matching/matches";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { MatchCard } from "@/components/matching/match-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Matches" };

// The score is recomputed on every visit, so nothing here should be cached.
export const dynamic = "force-dynamic";

export default async function FamilyMatchesPage() {
  const user = await requireRole("family", "/family/matches");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) redirect("/family/onboarding");

  const [{ matches, savedIds }, coverage] = await Promise.all([
    loadMatches(),
    requirementsCoverage(),
  ]);

  const strong = matches.filter((m) => m.score >= 80).length;

  return (
    <AppShell nav={FAMILY_NAV} active="/family/matches" name="Matches">
      <div className="px-4 pt-4 pb-2 sm:px-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Your matches</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {matches.length === 0
            ? "Nothing scored yet."
            : strong > 0
              ? `${strong} of ${matches.length} nannies fit most of what you asked for. Each score below is broken down so you can see how it was reached.`
              : `${matches.length} nannies scored against what you asked for. Each score below is broken down so you can see how it was reached.`}
        </p>
      </div>

      {coverage.missing.length > 0 && (
        <div className="mx-4 mt-2 rounded-md border border-butter bg-butter-wash px-4 py-3.5 sm:mx-6">
          <p className="text-sm leading-relaxed text-butter-deep">
            You have answered {coverage.answered} of {coverage.total} questions we
            score against. Tell us your {formatList(coverage.missing)} and these
            results get a lot sharper.
          </p>
          <Link href="/family/onboarding/requirements" className="mt-3 inline-block">
            <Button variant="outline" size="sm">
              Update what you need
            </Button>
          </Link>
        </div>
      )}

      {matches.length === 0 ? (
        <div className="px-4 py-14 text-center sm:px-6">
          <Sparkles className="mx-auto size-8 text-sage-deep" aria-hidden />
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">
            No approved nannies to score yet. New profiles are added every week, so
            it is worth checking back. In the meantime you can browse everyone who
            is already listed.
          </p>
          <Link href="/nannies" className="mt-5 inline-block">
            <Button>Search nannies</Button>
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3 px-4 py-3 sm:space-y-4 sm:px-6">
            {matches.map((match, index) => (
              <li key={match.nanny.id}>
                <MatchCard
                  match={match}
                  saved={savedIds.has(match.nanny.id)}
                  rank={index + 1}
                />
              </li>
            ))}
          </ul>

          <p className="px-4 pb-6 text-xs leading-relaxed text-subtle sm:px-6">
            Scores compare what a nanny wrote on her profile against what you told
            us. They are a starting point, not a recommendation, and they say
            nothing about whether someone is right for your family. That part is
            still yours. Reading the full profile and talking to her is what
            decides it. See{" "}
            <Link href="/nannies" className="underline">
              everyone else
            </Link>{" "}
            if none of these fit.
          </p>
        </>
      )}
    </AppShell>
  );
}

function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
