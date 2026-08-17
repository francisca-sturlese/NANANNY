/**
 * The service worker, which exists for one reason: web push.
 *
 * Not for offline caching. Caching a marketplace whose whole content is other
 * people's availability would show somebody a nanny who found a job last week,
 * and a stale answer to "who is available" is worse than no answer. If this
 * ever caches anything it will be the shell, deliberately, and not by drifting
 * into it.
 *
 * On iOS none of this runs until the site is on the home screen. That is not a
 * detail: it is why the install hint exists at all, and why the permission
 * prompt is only shown to somebody already running standalone.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close. There is
  // no old version whose behaviour we are protecting.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * A push arrives.
 *
 * The payload is built on the server from the same `describe()` the bell uses,
 * so the sentence on the phone and the sentence in the app are the same
 * sentence. If it ever arrives without one, something is wrong upstream and the
 * honest thing is a generic line rather than silence: a notification that says
 * nothing is still better than a person who was never told.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "NaNanny";
  const body = payload.body || "Something happened on your account.";
  const href = payload.href || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/maskable-192.png",
      // One notification per thing, replacing the previous one about the same
      // thing. Three buzzes about the same conversation is how somebody turns
      // these off.
      tag: payload.tag || href,
      renotify: false,
      data: { href },
    }),
  );
});

/**
 * She taps it.
 *
 * If the app is already open somewhere, that window is focused and moved rather
 * than a second one being opened: two tabs of the same product, one of them
 * behind, is how somebody replies in the wrong place.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const href = (event.notification.data && event.notification.data.href) || "/";
  const target = new URL(href, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            if ("navigate" in client) client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
