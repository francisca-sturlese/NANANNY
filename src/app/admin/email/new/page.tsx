import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { MailComposer } from "@/components/admin/mail-composer";

export const metadata: Metadata = { title: "New email" };

/**
 * Compose, and forward: forwarding is composing with the original quoted
 * into the body, still editable, addressed to whoever the operator chooses.
 * The quote is built here, server side, from the stored text: what gets
 * forwarded is exactly what the mailbox shows, never the raw HTML.
 */
export default async function ComposeMailPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; fwd?: string }>;
}) {
  const admin = await requireAdmin("/admin/email/new");
  const { thread, fwd } = await searchParams;

  let subject: string | undefined;
  let body: string | undefined;

  if (thread && fwd) {
    const supabase = await createServerSupabase();
    const { data } = await supabase.rpc("admin_mail_thread", {
      p_thread_key: decodeURIComponent(thread),
    });
    const original = (data ?? []).find((m) => m.id === fwd);
    if (original) {
      subject = /^\s*fwd?\s*:/i.test(original.subject)
        ? original.subject
        : `Fwd: ${original.subject}`;
      body = [
        "",
        "",
        "---------- Forwarded message ----------",
        `From: ${original.direction === "in" ? original.from_address : "hello@nananny.com"}`,
        `Date: ${new Date(original.created_at).toLocaleString("en-GB")}`,
        `Subject: ${original.subject}`,
        "",
        original.text_body,
      ].join("\n");
    }
  }

  const forwarding = Boolean(body);

  return (
    <AdminShell active="/admin/email" name={admin.firstName ?? "Admin"} narrow>
      <Link href="/admin/email" className="text-sm text-muted underline underline-offset-4">
        Back to the mailbox
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
        {forwarding ? "Forward email" : "New email"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        Sent from hello@nananny.com. Replies come back to this mailbox.
      </p>
      <div className="mt-6">
        <MailComposer subject={subject} body={body} />
      </div>
    </AdminShell>
  );
}
