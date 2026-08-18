import type { Metadata } from "next";
import { canonical } from "@/lib/seo/site";
import { MarketingPage, Section, FaqList } from "@/components/site/marketing-page";

export const metadata: Metadata = {
  alternates: canonical("/for-nannies"),
  title: "For nannies",
  description:
    "Create a free NaNanny profile, appear in search across the UAE and talk to families directly. No fees, no commission on your salary.",
};

export default function ForNanniesPage() {
  return (
    <MarketingPage
      eyebrow="For nannies"
      title="Free for you. Always."
      intro="You never pay to create a profile, appear in search, be discovered by families, apply to jobs or reply to a family. Nothing is taken from your salary."
      cta={{
        href: "/signup?role=nanny",
        label: "Create your free profile",
        secondary: { href: "/jobs", label: "Or look at open jobs first" },
      }}
    >
      <Section title="Why a complete profile matters">
        <p>
          Families read the description first. A few honest sentences about how you work,
          which ages you enjoy and what you are looking for will get you more replies than
          any list of skills. Profiles with a short video get many more still.
        </p>
      </Section>

      <Section title="What we ask for">
        <p>
          Your first name, a clear photo, where you are based, your experience, languages,
          availability and what you expect to earn. Your surname, date of birth, exact area
          and any documents you upload stay private. Families never see them.
        </p>
      </Section>

      <Section title="Review">
        <p>
          A person reads your profile before it goes live, usually within two working days.
          If something is missing we tell you exactly what, so you can fix it and resubmit.
          Once approved, families across the UAE can find you.
        </p>
      </Section>

      <FaqList
        items={[
          {
            q: "Will families see my phone number?",
            a: "No. Your phone number and email stay private. Families message you through NaNanny, and you decide what to share and when.",
          },
          {
            q: "Do I have to apply to jobs?",
            a: "No. Families can find and message you directly. Applying is another way in, and it is free.",
          },
          {
            q: "Is NaNanny my employer?",
            a: "No. NaNanny is a platform that introduces you to families. Any job you take is agreed directly between you and them.",
          },
          {
            q: "Can I take my profile down?",
            a: "Yes. You can stop appearing in search at any time from your profile settings.",
          },
        ]}
      />
    </MarketingPage>
  );
}
