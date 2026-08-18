import Link from "next/link";
import { LogoMark, Logo } from "@/components/brand/logo";
import { LogoutButton } from "@/components/auth/logout-button";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { PushPrompt } from "@/components/notifications/push-prompt";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/invites", label: "Invites" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/blog", label: "Blog" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/reminders", label: "Reminders" },
  { href: "/admin/insights", label: "Traffic" },
  { href: "/admin/audit", label: "Audit" },
];

/**
 * Frame for the back office.
 *
 * Seven sections do not fit a five-slot bottom bar, so admin uses a horizontal
 * scrolling tab rail instead. It is the one part of the product that is used
 * mostly at a desk, but it still has to work on a phone: a report does not wait
 * for someone to get back to their laptop.
 */
export async function AdminShell({
  active,
  name,
  pendingReview,
  openReports,
  openSupport,
  children,
}: {
  active: string;
  name: string;
  pendingReview?: number;
  openReports?: number;
  openSupport?: number;
  children: React.ReactNode;
}) {
  /**
   * The badges are fetched here, not passed in. When only the Support page
   * passed its count, the "1" appeared only after you had already clicked
   * Support, which is a notification that arrives after you no longer need
   * it. Three head-only counts per admin page view is the price of a rail
   * that tells the truth everywhere; a page that already computed a fresher
   * number can still pass it and win.
   */
  const supabase = await createServerSupabase();
  const [reviewRes, reportsRes, supportRes] = await Promise.all([
    supabase
      .from("nanny_profiles")
      .select("*", { count: "exact", head: true })
      .in("status", ["submitted", "under_review"]),
    supabase
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("support_requests")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]),
  ]);

  const counts: Record<string, number> = {
    "/admin/review": pendingReview ?? reviewRes.count ?? 0,
    "/admin/reports": openReports ?? reportsRes.count ?? 0,
    "/admin/support": openSupport ?? supportRes.count ?? 0,
  };

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Link href="/" aria-label="NaNanny UAE home" className="tap-target">
            <LogoMark className="h-8 w-8 sm:hidden" />
            <span className="hidden sm:block">
              <Logo />
            </span>
          </Link>

          <span className="rounded-pill bg-foreground px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide text-background uppercase">
            Admin
          </span>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-40 truncate text-sm text-muted lg:inline">{name}</span>
            <LogoutButton />
          </div>
        </div>

        <AdminNav
          active={active}
          sections={SECTIONS.map((section) => ({
            href: section.href,
            label: section.label,
            count: counts[section.href] ?? 0,
          }))}
        />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8"><PushPrompt />
        {children}</main>
    </div>
  );
}

/** A single number with a label. The dashboard is mostly these. */
export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "sage" | "peach" | "butter";
}) {
  const background = {
    neutral: "var(--surface-raised)",
    sage: "var(--sage-wash)",
    peach: "var(--peach-wash)",
    butter: "var(--butter-wash)",
  }[tone];

  return (
    <div
      className="rounded-lg border border-border p-4"
      style={{ background }}
    >
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-subtle">{hint}</p>}
    </div>
  );
}
