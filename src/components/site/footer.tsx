import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const COLUMNS = [
  {
    title: "Families",
    links: [
      { href: "/nannies", label: "Find a nanny" },
      { href: "/for-families", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Nannies",
    links: [
      { href: "/jobs", label: "Find a job" },
      { href: "/for-nannies", label: "Why NaNanny" },
      { href: "/signup?role=nanny", label: "Create a profile" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/support", label: "Support" },
      { href: "/partnerships", label: "Partnerships" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo withTagline />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
              NaNanny is a technology platform that connects families and nannies
              directly across the UAE.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="eyebrow">{col.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="tap-target text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* PRD §56: this wording is a legal position, not marketing copy.
            It must stay consistent everywhere it appears. */}
        <div className="mt-12 border-t border-border pt-8">
          <p className="max-w-3xl text-xs leading-relaxed text-subtle">
            NaNanny is a technology platform. NaNanny does not employ nannies, does not
            sponsor nannies, and does not negotiate employment contracts. Employment
            arrangements are made directly between families and nannies, who remain
            responsible for complying with applicable UAE laws.
          </p>
          <p className="mt-6 text-xs text-subtle">
            © {new Date().getFullYear()} NaNanny UAE. All rights reserved.
            {" · "}
            <a
              href="https://www.linkedin.com/company/nananny"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              LinkedIn
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
