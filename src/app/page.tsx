import Link from "next/link";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { SearchModule } from "@/components/site/search-module";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Photo } from "@/components/ui/photo";
import { photo } from "@/lib/photos";
import { getPricingConfig } from "@/lib/pricing";

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
      <SiteHeader />

      <main>
        {/* ---------------- Hero ---------------- */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] sm:h-[520px]"
            style={{
              background:
                "radial-gradient(70% 60% at 15% 0%, var(--sage-wash) 0%, transparent 70%), radial-gradient(60% 55% at 90% 8%, var(--peach-wash) 0%, transparent 72%)",
            }}
          />

          <div className="mx-auto max-w-6xl px-5 pt-8 pb-5 sm:px-8 sm:pt-16">
            <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
              <div>
                <Badge variant="butter" size="sm">
                  First {pricing.freeContacts} nanny contacts free
                </Badge>

                <h1 className="mt-4 text-[2rem] leading-[1.08] font-semibold sm:text-5xl lg:text-6xl">
                  Find the right nanny for your family
                </h1>

                <p className="mt-4 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
                  Connect directly with nannies across the UAE. No agency in between.
                </p>

                {/* Primary action first and full width on a phone — one thumb, no aiming. */}
                <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
                  <Link href="/nannies" className="sm:w-auto">
                    <Button size="lg" block className="sm:w-auto sm:px-8">
                      Find a Nanny
                    </Button>
                  </Link>
                  <Link href="/jobs" className="sm:w-auto">
                    <Button size="lg" variant="outline" block className="sm:w-auto sm:px-8">
                      Find a Job
                    </Button>
                  </Link>
                </div>
              </div>

              {/* The one image the phone downloads eagerly. Hidden below `sm`
                  would waste the request, so it renders at every size — just at
                  a shorter crop on a phone. */}
              <Photo
                photo={hero}
                priority
                rounded="xl"
                sizes="(min-width: 1024px) 40vw, (min-width: 640px) 80vw, 100vw"
                className="max-h-[260px] sm:max-h-none"
                imgClassName="object-[center_25%]"
              />
            </div>
          </div>

          <div className="mx-auto max-w-6xl px-5 pt-6 pb-12 sm:px-8 sm:pb-16">
            <SearchModule />
          </div>
        </section>

        {/* ---------------- Four promises ---------------- */}
        <section className="mx-auto max-w-6xl px-5 pb-4 sm:px-8">
          {/* Horizontal snap-scroll on a phone: four cards fit without either
              shrinking to unreadable or stacking into a long column. */}
          <ul className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
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
                className="min-w-[72vw] snap-start sm:min-w-0"
                style={{ background: item.tint, borderRadius: "var(--radius-lg)" }}
              >
                <div className="p-5">
                  <h3 className="text-base font-semibold">{item.step}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------- Pricing ---------------- */}
        <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
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

              {/* Best Value first on a phone: it is the recommendation, so it
                  should be the card the thumb reaches first. */}
              <div className="grid gap-3 sm:grid-cols-2">
                {pricing.monthlyEnabled && (
                  <PlanCard
                    name="Monthly"
                    price={pricing.monthlyPriceAed}
                    period="month"
                    currency={pricing.currency}
                    highlighted={pricing.monthlyIsBestValue}
                    className="sm:order-2"
                  />
                )}
                {pricing.weeklyEnabled && (
                  <PlanCard
                    name="Weekly"
                    price={pricing.weeklyPriceAed}
                    period="week"
                    currency={pricing.currency}
                    className="sm:order-1"
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Nannies are free ---------------- */}
        <section className="mx-auto max-w-6xl px-5 pb-10 sm:px-8">
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
