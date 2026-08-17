"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Portal, useScrollLock } from "@/components/ui/portal";
import { cn } from "@/lib/utils";

export type AdminSection = { href: string; label: string; count: number };

/**
 * The admin navigation, in the shape each screen deserves.
 *
 * Eleven sections never fit a phone as a rail: the scrolling version opened
 * half off-screen and read as broken (founder, twice). On a phone this is a
 * hamburger opening the same full-screen sheet the public site uses, every
 * section a large target with its count beside it. From `sm` up, the rail —
 * which at that width shows everything at once — survives unchanged.
 */
export function AdminNav({ sections, active }: { sections: AdminSection[]; active: string }) {
  const [open, setOpen] = useState(false);
  useScrollLock(open);

  const current = sections.find((s) => s.href === active);
  const totalCount = sections.reduce((n, s) => n + s.count, 0);

  return (
    <>
      {/* Phone: current section named, everything else behind the button. */}
      <div className="flex items-center justify-between px-4 pb-2 sm:hidden">
        <span className="text-sm font-semibold">{current?.label ?? "Admin"}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="admin-menu"
          aria-label="Open sections"
          className="relative grid size-11 place-items-center rounded-pill text-foreground"
        >
          <Menu className="size-5" aria-hidden />
          {totalCount > 0 && (
            <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-pill bg-peach text-[0.55rem] font-semibold text-peach-deep">
              {totalCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <Portal>
          <div id="admin-menu" className="fixed inset-0 z-50 bg-background sm:hidden">
            <div className="flex h-14 items-center justify-between px-4">
              <span className="text-sm font-semibold">Admin</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close sections"
                className="grid size-11 place-items-center rounded-pill text-foreground"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <nav className="overflow-y-auto px-4 pt-2 pb-8" aria-label="Admin sections">
              <ul className="divide-y divide-border border-y border-border">
                {sections.map((section) => (
                  <li key={section.href}>
                    <Link
                      href={section.href}
                      onClick={() => setOpen(false)}
                      aria-current={active === section.href ? "page" : undefined}
                      className={cn(
                        "flex min-h-13 items-center justify-between gap-3 text-base",
                        active === section.href ? "font-semibold" : "font-medium",
                      )}
                    >
                      {section.label}
                      {section.count > 0 && (
                        <span className="grid size-6 place-items-center rounded-pill bg-peach text-xs font-semibold text-peach-deep">
                          {section.count}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </Portal>
      )}

      {/* Wider screens: the rail, which fits there. */}
      <nav
        className="mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:flex"
        aria-label="Admin sections"
      >
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active === section.href ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill px-3.5 text-sm font-medium transition-colors",
              active === section.href
                ? "bg-foreground text-background"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            {section.label}
            {section.count > 0 && (
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-pill text-[0.625rem] font-semibold",
                  active === section.href ? "bg-background/25" : "bg-peach text-peach-deep",
                )}
              >
                {section.count}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </>
  );
}
