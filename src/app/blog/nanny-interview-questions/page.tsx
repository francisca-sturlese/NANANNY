import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/site/marketing-page";
import { absoluteUrl, canonical, jsonLd } from "@/lib/seo/site";
import { withCodePostVisibility } from "@/lib/blog-code-meta";

const baseMetadata: Metadata = {
  title: "12 questions that actually matter in a nanny interview",
  description:
    "Skip the rehearsed answers. The questions that reveal how somebody handles a tantrum, an emergency and a Tuesday, and the red flags on both sides of the table.",
  alternates: canonical("/blog/nanny-interview-questions"),
};

// Rendered per request so the admin hide switch can answer noindex.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return withCodePostVisibility("nanny-interview-questions", baseMetadata);
}

const QUESTIONS: { q: string; why: string }[] = [
  {
    q: "Walk me through a normal day with the last children you cared for.",
    why: "Rehearsed candidates describe qualities; experienced ones describe routines. You are listening for breakfast, school runs and nap logistics told like somebody who lived them.",
  },
  {
    q: "Tell me about a time a child would not stop crying. What did you do?",
    why: "There is no perfect answer, but there is a real one. Patience described in the abstract is worth little; a specific story with a specific ending tells you how she actually works.",
  },
  {
    q: "What would you do if my child had a fall while I was unreachable?",
    why: "You want calm sequence, not drama: check, comfort, assess, call. If she mentions who she would call and in what order, that is experience talking.",
  },
  {
    q: "What do you like least about this work?",
    why: "Everybody has an answer; only honest candidates share it. 'Nothing, I love everything' is the only wrong reply.",
  },
  {
    q: "How do you handle a child who refuses to eat, or to sleep?",
    why: "Listen for patience plus a method, and for whether her method would fit your parenting. A brilliant nanny with an opposite philosophy is a daily argument.",
  },
  {
    q: "What did your last family do that made the job work well?",
    why: "Flips the interview: her answer tells you what she needs from you, and whether your household can give it.",
  },
  {
    q: "Why did your last arrangement end?",
    why: "Families relocate, children grow up, contracts end: all normal. Vague or bitter answers deserve one gentle follow-up before you judge.",
  },
  {
    q: "What ages are you most confident with, honestly?",
    why: "A newborn and a seven-year-old are different jobs. Somebody who says 'all ages equally' is selling; somebody who says 'toddlers are my favourite, newborns I have done twice' is telling the truth.",
  },
  {
    q: "How would you spend a rainy afternoon with my children, no screens?",
    why: "You learn more from this than from any certificate: imagination, energy, and whether she actually enjoys children or manages them.",
  },
  {
    q: "What are your salary expectations, and what is included?",
    why: "Have the money conversation in the interview, not after. Her profile states a figure; confirm what it assumes about hours, days off and duties beyond childcare.",
  },
  {
    q: "Do you know first aid? When did you last refresh it?",
    why: "On NaNanny a first-aid badge means our team saw the certificate. Even so, ask when: a course from 2015 is a memory, not a skill.",
  },
  {
    q: "What questions do you have for us?",
    why: "The best candidates interview you back: about the children, the schedule, the house rules. No questions at all usually means no real interest, or no leverage to show it.",
  },
];

export default function InterviewQuestionsPage() {
  return (
    <>
      <script type="application/ld+json">
        {jsonLd({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "12 questions that actually matter in a nanny interview",
          datePublished: "2026-08-18",
          author: { "@type": "Organization", name: "NaNanny UAE" },
          url: absoluteUrl("/blog/nanny-interview-questions"),
        })}
      </script>
      <MarketingPage
        eyebrow="Blog · 18 August 2026"
        title="12 questions that actually matter in a nanny interview"
        intro="When you hire directly, the interview is yours to run. These questions get past rehearsed answers, and the notes under each explain what you are really listening for."
        cta={{
          href: "/nannies",
          label: "Find nannies to interview",
          secondary: { href: "/blog", label: "More from the blog" },
        }}
      >
        <section className="space-y-4">
          {QUESTIONS.map((item, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-5">
              <h2 className="font-semibold">
                {i + 1}. {item.q}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.why}</p>
            </div>
          ))}
        </section>

        <section>
          <h2 className="text-xl font-semibold sm:text-2xl">Before you interview anybody</h2>
          <p className="mt-3 leading-relaxed text-muted">
            Read her profile properly first: on{" "}
            <Link href="/nannies" className="underline underline-offset-4">
              NaNanny
            </Link>{" "}
            each nanny states her experience, age groups, arrangement and expected
            salary herself, and badges only appear after our team has seen the
            document behind them. Interview two or three candidates, in person or
            on a video call, and check what salaries look like in{" "}
            <Link
              href="/blog/nanny-salary-dubai-2026"
              className="underline underline-offset-4"
            >
              our real-numbers salary guide
            </Link>{" "}
            before you make an offer.
          </p>
        </section>
      </MarketingPage>
    </>
  );
}
