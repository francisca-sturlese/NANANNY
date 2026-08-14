import type { Metadata } from "next";
import { canonical } from "@/lib/seo/site";
import { MarketingPage, Section, FaqList } from "@/components/site/marketing-page";
import { SupportForm } from "@/components/safety/support-form";
import { getSession } from "@/lib/auth/dal";

export const metadata: Metadata = {
  alternates: canonical("/support"),
  title: "Support",
  description: "Get help with your NaNanny account, your profile or your subscription.",
};

export default async function SupportPage() {
  const user = await getSession();

  return (
    <MarketingPage
      eyebrow="Support"
      title="We're here to help"
      intro="Most things are quicker to fix than they look. If you cannot find the answer below, write to us."
    >
      <Section title="Write to us">
        <p>
          Fill this in and we will reply to the address you give, usually within one
          working day. You do not need to be logged in.
        </p>
        <div className="mt-5 rounded-lg border border-border bg-background p-5 sm:p-6">
          <SupportForm
            defaultEmail={user?.email}
            defaultName={[user?.firstName, user?.lastName].filter(Boolean).join(" ") || undefined}
          />
        </div>
      </Section>

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
            a: "Check your spam or promotions folder first. The link is valid for one hour. If it has expired, ask for a new one from the verification page.",
          },
          {
            q: "My nanny profile was rejected",
            a: "The rejection message says exactly what needs changing. Update those fields and submit it again. There is no limit on resubmissions.",
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
