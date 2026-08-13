import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage/private-assets";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { ShortlistCard } from "@/components/nanny/shortlist-card";

export const metadata: Metadata = { title: "Saved nannies" };

const STAGES = [
  { value: "interested", label: "Interested" },
  { value: "interview", label: "Interview" },
  { value: "finalists", label: "Finalists" },
  { value: "hired", label: "Hired" },
] as const;

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const user = await requireRole("family", "/family/saved");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();

  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) redirect("/family/onboarding");

  const { data: saved } = await supabase
    .from("saved_profiles")
    .select(
      "id, stage, created_at, nanny:nanny_profiles!inner(id, first_name, headline, emirate, years_experience, salary_expectation_min_aed, arrangement, photo_url, status)",
    )
    .eq("family_id", family.id)
    .order("created_at", { ascending: false });

  type Row = NonNullable<typeof saved>[number];
  const rows = (saved ?? []) as Row[];

  const photoMap = await signedUrls(
    "nanny-photos",
    rows.map((r) => r.nanny?.photo_url ?? null),
  );

  const counts = Object.fromEntries(
    STAGES.map((s) => [s.value, rows.filter((r) => r.stage === s.value).length]),
  );

  const activeStage = STAGES.some((s) => s.value === stage) ? stage : undefined;
  const visible = activeStage ? rows.filter((r) => r.stage === activeStage) : rows;

  return (
    <AppShell nav={FAMILY_NAV} active="/family/saved" name="Saved">
      <h1 className="text-2xl font-semibold sm:text-3xl">Saved nannies</h1>
      <p className="mt-1 text-sm text-muted">
        Saving and shortlisting is always free. It never uses one of your contacts.
      </p>

      {rows.length > 0 && (
        // Wraps onto a second line rather than scrolling sideways: a tab half
        // off the screen is a tab nobody knows exists.
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Shortlist stages">
          <StageTab href="/family/saved" label="All" count={rows.length} active={!activeStage} />
          {STAGES.map((s) => (
            <StageTab
              key={s.value}
              href={`/family/saved?stage=${s.value}`}
              label={s.label}
              count={counts[s.value] ?? 0}
              active={activeStage === s.value}
            />
          ))}
        </nav>
      )}

      {visible.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-background p-8 text-center sm:p-12">
          <h2 className="text-lg font-semibold">
            {rows.length === 0 ? "Nothing saved yet" : "Nothing at this stage"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            {rows.length === 0
              ? "Tap the heart on any profile to keep it here. Saving costs nothing."
              : "Move a saved nanny into this stage as you go."}
          </p>
          <Link href="/nannies" className="mt-5 inline-block">
            <Button>Find a nanny</Button>
          </Link>
        </div>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {visible.map((row) => (
            <li key={row.id}>
              <ShortlistCard
                nannyId={row.nanny.id}
                firstName={row.nanny.first_name}
                headline={row.nanny.headline}
                emirate={row.nanny.emirate}
                yearsExperience={row.nanny.years_experience}
                salaryMin={row.nanny.salary_expectation_min_aed}
                photoUrl={row.nanny.photo_url ? (photoMap.get(row.nanny.photo_url) ?? null) : null}
                stage={row.stage}
                stillListed={row.nanny.status === "approved"}
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function StageTab({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill bg-foreground px-4 text-sm font-medium text-background"
          : "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill border border-border bg-background px-4 text-sm font-medium text-muted"
      }
    >
      {label}
      <span className={active ? "opacity-70" : "text-subtle"}>{count}</span>
    </Link>
  );
}
