import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, reminderEmail } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";

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
  // Composed but not handed to a provider: no mail key here, or a local build.
  let skipped = 0;
  // Somebody else had already claimed it. A different thing from skipped, and
  // they were the same counter until both could happen in one run.
  let claimedElsewhere = 0;
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
      claimedElsewhere += 1;
      continue;
    }

    /**
     * What she still needs, read at the moment of writing to her.
     *
     * Asked here rather than returned by `due_reminders`, so the list cannot be
     * stale by the time the email is composed, and so the database's own idea
     * of required stays the only one. Costs one read per nanny in a batch that
     * is capped at a hundred, and only for the nudge that needs it.
     */
    const missing =
      person.reason === "nudge_nanny" ? await missingFieldsFor(service, person.user_id) : [];

    const mail = reminderEmail({
      name: person.name,
      reason: person.reason,
      conversations: person.conversations,
      messages: person.messages,
      missing,
      unsubscribeUrl: await unsubscribeUrl(person.user_id),
    });

    const result = await sendEmail({ to: person.email, ...mail });
    const wasSkipped = result.ok && "skipped" in result;

    /**
     * What was composed, kept on the row.
     *
     * These emails carry nothing a user typed, by design, so storing the text
     * leaks nothing and answers "what exactly did she get" without asking the
     * provider. It is also the only way to see one at all on a machine with no
     * mail key, which until now meant this copy had never been read by anybody
     * before it went to a real person.
     */
    await service.rpc("record_email_result", {
      p_event_id: claimId as string,
      p_status: result.ok ? (wasSkipped ? "skipped" : "sent") : "failed",
      p_provider_message_id: (result.ok ? result.id : null) ?? undefined,
      p_error: result.ok ? undefined : result.error,
    });

    await service
      .from("email_events")
      .update({
        metadata: {
          reason: person.reason,
          subject: mail.subject,
          text: mail.text,
          ...(wasSkipped ? { skipped: (result as { skipped: string }).skipped } : {}),
        },
      })
      .eq("id", claimId as string);

    if (!result.ok) failed += 1;
    else if (wasSkipped) skipped += 1;
    else sent += 1;
  }

  return Response.json({ due: due.length, sent, skipped, claimedElsewhere, failed });
}

/**
 * The required fields a nanny still has to fill in.
 *
 * Empty when she has no profile row at all, which is the larger group: somebody
 * who never opened the onboarding has nothing missing in the sense this means,
 * she has not started. The generic sentence is right for her.
 */
async function missingFieldsFor(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<string[]> {
  try {
    const { data: profile } = await service
      .from("nanny_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) return [];

    const { data } = await service.rpc("nanny_profile_completion", { p_nanny_id: profile.id });
    const completion = data as { required_missing?: string[] } | null;
    return Array.isArray(completion?.required_missing) ? completion.required_missing : [];
  } catch {
    // A reminder without the list is still a reminder.
    return [];
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i += 1) {
    different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return different === 0;
}
