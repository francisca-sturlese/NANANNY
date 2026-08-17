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
    /**
     * On a real deployment this is not a skip, it is a broken deployment.
     *
     * A development machine with no mail key is the normal state and says so.
     * A worker serving nananny.com with no key is a product that has silently
     * stopped telling anybody anything, and calling that "skipped" is what let
     * two real applications sit unsent for three hours: the row said exactly
     * what had happened, in a colour that reads as fine.
     *
     * `EMAIL_FROM` was the one missing, not the key, which is why naming both
     * matters. Recorded as a failure so it is red on the admin screen and loud
     * in the logs, where a misconfiguration belongs.
     */
    if (siteUrl().startsWith("https://")) {
      const missing = [!key && "RESEND_API_KEY", !from && "EMAIL_FROM"]
        .filter(Boolean)
        .join(" and ");
      console.error(`[email] not configured on this deployment: ${missing} is missing`);
      return { ok: false, error: `mail is not configured on this deployment: ${missing} is missing` };
    }

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
export function newMessageEmail(params: {
  /** Their first name, when we have one. No greeting rather than a placeholder. */
  name?: string | null;
  /** Messages waiting on them, across every conversation. */
  waiting: number;
  /** How many conversations those are spread across. */
  threads: number;
  unsubscribeUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const link = absoluteUrl("/account");

  const named = params.name?.trim();
  const greeting = named && named.toLowerCase() !== "there" ? `Hello ${named},` : null;

  const many = params.waiting > 1;

  /**
   * Counted, not named, for the same reason the application email counts.
   *
   * This is capped at one a day, so it covers everything that arrives for the
   * rest of that day. "Grace sent you a message" is true of the message that
   * triggered it and false by the time somebody else writes, and by then the
   * email has already gone.
   */
  const subject = many
    ? `You have ${params.waiting} messages waiting on NaNanny`
    : "You have a message waiting on NaNanny";

  const line = many
    ? params.threads > 1
      ? `You have ${params.waiting} messages waiting across ${params.threads} conversations.`
      : `You have ${params.waiting} messages waiting in a conversation you have not opened.`
    : "Somebody has written to you on NaNanny and you have not opened it yet.";

  // Said once, because it is the reason this is worth opening today rather than
  // whenever somebody next thinks of us.
  const nudge =
    "People arranging childcare talk to several others at the same time. Replying quickly is most of what decides how it goes.";

  const text = [
    ...(greeting ? [greeting, ""] : []),
    line,
    "",
    nudge,
    "",
    `Read it and reply here: ${link}`,
    "",
    "NaNanny UAE",
    "You get at most one of these a day, however many messages arrive.",
    ...(params.unsubscribeUrl
      ? ["", `Stop emails from NaNanny: ${params.unsubscribeUrl}`]
      : []),
  ].join("\n");

  const html = `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8e6e1;border-radius:12px">
      <tr>
        <td style="padding:28px">
          ${greeting ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escapeHtml(greeting)}</p>` : ""}
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escapeHtml(line)}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#555">${escapeHtml(nudge)}</p>
          <p style="margin:0">
            <a href="${link}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;font-weight:600">Read and reply</a>
          </p>
        </td>
      </tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#8a8a8a;text-align:center">
      NaNanny UAE<br />
      You get at most one of these a day, however many messages arrive.${
        params.unsubscribeUrl
          ? `<br /><a href="${params.unsubscribeUrl}" style="color:#8a8a8a">Stop emails from NaNanny</a>`
          : ""
      }
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
/**
 * What is actually between her and being found, said plainly.
 *
 * One thing left is a different message from six things left, and both are
 * different from a vague "not finished". The list comes from the database's own
 * idea of required, so it cannot drift from what the submit button checks.
 */
function nannyLine(missing: string[] | undefined, visible: boolean): string {
  const items = (missing ?? []).filter(Boolean);
  const list = items.map((i) => i.toLowerCase());
  const readable =
    list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0];

  /**
   * Already on the site, and still incomplete.
   *
   * Four profiles were published by hand to fill an empty marketplace, below
   * the completeness the product asks for. Telling those four that families
   * cannot find them would be a lie they can disprove by opening the search
   * page, and a mail somebody can catch out is a mail they stop reading. What
   * is true for them is that families can see them and there is not much there.
   */
  if (visible) {
    if (items.length === 0) {
      return "Your profile is live on NaNanny and families are looking. Filling in the rest of it is what turns a visit into a message.";
    }
    return items.length === 1
      ? `Your profile is live on NaNanny, but it is missing your ${readable}, which is the first thing a family looks for. Adding it takes a minute.`
      : `Your profile is live on NaNanny, but families are seeing very little: your ${readable} are still empty. Filling them in is what gets you replies.`;
  }

  if (items.length === 0) {
    return "There are new job offers from families on NaNanny, but your profile is not finished, so they cannot find you and you cannot apply. Finishing it takes a few minutes.";
  }

  if (items.length === 1) {
    return `There are new job offers from families on NaNanny, and you are one thing away from being able to apply: your ${readable}. Add it and families can find you straight away.`;
  }

  return `There are new job offers from families on NaNanny, but they cannot see you yet. What is missing is your ${readable}. It takes a few minutes.`;
}

