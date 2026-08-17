import { buildPushPayload } from "@block65/webcrypto-web-push";
import { createServiceClient } from "@/lib/supabase/service";
import { describe, type NotificationRow } from "@/lib/notifications/copy";

/**
 * Sends one notification to its owner's phones.
 *
 * Called by the database itself: an AFTER INSERT trigger on notifications
 * posts here (through pg_net) the moment a row worth a vibration is born.
 * The text is built by the same describe() the bell uses, so the phone and
 * the bell can never say different things.
 *
 * Endpoints that answer 404 or 410 are dead subscriptions (browser
 * reinstalled, permission revoked) and are deleted on sight: pushing to a
 * corpse forever is how a send loop rots.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const vapid = {
    subject: process.env.VAPID_SUBJECT ?? "mailto:hello@nananny.com",
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  };
  if (!vapid.publicKey || !vapid.privateKey) {
    console.error("[push] VAPID keys missing; dispatch cannot run");
    return new Response("Not configured", { status: 500 });
  }

  let notificationId: string;
  try {
    const body = (await request.json()) as { notification_id?: string };
    if (!body.notification_id) throw new Error("missing id");
    notificationId = body.notification_id;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const service = createServiceClient();
  const { data: notification } = await service
    .from("notifications")
    .select("id, user_id, kind, href, metadata")
    .eq("id", notificationId)
    .maybeSingle();
  if (!notification) return Response.json({ sent: 0, reason: "notification not found" });

  // The generated types have not met push_subscriptions yet (they regrow
  // from the local stack); an untyped handle bridges until they do.
  type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any --
  // deliberate: the generated types regrow from the local stack and have not
  // met this table yet; the SubRow cast above keeps the reads honest.
  const pushSubs = (): any => (service as any).from("push_subscriptions");

  const { data: rawSubscriptions } = await pushSubs()
    .select("id, endpoint, p256dh, auth")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", notification.user_id);
  const subscriptions = (rawSubscriptions ?? []) as unknown as SubRow[];
  if (subscriptions.length === 0) {
    return Response.json({ sent: 0, reason: "no subscriptions" });
  }

  const text = describe(notification as unknown as NotificationRow);
  const payload = JSON.stringify({
    title: "NaNanny",
    body: text.text,
    href: text.href,
  });

  let sent = 0;
  let dead = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      const message = await buildPushPayload(
        { data: payload, options: { ttl: 24 * 3600, urgency: "normal" } },
        {
          endpoint: sub.endpoint,
          expirationTime: null,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        vapid,
      );
      const res = await fetch(sub.endpoint, message as unknown as RequestInit);

      if (res.ok || res.status === 201) {
        sent += 1;
        await pushSubs()
          .update({ last_success_at: new Date().toISOString(), failed_count: 0 })
          .eq("id", sub.id);
      } else if (res.status === 404 || res.status === 410) {
        dead += 1;
        await pushSubs().delete().eq("id", sub.id);
      } else {
        failed += 1;
        console.error("[push] endpoint refused:", res.status, await res.text());
        // A flag, not a counter: "has been failing lately" is all the row
        // needs to say for a cleanup pass to find it.
        await pushSubs().update({ failed_count: 1 }).eq("id", sub.id);
      }
    } catch (error) {
      failed += 1;
      console.error("[push] send failed:", error);
    }
  }

  return Response.json({ sent, dead, failed });
}
