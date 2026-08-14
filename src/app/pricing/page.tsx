import Link from "next/link";
import type { Metadata } from "next";
import { canonical } from "@/lib/seo/site";
import { Check } from "lucide-react";
import { SiteHeader } from "@/components/site/header";
import { PromoBanner } from "@/components/promo/promo-banner";
import { SiteFooter } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FaqList } from "@/components/site/marketing-page";
import { getPricingConfig } from "@/lib/pricing";

export const metadata: Metadata = {
  alternates: canonical("/pricing"),
  title: "Pricing",
  description:
    "Your first nanny contacts are free. After that, choose a weekly or monthly plan for unlimited contacts. No commission on the nanny's salary, no placement fee.",
};

export default async function PricingPage() {
  const pricing = await getPricingConfig();

  const free = [
    `${pricing.freeContacts} nanny contacts`,
    "Browse unlimited profiles",
    "Save unlimited profiles",
    "Search and filters",
    "Create a family profile",
    "Post a job",
  ];

  const paid = [
    "Unlimited nanny contacts",
    "Unlimited messaging",
    "Advanced filters",
    "AI matching",
    "Unlimited shortlist",
    "Job posting",
  ];

  return (
    <>
      <SiteHeader />
      <PromoBanner audience="public" />

      <main className="mx-auto max-w-4xl px-5 pt-8 pb-16 sm:px-8 sm:pt-14">
        <h1 className="text-3xl leading-tight font-semibold sm:text-5xl">
          Find your nanny. Start for free.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          Your first {pricing.freeContacts} nanny contacts are free. Then choose the plan
          that works for you.
        </p>

        {/* Ascending: free, then the cheaper plan, then the dearer one. The
            Best Value mark still points at monthly without the layout having to
            shout it by putting it first. */}
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <PlanCard
            name="Free"
            price={0}
            period={null}
            currency={pricing.currency}
            features={free}
            footnote="No card needed."
          />

          {pricing.weeklyEnabled && (
            <PlanCard
              name="Weekly"
              price={pricing.weeklyPriceAed}
              period="week"
              currency={pricing.currency}
              features={paid}
            />
          )}

          {pricing.monthlyEnabled && (
            <PlanCard
              name="Monthly"
              price={pricing.monthlyPriceAed}
              period="month"
              currency={pricing.currency}
              features={paid}
              highlighted={pricing.monthlyIsBestValue}
            />
          )}
        </div>

        <div className="mt-10 rounded-xl bg-sage-wash p-6 sm:p-8">
          <h2 className="text-xl font-semibold sm:text-2xl">Nannies never pay.</h2>
          <p className="mt-2 max-w-xl leading-relaxed text-muted">
            No fee to create a profile, appear in search, receive matches, apply to jobs or
            reply to families. And no commission on her salary. What a family agrees with
            her is what she is paid.
          </p>
        </div>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold">Questions</h2>
          <div className="mt-5">
            <FaqList
              items={[
                {
                  q: "What counts as a contact?",
                  a: `Opening a conversation with a nanny you have not messaged before. Viewing her profile, saving her, or adding her to your shortlist costs nothing. Once you have messaged someone, every message after that is included, and she is never charged twice.`,
                },
                {
                  q: `What happens after my ${pricing.freeContacts} free contacts?`,
                  a: "Nothing changes until you want to message someone new. At that point you choose a weekly or monthly plan. You can keep browsing, saving and replying to conversations you have already started.",
                },
                {
                  q: "Do you take a cut of the nanny's salary?",
                  a: "No. NaNanny is a technology platform, not an agency. There is no commission and no placement fee. You agree the salary directly with her.",
                },
                {
                  q: "Can I cancel?",
                  a: "Yes, at any time. Your plan stays active until the end of the period you have already paid for.",
                },
                {
                  q: "Is NaNanny the employer?",
                  a: "No. NaNanny does not employ nannies, does not sponsor visas and does not negotiate employment contracts. Families and nannies are responsible for complying with applicable UAE law.",
                },
              ]}
            />
          </div>
        </section>

        <div className="mt-12 text-center">
          <Link href="/signup" className="block sm:inline-block">
            <Button size="lg" block className="sm:w-auto sm:px-8">
              Create a free account
            </Button>
          </Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function PlanCard({
  name,
  price,
  period,
  currency,
  features,
  highlighted = false,
  className,
  footnote,
}: {
  name: string;
  price: number;
  period: string | null;
  currency: string;
  features: string[];
  highlighted?: boolean;
  className?: string;
  footnote?: string;
}) {
  return (
    <div
      className={[
        "relative flex flex-col rounded-lg bg-surface-raised p-6",
        highlighted ? "border-2 border-foreground" : "border border-border",
        className ?? "",
      ].join(" ")}
    >
      {highlighted && (
        <span className="absolute -top-3 left-6">
          <Badge variant="solid" size="sm">
            Best Value
          </Badge>
        </span>
      )}

      <p className="text-sm font-medium text-muted">{name}</p>
      <p className="mt-1.5 text-3xl font-semibold">
        {price}
        <span className="ml-1.5 text-base font-medium text-muted">{currency}</span>
      </p>
      <p className="mt-0.5 text-sm text-muted">{period ? `per ${period}` : "to start"}</p>

      <ul className="mt-5 flex-1 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-sage-deep" aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {footnote && <p className="mt-5 text-xs text-subtle">{footnote}</p>}
    </div>
  );
}
