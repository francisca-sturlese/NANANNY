"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email/send";
import type { ActionState } from "@/lib/auth/actions";

/**
 * The mailbox's one write: sending.
 *
 * The words are typed by the administrator for this one message, which is what
 * keeps this inside the rule about outbound text: nothing templated, nothing
 * inferred, the sender is the person whose name answers for the product. The
 * mail goes out through the same sendEmail() as everything else, from
 * hello@nananny.com, so replies come back into this mailbox.
 */

/** One thread = counterpart + subject, reply prefixes stripped. Mirrors the mail worker. */
function threadKey(counterpart: string, subject: string): string {
  const s = subject
    .replace(/^\s*((re|fwd?|aw|r)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
  return `${counterpart.trim().toLowerCase()}|${s}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendMailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin("/admin/email");

  const to = String(formData.get("to") ?? "").trim().toLowerCase();
  // A newline in a subject is a header, somewhere. Resend builds the MIME
  // from JSON so today this is belt and braces, but the belt is ours and the
  // braces are a supplier's promise.
  const subject = String(formData.get("subject") ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { fieldErrors: { to: "A valid email address is required" } };
  }
  if (!subject) return { fieldErrors: { subject: "A subject is required" } };
  if (!body) return { fieldErrors: { body: "Write the message first" } };

  // The polite half of the limit; the database trigger is the hard one.
  // Checked before Resend is called, because the trigger can only refuse the
  // row after the mail has already left.
  const service = createServiceClient();
  const { count } = await service
    .from("mail_messages")
    .select("*", { count: "exact", head: true })
    .eq("direction", "out")
    .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= 50) {
    return { error: "Daily sending limit reached. Try again tomorrow." };
  }

  // Plain paragraphs, nothing else: the same register as every mail we send.
  const html = `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000">
    <div style="max-width:520px;margin:0 auto">
      ${body
        .split(/\n{2,}/)
        .map(
          (p) =>
            `<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`,
        )
        .join("\n      ")}
    </div>
  </body>
</html>`.trim();

  const result = await sendEmail({
    to,
    subject,
    text: body,
    html,
    replyTo: "hello@nananny.com",
  });

  if (!result.ok) {
    return { error: `The email was not sent: ${result.error}` };
  }

  await service.from("mail_messages").insert({
    direction: "out",
    thread_key: threadKey(to, subject),
    from_address: "hello@nananny.com",
    to_address: to,
    subject,
    text_body: body,
    provider_id: result.id,
  });

  revalidatePath("/admin/email");
  return { message: "skipped" in result ? "Composed, not sent from this machine." : "Sent." };
}
