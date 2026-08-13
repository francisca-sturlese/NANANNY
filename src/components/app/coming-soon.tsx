import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * An honest placeholder for a screen that is in the bottom navigation but not
 * built yet. It says plainly what is missing and points at the thing that does
 * work, rather than showing an empty list that reads as "you have nothing".
 */
export function ComingSoon({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-background p-8 text-center sm:p-12">
      <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{body}</p>
      <Link href={cta.href} className="mt-6 inline-block">
        <Button>{cta.label}</Button>
      </Link>
    </div>
  );
}
