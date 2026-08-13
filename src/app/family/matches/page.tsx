import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Matches" };

export default async function FamilyMatchesPage() {
  const user = await requireRole("family", "/family/matches");
  if (!user.emailVerified) redirect("/verify-email");

  return (
    <AppShell nav={FAMILY_NAV} active="/family/matches" name="Matches">
      <ComingSoon
        title="Matches are coming"
        body="We'll score every approved nanny against what you told us — location, schedule, ages, languages, budget — and show you why each one fits. Until then, search works on all the same filters."
        cta={{ href: "/nannies", label: "Search nannies" }}
      />
    </AppShell>
  );
}
