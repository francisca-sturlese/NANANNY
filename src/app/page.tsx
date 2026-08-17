import Link from "next/link";
import { SiteHeader } from "@/components/site/header";
import { PromoBanner } from "@/components/promo/promo-banner";
import { getPromo, endsPhrase } from "@/lib/promo";
import { SiteFooter } from "@/components/site/footer";
import { SearchModule } from "@/components/site/search-module";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Photo } from "@/components/ui/photo";
import { largestSrc, photo, srcSet } from "@/lib/photos";
import { getPricingConfig } from "@/lib/pricing";
import { absoluteUrl, canonical, jsonLd } from "@/lib/seo/site";
import { searchNannies } from "@/lib/search/nannies";
import { experienceShort } from "@/lib/nanny/experience";
import { NannyPhotoFallback } from "@/components/nanny/photo-fallback";

/**
 * Rendered per request, not baked at build.
 *
 * The launch banner appears and disappears on dates held in the database.
 * Prerendered, this page freezes whatever the promotion happened to be at
 * the moment somebody last deployed: the banner never appears when the
 * window opens, and never leaves when it closes. That is the exact failure
 * the banner was designed to avoid.
 *
 * The cost is one database read per visit. On the deployment target only
 * CPU is metered and waiting on the database is not, so this is cheap where
 * it matters.
 */
export const dynamic = "force-dynamic";

export const metadata = { alternates: canonical("/") };

/**
 * Homepage, mobile first.
 *
 * The phone layout is the design; the desktop layout is that design given more
 * room. Type scale starts at a comfortable phone size and steps up, rather than
 * starting at a desktop size and being shrunk.
 */

/** Answered the way we would answer by email: plainly, with the real numbers.
 * Built from pricing_config, never hardcoded, per the project rule. */
function buildFaq(pricing: { weeklyPriceAed: number; monthlyPriceAed: number; freeContacts: number; currency: string }, promoActive: boolean) {
  return [
    {
      q: "Is NaNanny an agency?",
      a: "No. NaNanny is a platform where you find, interview and hire a nanny directly. There is no placement fee and we never take a cut of the nanny's salary.",
    },
    {
      q: "How much does it cost?",
      a: `Browsing every profile is free. You only pay when you want to contact nannies beyond your ${pricing.freeContacts} free contacts: ${pricing.currency} ${pricing.weeklyPriceAed} per week or ${pricing.currency} ${pricing.monthlyPriceAed} per month, cancel anytime.${promoActive ? " Right now, during our launch period, contacting nannies is free for everyone." : ""}`,
    },
    {
      q: "How are nannies verified?",
      a: "Every profile is reviewed by our team before it earns badges. A verification badge appears only after a person has seen the actual document. Profiles without badges are clearly marked as still in progress.",
    },
    {
      q: "Can I hire a nanny who needs visa sponsorship?",
      a: "Profiles show each nanny's declared visa status, so you know before you write to her. Sponsorship itself is arranged between you and the relevant UAE authorities or a PRO service. NaNanny does not sponsor visas.",
    },
    {
      q: "How do I pay the nanny?",
      a: "Directly, between you and her, like any employment. NaNanny is not involved in her salary and never takes a commission from it.",
    },
    {
      q: "What do nannies pay?",
      a: "Nothing. Creating a profile, appearing in search, applying to jobs and replying to families is free for nannies, always.",
    },
  ];
}

