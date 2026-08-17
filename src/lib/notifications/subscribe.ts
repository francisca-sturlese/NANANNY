"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Turning on notifications, from the browser.
 *
 * Three things have to happen in order and any of them can fail for a reason
 * that is not our fault: the service worker registers, the person allows
 * notifications, and the browser hands us a subscription we can store. Each
 * returns a reason rather than a boolean, because "it did not work" is useless
 * to whoever has to explain it to a nanny on the phone.
 */

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "failed" };

/**
 * Whether asking is even possible here.
 *
 * On iOS the whole API is absent until the site is on the home screen, so
 * asking in Safari does nothing at all and looks like a broken button. The
 * install hint is what comes first there, and it says why.
 */
export function canAskForPush(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (typeof Notification === "undefined") return false;
  return true;
}

/** Already on, so nothing to ask. */
export function pushAlreadyOn(): boolean {
  return canAskForPush() && Notification.permission === "granted";
}

/** Refused before. Asking again does nothing: the browser will not prompt twice. */
export function pushRefused(): boolean {
  return canAskForPush() && Notification.permission === "denied";
}

/**
 * The bytes a browser wants for the application server key.
 *
 * The key travels as base64url because it has to fit in an environment
 * variable; `pushManager.subscribe` wants a Uint8Array. This is the conversion,
 * and it is the step that fails obscurely if the key has a stray newline in it.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const trimmed = base64.trim();
  const padding = "=".repeat((4 - (trimmed.length % 4)) % 4);
  const normalised = (trimmed + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  // Backed by a plain ArrayBuffer on purpose: `applicationServerKey` will not
  // take a view over a SharedArrayBuffer, and the default type is the union.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function subscribeToPush(publicKey: string): Promise<SubscribeResult> {
  if (!canAskForPush() || !publicKey) return { ok: false, reason: "unsupported" };

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // Asked here, and only from a tap. A permission prompt on page load is the
    // fastest way to a permanent no, and a permanent no cannot be undone from
    // inside the product.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: permission === "denied" ? "denied" : "failed" };
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        // Required by every browser that implements this: a push that arrives
        // without showing anything is not allowed, which is the right rule.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const json = subscription.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "failed" };
    }

    /**
     * Stored under her own session rather than through a server action.
     *
     * The row belongs to her, row level security says so, and the browser is
     * where the subscription exists. A server action would add a hop that can
     * only get it wrong.
     *
     * `endpoint` is unique, so the same phone subscribing again updates instead
     * of accumulating: somebody who turns this off and on twice should not
     * receive three copies of everything.
     */
    const supabase = createClient();

    // Written explicitly rather than left to a column default. The row is
    // useless without an owner, and a default that turns out not to exist fails
    // as a constraint violation at the one moment somebody is watching a
    // spinner.
    const { data: session } = await supabase.auth.getUser();
    if (!session.user) return { ok: false, reason: "failed" };

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: session.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 300),
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      console.error("[push] could not store the subscription:", error.message);
      return { ok: false, reason: "failed" };
    }

    return { ok: true };
  } catch (error) {
    console.error("[push] could not subscribe:", error);
    return { ok: false, reason: "failed" };
  }
}
