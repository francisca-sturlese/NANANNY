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
  /** Put in the List-Unsubscribe header as well as in the footer. */
  unsubscribeUrl?: string | null;
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
        /**
         * The way out, said in the header as well as in the body.
         *
         * Gmail and the rest read `List-Unsubscribe` directly and treat it as
         * one of the strongest signals that a sender is behaving: it is what
         * turns "this is junk" into one tap that costs the sender nothing. We
         * already offer the link in the footer; without the header, the only
         * way somebody can stop us is the spam button, and the spam button is
         * the thing that damages every other email we send.
         *
         * `One-Click` with the POST form, because a provider that has to open
         * a page to unsubscribe somebody often does not bother.
         */
        ...(options.unsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${options.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
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
/**
 * One shape for everything we mail a family or a nanny.
 *
 * Written to read like a person, because that is what decides the Gmail tab.
 * Gmail files branded cards with buttons under Updates however well they are
 * built; what it files under Primary is correspondence: plain paragraphs and
 * one link said as a sentence.
 *
 * Every sentence in here is Federico's to approve, word for word, before it
 * ships. An earlier version added a "just reply to this email" line nobody
 * approved; it went out under his product's name and he ordered it removed.
 * The mail signs as NaNanny, never as a person, and the opt-out link stays
 * on every template that has one.
 */
function personalEmail(opts: {
  greeting: string | null;
  paragraphs: string[];
  /** The one link, said as a sentence rather than pressed as a button. */
  linkLabel: string;
  link: string;
  /**
   * The only thing under the signature, by Federico's order: the way out,
   * and nothing else. There is deliberately no other footer parameter.
   */
  unsubscribe?: { label: string; url: string } | null;
}): { html: string; text: string; unsubscribeUrl?: string | null } {
  const text = [
    ...(opts.greeting ? [opts.greeting, ""] : []),
    ...opts.paragraphs.flatMap((p) => [p, ""]),
    `${opts.linkLabel}: ${opts.link}`,
    "",
    "NaNanny helpcenter",
    ...(opts.unsubscribe ? ["", `${opts.unsubscribe.label}: ${opts.unsubscribe.url}`] : []),
  ].join("\n");

  const para = (content: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${content}</p>`;

  const smallPrint = opts.unsubscribe
    ? [
        `<a href="${opts.unsubscribe.url}" style="color:#8a8a8a">${escapeHtml(opts.unsubscribe.label)}</a>`,
      ]
    : [];

  const html = `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000">
    <div style="max-width:520px;margin:0 auto">
      ${opts.greeting ? para(escapeHtml(opts.greeting)) : ""}
      ${opts.paragraphs.map((p) => para(escapeHtml(p))).join("\n      ")}
      ${para(`<a href="${opts.link}" style="color:#1a5fb4">${escapeHtml(opts.linkLabel)}</a>`)}
      ${para("NaNanny helpcenter")}
      ${smallPrint.length ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8a8a8a">${smallPrint.join("<br />")}</p>` : ""}
    </div>
  </body>
</html>`.trim();

  return { html, text, unsubscribeUrl: opts.unsubscribe?.url ?? null };
}

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

  return {
    subject,
    ...personalEmail({
      greeting,
      paragraphs: [line, nudge],
      linkLabel: "Read it and reply here",
      link,
      unsubscribe: params.unsubscribeUrl
        ? { label: "Stop activity emails like this one", url: params.unsubscribeUrl }
        : null,
    }),
  };
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
   * The link now carries a scope, so the click does exactly what the words
   * say: a reminder link stops reminders, an activity link stops activity
   * mail, and the landing page offers the bigger switch to whoever wanted
   * that. The old "stop everything" wording was the stopgap; this is the fix
   * it promised.
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

  return {
    subject: copy.subject,
    ...personalEmail({
      greeting,
      paragraphs: [copy.line],
      linkLabel: copy.button,
      link,
      unsubscribe: params.unsubscribeUrl
        ? { label: "Stop these reminders", url: params.unsubscribeUrl }
        : null,
    }),
  };
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
/**
 * Her profile was rejected, and this is how she finds out.
 *
 * Until now a rejection wrote a notification inside the app and nothing else,
 * so a nanny who did not come back never learned why her profile had gone
 * quiet. Leticia was rejected on 18 August for a photo that was not hers and
 * had not been told two days later.
 *
 * The reason is the administrator's own words, copied exactly. That is not a
 * breach of "an email never carries text another user typed": it is our text,
 * written by us about our decision, and paraphrasing it would mean telling her
 * something slightly different from what the screen shows her.
 *
 * No unsubscribe link, deliberately. This is not activity or news, it is the
 * reason her profile is not visible and the way to fix it. Offering to stop
 * sending it would be offering to stop telling her.
 */
export function rejectionEmail(params: {
  name?: string | null;
  /** Exactly what the administrator wrote in the rejection box. */
  reason: string;
}): { subject: string; html: string; text: string } {
  const named = params.name?.trim();
  const greeting = named && named.toLowerCase() !== "there" ? `Hello ${named},` : null;

  return {
    subject: "Your NaNanny profile needs one change",
    ...personalEmail({
      greeting,
      paragraphs: [
        "Thank you for putting your profile together. We look at every profile before it goes in front of families, and yours needs one thing changed before we can show it.",
        `What we need: ${params.reason}`,
        "Once you have updated it, your profile goes back in the queue and we look at it again. Nothing else you have written is lost.",
      ],
      linkLabel: "Update your profile here",
      link: absoluteUrl("/nanny/profile"),
      unsubscribe: null,
    }),
  };
}

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

  return {
    subject,
    ...personalEmail({
      greeting,
      paragraphs: [line, nudge],
      linkLabel: "Read the applications",
      link,
      unsubscribe: params.unsubscribeUrl
        ? { label: "Stop activity emails like this one", url: params.unsubscribeUrl }
        : null,
    }),
  };
}
