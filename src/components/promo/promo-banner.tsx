import { Sparkles } from "lucide-react";
import { getPromo, endsPhrase } from "@/lib/promo";
import { getPricingConfig } from "@/lib/pricing";

/**
 * The launch banner.
 *
 * Appears and disappears on its own, because the window it reads is
 * configuration. Nobody has to remember to take it down, which is how a
 * "limited time" message ends up still on a site in March.
 *
 * A strip rather than a dismissible bar with a close button. It is one line on
 * a phone, it does not cover anything, and a family who is told the product is
 * free this week and then cannot find that message again is worse served than
 * one who sees it twice.
 */
export async function PromoBanner({
  audience = "family",
}: {
  /** Public pages say what it is; a signed-in family is told what it means for them. */
  audience?: "public" | "family";
}) {
  const promo = await getPromo();
  if (!promo.active) return null;

  const pricing = await getPricingConfig();
  const ends = endsPhrase(promo);

  return (
    <div className="border-b border-sage bg-sage-wash">
      {/* One paragraph, not a text column and a date column. Two columns on a
          390px screen squeezed the sentence onto four lines to keep a date on
          one. The date is part of the sentence instead, and wraps with it. */}
      <div className="mx-auto flex max-w-5xl items-start gap-2.5 px-4 py-2.5 sm:items-center sm:px-6">
        <Sparkles className="mt-px size-4 shrink-0 text-sage-deep sm:mt-0" aria-hidden />

        <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-sage-deep">
          <span className="font-medium">{promo.label ?? "Free while we launch."}</span>{" "}
          {audience === "family"
            ? `None of it uses your ${pricing.freeContacts} free contacts.`
            : "Contacting a nanny costs nothing right now."}
          {ends && <span className="whitespace-nowrap"> {ends}.</span>}
        </p>
      </div>
    </div>
  );
}
