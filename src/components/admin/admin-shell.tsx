import Link from "next/link";
import { LogoMark, Logo } from "@/components/brand/logo";
import { LogoutButton } from "@/components/auth/logout-button";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/pricing", label: "Pricing" },
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
export function AdminShell({
  active,
  name,
  pendingReview = 0,
  openReports = 0,
  openSupport = 0,
  children,
}: {
  active: string;
  name: string;
  pendingReview?: number;
  openReports?: number;
  openSupport?: number;
  children: React.ReactNode;
}) {
  const counts: Record<string, number> = {
    "/admin/review": pendingReview,
    "/admin/reports": openReports,
    "/admin/support": openSupport,
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

        <nav
          className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2 sm:px-4"
          aria-label="Admin sections"
        >
          {SECTIONS.map((section) => {
            const current = active === section.href;
            const count = counts[section.href] ?? 0;
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill px-3.5 text-sm font-medium transition-colors",
                  current
                    ? "bg-foreground text-background"
                    : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                {section.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-pill text-[0.625rem] font-semibold",
                      current ? "bg-background/25" : "bg-peach text-peach-deep",
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
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
