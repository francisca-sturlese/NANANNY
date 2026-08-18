import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canonical, absoluteUrl, jsonLd } from "@/lib/seo/site";
import { MarketingPage, Section, FaqList } from "@/components/site/marketing-page";
import { NannyCard } from "@/components/nanny/nanny-card";
import { searchNannies } from "@/lib/search/nannies";
import {
  EMIRATE_SLUGS,
  LANDING_FILTERS,
  landingFilter,
  landingIsWorthIt,
} from "@/lib/seo/landings";

/**
 * A landing page for a search families actually type.
 *
 * "Filipina nannies in Dubai", "live-in nanny Dubai". These are asked of Google
 * constantly and answered by nobody: the nearest competitor renders its
 * listings in JavaScript, so to a crawler its pages are blank. Each page here
 * competes against nothing.
 *
 * It shows real profiles, not a sample. A page that promises nannies and shows
 * a stock illustration is the reason people distrust this category, and the
 * profiles are the only part a family came for.
 *
 * It refuses to exist below three profiles. A near-empty page loses the visitor
 * in three seconds and teaches Google that this site is not worth crawling, so
 * a combination that thins out stops being a page and stops being in the
 * sitemap on the same day.
 *
 * Rendered per request rather than at build. Who is available changes daily,
 * and a page baked a week ago showing somebody who has found a job is worse
 * than a page that took an extra hundred milliseconds.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ emirate: string; filter: string }>;
}): Promise<Metadata> {
  const { emirate, filter } = await params;
  const name = EMIRATE_SLUGS[emirate];
  const chosen = landingFilter(filter);
  if (!name || !chosen) return {};

  const title = `${chosen.plural} in ${name}`;

  return {
    title,
    description: `${title} on NaNanny. Browse real profiles with experience, languages, salary expectation and visa status, and message them directly. No agency and no placement fee.`,
    alternates: canonical(`/nanny-in/${emirate}/${filter}`),
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ emirate: string; filter: string }>;
}) {
  const { emirate, filter } = await params;
  const name = EMIRATE_SLUGS[emirate];
  const chosen = landingFilter(filter);
  if (!name || !chosen) notFound();

  const { results, total } = await searchNannies({
    emirate: name,
    ...(chosen.kind === "nationality"
      ? { nationality: chosen.value }
      : { arrangement: chosen.value as "live_in" | "live_out" }),
  });

  // Below the line this is not a page, it is a disappointment with a URL.
  if (!landingIsWorthIt(total)) notFound();

  const searchHref =
    chosen.kind === "nationality"
      ? `/nannies?emirate=${encodeURIComponent(name)}&nationality=${encodeURIComponent(chosen.value)}`
      : `/nannies?emirate=${encodeURIComponent(name)}&arrangement=${chosen.value}`;

  const title = `${chosen.plural} in ${name}`;

  /**
   * Structured data for the page a crawler sees, describing the list rather
   * than the people on it. The profiles themselves are deliberately kept out of
   * the index: a nanny does not expect her photo and her first name to sit in a
   * search result long after she has found a job.
   */
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: absoluteUrl(`/nanny-in/${emirate}/${filter}`),
    about: { "@type": "Thing", name: title },
    isPartOf: { "@type": "WebSite", name: "NaNanny UAE", url: absoluteUrl("/") },
  };

  const others = LANDING_FILTERS.filter((f) => f.slug !== chosen.slug);

  return (
    <>
      {/* As a child rather than through dangerouslySetInnerHTML: React writes
          it as text either way, and never using that API anywhere in src is one
          of the assumptions the Content Security Policy rests on. */}
      <script type="application/ld+json">{jsonLd(structuredData)}</script>
      <MarketingPage
        eyebrow={name}
        title={title}
        intro={`${total} ${total === 1 ? "profile" : "profiles"} on NaNanny right now. ${chosen.note}`}
      >
        <Section title={`Available in ${name} now`}>
          <ul className="not-prose grid gap-4 sm:grid-cols-2">
            {results.slice(0, 6).map((nanny) => (
              <li key={nanny.id}>
                <NannyCard nanny={nanny} saved={false} canSave={false} />
              </li>
            ))}
          </ul>
          <p className="mt-5">
            <Link href={searchHref} className="font-medium text-foreground underline">
              See all {chosen.plural.toLowerCase()} in {name}
            </Link>{" "}
            and filter further by experience, languages, salary or visa status.
          </p>
        </Section>

        <Section title="What you can see before you say hello">
          <p>
            Every profile shows experience, the ages she has cared for, languages,
            availability, salary expectation and <strong>visa status</strong>, which in
            the UAE is usually the first question a family asks. Contact details are not
            on profiles, by design: you message her here, you keep a record of it, and
            either side can stop at any time.
          </p>
        </Section>

        <Section title="No agency in the middle">
          <p>
            NaNanny is not an agency. No placement fee, no commission on the salary, and
            nobody between you and the person you are hiring. Our guide on{" "}
            <Link
              href="/guides/hire-a-nanny-in-dubai-without-an-agency"
              className="font-medium text-foreground underline"
            >
              hiring a nanny without an agency
            </Link>{" "}
            covers the visa, the contract and what the law expects from both sides.
          </p>
        </Section>

        <Section title="Questions families ask">
          <FaqList
            items={[
              {
                q: `How do I hire ${chosen.plural.toLowerCase()} in ${name}?`,
                a: "Browse the profiles here, message the ones who fit, and arrange to meet. You interview, you check references, you agree terms directly. Nobody negotiates on your behalf and nobody takes a cut.",
              },
              {
                q: "What does it cost?",
                a: "Browsing and profiles are free. Families pay only to keep messaging beyond their free contacts, and there is never a commission on a nanny's salary or a placement fee.",
              },
              {
                q: "Are the profiles checked?",
                a: "A person reviews every profile before it appears. Where our team has checked a specific document, the profile carries a badge for that particular thing. We never claim more than we have actually looked at.",
              },
              {
                q: "Can she transfer her visa to us?",
                a: "It depends on her current status, which every profile states. Some nannies hold their own residency and need no sponsorship; others would need a family to sponsor them. The guide explains what each case involves.",
              },
            ]}
          />
        </Section>

        <Section title={`Other searches in ${name}`}>
          <p className="not-prose flex flex-wrap gap-2">
            {others.map((other) => (
              <Link
                key={other.slug}
                href={`/nanny-in/${emirate}/${other.slug}`}
                className="rounded-pill border border-border bg-surface px-3 py-1.5 text-sm hover:border-border-strong"
              >
                {other.plural} in {name}
              </Link>
            ))}
            <Link
              href={`/nanny-in/${emirate}`}
              className="rounded-pill border border-border bg-surface px-3 py-1.5 text-sm hover:border-border-strong"
            >
              All nannies in {name}
            </Link>
          </p>
        </Section>
      </MarketingPage>
    </>
  );
}
