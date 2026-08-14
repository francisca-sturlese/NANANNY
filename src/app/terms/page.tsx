import type { Metadata } from "next";
import { canonical } from "@/lib/seo/site";
import { MarketingPage, Section } from "@/components/site/marketing-page";

export const metadata: Metadata = {
  alternates: canonical("/terms"),
  title: "Terms",
  description: "The terms on which NaNanny connects families and nannies in the UAE.",
};

export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Terms"
      title="What NaNanny is, and what it is not"
      intro="The short version: we are the noticeboard and the messenger, not the employer."
    >
      <Section title="What NaNanny is">
        <p>
          NaNanny is software operated by Smartbound - Athon L.L.C-FZ, a company registered
          in the Meydan Free Zone, Dubai, United Arab Emirates. It is a place where families
          and nannies find each other, see each other&apos;s profiles and talk directly.
          That is the whole service.
        </p>
      </Section>

      <Section title="What NaNanny is not">
        <p>
          We are not a recruitment agency, an employment agency or a sponsor. We do not
          select candidates, arrange interviews, negotiate salaries, issue visas or work
          permits, employ anyone or take any fee from a hire. No commission is charged to
          anyone on a salary, ever.
        </p>
      </Section>

      <Section title="The agreement is yours">
        <p>
          If a family and a nanny decide to work together, that agreement is between them.
          Interviews, references, contracts, pay, visas, permits and everything the law of
          the UAE requires for domestic work are the responsibility of the people making
          the arrangement. NaNanny is not a party to it.
        </p>
      </Section>

      <Section title="Profiles are self declared">
        <p>
          What people write about themselves is theirs. We review profiles before they
          appear, and where we have checked something specific, such as an identity
          document or a first aid certificate, the profile says so with a badge for that
          particular thing. A badge means one thing only: a person on our team looked at a
          specific document. It is not a background check and not a guarantee of character,
          of skill or of legal status.
        </p>
        <p>
          Meet people, interview them, check references and use your own judgment, exactly
          as you would without us.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          Keep what you write truthful. One account per person. Do not claim experience,
          certificates or references you do not have. Do not create an account for someone
          else. Do not post another person&apos;s photos or documents. Do not use NaNanny
          to advertise anything other than childcare work. We may suspend or remove an
          account that breaks these rules or that harms other users.
        </p>
      </Section>

      <Section title="Paying for NaNanny">
        <p>
          Families can browse and shortlist for free, and open a limited number of
          conversations for free. Opening more requires a subscription, at the prices shown
          on the pricing page before any payment. Nannies never pay. You can cancel a
          subscription at any time and it stays usable until the end of the period already
          paid for.
        </p>
      </Section>

      <Section title="What we are responsible for">
        <p>
          Running the service well: keeping it online, protecting your data as the privacy
          page describes, and reviewing what gets reported to us. The service is provided
          as it is. To the extent the law of the UAE allows, we are not liable for what
          happens between a family and a nanny, on the platform or off it, including any
          hire, any dispute and any loss that follows from one.
        </p>
      </Section>

      <Section title="The law that applies">
        <p>
          These terms follow the laws of the United Arab Emirates and the courts of Dubai.
          If a part of these terms turns out to be unenforceable, the rest still stands.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          Write to support@nananny.com. This version is from August 2026.
        </p>
      </Section>
    </MarketingPage>
  );
}
