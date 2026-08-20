import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { MailComposer } from "@/components/admin/mail-composer";
import { DeleteThreadControl } from "@/components/admin/mail-thread-actions";

export const metadata: Metadata = { title: "Email" };

type MailRow = {
  id: string;
  direction: string;
  thread_key: string;
  from_address: string;
  to_address: string;
  subject: string;
  text_body: string;
  attachments: { name: string; size: number | null; type: string | null }[];
  read_at: string | null;
  created_at: string;
};

export default async function MailThreadPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const admin = await requireAdmin("/admin/email");
  const { key } = await params;
  const threadKey = decodeURIComponent(key);

  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("admin_mail_thread", { p_thread_key: threadKey });
  const messages = (data ?? []) as unknown as MailRow[];
  if (messages.length === 0) notFound();

  // Opening the thread is what reading means. Same shape as
  // record_conversation_read: recorded during render, once per open.
  await supabase.rpc("admin_mail_mark_read", { p_thread_key: threadKey });

  const latest = messages[messages.length - 1];
  const counterpart =
    latest.direction === "in" ? latest.from_address : latest.to_address;
  const subject = messages[0].subject || "(no subject)";
  // A reply keeps the thread on both sides: same counterpart, subject with
  // one Re: in front unless it already has one.
  const replySubject = /^\s*re\s*:/i.test(latest.subject)
    ? latest.subject
    : `Re: ${messages[0].subject}`;

  return (
    <AdminShell active="/admin/email" name={admin.firstName ?? "Admin"} narrow>
      <Link href="/admin/email" className="text-sm text-muted underline underline-offset-4">
        Back to the mailbox
      </Link>
      <h1 className="mt-2 text-xl font-semibold sm:text-2xl">{subject}</h1>
      <p className="mt-1 text-sm text-muted">{counterpart}</p>

      <div className="mt-6 space-y-4">
        {messages.map((m) => (
          <article
            key={m.id}
            className={`rounded-lg border border-border p-5 ${
              m.direction === "out" ? "bg-surface" : "bg-background"
            }`}
          >
            <p className="text-xs text-subtle">
              {m.direction === "out" ? "NaNanny helpcenter" : m.from_address} ·{" "}
              {new Date(m.created_at).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {/* Text, never HTML. A pasted <script> must read as the word. */}
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{m.text_body}</p>
            {m.attachments?.length > 0 && (
              <p className="mt-3 text-xs text-subtle">
                Attachments (in the Gmail copy):{" "}
                {m.attachments.map((a) => a.name).join(", ")}
              </p>
            )}
            <p className="mt-3">
              <Link
                href={`/admin/email/new?thread=${encodeURIComponent(m.thread_key)}&fwd=${m.id}`}
                className="text-xs text-muted underline underline-offset-4"
              >
                Forward
              </Link>
            </p>
          </article>
        ))}
      </div>

      <div className="mt-6">
        <MailComposer to={counterpart} subject={replySubject} compact />
      </div>

      <div className="mt-8">
        <DeleteThreadControl threadKey={threadKey} />
      </div>
    </AdminShell>
  );
}
