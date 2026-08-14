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
      title="What NaNanny is, and is not"
      intro="The short version: we introduce people. What you agree with each other is yours."
    >
      <Section title="NaNanny is a technology platform">
        <p>
          NaNanny connects families and nannies so they can find each other and talk
          directly. NaNanny is not an employment agency and not a recruitment business.
        </p>
        <p>
          NaNanny does not employ nannies. NaNanny does not sponsor visas. NaNanny does not
          negotiate, hold or administer employment contracts, and does not pay salaries.
        </p>
      </Section>

      <Section title="The relationship is between you">
        <p>
          Any working arrangement is made directly between a family and a nanny. Both are
          responsible for complying with applicable UAE law, including anything relating to
          sponsorship, permits, working hours and pay.
        </p>
        <p>
          NaNanny takes no commission on a nanny&apos;s salary and charges no placement fee.
        </p>
      </Section>

      <Section title="What we charge for">
        <p>
          Families pay for access to contact nannies beyond the free allowance. Nannies pay
          nothing, ever. Prices are shown before payment and a plan stays active until the
          end of the period already paid for.
        </p>
      </Section>

      <Section title="Using the platform honestly">
        <p>
          Profiles must describe the real person. Do not claim experience, certificates or
          references you do not have. Do not create an account for someone else. Do not use
          NaNanny to advertise anything other than childcare work.
        </p>
        <p>
          We may suspend or remove an account that breaks these rules, or that is reported
          and found to be harmful to other users.
        </p>
      </Section>

      <Section title="Verification">
        <p>
          An approved profile means our team has read it and found it genuine and complete.
          It is not a background check. Where we have checked something specific, such as an
          identity document or a first aid certificate, the profile says so with a badge for
          that particular thing, and nothing more.
        </p>
        <p>
          Families should still meet, interview and make their own judgement.
        </p>
      </Section>

      <Section title="Before launch">
        <p className="text-subtle">
          This page states the product&apos;s position plainly. Full terms reviewed by a UAE
          lawyer will replace it before NaNanny opens to the public.
        </p>
      </Section>
    </MarketingPage>
  );
}
