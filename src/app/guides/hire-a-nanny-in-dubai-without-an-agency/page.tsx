import type { Metadata } from "next";
import Link from "next/link";
import { canonical } from "@/lib/seo/site";
import { MarketingPage, Section } from "@/components/site/marketing-page";

export const metadata: Metadata = {
  title: "Hire a nanny in Dubai without an agency",
  description:
    "How to find, interview and legally hire a nanny in Dubai directly: what agencies charge, what the law expects, what visa status means, and a practical checklist.",
  alternates: canonical("/guides/hire-a-nanny-in-dubai-without-an-agency"),
};

/**
 * The one guide that matches the site's whole reason to exist. Evergreen, no
 * promo copy, no numbers precise enough to rot. The legal section describes
 * the system without giving advice, and says so.
 */
export default function HireWithoutAgencyGuide() {
  return (
    <MarketingPage
      eyebrow="Guide"
      title="How to hire a nanny in Dubai without an agency"
      intro="Families in Dubai have always found nannies through word of mouth. This is the same process, done properly, with the paperwork explained."
    >
      <Section title="What an agency actually charges for">
        <p>
          A typical agency bundles three things: finding candidates, vetting them, and
          handling paperwork. For that, families pay placement fees that commonly run
          into thousands of dirhams, and some agencies take an ongoing cut connected to
          the salary. None of those three things requires an agency. Finding candidates
          is what a directory does, vetting is interviews and references, which you will
          want to do yourself anyway, and the paperwork is a defined government process
          you can follow directly.
        </p>
      </Section>

      <Section title="Step one: know what you need before you search">
        <p>
          Live in or live out. Which days and hours. Which languages matter at home. What
          the job really involves: babies need different experience than school age
          children, and cooking or driving are separate skills, not extras that come free.
          Families who write this down first interview three people; families who do not,
          interview ten.
        </p>
      </Section>

      <Section title="Step two: read visa status first">
        <p>
          In the UAE, a nanny&apos;s visa situation decides how simple your hire will be,
          which is why profiles on NaNanny state it up front. In practice you will meet
          four situations:
        </p>
        <p>
          <strong>Own visa.</strong> She holds her own residency. Usually the simplest
          conversation, but a residency visa is not by itself a permission to work for
          you: see the section on making it legal.
        </p>
        <p>
          <strong>On a family visa.</strong> Sponsored by a husband or relative. She can
          work part time or full time if the arrangement is registered properly, which
          normally starts with a no objection letter from her sponsor. The letter is a
          prerequisite for the permit, not a substitute for it.
        </p>
        <p>
          <strong>Visa cancelled.</strong> Between sponsors, often in a grace period.
          Hiring her means becoming her sponsor or arranging one, which is the full
          process, not the shortcut.
        </p>
        <p>
          <strong>Needs sponsorship.</strong> The family sponsors her domestic worker
          visa. The most paperwork, and also the most common arrangement for full time,
          live in help.
        </p>
      </Section>

      <Section title="Step three: making it legal">
        <p>
          Domestic work in the UAE is regulated by MOHRE, the Ministry of Human Resources
          and Emiratisation. The official routes are a registered domestic worker
          arrangement processed through MOHRE&apos;s channels and service centres, or
          employment through a licensed agency that provides staff. Paying someone
          informally is common and it is also, formally, against the rules for both
          sides, with real consequences in the serious cases.
        </p>
        <p>
          The practical takeaway: whichever visa situation you start from, the hire is
          complete when the arrangement is registered, not when you agree a salary. The
          government has been moving these services online, so start at the official
          MOHRE channels and follow the current process from there.
        </p>
        <p className="text-subtle">
          This page describes the system in plain words. It is not legal advice, and the
          rules evolve: for a specific case, MOHRE and its authorised centres are the
          authority.
        </p>
      </Section>

      <Section title="Step four: interview like it matters">
        <p>
          Meet in person or on video before anything else. Ask about the last two
          families: how long, which ages, why it ended. Call at least one reference and
          ask one question that matters: would you hire her again? Watch how she is with
          your children, not only how she is with you. And treat a badge on any platform,
          ours included, as exactly what it is: someone checked a specific document. It
          is not a guarantee of character, and nothing replaces your own judgment.
        </p>
      </Section>

      <Section title="Step five: agree the real terms">
        <p>
          Salary, days off, hours, overtime, accommodation if she lives in, and what
          happens with holidays and sick days. Write it down, even simply. The UAE
          domestic worker rules set minimum protections on rest and leave; an
          arrangement both sides understand on day one is the cheapest problem
          prevention there is.
        </p>
      </Section>

      <Section title="Where NaNanny fits">
        <p>
          NaNanny is the directory and the messenger: profiles with experience,
          languages, salary expectation and visa status stated up front, and a direct
          chat. No placement fee, no commission, nobody renting you a person. Start by{" "}
          <Link href="/nanny-in/dubai" className="font-medium text-foreground underline">
            browsing nannies in Dubai
          </Link>
          , or{" "}
          <Link href="/signup" className="font-medium text-foreground underline">
            post your job
          </Link>{" "}
          and let the right people find you.
        </p>
      </Section>
    </MarketingPage>
  );
}
