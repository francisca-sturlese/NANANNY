import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { ComingSoon } from "@/components/app/coming-soon";
import { getPricingConfig } from "@/lib/pricing";

export const metadata: Metadata = { title: "Messages" };

export default async function FamilyMessagesPage() {
  const user = await requireRole("family", "/family/messages");
  if (!user.emailVerified) redirect("/verify-email");

  const supabase = await createServerSupabase();
  const [{ data: contactState }, pricing] = await Promise.all([
    supabase.rpc("my_contact_state"),
    getPricingConfig(),
  ]);
  const contacts = Array.isArray(contactState) ? contactState[0] : contactState;
  const remaining = contacts?.free_contacts_remaining ?? pricing.freeContacts;

  return (
    <AppShell nav={FAMILY_NAV} active="/family/messages" name="Messages">
      <ComingSoon
        title="Messaging opens next"
        body={`When it does, you'll have ${remaining} free ${
          remaining === 1 ? "contact" : "contacts"
        } to start conversations with. Saving profiles and reading applications stays free either way.`}
        cta={{ href: "/nannies", label: "Build your shortlist" }}
      />
    </AppShell>
  );
}
