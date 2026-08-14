import type { Metadata } from "next";
import { canonical } from "@/lib/seo/site";
import { MarketingPage, Steps, Section } from "@/components/site/marketing-page";
import { getPricingConfig } from "@/lib/pricing";
import { getPromo, endsPhrase } from "@/lib/promo";

// The launch window opens and closes on dates in the database, so this page
// cannot be frozen at build time with whatever it said then.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: canonical("/how-it-works"),
  title: "How it works",
  description:
    "How NaNanny connects families and nannies directly across the UAE. Search, match, message and hire, with no agency in between.",
};

export default async function HowItWorksPage() {
  const [pricing, promo] = await Promise.all([getPricingConfig(), getPromo()]);

  return (
    <MarketingPage
      eyebrow="How it works"
      title="Discover. Match. Connect. Choose."
      intro="NaNanny is a place for families and nannies to find each other directly. No agency in the middle, no commission on her salary."
      cta={{
        href: "/signup",
        label: "Create a free account",
        secondary: { href: "/nannies", label: "Or browse nannies first" },
      }}
    >
      <Section title="If you are a family">
        <Steps
          items={[
            {
              title: "Tell us what you need",
              body: "Where you live, how many children, live in or live out, the schedule and your budget. It takes a few minutes and you can finish it later.",
            },
            {
              title: "See who fits",
              body: "Search every approved nanny in the UAE, or let us score candidates against what you asked for and show you why each one matched.",
            },
            {
              title: "Message the ones you like",
              body: promo.active
                ? `While we are launching, every conversation is free and none of it uses your ${pricing.freeContacts} free contacts. ${endsPhrase(promo) ?? ""} Browsing, viewing and saving profiles never costs anything at all.`.trim()
                : `Your first ${pricing.freeContacts} conversations are free. Browsing, viewing and saving profiles never costs anything at all.`,
            },
            {
              title: "Interview and decide",
              body: "You agree the arrangement directly with her. NaNanny takes no commission and charges no placement fee.",
            },
          ]}
        />
      </Section>

      <Section title="If you are a nanny">
        <Steps
          items={[
            {
              title: "Create your profile",
              body: "Your photo, your experience, the ages you have cared for, your languages, when you can start and what you expect to earn.",
            },
            {
              title: "We review it",
              body: "A person reads every profile, usually within two working days. We may ask for a document or a reference before approving it.",
            },
            {
              title: "Families find you",
              body: "Once approved you appear in search. Families message you directly, and you can apply to any job you like.",
            },
            {
              title: "It stays free",
              body: "You never pay to be here, and nothing is taken from your salary.",
            },
          ]}
        />
      </Section>

      <Section title="What NaNanny is not">
        <p>
          NaNanny is a technology platform. We do not employ nannies, we do not sponsor
          visas, and we do not negotiate employment contracts. Any working arrangement is
          made directly between a family and a nanny, and both are responsible for
          complying with applicable UAE law.
        </p>
      </Section>
    </MarketingPage>
  );
}
