import type { Metadata } from "next";
import { MarketingPage, Section, FaqList } from "@/components/site/marketing-page";
import { getPricingConfig } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "For families",
  description:
    "Search every approved nanny in the UAE, compare candidates and message them yourself. Your first contacts are free.",
};

export default async function ForFamiliesPage() {
  const pricing = await getPricingConfig();

  return (
    <MarketingPage
      eyebrow="For families"
      title="Choose your nanny yourself"
      intro="An agency picks for you and takes a fee for it. NaNanny gives you the whole field and lets you decide."
      cta={{ href: "/signup", label: "Find a nanny", secondary: { href: "/pricing", label: "See pricing" } }}
    >
      <Section title="What it costs">
        <p>
          Searching, viewing profiles and building a shortlist are free and always will be.
          Your first {pricing.freeContacts} conversations are free too. You only choose a
          plan when you want to message a {pricing.freeContacts + 1}th nanny.
        </p>
        <p>
          There is no commission on her salary and no placement fee. What you agree with her
          is what she is paid.
        </p>
      </Section>

      <Section title="What you can see before you pay">
        <p>
          Everything that matters: her photo, experience, the ages she has cared for, her
          languages, availability, salary expectation and what our team has actually
          verified. You are not paying to find out whether someone is worth talking to.
        </p>
      </Section>

      <Section title="How we handle verification">
        <p>
          Every nanny profile is read by a person before it goes live. Approval means the
          profile is genuine and complete — it is not a background check, and we never
          claim it is. Badges are specific: Identity Verified, Documents Reviewed, First Aid
          Certificate. Each one means someone looked at that particular thing.
        </p>
      </Section>

      <FaqList
        items={[
          {
            q: "Can I post a job instead of searching?",
            a: "Yes. Post what you need and nannies apply to you. Reading and shortlisting applications is free.",
          },
          {
            q: "Is my address visible?",
            a: "No. Nannies see your area and emirate, never your address. Your email and phone number are never shown.",
          },
          {
            q: "What if it does not work out?",
            a: "You can go back to searching at any time. Conversations you have already started stay open and cost nothing more.",
          },
        ]}
      />
    </MarketingPage>
  );
}
