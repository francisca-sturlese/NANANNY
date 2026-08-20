"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/dal";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import type { ActionState } from "@/lib/auth/actions";

/**
 * The mailbox's writes: sending, and deleting forever.
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

/**
 * Deleting is forever, and it says so in the audit log rather than in the
 * mailbox: admin_mail_delete_thread checks the caller and records who
 * deleted a thread with whom before the rows go.
 */
/**
 * Bulk forward is a redirect, not a send: it gathers the selection and lands
 * on the compose page with every selected conversation quoted, where the
 * operator still writes the address and presses Send. Nothing leaves here.
 */
export async function bulkForwardAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/email");
  const selected = formData.getAll("sel").map(String).filter(Boolean).slice(0, 20);
  if (selected.length === 0) redirect("/admin/email");
  redirect(`/admin/email/new?sel=${selected.map(encodeURIComponent).join(",")}`);
}

/**
 * The row's own delete, submitted through the list's form: the button carries
 * the thread key as its name/value pair, so no nested form is needed.
 */
export async function rowDeleteAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/email");
  const threadKey = String(formData.get("threadKey") ?? "");
  if (!threadKey) redirect("/admin/email");

  const supabase = await createServerSupabase();
  await supabase.rpc("admin_mail_delete_thread", { p_thread_key: threadKey });

  revalidatePath("/admin/email");
  redirect("/admin/email");
}

/** Same rule as the single delete: audited per thread, forever means forever. */
export async function bulkDeleteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin("/admin/email");
  const selected = formData.getAll("sel").map(String).filter(Boolean);
  if (selected.length === 0) return { error: "Nothing selected" };

  const supabase = await createServerSupabase();
  for (const key of selected) {
    const { error } = await supabase.rpc("admin_mail_delete_thread", {
      p_thread_key: key,
    });
    if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  }

  revalidatePath("/admin/email");
  redirect("/admin/email");
}

export async function deleteMailThreadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin("/admin/email");
  const threadKey = String(formData.get("threadKey") ?? "");
  if (!threadKey) return { error: "Missing thread" };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_mail_delete_thread", {
    p_thread_key: threadKey,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/admin/email");
  redirect("/admin/email");
}
