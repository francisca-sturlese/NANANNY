import Link from "next/link";
import { Badge } from "@/components/ui/badge";

/**
 * The free-contact counter (PRD §17).
 *
 * Shown discreetly: it is information, not a nag. It only becomes prominent at
 * zero, which is the one moment it changes what the family can do next.
 */
export function ContactCounter({
  used,
  limit,
  remaining,
  subscribed,
}: {
  used: number;
  limit: number;
  remaining: number;
  subscribed: boolean;
}) {
  if (subscribed) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Badge variant="sage" size="sm">
          Unlimited
        </Badge>
        You can contact as many nannies as you like.
      </p>
    );
  }

  if (remaining === 0) {
    return (
      <div className="rounded-lg border border-peach bg-peach-wash px-4 py-3">
        <p className="text-sm font-medium text-peach-deep">
          You&apos;ve used all {limit} free contacts.
        </p>
        <p className="mt-0.5 text-sm text-peach-deep/90">
          Conversations you have already started stay open and free.{" "}
          <Link href="/pricing" className="underline underline-offset-4">
            See plans
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      {/* Small dots read faster than "2 of 3" on a phone glance. */}
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: limit }, (_, i) => (
          <span
            key={i}
            className={
              i < used
                ? "size-2 rounded-full bg-border-strong"
                : "size-2 rounded-full bg-sage-deep"
            }
          />
        ))}
      </span>
      <p className="text-sm text-muted">
        {remaining} free {remaining === 1 ? "contact" : "contacts"} remaining
      </p>
    </div>
  );
}
