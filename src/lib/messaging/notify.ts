import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, newMessageEmail } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";

/**
 * Telling the other person a message arrived.
 *
 * Called after a message is stored, never before. The database decides whether
 * to send: it knows who the other participant is, whether the conversation is
 * blocked, and whether this person has already been told in the last fifteen
 * minutes. That decision and the record of having made it are one insert, so a
 * retried request cannot send twice.
 *
 * Runs through the service client because the recipient's email address is not
 * something the sender is allowed to read, which is the correct rule and the
 * reason this cannot be done from the caller's own session.
 *
 * Never throws. A message has been delivered inside the product whether or not
 * the email went out, and turning a mail failure into an error the sender sees
 * would be the worse outcome.
 *
 * The email is currently off. Federico asked for the opposite of a per message
 * notification: a reminder only after somebody has been away for a long time
 * with something waiting. Until that is built, the in app record is still
 * written on every message, so the bell and the digest that follows will have
 * the history they need. Only the immediate send is suppressed.
 */
/**
 * Whether a message sends an email straight away. It does, again.
 *
 * It was switched off because one email per message is more than anybody wants
 * and becomes a filter rule inside a week. That was right about the cadence and
 * wrong about the case.
 *
 * Only a family can open a conversation here, so every message is either a
 * family reaching a nanny who is looking for work, or a nanny answering a
 * question a family asked her. Neither is a stranger writing out of the blue,
 * and both are the moment this product either works or does not.
 *
 * It happened: a nanny replied at 13:24 and the family never found out, because
 * the bell only rings for somebody already looking at it and the silence
 * reminder waits a day. Twenty four hours is the wrong wait for the answer to a
 * question you asked yourself.
 *
 * The cap moved instead of the feature: one a day per person, whatever arrives,
 * which is what `notify_new_message` now enforces and what the application
 * email already does.
 */
const IMMEDIATE_EMAIL = true;

export async function notifyNewMessage(
  conversationId: string,
  senderId: string,
): Promise<void> {
  try {
    const service = createServiceClient();

    const { data, error } = await service.rpc("notify_new_message", {
      p_conversation_id: conversationId,
      p_sender_id: senderId,
    });

    if (error) {
      console.error("[notify] could not decide:", error.message);
      return;
    }

    const decision = data as {
      send: boolean;
      reason?: string;
      event_id?: string;
      to?: string;
      name?: string;
      user_id?: string;
      waiting?: number;
      threads?: number;
    } | null;

    if (!decision?.send || !decision.event_id || !decision.to) return;

    // Off on purpose, and not by deleting the path: the queued row stays, so
    // when the inactivity reminder lands it can see what was pending and when.
    if (!IMMEDIATE_EMAIL) {
      await service.rpc("record_email_result", {
        p_event_id: decision.event_id,
        p_status: "skipped",
        p_error: "immediate message email is switched off, pending the inactivity reminder",
      });
      return;
    }

    const mail = newMessageEmail({
      name: decision.name,
      waiting: decision.waiting ?? 1,
      threads: decision.threads ?? 1,
      unsubscribeUrl: decision.user_id ? await unsubscribeUrl(decision.user_id, "applications") : null,
    });

    const result = await sendEmail({ to: decision.to, ...mail });
    const wasSkipped = result.ok && "skipped" in result;

    // Recorded either way. "She never got the email" needs to be a question
    // with an answer, and a silent failure is how it stops being one.
    //
    // Skipped is not failed. A machine with no mail key composed the message
    // and had nowhere to hand it, which is the normal state of every
    // development machine and looked like a broken sender on the admin screen.
    await service.rpc("record_email_result", {
      p_event_id: decision.event_id,
      p_status: result.ok ? (wasSkipped ? "skipped" : "sent") : "failed",
      p_provider_message_id: (result.ok ? result.id : null) ?? undefined,
      p_error: result.ok
        ? wasSkipped
          ? (result as { skipped: string }).skipped
          : undefined
        : result.error,
    });

    // The composed text, kept on the row. It carries nothing anybody typed, by
    // design, and it is the only way this copy is ever read on a machine that
    // cannot send.
    await service
      .from("email_events")
      .update({
        metadata: {
          waiting: decision.waiting ?? 1,
          threads: decision.threads ?? 1,
          subject: mail.subject,
          text: mail.text,
          ...(wasSkipped ? { skipped: (result as { skipped: string }).skipped } : {}),
        },
      })
      .eq("id", decision.event_id);

    if (!result.ok) console.error("[notify] send failed:", result.error);
  } catch (error) {
    console.error("[notify] unexpected:", error);
  }
}
