import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canonical } from "@/lib/seo/site";
import { MarketingPage, Section } from "@/components/site/marketing-page";
import { createServiceClient } from "@/lib/supabase/service";
import { getSession } from "@/lib/auth/dal";

/**
 * The public page for invitations.
 *
 * It 404s while the mechanic is switched off, for the same reason the filter
 * landings do: a page that promises something the product is not giving is a
 * page that costs more than it earns, and a crawler that has indexed one keeps
 * sending people to a promise nobody is keeping. The switch in the back office
 * is the single source of truth, so the page and the product cannot disagree.
 *
 * The numbers are read at request time rather than written into the copy. The
 * reward and the ceiling are configuration an admin changes from a screen, and
 * a page that said "one extra contact" in prose would be wrong the moment the
 * number moved, which is exactly how a pricing page ends up lying.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invite a family, you both get an extra free contact",
  description:
    "Tell another family in the UAE about NaNanny. When they finish setting up, you both get an extra free nanny contact. No agency, no placement fee.",
  alternates: canonical("/invite-a-family"),
};

type Config = {
  referral_enabled: boolean;
  referral_bonus_contacts: number;
  referral_bonus_max: number;
  free_contacts: number;
};

export default async function InviteAFamilyPage() {
  const { data } = await createServiceClient()
    .from("pricing_config")
    .select("referral_enabled, referral_bonus_contacts, referral_bonus_max, free_contacts")
    .single();

  const config = data as Config | null;
  if (!config?.referral_enabled || config.referral_bonus_contacts < 1) notFound();

  const reward = config.referral_bonus_contacts;
  const rewardWord = reward === 1 ? "an extra free contact" : `${reward} extra free contacts`;
  const user = await getSession();

  return (
    <MarketingPage
      eyebrow="Invitations"
      title={`Invite a family, you both get ${rewardWord}`}
      intro="Most families here arrived because somebody they trust told them about it. This is the same thing, with something in it for both of you."
      cta={{
        href: user ? "/family" : "/signup?role=family",
        label: user ? "Get your invite link" : "Create a free account",
        secondary: { href: "/pricing", label: "See what contacts cost" },
      }}
    >
      <Section title="How it works">
        <p>
          Your invite link is on your dashboard. Send it to a family who is
          looking for a nanny, in a message or wherever you already talk to them.
        </p>
        <p>
          When they sign up through it and finish setting up their account, you
          both get {rewardWord}. Nothing arrives at the moment they sign up: a
          family who joins and stops has not started looking, and rewarding that
          would be paying for a name in a table.
        </p>
      </Section>

      <Section title="What a contact is">
        <p>
          Every family gets {config.free_contacts} free contacts. A contact is
          spent when you open a conversation with a nanny for the first time, and
          never again after that: replying is free, and so is reading, saving and
          comparing.
        </p>
        <p>
          So an extra contact is one more nanny you can write to before deciding
          whether this is worth paying for.
        </p>
      </Section>

      <Section title="The limits, plainly">
        <p>
          One family earns at most {config.referral_bonus_max} extra{" "}
          {config.referral_bonus_max === 1 ? "contact" : "contacts"} this way.
        </p>
        <p>
          A family can only be invited once, by one person, and inviting yourself
          with a second address does not work: the invitation has to reach a
          family who then sets up their own account and posts what they need.
        </p>
        <p>
          Nannies are not part of this, and that is deliberate. A nanny never pays
          for anything on NaNanny, so a free contact would buy her nothing. She
          can still send the site to anyone looking for work, and there is a
          button on her dashboard for exactly that.
        </p>
      </Section>

      <Section title="Why we do this">
        <p>
          Families find nannies here by looking, comparing and writing directly.
          There is no agency in the middle, no placement fee and no commission on
          anybody&apos;s salary, which means the only way this reaches the next
          family is somebody telling them.
        </p>
        <p>
          <Link href="/how-it-works" className="underline underline-offset-4">
            How NaNanny works
          </Link>
          , if you want to read that first.
        </p>
      </Section>
    </MarketingPage>
  );
}
