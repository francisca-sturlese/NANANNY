import type { Metadata } from "next";
import { canonical } from "@/lib/seo/site";
import { MarketingPage, Section } from "@/components/site/marketing-page";

export const metadata: Metadata = {
  alternates: canonical("/privacy"),
  title: "Privacy",
  description: "What NaNanny collects, who can see it, and how it is protected.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Privacy"
      title="What we hold, and who can see it"
      intro="Written to match what the product actually does, not to be difficult to read."
    >
      <Section title="Who we are">
        <p>
          NaNanny is operated by Smartbound - Athon L.L.C-FZ, a company registered in the
          Meydan Free Zone, Dubai, United Arab Emirates, under license 2542246.01. When this
          page says &quot;we&quot;, it means that company. For anything about your data,
          write to support@nananny.com.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          An account needs an email address and a password. Nannies add a profile: name,
          photo, nationality, emirate, experience, languages, availability, salary
          expectation, skills, identity and visa documents, and an optional video
          introduction. Families add the area and emirate, the number and ages of their
          children, a schedule and a budget. Messages sent through NaNanny are stored so
          both sides can read their own conversations. Authorised NaNanny
          administrators can also read conversations, for safety, fraud
          prevention and dispute resolution only; every such access is
          recorded in an internal log. We also keep the technical logs any
          website keeps, such as when a request happened and whether it failed.
        </p>
        <p>
          When payments go live they will be handled by Stripe. Card numbers never touch
          our servers and we never store them. We see which plan you chose and whether a
          payment succeeded.
        </p>
      </Section>

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

      <Section title="Children">
        <p>
          NaNanny is for adults. We never ask for a child&apos;s name or photo. The only
          information about children on the platform is what a family chooses to share to
          describe the job: how many children there are, and their ages.
        </p>
      </Section>

      <Section title="Files">
        <p>
          Photos, videos, documents and certificates are stored privately. Nothing is
          served from a public address. Every file passes through our own server, which
          checks who is asking before releasing a single byte, on every single request.
          There is no link that keeps working if it is forwarded to someone else.
        </p>
        <p>
          Identity documents, a passport, an ID card or a visa, are readable only by the
          nanny who uploaded them and by our review team. A family never has access to
          them. A CV, certificates and written references can also be opened by a family
          a nanny has applied to, because they are part of the application. Video
          introductions require an account to watch.
        </p>
      </Section>

      <Section title="Reports">
        <p>
          If you report a profile or a message, the person you report is not told who
          reported them. Reports are read by our team, and what we did about them is
          recorded.
        </p>
      </Section>

      <Section title="Why we use your data">
        <p>
          To run the service you signed up for: showing profiles, delivering messages,
          matching families and nannies. To keep the platform safe: reviewing profiles and
          documents, handling reports, preventing abuse. To take payments when you choose a
          plan. To meet the legal obligations that apply to a UAE company. We do not sell
          your data and we do not show ads.
        </p>
      </Section>

      <Section title="Who processes it for us">
        <p>
          Your data lives in a database hosted by Supabase. The website is delivered by
          Cloudflare. Emails are sent through our email provider. Payments, when live, run
          through Stripe. Each of these companies processes data only to provide their
          service to us. We do not hand your data to anyone else unless the law requires
          it.
        </p>
      </Section>

      <Section title="Where the rules live">
        <p>
          Access is enforced in the database itself, not only in the application. Each row
          carries a policy saying who may read or change it, so a bug in a page cannot
          expose something the policy forbids. Actions taken by our own team are recorded
          in an audit log.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Your data stays while your account exists. If you delete your account, your
          profile, files and messages are removed. We keep only what a business is required
          to keep, such as payment records and the audit log of our own actions.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <p>
          You can edit or remove anything on your profile at any time, stop appearing in
          search, ask for a copy of the data we hold about you, or ask us to delete your
          account and everything attached to it. Write to support@nananny.com and we will
          answer. These rights follow the UAE Personal Data Protection Law, Federal Decree
          Law No. 45 of 2021.
        </p>
      </Section>

      {/* This claim is verified by security-check, which fails if a third party
          script appears, and the CSP blocks external scripts anyway. If an
          analytics tag is ever added, this section becomes false and must be
          rewritten in the same commit. */}
      <Section title="Cookies">
        <p>
          We use cookies to keep you signed in. We do not use advertising or tracking
          cookies.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this page changes in a way that matters, we will say so on the site rather
          than changing it quietly. This version is from August 2026.
        </p>
      </Section>
    </MarketingPage>
  );
}
