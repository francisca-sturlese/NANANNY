import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * Shared frame for every auth screen. Split layout on desktop: form on the
 * left, a quiet brand panel on the right. Single column on mobile.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  aside,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,42%)]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="tap-target w-fit" aria-label="NaNanny UAE home">
          <Logo />
        </Link>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-3 leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && (
            <div className="mt-6 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
              {footer}
            </div>
          )}
        </div>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-border lg:block">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 60% at 20% 15%, var(--sage-wash) 0%, transparent 70%), radial-gradient(65% 55% at 85% 40%, var(--peach-wash) 0%, transparent 72%), radial-gradient(60% 50% at 40% 90%, var(--butter-wash) 0%, transparent 70%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-end p-12">
          {aside ?? (
            <blockquote className="max-w-sm">
              <p className="text-2xl leading-snug font-medium">
                Find the right nanny. Directly.
              </p>
              <footer className="mt-4 text-sm text-muted">
                No agency in between. No commission on her salary. No placement fee.
              </footer>
            </blockquote>
          )}
        </div>
      </aside>
    </div>
  );
}
