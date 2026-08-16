import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Profile completeness: the percentage, what is actually missing, the reason it
 * matters, and one obvious next step. A bare percentage with no list is a nag,
 * not help, and a list with no consequence is only slightly better.
 *
 * The consequence is the part that was absent, and it cost real people. Six
 * nannies signed up in the first week and none of them could be found: five
 * were missing several required fields, and one was missing a single photo at
 * eighty eight per cent. Every one of them saw a peach coloured pill saying
 * "Profile photo" and nothing telling them that until it was there, no family
 * could see them at all. A label is not an explanation.
 */
export function CompletionCard({
  percent,
  missing,
  requiredMissing = [],
  /**
   * Whether families can already see her.
   *
   * Approval used to imply a complete profile, so "families cannot find you"
   * was safe to say to anybody with something required missing. Four profiles
   * were published by hand into an empty marketplace and then approved from the
   * review queue, and that assumption stopped holding within the afternoon:
   * those four are on the search page today with several fields blank.
   *
   * Telling them families cannot find them is a claim they can disprove in one
   * click, and a product somebody catches lying is one they stop reading. The
   * true thing for them is different and just as motivating: a family is
   * looking at this right now, and there is not much to look at.
   */
  visible = false,
  editHref,
  title = "Profile completeness",
  blurb,
}: {
  percent: number;
  missing: string[];
  requiredMissing?: string[];
  visible?: boolean;
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
            {requiredMissing.length > 0 && (
              <p className="mt-1 text-sm leading-relaxed text-peach-deep">
                {visible
                  ? requiredMissing.length === 1
                    ? "Your profile is live, and this is the first thing a family looks for."
                    : `Your profile is live, and families are seeing very little: these ${requiredMissing.length} are still empty.`
                  : requiredMissing.length === 1
                    ? "Families cannot find you until you add this one thing."
                    : `Families cannot find you until these ${requiredMissing.length} are filled in.`}{" "}
                Everything else on the list is optional.
              </p>
            )}
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
