import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { AppShell, FAMILY_NAV } from "@/components/app/app-shell";
import { ThreadList } from "@/components/messaging/thread-list";
import { ContactCounter } from "@/components/messaging/contact-counter";
import { Button } from "@/components/ui/button";
import { loadThreads } from "@/lib/messaging/queries";
import { loadContactState } from "@/lib/messaging/actions";

export const metadata: Metadata = { title: "Messages" };

export default async function FamilyMessagesPage() {
  const user = await requireRole("family", "/family/messages");
  if (!user.emailVerified) redirect("/verify-email");

  const [threads, contacts] = await Promise.all([loadThreads(user), loadContactState()]);

  return (
    <AppShell nav={FAMILY_NAV} active="/family/messages" name="Messages">
      <h1 className="text-2xl font-semibold sm:text-3xl">Messages</h1>

      {contacts && (
        <div className="mt-4">
          <ContactCounter
            used={contacts.free_contacts_used}
            limit={contacts.free_contacts_limit}
            remaining={contacts.free_contacts_remaining}
            subscribed={contacts.subscription_active}
          />
        </div>
      )}

      {threads.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-background p-8 text-center sm:p-12">
          <h2 className="text-lg font-semibold">No conversations yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Find a nanny you like and send her a message. Browsing and saving profiles
            costs nothing.
          </p>
          <Link href="/nannies" className="mt-5 inline-block">
            <Button>Find a nanny</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-5">
          <ThreadList threads={threads} basePath="/family/messages" />
        </div>
      )}
    </AppShell>
  );
}
