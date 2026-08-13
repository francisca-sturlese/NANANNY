import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { AppShell, NANNY_NAV } from "@/components/app/app-shell";
import { ThreadList } from "@/components/messaging/thread-list";
import { Button } from "@/components/ui/button";
import { loadThreads } from "@/lib/messaging/queries";

export const metadata: Metadata = { title: "Messages" };

export default async function NannyMessagesPage() {
  const user = await requireRole("nanny", "/nanny/messages");
  if (!user.emailVerified) redirect("/verify-email");

  const threads = await loadThreads(user);

  return (
    <AppShell nav={NANNY_NAV} active="/nanny/messages" name="Messages">
      <h1 className="text-2xl font-semibold sm:text-3xl">Messages</h1>
      <p className="mt-1 text-sm text-muted">Replying is always free.</p>

      {threads.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-background p-8 text-center sm:p-12">
          <h2 className="text-lg font-semibold">No messages yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Families message you here once your profile is live. Applying to jobs is
            another way to start a conversation.
          </p>
          <Link href="/jobs" className="mt-5 inline-block">
            <Button>Find jobs</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-5">
          <ThreadList threads={threads} basePath="/nanny/messages" />
        </div>
      )}
    </AppShell>
  );
}
