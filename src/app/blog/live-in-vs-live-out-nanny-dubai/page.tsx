import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/site/marketing-page";
import { absoluteUrl, canonical, jsonLd } from "@/lib/seo/site";
import { withCodePostVisibility } from "@/lib/blog-code-meta";

const baseMetadata: Metadata = {
  title: "Live-in or live-out nanny in Dubai: how to choose",
  description:
    "Costs, space, privacy and the law: the honest trade-offs between a live-in and a live-out nanny in the UAE, with real salary expectations from live profiles.",
  alternates: canonical("/blog/live-in-vs-live-out-nanny-dubai"),
};

// Rendered per request so the admin hide switch can answer noindex.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return withCodePostVisibility("live-in-vs-live-out-nanny-dubai", baseMetadata);
}

export default function LiveInLiveOutPage() {
  return (
    <>
      <script type="application/ld+json">
        {jsonLd({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Live-in or live-out nanny in Dubai: how to choose",
          datePublished: "2026-08-18",
          author: { "@type": "Organization", name: "NaNanny UAE" },
          url: absoluteUrl("/blog/live-in-vs-live-out-nanny-dubai"),
        })}
      </script>
      <MarketingPage
        eyebrow="Blog · 18 August 2026"
        title="Live-in or live-out nanny in Dubai: how to choose"
        intro="It is the first fork in every hiring conversation, and the right answer depends on your space, your hours and your budget more than on any rule of thumb."
        cta={{
          href: "/nannies",
          label: "Browse nannies by arrangement",
          secondary: { href: "/blog", label: "More from the blog" },
        }}
      >
        <section>
          <h2 className="text-xl font-semibold sm:text-2xl">The short version</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-5">
              <h3 className="font-semibold">Live-in</h3>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
                <li>She lives with you: a room and food are part of the deal</li>
                <li>Cash salary often lower; total cost includes hosting her</li>
                <li>Early mornings and evenings are covered naturally</li>
                <li>Least privacy, most flexibility</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <h3 className="font-semibold">Live-out</h3>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
                <li>She has her own accommodation and commutes</li>
                <li>On NaNanny, live-out asks range AED 3,000 to 4,000 a month</li>
                <li>Fixed hours by agreement; overtime is a conversation</li>
                <li>Most privacy, least flexibility at the edges of the day</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold sm:text-2xl">What actually decides it</h2>
          <div className="mt-4 space-y-4">
            {[
              {
                title: "Your hours",
                body: "Two parents with early flights or shift work usually end up live-in: covering a 6am departure with a commuting nanny means paying for it, in salary and in goodwill. School-hours families with predictable days do fine live-out.",
              },
              {
                title: "Your space",
                body: "A live-in nanny needs a proper room, not a converted storage space. If your home cannot offer one with a straight face, the decision has made itself, and forcing it is how both sides end up unhappy.",
              },
              {
                title: "Your budget, counted honestly",
                body: "Compare total cost, not headline salary: live-in adds food, utilities and space you could use otherwise; live-out salaries run higher in cash and may involve a transport allowance. On our live profiles the middle of the market sits around AED 3,500 a month either way.",
              },
              {
                title: "The nanny's own preference",
                body: "Many nannies state a firm preference on their profile, and it is worth respecting: somebody pushed into an arrangement she did not want rarely stays long. On NaNanny you can filter by live-in, live-out or either.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-border bg-surface p-5">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold sm:text-2xl">The legal side, in one paragraph</h2>
          <p className="mt-3 leading-relaxed text-muted">
            Either way, hiring a domestic worker in the UAE comes with obligations
            that are yours as the employer: a lawful basis for her to work, agreed
            terms in writing, and the protections UAE law grants domestic workers.
            When you hire directly, you and the nanny agree these together. For
            visa questions, speak to MoHRE or a licensed PRO service; that part is
            regulated and worth doing properly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold sm:text-2xl">See who is available</h2>
          <p className="mt-3 leading-relaxed text-muted">
            Every nanny on{" "}
            <Link href="/nannies" className="underline underline-offset-4">
              NaNanny
            </Link>{" "}
            states her arrangement preference, expected salary and availability on
            her own profile. Browsing is free, you contact her directly, and there
            is no agency fee on either side. For what salaries look like right
            now, see{" "}
            <Link
              href="/blog/nanny-salary-dubai-2026"
              className="underline underline-offset-4"
            >
              our salary guide with real numbers
            </Link>
            .
          </p>
        </section>
      </MarketingPage>
    </>
  );
}
