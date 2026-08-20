/**
 * What a notification says.
 *
 * The rows do not store a sentence. `title` is null on every one of them and
 * the text is built here, at the moment somebody reads it, for two reasons.
 *
 * A stored sentence is written once in one language, and the people using this
 * are a family in Dubai and a nanny from Manila. Building it on read means the
 * wording can change, or be translated, without a migration that rewrites
 * history.
 *
 * And a row that holds a sentence eventually holds a sentence somebody typed.
 * The metadata here is names and titles the platform already shows, never free
 * text: the same rule the message email follows, applied a layer earlier.
 */

export type NotificationRow = {
  id: string;
  kind: string;
  href: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type NotificationText = {
  /** The one line shown in the list. */
  text: string;
  /** Where it goes. Falls back to the row's own href. */
  href: string;
};

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function describe(row: NotificationRow): NotificationText {
  const meta = row.metadata ?? {};
  const href = row.href ?? "/";

  switch (row.kind) {
    case "new_message":
      return {
        text: `${text(meta.from, "Someone")} sent you a message.`,
        href,
      };

    case "application_received":
      return {
        text: `${text(meta.nanny_name, "A nanny")} applied to ${text(meta.job_title, "your job post")}.`,
        href,
      };

    case "application_shortlisted":
      return {
        text: `You were shortlisted for ${text(meta.job_title, "a job")}.`,
        href,
      };

    case "application_interview":
      return {
        text: `A family wants to interview you for ${text(meta.job_title, "a job")}.`,
        href,
      };

    // Written plainly. Softening it into "an update on your application" means
    // she opens the page hoping, which is worse than being told.
    case "application_rejected":
      return {
        text: `You were not selected for ${text(meta.job_title, "a job")}.`,
        href,
      };

    case "application_hired":
      return {
        text: `You got the job: ${text(meta.job_title, "a job")}.`,
        href,
      };

    case "profile_approved":
      return {
        text: "Your profile was reviewed and approved.",
        href,
      };

    // No reason here. It lives on her profile page, written by a person, and
    // a copy of it in a notification row is a copy that goes stale.
    case "profile_rejected":
      return {
        text: "Your profile needs a change before it can be approved.",
        href,
      };

    // Founder's choice over an email: the explanation lives where the profile
    // does. Written as protection, because it is: the removal is what stands
    // between her number and every stranger on the internet.
    case "contact_details_removed":
      return {
        text: "We removed a phone number or email from your profile text, for your safety. Families contact you here on NaNanny instead.",
        href,
      };

    // For the operator's phone: both pass the bus test, because "she
    // finished her profile" and "somebody wrote to us" are good news to the
    // person running the shop.
    case "admin_review_pending":
      return {
        text: `${text(meta.nanny_name, "A nanny")} finished her profile and is waiting for review.`,
        href,
      };

    case "admin_support_request":
      return {
        text: `New support message: ${text(meta.subject, "no subject")}.`,
        href,
      };

    // Deliberately wordless about the mail itself: an inbound subject and
    // sender are a stranger's words, and a push that repeats them is a
    // phishing envelope signed by us. The mailbox shows them as a stranger's.
    case "admin_mail_received":
      return {
        text: "New email in the NaNanny mailbox.",
        href,
      };

    default:
      // A kind added in the database and not here. Better a vague line that
      // still opens the right page than a gap in the list.
      return { text: "Something happened on your account.", href };
  }
}

/**
 * "4 minutes ago", without pulling in a date library.
 *
 * Anything older than a week is a date, because "13 days ago" is a number the
 * reader has to do arithmetic on.
 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));

  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
