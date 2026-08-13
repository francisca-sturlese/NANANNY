import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { AppShell, NANNY_NAV } from "@/components/app/app-shell";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Messages" };

export default async function NannyMessagesPage() {
  const user = await requireRole("nanny", "/nanny/messages");
  if (!user.emailVerified) redirect("/verify-email");

  return (
    <AppShell nav={NANNY_NAV} active="/nanny/messages" name="Messages">
      <ComingSoon
        title="Messaging opens next"
        body="Families will be able to write to you here, and replying will always be free. In the meantime, applying to jobs is the fastest way to reach a family."
        cta={{ href: "/jobs", label: "Find jobs" }}
      />
    </AppShell>
  );
}
