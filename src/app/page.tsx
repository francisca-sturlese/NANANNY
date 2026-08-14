import Link from "next/link";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { SearchModule } from "@/components/site/search-module";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Photo } from "@/components/ui/photo";
import { largestSrc, photo, srcSet } from "@/lib/photos";
import { getPricingConfig } from "@/lib/pricing";
import { absoluteUrl, canonical, jsonLd } from "@/lib/seo/site";

export const metadata = { alternates: canonical("/") };

/**
 * Homepage, mobile first.
 *
 * The phone layout is the design; the desktop layout is that design given more
 * room. Type scale starts at a comfortable phone size and steps up, rather than
 * starting at a desktop size and being shrunk.
 */
export default async function HomePage() {
  const pricing = await getPricingConfig();
  const hero = photo("family-sunset");
  const nannyPhoto = photo("nanny-reading");

  return (
    <>
      {/* Structured data, so a search result can show what this is and where it
          operates. Rendered as a child of the script tag rather than through
          dangerouslySetInnerHTML: React writes it as text either way, and not
          using that API anywhere is one of the assumptions the Content Security
          Policy rests on. */}
      <script type="application/ld+json">
        {jsonLd({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "NaNanny UAE",
          url: absoluteUrl("/"),
          logo: absoluteUrl("/icon.svg"),
          description:
            "A marketplace connecting families and nannies across the United Arab Emirates.",
          areaServed: { "@type": "Country", name: "United Arab Emirates" },
        })}
      </script>

      <SiteHeader />

      <main>
        {/* ---------------- Hero ---------------- */}
        {/* Photograph first, words last. The copy is anchored to the bottom of
            the hero so the picture has the whole upper half to itself, and the
            search card sits below the hero rather than on top of it. */}
        <section className="relative flex min-h-[max(560px,78svh)] flex-col justify-end overflow-hidden sm:min-h-[max(600px,72svh)] lg:min-h-[82vh]">
          <div aria-hidden className="absolute inset-0 -z-10">
            <img
              src={largestSrc(hero)}
              srcSet={srcSet(hero)}
              sizes="100vw"
              alt=""
              fetchPriority="high"
              decoding="sync"
              className="size-full object-cover object-[center_28%]"
            />
            {/* Barely there at the top, so the photograph reads as a
                photograph; heavier only where the words actually sit. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.2) 30%, rgba(255,255,255,0.62) 52%, rgba(255,255,255,0.9) 78%, rgba(255,255,255,1) 100%)",
              }}
            />
          </div>

          <div className="mx-auto w-full max-w-3xl px-5 pb-10 text-center sm:px-8 sm:pb-14">
            {/* An aside, not a headline: pushed right and half the size, so it
                informs without competing with the promise above the buttons. */}
            <div className="flex justify-end">
              <Badge variant="butter" size="xs">
                First {pricing.freeContacts} nanny contacts free
              </Badge>
            </div>

            <h1 className="mt-3 text-[2.15rem] leading-[1.08] font-semibold sm:text-5xl lg:text-6xl">
              Find the right nanny for your family
            </h1>

            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-foreground/75 sm:text-lg">
              Connect directly with nannies across the UAE. No agency in between.
            </p>

            <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
              <Link href="/nannies" className="sm:w-auto">
                <Button size="lg" block className="sm:w-auto sm:px-10">
                  Find a Nanny
                </Button>
              </Link>
              <Link href="/jobs" className="sm:w-auto">
                <Button size="lg" variant="outline" block className="sm:w-auto sm:px-10">
                  Find a Job
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ---------------- Search ---------------- */}
        <section className="mx-auto max-w-3xl px-5 pt-10 pb-4 sm:px-8 sm:pt-14">
          <SearchModule />
        </section>

        {/* ---------------- Four promises ---------------- */}
        <section className="mx-auto max-w-6xl px-5 pt-4 pb-8 sm:px-8 sm:pt-6">
          {/* Two columns on a phone rather than a sideways scroll. A card half
              off the screen reads as broken, and nobody swipes horizontally on
              a page that scrolls down. */}
          <ul className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {[
              {
                step: "Discover",
                copy: "Search every approved nanny profile in the UAE. Free, always.",
                tint: "var(--sage-wash)",
              },
              {
                step: "Match",
                copy: "Tell us what you need. We score candidates and show you why.",
                tint: "var(--peach-wash)",
              },
              {
                step: "Connect",
                copy: `Message your first ${pricing.freeContacts} nannies without paying.`,
                tint: "var(--butter-wash)",
              },
              {
                step: "Choose",
                copy: "Interview, decide, hire directly. No placement fee, ever.",
                tint: "var(--sage-wash)",
              },
            ].map((item) => (
              <li
                key={item.step}
                style={{ background: item.tint, borderRadius: "var(--radius-lg)" }}
              >
                <div className="p-4 sm:p-5">
                  <h3 className="text-base font-semibold">{item.step}</h3>
                  <p className="mt-1.5 text-sm leading-snug text-muted">{item.copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------- Pricing ---------------- */}
        <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="rounded-xl border border-border bg-surface p-6 sm:p-10 lg:p-12">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12">
              <div>
                <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">
                  Your first {pricing.freeContacts} nanny contacts are free.
                </h2>
                <p className="mt-3 max-w-md leading-relaxed text-muted">
                  Search, compare and save as many profiles as you like without paying.
                  You only choose a plan when you want to contact a{" "}
                  {ordinal(pricing.freeContacts + 1)} nanny.
                </p>

                <ul className="mt-6 space-y-2.5">
                  {[
                    "No cost to view profiles",
                    "No commission on the nanny's salary",
                    "No placement fee",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-sm">
                      <span
                        aria-hidden
                        className="mt-[7px] size-1.5 shrink-0 rounded-full bg-sage-deep"
                      />
                      <span className="text-muted">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Cheapest first. Someone deciding reads up from the smallest
                  number, and leading with the higher one makes the page feel
                  like it is selling rather than informing. */}
              <div className="grid gap-3 sm:grid-cols-2">
                {pricing.weeklyEnabled && (
                  <PlanCard
                    name="Weekly"
                    price={pricing.weeklyPriceAed}
                    period="week"
                    currency={pricing.currency}
                  />
                )}
                {pricing.monthlyEnabled && (
                  <PlanCard
                    name="Monthly"
                    price={pricing.monthlyPriceAed}
                    period="month"
                    currency={pricing.currency}
                    highlighted={pricing.monthlyIsBestValue}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Nannies are free ---------------- */}
        <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-20">
          <div className="overflow-hidden rounded-xl bg-sage-wash">
            <div className="grid gap-6 sm:grid-cols-2 sm:items-center">
              <div className="p-6 sm:p-10">
                <h2 className="text-xl font-semibold sm:text-2xl">
                  Nannies use NaNanny for free.
                </h2>
                <p className="mt-2 leading-relaxed text-muted">
                  No fee to create a profile, appear in search, receive matches, apply to
                  jobs or reply to families. Families pay. Nannies never do.
                </p>
                <Link href="/signup?role=nanny" className="mt-5 inline-block w-full sm:w-auto">
                  <Button size="lg" variant="outline" block className="sm:w-auto sm:px-8">
                    Create your profile
                  </Button>
                </Link>
              </div>

              <Photo
                photo={nannyPhoto}
                rounded="none"
                sizes="(min-width: 640px) 50vw, 100vw"
                className="order-first h-48 sm:order-last sm:h-full sm:min-h-[320px]"
              />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function PlanCard({
  name,
  price,
  period,
  currency,
  highlighted = false,
  className,
}: {
  name: string;
  price: number;
  period: string;
  currency: string;
  highlighted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        "relative rounded-lg bg-surface-raised p-5 sm:p-6",
        highlighted ? "border-2 border-foreground" : "border border-border",
        className ?? "",
      ].join(" ")}
    >
      {highlighted && (
        <span className="absolute -top-3 left-5">
          <Badge variant="solid" size="sm">
            Best Value
          </Badge>
        </span>
      )}
      <p className="text-sm font-medium text-muted">{name}</p>
      <p className="mt-1.5 text-3xl font-semibold">
        {price}
        <span className="ml-1.5 text-base font-medium text-muted">{currency}</span>
      </p>
      <p className="mt-0.5 text-sm text-muted">per {period}</p>
      <p className="mt-3 text-sm leading-relaxed">Unlimited nanny contacts.</p>
    </div>
  );
}

function ordinal(n: number) {
  const suffix = ["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}
