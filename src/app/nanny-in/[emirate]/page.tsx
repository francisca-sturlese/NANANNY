import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canonical } from "@/lib/seo/site";
import { EMIRATES, AREAS } from "@/lib/uae";
import { MarketingPage, Section } from "@/components/site/marketing-page";
import { availableLandings } from "@/lib/seo/landings";

/**
 * One local landing page per emirate, for the searches families actually type:
 * "nanny in dubai", "nanny in abu dhabi" and so on. Fully static, no database
 * read, evergreen copy: nothing here mentions the launch promo, so nothing
 * here goes stale when it ends.
 */

const SLUGS: Record<string, (typeof EMIRATES)[number]> = Object.fromEntries(
  EMIRATES.map((name) => [name.toLowerCase().replace(/ /g, "-"), name]),
);

/** One sentence of local colour per emirate, so seven pages do not read as one. */
const LOCAL_LINE: Record<string, string> = {
  Dubai:
    "From Marina apartments to Arabian Ranches villas, most nannies on NaNanny are based here, and many list the communities they already know.",
  "Abu Dhabi":
    "Families on the island and in Khalifa City look for different things, and profiles say where a nanny is based and where she can reach.",
  Sharjah:
    "Many nannies here also consider roles across the border in Dubai, so families in Sharjah often have more candidates than they expect.",
  Ajman:
    "A smaller market than Dubai, which cuts both ways: fewer profiles, but far fewer families competing for them.",
  "Ras Al Khaimah":
    "Profiles this far north are fewer, so it is worth saving a search and coming back as new nannies join.",
  Fujairah:
    "The east coast has the smallest pool in the country, and a family that posts a clear job here stands out immediately.",
  "Umm Al Quwain":
    "The quietest market in the UAE, where posting a job usually works better than waiting for the right profile to appear.",
};

/**
 * Rendered per request now that it links to the narrower pages.
 *
 * Those exist only while enough profiles sit behind them, so a prerendered list
 * of links freezes at the moment of the last deploy and starts pointing at
 * pages that have since stopped existing. An internal link to a 404 is worse
 * than no link: it is the site telling a crawler it does not know its own
 * shape. The copy above is still evergreen; only the links are not.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ emirate: string }>;
}): Promise<Metadata> {
  const { emirate } = await params;
  const name = SLUGS[emirate];
  if (!name) return {};
  return {
    title: `Nanny in ${name}`,
    description: `Find a nanny in ${name}: browse profiles with experience, languages, salary expectation and visa status, and message them directly. No agency, no placement fee.`,
    alternates: canonical(`/nanny-in/${emirate}`),
  };
}

export default async function NannyInEmiratePage({
  params,
}: {
  params: Promise<{ emirate: string }>;
}) {
  const { emirate } = await params;
  const name = SLUGS[emirate];
  if (!name) notFound();

  const areas = AREAS[name] ?? [];

  /**
   * The narrower pages that currently exist for this emirate.
   *
   * Linked from here rather than listed by hand, so a page that thins out below
   * the threshold stops being linked the same day it stops existing. An
   * internal link to a 404 is worse than no link: it is the site telling a
   * crawler that it does not know its own shape.
   */
  const landings = await availableLandings(name);
  const searchHref = `/nannies?emirate=${encodeURIComponent(name)}`;

  return (
    <MarketingPage
      eyebrow={name}
      title={`Find a nanny in ${name}`}
      intro={`Browse nanny profiles in ${name}, see who fits, and talk to them directly. ${LOCAL_LINE[name]}`}
    >
      <Section title="What you can see before you say hello">
        <p>
          Every profile shows experience, the ages cared for, languages, availability,
          salary expectation and <strong>visa status</strong>, which in the UAE is usually
          the first question a family asks. Profiles are reviewed by a person before they
          appear, and where our team has checked a specific document, the profile says so
          with a badge for that particular thing.
        </p>
        <p>
          <Link href={searchHref} className="font-medium text-foreground underline">
            Browse nannies in {name}
          </Link>{" "}
          or{" "}
          <Link href="/signup" className="font-medium text-foreground underline">
            post a job
          </Link>{" "}
          and let them come to you. Nannies apply directly, and you talk in the chat.
        </p>
      </Section>

      <Section title="No agency in the middle">
        <p>
          NaNanny is not an agency. There is no placement fee, no commission on the
          salary, and nobody between you and the person you are hiring. You interview,
          you check references, you agree terms together. Our guide on{" "}
          <Link
            href="/guides/hire-a-nanny-in-dubai-without-an-agency"
            className="font-medium text-foreground underline"
          >
            hiring a nanny without an agency
          </Link>{" "}
          walks through the whole process, including what the law expects from both
          sides.
        </p>
      </Section>

      {landings.length > 0 && (
        <Section title={`Searches families make in ${name}`}>
          <p className="not-prose flex flex-wrap gap-2">
            {landings.map((landing) => (
              <Link
                key={landing.filter.slug}
                href={`/nanny-in/${emirate}/${landing.filter.slug}`}
                className="rounded-pill border border-border bg-surface px-3 py-1.5 text-sm hover:border-border-strong"
              >
                {landing.filter.plural} in {name}
              </Link>
            ))}
          </p>
        </Section>
      )}

      {areas.length > 0 && (
        <Section title={`Areas families search in ${name}`}>
          <p>
            Families on NaNanny in {name} most often look for help in{" "}
            {areas.slice(0, 6).join(", ")}
            {areas.length > 6 ? " and nearby communities" : ""}. A nanny&apos;s profile
            shows her emirate; the exact area stays private and comes up naturally when
            you talk.
          </p>
        </Section>
      )}

      <Section title="What it costs">
        <p>
          Browsing and shortlisting are free, and every family can open a first few
          conversations at no cost. After that, contacting more nannies takes a
          subscription, priced openly on the{" "}
          <Link href="/pricing" className="font-medium text-foreground underline">
            pricing page
          </Link>
          . Nannies never pay anything.
        </p>
      </Section>
    </MarketingPage>
  );
}
