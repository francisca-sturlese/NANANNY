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
  searchParams: Promise<{ thread?: string; fwd?: string; sel?: string }>;
}) {
  const admin = await requireAdmin("/admin/email/new");
  const { thread, fwd, sel } = await searchParams;

  let subject: string | undefined;
  let body: string | undefined;

  const quote = (m: {
    direction: string;
    from_address: string;
    subject: string;
    text_body: string;
    created_at: string;
  }) =>
    [
      "---------- Forwarded message ----------",
      `From: ${m.direction === "in" ? m.from_address : "hello@nananny.com"}`,
      `Date: ${new Date(m.created_at).toLocaleString("en-GB")}`,
      `Subject: ${m.subject}`,
      "",
      m.text_body,
    ].join("\n");

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
      body = `\n\n${quote(original)}`;
    }
  } else if (sel) {
    // The bulk path: every selected conversation, every message, in order.
    // Capped at twenty threads by the action that built this URL.
    const keys = sel.split(",").map(decodeURIComponent).filter(Boolean).slice(0, 20);
    const supabase = await createServerSupabase();
    const parts: string[] = [];
    let firstSubject: string | undefined;
    for (const key of keys) {
      const { data } = await supabase.rpc("admin_mail_thread", { p_thread_key: key });
      for (const m of data ?? []) {
        firstSubject ??= m.subject;
        parts.push(quote(m));
      }
    }
    if (parts.length > 0) {
      subject =
        keys.length === 1
          ? `Fwd: ${firstSubject ?? ""}`
          : `Fwd: ${keys.length} conversations from the NaNanny mailbox`;
      body = `\n\n${parts.join("\n\n")}`;
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
