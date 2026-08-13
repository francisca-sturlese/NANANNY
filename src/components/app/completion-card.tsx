import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Profile completeness: the percentage, what is actually missing, and one
 * obvious next step. A bare percentage with no list is a nag, not help.
 */
export function CompletionCard({
  percent,
  missing,
  requiredMissing = [],
  editHref,
  title = "Profile completeness",
  blurb,
}: {
  percent: number;
  missing: string[];
  requiredMissing?: string[];
  editHref: string;
  title?: string;
  blurb?: string;
}) {
  const complete = percent >= 100;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {blurb && <p className="mt-1 text-sm text-muted">{blurb}</p>}
          </div>
          <span className="text-2xl font-semibold tabular-nums">{percent}%</span>
        </div>

        <div
          className="mt-4 h-2 overflow-hidden rounded-pill bg-border"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={title}
        >
          <div
            className="h-full rounded-pill transition-[width] duration-500"
            style={{
              width: `${percent}%`,
              background: complete ? "var(--sage-deep)" : "var(--foreground)",
            }}
          />
        </div>

        {missing.length > 0 ? (
          <div className="mt-5">
            <p className="text-sm font-medium">
              {requiredMissing.length > 0 ? "Still needed" : "Worth adding"}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {missing.slice(0, 8).map((item) => (
                <li
                  key={item}
                  className={
                    requiredMissing.includes(item)
                      ? "rounded-pill border border-peach bg-peach-wash px-3 py-1 text-xs text-peach-deep"
                      : "rounded-pill border border-border bg-surface px-3 py-1 text-xs text-muted"
                  }
                >
                  {item}
                </li>
              ))}
            </ul>
            <Link href={editHref} className="mt-5 inline-block">
              <Button size="sm" variant={requiredMissing.length > 0 ? "primary" : "outline"}>
                {requiredMissing.length > 0 ? "Add what's missing" : "Improve my profile"}
              </Button>
            </Link>
          </div>
        ) : (
          <p className="mt-5 text-sm text-sage-deep">
            Your profile is complete. Nothing else needed.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
