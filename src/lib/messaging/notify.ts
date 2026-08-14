import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, newMessageEmail } from "@/lib/email/send";

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
 * Whether a message sends an email straight away.
 *
 * False, because the requirement changed after this shipped: an email per
 * message, even at one per fifteen minutes, is more than anybody wants. What
 * replaces it is a reminder after a long silence, which is a different feature
 * and is being built next.
 */
const IMMEDIATE_EMAIL = false;

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
      from_name?: string;
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
      name: decision.name ?? "there",
      fromName: decision.from_name ?? "Someone",
    });

    const result = await sendEmail({ to: decision.to, ...mail });

    // Recorded either way. "She never got the email" needs to be a question
    // with an answer, and a silent failure is how it stops being one.
    await service.rpc("record_email_result", {
      p_event_id: decision.event_id,
      p_status: result.ok ? "sent" : "failed",
      p_provider_message_id: (result.ok ? result.id : null) ?? undefined,
      p_error: result.ok ? undefined : result.error,
    });

    if (!result.ok) console.error("[notify] send failed:", result.error);
  } catch (error) {
    console.error("[notify] unexpected:", error);
  }
}
