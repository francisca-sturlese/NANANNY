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
  /** Handed to the provider. */
  | { ok: true; id: string | null }
  /**
   * Composed, and deliberately not handed to anybody: a machine with no key, or
   * a local build. Distinct from a failure because it is not one, and the two
   * looked identical on the admin screen, where "failed" next to every reminder
   * ever composed is the kind of thing that gets investigated for an hour.
   */
  | { ok: true; id: null; skipped: string }
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
    return { ok: true, id: null, skipped: "no mail provider is configured here" };
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
    return { ok: true, id: null, skipped: "not sent from a local build" };
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
  /** Per recipient. Reminder mail without a way out is a nuisance with a logo. */
  unsubscribeUrl?: string | null;
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
            subject: "Families are hiring on NaNanny right now",
            line:
              "There are new job offers from families on NaNanny, but your profile is not finished, so they cannot find you and you cannot apply. Finishing it takes a few minutes. Do not miss them.",
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
    ...(params.unsubscribeUrl
      ? ["", `Stop these reminder emails: ${params.unsubscribeUrl}`]
      : []),
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
      NaNanny UAE${params.unsubscribeUrl ? `<br /><a href="${params.unsubscribeUrl}" style="color:#8a8a8a">Stop these reminder emails</a>` : ""}
    </p>
  </body>
</html>`.trim();

  return { subject: copy.subject, html, text };
}

/**
 * The one email a family wants interrupting them for.
 *
 * Somebody applied to their job. That is the event the marketplace turns on,
 * and the reason it is a mail rather than a bell is that a family with nothing
 * to do on the site is not on the site: eight real applications sat unopened
 * while the notifications for them were delivered perfectly.
 *
 * Written as an aggregate on purpose, and this is the part that is easy to get
 * wrong. The email is capped at one per family per day, so it covers every
 * application that arrives for the rest of that day. A subject naming a nanny,
 * or saying "an application", stops being true the moment the second one lands
 * and the family has already been told for today. So it counts, and the count
 * is read at the moment of sending rather than passed in from whatever
 * triggered it.
 *
 * No cover note, no name, nothing the applicant typed. Same rule as the message
 * email, same reason: an email that genuinely came from us is the best phishing
 * envelope this product could hand anybody.
 */
export function applicationEmail(params: {
  name: string;
  /** Applications waiting on them, across every job they have open. */
  waiting: number;
  /** How many of their jobs those are spread across. */
  jobs: number;
}): { subject: string; html: string; text: string } {
  const link = absoluteUrl("/family/jobs");
  const many = params.waiting > 1;

  const subject = many
    ? `${params.waiting} nannies are waiting to hear from you`
    : "A nanny applied to your job";

  const line = many
    ? params.jobs > 1
      ? `${params.waiting} nannies have applied across ${params.jobs} of your job posts, and none of them have heard back yet.`
      : `${params.waiting} nannies have applied to your job post, and none of them have heard back yet.`
    : "A nanny has applied to your job post. Her profile, experience and languages are on the application.";

  // Said once, plainly, because it is the honest reason to open this today.
  const nudge = many
    ? "Nannies looking for work talk to several families at once. The ones who reply first are the ones who hire."
    : "Replying quickly is what gets you the nanny you want.";

  const text = [
    `Hello ${params.name},`,
    "",
    line,
    "",
    nudge,
    "",
    `Read the applications: ${link}`,
    "",
    "NaNanny UAE",
    "You get at most one of these a day, however many applications arrive.",
  ].join("\n");

  const html = `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8e6e1;border-radius:12px">
      <tr>
        <td style="padding:28px">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hello ${escapeHtml(params.name)},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escapeHtml(line)}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#555">${escapeHtml(nudge)}</p>
          <p style="margin:0">
            <a href="${link}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;font-weight:600">Read the applications</a>
          </p>
        </td>
      </tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#8a8a8a;text-align:center">
      NaNanny UAE<br />
      You get at most one of these a day, however many applications arrive.
    </p>
  </body>
</html>`.trim();

  return { subject, html, text };
}
