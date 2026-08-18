import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/logo";
import { LogoutButton } from "@/components/auth/logout-button";
import { cn } from "@/lib/utils";
import { PromoBanner } from "@/components/promo/promo-banner";
import { NotificationBell } from "@/components/notifications/bell";
import { InstallHint } from "@/components/app/install-hint";
import { PushPrompt } from "@/components/notifications/push-prompt";
import { getNotifications } from "@/lib/notifications/read";
import { getSession } from "@/lib/auth/dal";
import {
  Home,
  Search,
  Sparkles,
  MessageCircle,
  User,
  Briefcase,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Family bottom navigation, in the order the spec sets out. */
export const FAMILY_NAV: NavItem[] = [
  { href: "/family", label: "Home", icon: Home },
  { href: "/nannies", label: "Find Nanny", icon: Search },
  { href: "/family/matches", label: "Matches", icon: Sparkles },
  { href: "/family/messages", label: "Messages", icon: MessageCircle },
  { href: "/family/profile", label: "Profile", icon: User },
];

export const NANNY_NAV: NavItem[] = [
  { href: "/nanny", label: "Home", icon: Home },
  { href: "/jobs", label: "Find Jobs", icon: Briefcase },
  { href: "/nanny/applications", label: "Applications", icon: ClipboardList },
  { href: "/nanny/messages", label: "Messages", icon: MessageCircle },
  { href: "/nanny/profile", label: "Profile", icon: User },
];

/**
 * Frame for the signed-in areas — built for a phone first.
 *
 * Mobile: a compact 56px header (mark only, no wordmark, so it stays legible
 * without crowding) and a fixed bottom bar. The bar is the primary navigation,
 * not a fallback: five thumb-sized targets, and the page reserves space for it
 * via `pb-nav` so it can never cover content.
 *
 * Desktop expands that into a horizontal nav in the header and drops the bar.
 */
export async function AppShell({
  nav,
  active,
  name,
  children,
}: {
  nav: NavItem[];
  active: string;
  name: string;
  children: React.ReactNode;
}) {
  /**
   * Fetched here rather than passed in by each page, so the bell is on all
   * fourteen signed-in screens instead of the ones somebody remembered. Both
   * calls are React.cache'd, so the page above has already paid for the
   * session and this adds one query.
   */
  const [session, feed] = await Promise.all([getSession(), getNotifications()]);

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Link href="/" aria-label="NaNanny UAE home" className="tap-target">
            <LogoMark className="h-8 w-8 sm:hidden" />
            <span className="hidden sm:block">
              <Logo />
            </span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active === item.href ? "page" : undefined}
                className={cn(
                  "tap-target text-sm font-medium transition-colors",
                  active === item.href ? "text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <span className="mr-1 hidden max-w-40 truncate text-sm text-muted lg:inline">
              {name}
            </span>
            {session && (
              <NotificationBell
                userId={session.id}
                initialUnread={feed.unread}
                initialItems={feed.items}
              />
            )}
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Families only. A nanny pays nothing either way, and telling her the
          contacts are free is telling her about somebody else's bill. */}
      {nav === FAMILY_NAV && <PromoBanner audience="family" />}

      <main className="mx-auto max-w-5xl px-4 py-6 pb-nav sm:px-6 sm:py-10 md:pb-10">
        {/* Signed in only. Somebody still deciding whether to sign up does not
            need to be asked to install anything. */}
        {/* Only once something has arrived. The reason to install is that we
            can reach her without her checking, and that reason is a promise
            about the future until the first message or application lands. */}
        <InstallHint afterSomethingHappened={feed.items.length > 0} />
        {/* Only one of these two ever renders. On iOS push does not exist until
            the site is on the home screen, so there the hint speaks and this
            stays quiet; once installed, the API appears and this asks. Two
            requests stacked on one screen is how both get dismissed. */}
        <PushPrompt />
        {children}
      </main>

      <BottomNav nav={nav} active={active} />
    </div>
  );
}

/**
 * Fixed bottom bar. Sits above the iPhone home indicator via `pb-safe`, and
 * every target is a 44px-tall column so it is usable one-handed.
 */
export function BottomNav({ nav, active }: { nav: NavItem[]; active: string }) {
  return (
    <nav
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      aria-label="Main"
    >
      <ul className="flex">
        {nav.map((item) => {
          const Icon = item.icon;
          const current = active === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-2 transition-colors",
                  current ? "text-foreground" : "text-subtle",
                )}
              >
                <Icon
                  className="size-5 shrink-0"
                  strokeWidth={current ? 2.2 : 1.7}
                  aria-hidden
                />
                <span className="text-[0.625rem] leading-none font-medium">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
