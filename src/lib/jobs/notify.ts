import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, applicationEmail } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";

/**
 * Telling a family that somebody applied.
 *
 * Called after the application row exists, never before, and the database
 * decides whether anything is sent: it knows who the family is, whether they
 * are still active, how many applications are actually waiting, and whether
 * they have already been written to today. That decision and the record of
 * having made it are one insert, so a retried request cannot send twice.
 *
 * Runs through the service client because a family's email address is not
 * something an applicant is allowed to read, which is why this cannot be done
 * from the caller's own session.
 *
 * Never throws. The application has been delivered inside the product whether
 * or not the email went out, and turning a mail failure into an error the nanny
 * sees would tell her that her application failed when it did not.
 */
export async function notifyApplicationReceived(jobId: string): Promise<void> {
  try {
    const service = createServiceClient();

    const { data, error } = await service.rpc("notify_application_email", {
      p_job_id: jobId,
    });

    if (error || !data || typeof data !== "object") {
      if (error) console.error("[applications] could not decide:", error.message);
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
      jobs?: number;
    };

    if (!decision.send || !decision.event_id || !decision.to) return;

    const mail = applicationEmail({
      name: decision.name ?? "there",
      waiting: decision.waiting ?? 1,
      jobs: decision.jobs ?? 1,
      unsubscribeUrl: decision.user_id ? await unsubscribeUrl(decision.user_id) : null,
    });

    const result = await sendEmail({ to: decision.to, ...mail });
    const wasSkipped = result.ok && "skipped" in result;

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

    // The composed text, kept on the row. It carries nothing anybody typed, and
    // it is the only way this copy is ever read on a machine that cannot send.
    await service
      .from("email_events")
      .update({
        metadata: {
          waiting: decision.waiting ?? 1,
          jobs: decision.jobs ?? 1,
          subject: mail.subject,
          text: mail.text,
          ...(wasSkipped ? { skipped: (result as { skipped: string }).skipped } : {}),
        },
      })
      .eq("id", decision.event_id);

    if (!result.ok) console.error("[applications] send failed:", result.error);
  } catch (error) {
    console.error("[applications] unexpected:", error);
  }
}
