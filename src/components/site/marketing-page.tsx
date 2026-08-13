import Link from "next/link";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { Button } from "@/components/ui/button";

/**
 * Frame for the content pages: how it works, for families, for nannies, legal.
 * Narrow measure, generous line height, and a single call to action at the end
 * — a phone reader should never meet a wall of text.
 */
export function MarketingPage({
  eyebrow,
  title,
  intro,
  children,
  cta,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
  cta?: { href: string; label: string; secondary?: { href: string; label: string } };
}) {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-2xl px-5 pt-8 pb-16 sm:px-8 sm:pt-14">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl leading-tight font-semibold sm:text-5xl">{title}</h1>
        {intro && (
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{intro}</p>
        )}

        <div className="mt-10 space-y-10">{children}</div>

        {cta && (
          <div className="mt-14 rounded-xl border border-border bg-surface p-6 text-center sm:p-8">
            <Link href={cta.href} className="block sm:inline-block">
              <Button size="lg" block className="sm:w-auto sm:px-8">
                {cta.label}
              </Button>
            </Link>
            {cta.secondary && (
              <p className="mt-3 text-sm text-muted">
                <Link href={cta.secondary.href} className="underline underline-offset-4">
                  {cta.secondary.label}
                </Link>
              </p>
            )}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

export function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="space-y-6">
      {items.map((item, i) => (
        <li key={item.title} className="flex gap-4">
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background"
          >
            {i + 1}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-1 leading-relaxed text-muted">{item.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <dl className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <div key={item.q} className="py-5">
          <dt className="font-medium">{item.q}</dt>
          <dd className="mt-1.5 leading-relaxed text-muted">{item.a}</dd>
        </div>
      ))}
    </dl>
  );
}
