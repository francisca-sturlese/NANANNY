import "server-only";

import { absoluteUrl, siteUrl } from "@/lib/seo/site";

/**
 * Sending email.
 *
 * Over `fetch` rather than through Resend's SDK: the deployment target has no
 * Node runtime, and one POST is less to go wrong than a dependency that might
 * reach for one.
 *
 * Nothing here throws. An email that fails to send must not fail the action
 * that triggered it: a nanny's message has been delivered inside the product
 * whether or not we managed to tell her about it by email, and turning that
 * into an error the sender sees would be the worse outcome by far.
 */

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!key || !from) {
    // Not an error worth shouting about locally, where mail is not configured.
    return { ok: false, error: "email is not configured" };
  }

  /**
   * Nothing leaves a development machine.
   *
   * The key is real in .env.local, so without this every message sent by the
   * end to end suites made a live call to Resend: seconds of latency on each
   * one, and mail genuinely delivered to whatever address a fixture invented.
   * The check is the site URL rather than NODE_ENV because the suites run a
   * production build over http on 127.0.0.1.
   */
  if (!siteUrl().startsWith("https://")) {
    console.info(`[email] not sent from a local build: ${options.subject} to ${options.to}`);
    return { ok: true, id: null };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `${response.status} ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as { id?: string };
    return { ok: true, id: data.id ?? null };
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 200) };
  }
}

/**
 * The new message email.
 *
 * It says a message arrived and links to it. It does not carry the message.
 *
 * That is a deliberate refusal, not an omission. Including the body would mean
 * any stranger on the platform can put arbitrary text into another person's
 * inbox, inside an email that genuinely came from us and passes every
 * authentication check a mail client makes. "Click here to confirm your visa
 * documents" in that envelope is more convincing than anything an attacker
 * could send directly, and the people it would work on are exactly the ones
 * this product exists to look after.
 *
 * The sender's first name is included because it is theirs and not free text:
 * a nanny's comes from her profile, a family's from its display name, both of
 * which a human reviews.
 */
export function newMessageEmail(params: { name: string; fromName: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const link = absoluteUrl("/account");
  const subject = `${escapeHeader(params.fromName)} sent you a message on NaNanny`;

  const text = [
    `Hello ${params.name},`,
    "",
    `${params.fromName} has sent you a message on NaNanny.`,
    "",
    `Read it and reply here: ${link}`,
    "",
    "We do not include the message itself in email. Open the site to read it.",
    "",
    "NaNanny UAE",
  ].join("\n");

  const html = `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8e6e1;border-radius:12px">
      <tr>
        <td style="padding:28px">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hello ${escapeHtml(params.name)},</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.5">
            <strong>${escapeHtml(params.fromName)}</strong> has sent you a message on NaNanny.
          </p>
          <p style="margin:0 0 24px">
            <a href="${link}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;font-weight:600">Read and reply</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b6b6b">
            We never put the message itself in an email. Open the site to read it.
            That way nothing anybody types can reach your inbox pretending to be from us.
          </p>
        </td>
      </tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#8a8a8a;text-align:center">
      NaNanny UAE
    </p>
  </body>
</html>`.trim();

  return { subject, html, text };
}

/**
 * A name is not markup.
 *
 * Both of these are short and neither is optional. A display name is chosen by
 * the person it belongs to, which is exactly the definition of untrusted.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A newline in a header is header injection. */
function escapeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 80);
}

/**
 * The reminder email.
 *
 * Aggregated on purpose: a count and a link, never the messages. The same
 * refusal as the per message notification, for the same reason. What changes
 * here is only that somebody has been away a while.
 */
export function reminderEmail(params: {
  name: string;
  reason: "unread" | "nudge_family" | "nudge_nanny";
  conversations: number;
  messages: number;
}): { subject: string; html: string; text: string } {
  const link = absoluteUrl("/account");

  const copy =
    params.reason === "unread"
      ? {
          subject:
            params.messages === 1
              ? "You have a message waiting on NaNanny"
              : `You have ${params.messages} messages waiting on NaNanny`,
          line:
            params.conversations === 1
              ? `You have ${params.messages === 1 ? "a message" : `${params.messages} messages`} waiting in a conversation you have not opened yet.`
              : `You have ${params.messages} messages waiting across ${params.conversations} conversations.`,
          button: "Read them",
        }
      : params.reason === "nudge_family"
        ? {
            subject: "Tell nannies what you are looking for",
            line:
              "Your family profile is ready, but you have not posted what you need or written to anybody yet. Posting takes a couple of minutes and lets nannies come to you.",
            button: "Post what you need",
          }
        : {
            subject: "Your NaNanny profile is not finished",
            line:
              "Your profile is still a draft, so families cannot find you. Finishing it is what puts you in front of them.",
            button: "Finish your profile",
          };

  const text = [
    `Hello ${params.name},`,
    "",
    copy.line,
    "",
    `${copy.button}: ${link}`,
    "",
    "NaNanny UAE",
  ].join("\n");

  const html = `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8e6e1;border-radius:12px">
      <tr>
        <td style="padding:28px">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hello ${escapeHtml(params.name)},</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.5">${escapeHtml(copy.line)}</p>
          <p style="margin:0">
            <a href="${link}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;font-weight:600">${escapeHtml(copy.button)}</a>
          </p>
        </td>
      </tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#8a8a8a;text-align:center">
      NaNanny UAE
    </p>
  </body>
</html>`.trim();

  return { subject: copy.subject, html, text };
}
