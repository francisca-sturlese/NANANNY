import Link from "next/link";
import { MapPin, Clock, Home, Car, ChefHat, Sparkles, HeartPulse } from "lucide-react";
import type { NannyCardData } from "@/lib/search/nannies";
import { Badge } from "@/components/ui/badge";
import { VERIFICATION_BADGES, UnverifiedBadge, type VerificationBadgeKey } from "@/components/ui/badge";
import { SaveButton } from "@/components/nanny/save-button";
import { visaLabel } from "@/lib/nanny/visa";
import { NannyPhotoFallback } from "@/components/nanny/photo-fallback";
import { experienceShort } from "@/lib/nanny/experience";

/**
 * The search result card, designed for a thumb scrolling a phone.
 *
 * Everything a family needs to decide "open this one or keep scrolling" is on
 * the card: photo, name, where, experience, when she can start, live in/out,
 * salary, a few skills and what has actually been verified. Anything more and
 * the card stops being scannable.
 *
 * The whole card is one link, with Save as a separate control on top — so a
 * mis-tap opens the profile rather than doing something unexpected.
 */
export function NannyCard({
  nanny,
  saved = false,
  canSave = false,
}: {
  nanny: NannyCardData;
  saved?: boolean;
  canSave?: boolean;
}) {
  const arrangement =
    nanny.arrangement === "live_in"
      ? "Live in"
      : nanny.arrangement === "live_out"
        ? "Live out"
        : "Live in or out";

  const skills = [
    nanny.driving && { icon: Car, label: "Drives" },
    nanny.cooking && { icon: ChefHat, label: "Cooks" },
    nanny.housekeeping && { icon: Sparkles, label: "Housekeeping" },
    nanny.firstAid && { icon: HeartPulse, label: "First aid" },
  ].filter(Boolean) as { icon: typeof Car; label: string }[];

  const ages = [
    nanny.newborn && "Newborn",
    nanny.toddler && "Toddler",
    nanny.schoolAge && "School age",
    nanny.specialNeeds && "Special needs",
  ].filter(Boolean) as string[];

  return (
    <article className="relative h-full rounded-lg border border-border bg-surface-raised transition-shadow hover:shadow-card">
      {canSave && (
        <div className="absolute top-3 right-3 z-10">
          <SaveButton nannyId={nanny.id} saved={saved} />
        </div>
      )}

      <Link href={`/nannies/${nanny.id}`} className="block p-4 sm:p-5">
        <div className="flex gap-3.5">
          {/* Fixed 80px on a phone: big enough to read a face, small enough to
              leave the text room to breathe. */}
          {nanny.photoUrl ? (
            <img
              src={nanny.photoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              width={80}
              height={80}
              className="size-20 shrink-0 rounded-md object-cover"
            />
          ) : (
            <NannyPhotoFallback className="size-20 rounded-md" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2 pr-9">
              <h3 className="truncate text-base font-semibold">
                {nanny.firstName ?? "Nanny"}
              </h3>
              <span className="shrink-0 text-sm text-muted">
                {experienceShort(nanny.yearsExperience)}
              </span>
            </div>

            {nanny.headline && (
              <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted">
                {nanny.headline}
              </p>
            )}

            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              {nanny.emirate && (
                <li className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {nanny.emirate}
                </li>
              )}
              <li className="inline-flex items-center gap-1">
                <Home className="size-3.5 shrink-0" aria-hidden />
                {arrangement}
              </li>
              {nanny.availableFrom && (
                <li className="inline-flex items-center gap-1">
                  <Clock className="size-3.5 shrink-0" aria-hidden />
                  {availabilityLabel(nanny.availableFrom)}
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Salary is the second thing a family looks for, so it gets its own line. */}
        {nanny.salaryMin != null && (
          <p className="mt-3 text-sm font-medium">
            From AED {nanny.salaryMin.toLocaleString("en-AE")}
            <span className="font-normal text-muted"> / month</span>
          </p>
        )}

        {/* Deliberately not a verification badge and deliberately not in the
            sage or peach used for one. She said this; nobody checked it. */}
        {visaLabel(nanny.visaStatus) && (
          <p className="mt-3 text-xs text-muted">{visaLabel(nanny.visaStatus)}</p>
        )}

        {(ages.length > 0 || nanny.languages.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ages.slice(0, 2).map((a) => (
              <Badge key={a} variant="sage" size="sm">
                {a}
              </Badge>
            ))}
            {nanny.languages.slice(0, 3).map((l) => (
              <Badge key={l} variant="neutral" size="sm">
                {l}
              </Badge>
            ))}
          </div>
        )}

        {skills.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-muted">
            {skills.map((s) => (
              <li key={s.label} className="inline-flex items-center gap-1">
                <s.icon className="size-3.5 shrink-0" aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
        )}

        {/* Only what a human actually reviewed. Never a blanket claim, and
            when nobody has reviewed anything yet, that is what it says. */}
        {(nanny.badges.length > 0 || !nanny.verified) && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
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
      </Link>
    </article>
  );
}

function availabilityLabel(date: string): string {
  const when = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (when <= today) return "Available now";

  const days = Math.round((when.getTime() - today.getTime()) / 86_400_000);
  if (days <= 14) return `In ${days} days`;
  return when.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}
