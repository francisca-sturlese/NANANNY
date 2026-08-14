import type { Metadata } from "next";
import { canonical } from "@/lib/seo/site";
import { MarketingPage, Section } from "@/components/site/marketing-page";

export const metadata: Metadata = {
  alternates: canonical("/privacy"),
  title: "Privacy",
  description: "What NaNanny collects, who can see it, and how it is protected.",
  robots: { index: true, follow: true },
};

/**
 * A plain-language summary of how the product actually behaves. It is not a
 * substitute for a lawyer-reviewed policy before launch — the placeholder note
 * at the end says so rather than implying this is final.
 */
export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Privacy"
      title="What we hold, and who can see it"
      intro="Written to match what the product actually does, not to be difficult to read."
    >
      <Section title="What nannies share, and what stays private">
        <p>
          <strong>Public on an approved profile:</strong> first name, photo, headline and
          description, nationality, emirate, years of experience, the ages cared for,
          languages, availability, salary expectation, skills and any verification badges.
        </p>
        <p>
          <strong>Never public:</strong> surname, email, phone number, date of birth, exact
          area, and every document uploaded. Video introductions require an account to
          watch.
        </p>
      </Section>

      <Section title="What families share">
        <p>
          Nannies see the area and emirate, the number and ages of children, the schedule,
          the budget and what a family is looking for. They never see an address, an email
          or a phone number.
        </p>
      </Section>

      <Section title="Files">
        <p>
          Photos, videos, documents and certificates are stored privately. Nothing is served
          from a public address. When a file is shown, the server checks who is asking and
          then issues a link that expires within the hour.
        </p>
        <p>
          Documents and video are readable only by the nanny who uploaded them and by our
          review team. A family never has access to them.
        </p>
      </Section>

      <Section title="Where the rules live">
        <p>
          Access is enforced in the database itself, not only in the application. Each row
          carries a policy saying who may read or change it, so a bug in a page cannot
          expose something the policy forbids.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          You can edit or remove anything on your profile at any time, stop appearing in
          search, or ask us to delete your account and everything attached to it by writing
          to support@nananny.com.
        </p>
      </Section>

      <Section title="Before launch">
        <p className="text-subtle">
          This page describes the product as built. A full policy reviewed against UAE data
          protection law will replace it before NaNanny opens to the public.
        </p>
      </Section>
    </MarketingPage>
  );
}
