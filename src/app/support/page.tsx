import type { Metadata } from "next";
import { MarketingPage, Section, FaqList } from "@/components/site/marketing-page";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with your NaNanny account, your profile or your subscription.",
};

export default function SupportPage() {
  return (
    <MarketingPage
      eyebrow="Support"
      title="We're here to help"
      intro="Most things are quicker to fix than they look. If you cannot find the answer below, write to us."
      cta={{ href: "mailto:support@nananny.ae", label: "Email support@nananny.ae" }}
    >
      <Section title="Reporting something">
        <p>
          If a profile, a message or a job post is not what it should be, use the report
          option on it. Reports go to our team, not to the person you reported, and we read
          every one.
        </p>
        <p>
          If you feel unsafe, stop the conversation and report it. You can also block
          someone at any time.
        </p>
      </Section>

      <FaqList
        items={[
          {
            q: "I did not get my verification email",
            a: "Check your spam or promotions folder first. The link is valid for one hour — if it has expired, ask for a new one from the verification page.",
          },
          {
            q: "My nanny profile was rejected",
            a: "The rejection message says exactly what needs changing. Update those fields and submit it again — there is no limit on resubmissions.",
          },
          {
            q: "I want to change my subscription",
            a: "Manage it from your account. Cancelling keeps your access until the end of the period you have already paid for.",
          },
          {
            q: "Billing questions",
            a: "Write to billing@nananny.ae with your account email and we will look into it.",
          },
          {
            q: "Delete my account",
            a: "Email support@nananny.ae from the address on the account and we will remove it, along with your profile and any documents you uploaded.",
          },
        ]}
      />
    </MarketingPage>
  );
}