export function reminderEmail(params: {
  /**
   * Their first name, when we have one.
   *
   * Most of the people this reaches do not have one. The reminder exists for
   * somebody who signed up and never came back, and the name is asked for
   * inside the onboarding they never opened, so the person most likely to get
   * this email is exactly the person we cannot address by name.
   *
   * The database hands over 'there' as a stand-in, which is fine for a greeting
   * with a name in front of it and wrong on its own: "Hello there" to somebody
   * who joined two days ago and left is the sentence that says we are a script.
   * So a missing name means no greeting line at all, rather than a greeting
   * with a placeholder in it.
   */
  name?: string | null;
  reason: "unread" | "nudge_family" | "nudge_nanny" | "waiting_apps";
  conversations: number;
  messages: number;
  /**
   * For a nanny: the required fields still missing, in her own words.
   *
   * "Your profile is not finished" is true and useless. One of the six nannies
   * who signed up in the first week was at eighty eight per cent and missing a
   * single photograph, and nothing anywhere told her that was the one thing
   * between her and being found. Naming it turns a chore into a task.
   */
  missing?: string[];
  /**
   * Whether families can already see her.
   *
   * Not the same as complete. Some profiles were published by hand while still
   * short of what the product asks for, so "families cannot find you" and "your
   * profile is thin" are both real situations and only one of them is true for
   * any given reader.
   */
  visible?: boolean;
  /**
   * Per recipient. Reminder mail without a way out is a nuisance with a logo.
   *
   * The wording is "stop emails from NaNanny" rather than "stop these
   * reminders", because one click writes one row in `email_optouts` and that
   * row silences every non-account email we send, including the one telling a
   * family that somebody applied. A link that promises less than the click does
   * is worse than no link: it takes away the most useful message we send, from
   * somebody who was only trying to stop being nagged.
   *
   * The honest wording is the stopgap. The fix is an opt-out that knows what it
   * is opting out of.
   */
  unsubscribeUrl?: string | null;
}): { subject: string; html: string; text: string } {
  // A family with applications waiting lands where they are listed, not on
  // account settings.
  const link =
    params.reason === "waiting_apps" ? absoluteUrl("/family") : absoluteUrl("/account");

  const named = params.name?.trim();
  const greeting = named && named.toLowerCase() !== "there" ? `Hello ${named},` : null;

  const copy =
    params.reason === "waiting_apps"
      ? {
          subject:
            params.messages === 1
              ? "A nanny is still waiting to hear from you"
              : `${params.messages} nannies are still waiting to hear from you`,
          line:
            params.messages === 1
              ? "You have an application waiting on your job post. A nanny who waits too long usually takes another job, and a quick yes or no keeps the good ones interested."
              : `You have ${params.messages} applications waiting${params.conversations === 1 ? " on your job post" : ` across ${params.conversations} job posts`}. A nanny who waits too long usually takes another job, and a quick yes or no keeps the good ones interested.`,
          button: "Review applications",
        }
      : params.reason === "unread"
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
            subject: params.visible
              ? "Your NaNanny profile is missing a few things"
              : "Families are hiring on NaNanny right now",
            line: nannyLine(params.missing, params.visible ?? false),
            button: "Finish your profile",
          };

  const text = [
    ...(greeting ? [greeting, ""] : []),
    copy.line,
    "",
    `${copy.button}: ${link}`,
    "",
    "NaNanny UAE",
    ...(params.unsubscribeUrl
      ? ["", `Stop emails from NaNanny: ${params.unsubscribeUrl}`]
      : []),
  ].join("\n");

  const html = `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8e6e1;border-radius:12px">
      <tr>
        <td style="padding:28px">
          ${greeting ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escapeHtml(greeting)}</p>` : ""}
          <p style="margin:0 0 24px;font-size:16px;line-height:1.5">${escapeHtml(copy.line)}</p>
          <p style="margin:0">
            <a href="${link}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;font-weight:600">${escapeHtml(copy.button)}</a>
          </p>
        </td>
      </tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#8a8a8a;text-align:center">
      NaNanny UAE${params.unsubscribeUrl ? `<br /><a href="${params.unsubscribeUrl}" style="color:#8a8a8a">Stop emails from NaNanny</a>` : ""}
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
  /** Same rule as the reminder: no name means no greeting, never a placeholder. */
  name?: string | null;
  /** Applications waiting on them, across every job they have open. */
  waiting: number;
  /** How many of their jobs those are spread across. */
  jobs: number;
  /**
   * Where to press to stop receiving these.
   *
   * Present on this email for the same reason it is on the reminders, and the
   * wording is different on purpose. Somebody unsubscribing here is turning off
   * being told that people applied for their job, which is the most useful
   * message this product sends. Saying so is not a dark pattern, it is the one
   * fact they need in order to make the choice they actually mean.
   */
  unsubscribeUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const link = absoluteUrl("/family/jobs");
  const many = params.waiting > 1;

  const named = params.name?.trim();
  const greeting = named && named.toLowerCase() !== "there" ? `Hello ${named},` : null;

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
    ...(greeting ? [greeting, ""] : []),
    line,
    "",
    nudge,
    "",
    `Read the applications: ${link}`,
    "",
    "NaNanny UAE",
    "You get at most one of these a day, however many applications arrive.",
    ...(params.unsubscribeUrl
      ? ["", `Stop emails from NaNanny: ${params.unsubscribeUrl}`]
      : []),
  ].join("\n");

  const html = `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8e6e1;border-radius:12px">
      <tr>
        <td style="padding:28px">
          ${greeting ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escapeHtml(greeting)}</p>` : ""}
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
      You get at most one of these a day, however many applications arrive.${
        params.unsubscribeUrl
          ? `<br /><a href="${params.unsubscribeUrl}" style="color:#8a8a8a">Stop emails from NaNanny</a>`
          : ""
      }
    </p>
  </body>
</html>`.trim();

  return { subject, html, text };
}
