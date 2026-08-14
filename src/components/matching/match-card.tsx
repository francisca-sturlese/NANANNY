import Link from "next/link";
import { Check, AlertTriangle, ChevronRight } from "lucide-react";
import type { MatchedNanny } from "@/lib/matching/matches";
import { DIMENSION_LABELS } from "@/lib/matching/matches";
import { Badge } from "@/components/ui/badge";
import { VERIFICATION_BADGES, UnverifiedBadge, type VerificationBadgeKey } from "@/components/ui/badge";
import { SaveButton } from "@/components/nanny/save-button";

/**
 * A scored nanny.
 *
 * The score is never shown on its own. Every card carries the sentences that
 * produced it, and the things that do not fit sit next to the things that do,
 * in the same size type. A family deciding who to spend one of three free
 * contacts on deserves the caveats as plainly as the pitch.
 *
 * The breakdown lives in a <details>, closed by default: useful to the family
 * that wants it, out of the way for the one that does not.
 */
export function MatchCard({
  match,
  saved,
  rank,
}: {
  match: MatchedNanny;
  saved: boolean;
  rank: number;
}) {
  const { nanny, score, reasons, conflicts, breakdown, unknown } = match;

  const dimensions = Object.entries(DIMENSION_LABELS)
    .filter(([key]) => breakdown[key] != null)
    .map(([key, label]) => ({
      key,
      label,
      value: Number(breakdown[key]),
      // Neutral because the family never answered, not because it half fits.
      // Showing "50%" here would be inventing a number.
      unanswered: unknown.includes(key),
    }));

  return (
    <article className="relative rounded-lg border border-border bg-surface-raised">
      <div className="absolute top-3 right-3 z-10">
        <SaveButton nannyId={nanny.id} saved={saved} />
      </div>

      <Link href={`/nannies/${nanny.id}`} className="block p-4 sm:p-5">
        <div className="flex gap-3.5">
          {nanny.photoUrl ? (
            <img
              src={nanny.photoUrl}
              alt=""
              loading={rank <= 2 ? "eager" : "lazy"}
              decoding="async"
              width={80}
              height={80}
              className="size-20 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="grid size-20 shrink-0 place-items-center rounded-md bg-sage-wash text-xs text-sage-deep">
              {nanny.firstName?.[0] ?? "N"}
            </span>
          )}

          {/* pr-9 on the column, not just the first line: the Save button is
              positioned over this corner and the salary was running under it. */}
          <div className="min-w-0 flex-1 pr-9">
            <div className="flex items-start gap-2">
              <h3 className="truncate text-base font-semibold">
                {nanny.firstName ?? "Nanny"}
              </h3>
              <ScorePill score={score} />
            </div>

            {/* No emirate here on purpose. Location is always covered below,
                either as a reason or as a conflict, and repeating it pushed
                this line onto a second row on a phone. */}
            <p className="mt-1 text-sm leading-snug text-muted">
              {[
                `${nanny.yearsExperience} yr${nanny.yearsExperience === 1 ? "" : "s"}`,
                nanny.salaryMin != null
                  ? `from AED ${nanny.salaryMin.toLocaleString("en-AE")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        {/* Badges sit under the whole header rather than beside the photo, so
            two of them lie side by side instead of stacking in a narrow column. */}
        {(nanny.badges.length > 0 || !nanny.verified) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {!nanny.verified && <UnverifiedBadge />}
            {nanny.badges.slice(0, 3).map((b) => {
              const meta = VERIFICATION_BADGES[b as VerificationBadgeKey];
              if (!meta) return null;
              return (
                <Badge key={b} variant={meta.variant} size="sm">
                  {meta.label}
                </Badge>
              );
            })}
          </div>
        )}

        {reasons.length > 0 && (
          <ul className="mt-3.5 space-y-1.5">
            {reasons.slice(0, 3).map((reason) => (
              <li key={reason} className="flex gap-2 text-sm leading-snug">
                <Check className="mt-0.5 size-4 shrink-0 text-sage-deep" aria-hidden />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}

        {conflicts.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {conflicts.slice(0, 2).map((conflict) => (
              <li key={conflict} className="flex gap-2 text-sm leading-snug text-muted">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-peach-deep"
                  aria-hidden
                />
                <span>{conflict}</span>
              </li>
            ))}
          </ul>
        )}
      </Link>

      {dimensions.length > 0 && (
        <details className="group border-t border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm text-muted sm:px-5">
            How this score was worked out
            <ChevronRight
              className="size-4 shrink-0 transition-transform group-open:rotate-90"
              aria-hidden
            />
          </summary>

          <dl className="space-y-2.5 px-4 pt-1 pb-4 sm:px-5">
            {dimensions.map((d) => (
              <div key={d.key} className="flex items-center gap-3">
                <dt className="w-28 shrink-0 text-xs text-muted">{d.label}</dt>
                {d.unanswered ? (
                  <dd className="flex-1 text-xs text-subtle">You have not said</dd>
                ) : (
                  <dd className="flex flex-1 items-center gap-2">
                    <span
                      className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface"
                      aria-hidden
                    >
                      <span
                        className="block h-full rounded-pill bg-sage"
                        style={{ width: `${Math.round(d.value * 100)}%` }}
                      />
                    </span>
                    <span className="w-9 shrink-0 text-right text-xs text-muted tabular-nums">
                      {Math.round(d.value * 100)}%
                    </span>
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </details>
      )}
    </article>
  );
}

function ScorePill({ score }: { score: number }) {
  const variant = score >= 80 ? "sage" : score >= 60 ? "butter" : "neutral";
  return (
    <Badge variant={variant} size="sm" className="shrink-0 tabular-nums">
      {score}% match
    </Badge>
  );
}
