import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { ReferralForm } from "@/components/admin/referral-form";
import { Card, CardBody } from "@/components/ui/card";

export const metadata: Metadata = { title: "Referral" };

/**
 * Its own screen, with its own name in the navigation.
 *
 * This lived as a card at the bottom of the pricing page, which is where
 * Federico went looking for it and did not find it. A feature somebody asked
 * for by name needs that name in the menu: the fastest way to make something
 * invisible is to file it under a heading the person was not thinking about.
 *
 * It is also why this is not called "Invites". That word is already taken in
 * this back office by the invitations that appoint administrators, and two
 * unrelated things sharing a label is worse than either being hard to find.
 */
export default async function AdminReferralPage() {
  const admin = await requireAdmin("/admin/referral");
  const supabase = await createServerSupabase();

  const [{ data: config }, { data: stats }] = await Promise.all([
    supabase
      .from("pricing_config")
      .select("referral_enabled, referral_bonus_contacts, referral_bonus_max, free_contacts")
      .single(),
    supabase.rpc("admin_referral_stats"),
  ]);

  if (!config) return null;

  return (
    <AdminShell active="/admin/referral" name={admin.firstName ?? "Admin"}>
      <h1 className="text-2xl font-semibold sm:text-3xl">Referral</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
        A family that brings another family. Both sides get extra free contacts,
        and only once the invited family has finished setting up, so a signup on
        its own earns nobody anything.
      </p>

      <div className="mt-6 max-w-xl">
        <Card>
          <CardBody>
            <ReferralForm
              enabled={config.referral_enabled}
              bonusContacts={config.referral_bonus_contacts}
              bonusMax={config.referral_bonus_max}
              stats={
                (stats as {
                  claimed: number;
                  qualified: number;
                  families_earning: number;
                  contacts_granted: number;
                }) ?? { claimed: 0, qualified: 0, families_earning: 0, contacts_granted: 0 }
              }
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 max-w-xl rounded-md border border-border bg-surface px-4 py-3">
        <p className="text-sm leading-relaxed text-muted">
          While this is off, invite links still work and still record who invited
          whom, and nobody is granted anything. Turning it on also publishes{" "}
          <Link href="/invite-a-family" className="underline underline-offset-4">
            the page that explains it
          </Link>
          , which answers 404 until then.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The free contacts a family starts with, currently {config.free_contacts},
          are set on the{" "}
          <Link href="/admin/pricing" className="underline underline-offset-4">
            pricing screen
          </Link>
          .
        </p>
      </div>
    </AdminShell>
  );
}