export default async function HomePage() {
  const [pricing, promo, search] = await Promise.all([
    getPricingConfig(),
    getPromo(),
    // The strongest proof a marketplace can offer is its own shelf. Default
    // ordering already puts faces first, newest first.
    searchNannies({ page: 1 }),
  ]);
  const featured = search.results.slice(0, 6);
  const FAQ = buildFaq(pricing, promo.active);
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
      <script type="application/ld+json">
        {jsonLd({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        })}
      </script>

      <SiteHeader />
      <PromoBanner audience="public" />

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
            <h1 className="text-[2.15rem] leading-[1.08] font-semibold sm:text-5xl lg:text-6xl">
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
                copy: promo.active
                  ? "Message as many nannies as you like. Free while we launch."
                  : `Message your first ${pricing.freeContacts} nannies without paying.`,
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

        {/* ---------------- Real nannies, live now ---------------- */}
        {/* Never sample data: these are the same rows the search returns to
            an anonymous visitor, so the shelf can only show what is true. */}
        {featured.length >= 3 && (
          <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold sm:text-3xl">
                  Meet some of our nannies
                </h2>
                <p className="mt-2 text-muted">
                  Real profiles, live on NaNanny right now.
                </p>
              </div>
              <Link
                href="/nannies"
                className="tap-target hidden shrink-0 text-sm font-medium underline underline-offset-4 sm:block"
              >
                See all nannies
              </Link>
            </div>

            <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {featured.map((nanny) => (
                <li key={nanny.id} className="h-full">
                  {/* Vertical on purpose: side-by-side text next to a photo
                      wraps long names into ragged card heights on a phone.
                      Photo on top, one line of name, one line of facts, all
                      truncated, every card the same shape. */}
                  <Link
                    href={`/nannies/${nanny.id}`}
                    className="block h-full overflow-hidden rounded-lg border border-border bg-surface-raised transition-shadow hover:shadow-card"
                  >
                    {nanny.photoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element --
                         short-lived signed URL, next/image cannot cache it */
                      <img
                        src={nanny.photoUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width={320}
                        height={240}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      <NannyPhotoFallback className="aspect-[4/3] w-full rounded-none" />
                    )}
                    <div className="min-w-0 p-3">
                      <h3 className="truncate text-sm font-semibold">
                        {nanny.firstName ?? "Nanny"}
                      </h3>
                      <p className="truncate text-xs text-muted">
                        {[nanny.emirate, experienceShort(nanny.yearsExperience)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href="/nannies"
              className="tap-target mt-5 block text-center text-sm font-medium underline underline-offset-4 sm:hidden"
            >
              See all nannies
            </Link>
          </section>
        )}

        {/* ---------------- Three ways to hire ---------------- */}
        <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <h2 className="text-2xl font-semibold sm:text-3xl">
            Three ways to find a nanny in the UAE
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Families here usually choose between an agency, Facebook groups, or
            hiring directly. This is the honest comparison.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {[
              {
                name: "An agency",
                tint: "var(--peach-wash)",
                points: [
                  "Thousands of dirhams in placement or monthly fees",
                  "You choose from the shortlist they give you",
                  "The nanny's salary often carries their margin",
                ],
              },
              {
                name: "Facebook groups",
                tint: "var(--butter-wash)",
                points: [
                  "Free, but nobody checks anything",
                  "No profiles, no history, no way to report anyone",
                  "Your phone number is public from the first post",
                ],
              },
              {
                name: "NaNanny",
                tint: "var(--sage-wash)",
                points: [
                  "Browse every profile free, then a simple subscription",
                  "You choose, you interview, you hire directly",
                  "No placement fee and no cut of her salary, ever",
                ],
              },
            ].map((option) => (
              <div
                key={option.name}
                style={{ background: option.tint, borderRadius: "var(--radius-xl)" }}
                className="p-5 sm:p-6"
              >
                <h3 className="font-semibold">{option.name}</h3>
                <ul className="mt-3 space-y-2">
                  {option.points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-sm">
                      <span
                        aria-hidden
                        className="mt-[7px] size-1.5 shrink-0 rounded-full bg-foreground/40"
                      />
                      <span className="text-muted">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Pricing ---------------- */}
        <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="rounded-xl border border-border bg-surface p-6 sm:p-10 lg:p-12">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12">
              <div>
                {/* While the window is open the allowance is not the current
                    state, it is what happens afterwards. Leading with it told a
                    family it was on a meter when nothing was being counted. */}
                <h2 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">
                  {promo.active
                    ? "Right now every nanny contact is free."
                    : `Your first ${pricing.freeContacts} nanny contacts are free.`}
                </h2>
                <p className="mt-3 max-w-md leading-relaxed text-muted">
                  {promo.active ? (
                    <>
                      Message as many nannies as you like while we are launching
                      {endsPhrase(promo) ? `. ${endsPhrase(promo)}` : ""}. Afterwards
                      your first {pricing.freeContacts} nanny contacts are free, and
                      none of what you do now counts against them.
                    </>
                  ) : (
                    <>
                      Search, compare and save as many profiles as you like without
                      paying. You only choose a plan when you want to contact a{" "}
                      {ordinal(pricing.freeContacts + 1)} nanny.
                    </>
                  )}
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

        {/* ---------------- What protects you ---------------- */}
        {/* No borrowed numbers, no invented reviews: every line here names a
            mechanism that actually exists in the product. */}
        <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <h2 className="text-2xl font-semibold sm:text-3xl">
            Built to keep both sides safe
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              {
                title: "Verified means a person checked",
                copy: "A badge appears on a profile only after our team has seen the document itself. What we have not checked is never presented as checked.",
              },
              {
                title: "Identity papers stay private",
                copy: "A nanny's passport and visa documents are never visible to families. Only what she chooses to share, like certificates and references, can be seen, and only by a family she applied to.",
              },
              {
                title: "Contact details cannot leak",
                copy: "Phone numbers and emails are removed from profile text automatically, so conversations start here, with a record you can rely on.",
              },
              {
                title: "Block and report, anywhere",
                copy: "Every conversation and every profile carries a report button, and blocking somebody stops all contact both ways, instantly.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-border bg-surface p-5">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
          <h2 className="text-2xl font-semibold sm:text-3xl">Common questions</h2>
          <div className="mt-6 divide-y divide-border border-y border-border">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="tap-target cursor-pointer list-none pr-8 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-5 text-sm text-muted">
            Anything else? Write to{" "}
            <a href="mailto:support@nananny.com" className="underline underline-offset-4">
              support@nananny.com
            </a>{" "}
            and a person answers.
          </p>
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
