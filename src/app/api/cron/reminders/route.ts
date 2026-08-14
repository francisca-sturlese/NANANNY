import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, reminderEmail } from "@/lib/email/send";

/**
 * Sends the reminders that are due.
 *
 * A route rather than a database job, because the templates and the mail
 * provider live here and duplicating either into SQL would mean two places to
 * change one sentence. Whatever calls it is somebody else's decision: pg_cron
 * with pg_net, a Cloudflare cron trigger, or a person with curl. It is
 * idempotent, so calling it twice is harmless and calling it too often just
 * finds nothing to do.
 *
 * Guarded by a shared secret. Without one it is an unauthenticated endpoint
 * that makes us send mail on demand, and the URL is guessable.
 */

export const dynamic = "force-dynamic";

/** One run will not send more than this, so a backlog cannot become a flood. */
const BATCH = 100;

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("[cron] CRON_SECRET is not set. Refusing to run.");
    return new Response("Not configured", { status: 503 });
  }

  // Compared in full rather than with an early exit on the first wrong byte.
  // The difference is small here, but a timing side channel on a shared secret
  // is not a thing to leave behind on purpose.
  const offered = request.headers.get("authorization") ?? "";
  if (!safeEqual(offered, `Bearer ${secret}`)) {
    return new Response("No", { status: 401 });
  }

  const service = createServiceClient();

  const { data, error } = await service.rpc("due_reminders", { p_limit: BATCH });
  if (error) {
    console.error("[cron] could not list reminders:", error.message);
    return new Response("Could not list reminders", { status: 500 });
  }

  const due = (data ?? []) as {
    user_id: string;
    email: string;
    name: string;
    reason: "unread" | "nudge_family" | "nudge_nanny";
    conversations: number;
    messages: number;
    dedupe_key: string;
  }[];

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const person of due) {
    // Claimed before sending. Two schedulers firing at once is ordinary, and a
    // duplicate reminder is the exact annoyance this feature exists to avoid.
    const { data: claimId } = await service.rpc("claim_reminder", {
      p_user_id: person.user_id,
      p_email: person.email,
      p_reason: person.reason,
      p_dedupe_key: person.dedupe_key,
    });

    if (!claimId) {
      skipped += 1;
      continue;
    }

    const mail = reminderEmail({
      name: person.name,
      reason: person.reason,
      conversations: person.conversations,
      messages: person.messages,
    });

    const result = await sendEmail({ to: person.email, ...mail });

    await service.rpc("record_email_result", {
      p_event_id: claimId as string,
      p_status: result.ok ? "sent" : "failed",
      p_provider_message_id: (result.ok ? result.id : null) ?? undefined,
      p_error: result.ok ? undefined : result.error,
    });

    if (result.ok) sent += 1;
    else failed += 1;
  }

  return Response.json({ due: due.length, sent, skipped, failed });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i += 1) {
    different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return different === 0;
}
