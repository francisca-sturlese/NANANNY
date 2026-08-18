import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/site/marketing-page";
import { absoluteUrl, canonical, jsonLd } from "@/lib/seo/site";
import { withCodePostVisibility } from "@/lib/blog-code-meta";

const baseMetadata: Metadata = {
  title: "Nanny salaries in Dubai and the UAE, 2026: real numbers",
  description:
    "What nannies in the UAE actually ask for, from live marketplace profiles: a median of AED 3,500 per month, ranges by arrangement and experience, and what moves the number.",
  alternates: canonical("/blog/nanny-salary-dubai-2026"),
};

// Rendered per request so the admin hide switch can answer noindex.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return withCodePostVisibility("nanny-salary-dubai-2026", baseMetadata);
}

/**
 * The salary guide, written from our own shelves.
 *
 * Every published number on this subject is an agency quoting itself. These
 * figures are what nannies themselves ask for on their live profiles, which
 * is a number nobody else can print, and the article says where it comes
 * from and how small the sample is rather than dressing it up.
 */
export default function SalaryGuidePage() {
  return (
    <>
      <script type="application/ld+json">
        {jsonLd({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Nanny salaries in Dubai and the UAE, 2026: real numbers",
          datePublished: "2026-08-18",
          author: { "@type": "Organization", name: "NaNanny UAE" },
          url: absoluteUrl("/blog/nanny-salary-dubai-2026"),
        })}
      </script>

      <MarketingPage
        eyebrow="Blog · 18 August 2026"
        title="Nanny salaries in Dubai and the UAE, 2026: real numbers"
        intro="Most salary guides are an agency quoting its own price list. These numbers are different: they are what nannies themselves ask for, taken from live profiles on NaNanny in August 2026."
        cta={{
          href: "/nannies",
          label: "Browse nannies and their expectations",
          secondary: { href: "/signup", label: "Or create a free family account" },
        }}
      >
        <section>
          <h2 className="text-xl font-semibold sm:text-2xl">The headline numbers</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {[
              { value: "AED 3,500", label: "median asking salary, per month" },
              { value: "AED 2,300 to 4,500", label: "full range across live profiles" },
              { value: "AED 3,000", label: "median with under 5 years' experience" },
              { value: "AED 3,500", label: "median with 5 or more years" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-surface p-4">
                <p className="text-lg font-semibold">{item.value}</p>
                <p className="mt-1 text-xs leading-snug text-muted">{item.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-subtle">
            Source: salary expectations stated by nannies on their own NaNanny
            profiles, August 2026. A young marketplace, so the sample is a few
            dozen profiles, not thousands; we would rather tell you that than
            invent precision. The numbers update as the marketplace grows.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold sm:text-2xl">What moves the number</h2>
          <div className="mt-4 space-y-4">
            {[
              {
                title: "Experience, more than anything",
                body: "Five or more years of childcare experience adds roughly AED 500 a month to the median ask. References and verified certificates push the same direction: a nanny who can show her history asks with more confidence, and is usually worth it.",
              },
              {
                title: "Live-in or live-out",
                body: "Live-out nannies on NaNanny ask AED 3,000 to 4,000. Live-in arrangements often come with a lower cash salary because accommodation and food are part of the deal, but remember the legal obligations that come with hosting a domestic worker.",
              },
              {
                title: "Hours and days",
                body: "A full six-day week sits at the top of the range. Part-time and school-hours arrangements are negotiated per day or per hour; many nannies list availability day by day on their profile.",
              },
              {
                title: "What does not move it: an agency's cut",
                body: "When you hire directly, the number you agree is the number she receives. Agency models add placement fees of thousands of dirhams, or monthly packages where part of what you pay never reaches her.",
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
          <h2 className="text-xl font-semibold sm:text-2xl">
            What a fair offer looks like in practice
          </h2>
          <p className="mt-3 leading-relaxed text-muted">
            Take the median as your anchor, then adjust honestly: more children,
            newborn care, cooking or housekeeping duties, and long hours all
            justify moving up from it. Offering well under a nanny&apos;s stated
            expectation rarely saves money; it selects for the candidates with no
            better option, and the good ones simply take another family.
          </p>
          <p className="mt-3 leading-relaxed text-muted">
            Whatever you agree, put it in writing and pay it on time. When you
            hire directly, you and the nanny are the whole arrangement: salary,
            days off, and notice periods are yours to agree and yours to honour,
            within UAE law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold sm:text-2xl">See the real profiles</h2>
          <p className="mt-3 leading-relaxed text-muted">
            Every figure here comes from profiles you can read yourself: each
            nanny on{" "}
            <Link href="/nannies" className="underline underline-offset-4">
              NaNanny
            </Link>{" "}
            states her own expected salary, experience and availability, and
            families browse for free and contact her directly. No agency in
            between, no placement fee, and nothing taken from her salary.
          </p>
        </section>
      </MarketingPage>
    </>
  );
}
