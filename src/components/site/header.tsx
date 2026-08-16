"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Portal, useScrollLock } from "@/components/ui/portal";

const NAV = [
  { href: "/nannies", label: "Find a Nanny" },
  { href: "/jobs", label: "Find a Job" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * Public header.
 *
 * A phone gets a 56px bar carrying the logo, one primary action (Sign up) and a
 * menu button — nothing else competes for the width. The four nav links move
 * into a full-screen sheet with large targets rather than being crammed in.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  useScrollLock(open);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:h-16 sm:px-8">
        <Link href="/" aria-label="NaNanny UAE home" className="tap-target">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="tap-target text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link href="/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Sign up</Button>
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-11 place-items-center rounded-pill text-foreground md:hidden"
          >
            {open ? <Menu className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Full-screen menu: every link is a large, unmissable target. */}
      {open && (
        <Portal>
        {/* Same reason as the filter sheet: the header itself has
            backdrop-blur, so a `fixed` child would be trapped inside it. */}
        <div id="mobile-menu" className="fixed inset-0 z-50 bg-background md:hidden">
          <div className="flex h-14 items-center justify-between px-5">
            <Logo />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="grid size-11 place-items-center rounded-pill text-foreground"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <nav className="px-5 pt-4" aria-label="Main">
            <ul className="divide-y divide-border border-y border-border">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-14 items-center text-lg font-medium"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-6 space-y-2.5">
              <Link href="/signup" onClick={() => setOpen(false)} className="block">
                <Button size="lg" block>
                  Sign up
                </Button>
              </Link>
              <Link href="/login" onClick={() => setOpen(false)} className="block">
                <Button size="lg" variant="outline" block>
                  Log in
                </Button>
              </Link>
            </div>
          </nav>
        </div>
        </Portal>
      )}
    </header>
  );
}
