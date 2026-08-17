import type { Metadata } from "next";
import { MarketingPage } from "@/components/site/marketing-page";
import { Photo } from "@/components/ui/photo";
import { photo } from "@/lib/photos";
import { canonical } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Partner with NaNanny",
  description:
    "You work with families in the UAE. We help them find the right nanny. Nurseries, parent communities, relocation and PRO services: let's send families to each other.",
  alternates: canonical("/partnerships"),
};

/**
 * A door for the businesses that already serve families.
 *
 * Deliberately not the Yaya version: their partnerships page recruits supply
 * (tutors, night nurses) into their catalogue. Ours courts distribution, the
 * people a family already trusts before it needs a nanny. One category, done
 * deeply, is what a young marketplace has to offer; the service-provider
 * expansion is a decision for after the paywall has earned its keep.
 */
export default function PartnershipsPage() {
  return (
    <MarketingPage
      eyebrow="Partnerships"
      title="You work with families. So do we."
      intro="Nurseries, parent communities, relocation specialists: the families you serve ask you about childcare all the time. Send them somewhere you can stand behind."
      cta={{
        href: "/support",
        label: "Get in touch",
        secondary: {
          href: "mailto:partnerships@nananny.com",
          label: "Or write to partnerships@nananny.com",
        },
      }}
    >
      <Photo
        photo={photo("family-golden-hour")}
        sizes="(min-width: 640px) 640px, 100vw"
        rounded="xl"
      />

      <section>
        <h2 className="text-xl font-semibold sm:text-2xl">Who we are looking for</h2>
        <div className="mt-4 space-y-4">
          {[
            {
              title: "Nurseries and schools",
              body: "Parents ask you for nanny recommendations every week. Give them an answer that is not a Facebook group: a place where profiles are reviewed, contact details are protected and they hire directly, with no agency fee.",
            },
            {
              title: "Parent and community groups",
              body: "Mum groups, neighbourhood communities, expat networks. We are happy to offer your members something real: guidance on hiring without an agency, and a platform where the first contacts are free.",
            },
            {
              title: "Relocation and PRO services",
              body: "Families landing in the UAE need a school, a home and often a nanny, in that order. Add childcare to your welcome package by pointing them somewhere trustworthy, and send us the questions about visas we cannot answer: that traffic belongs with you.",
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
        <h2 className="text-xl font-semibold sm:text-2xl">How it works</h2>
        <p className="mt-3 leading-relaxed text-muted">
          Simply. We agree on what makes sense for your audience: a referral link, a
          guide written for your families, co-marketing, or something we have not
          thought of. No exclusivity, no contracts you need a lawyer for, and
          nothing that costs your families money they would not have spent.
        </p>
        <p className="mt-3 leading-relaxed text-muted">
          NaNanny is a UAE platform operated under a Meydan Free Zone licence. We
          are not an agency: families and nannies meet here and hire directly,
          which is exactly why the people you refer will not come back to you with
          a placement-fee complaint.
        </p>
      </section>
    </MarketingPage>
  );
}
