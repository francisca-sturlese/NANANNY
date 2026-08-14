/**
 * Response headers, in one place.
 *
 * Imported by next.config.ts, so it must stay free of app imports and of
 * anything that only exists at request time.
 *
 * ## About the Content Security Policy
 *
 * This policy allows `'unsafe-inline'` for scripts, which is a real weakening
 * and is a deliberate choice rather than an oversight. The strict alternative
 * is a per-request nonce, and Next only applies a nonce to a page it renders
 * dynamically: adopting it turns every static page into a server render and
 * removes CDN caching. On the free Cloudflare Workers plan, where the budget is
 * 10 ms of CPU per request, that cost is paid on every visit to pages that have
 * no business being dynamic at all.
 *
 * What makes the trade defensible here, and what would make it indefensible if
 * it changed:
 *
 *   - React escapes everything it renders, and this codebase contains no
 *     `dangerouslySetInnerHTML` at all. The usual route from user text to
 *     executed script does not exist.
 *   - There are no third-party scripts. Nothing analytics, nothing embedded.
 *   - `connect-src` is pinned to this origin and Supabase, so even a script
 *     that did run would have nowhere to send what it stole.
 *
 * Add a third-party script, or render user content as HTML, and this policy
 * must be revisited before that lands. `scripts/security-check.mjs` fails if
 * `dangerouslySetInnerHTML` appears anywhere in `src/`, so the assumption is
 * checked rather than remembered.
 */

/**
 * Whether this deployment is actually served over https.
 *
 * Read from the site URL rather than from NODE_ENV, because the two are not
 * the same question. The browser suites run against a production build on
 * http://127.0.0.1, where NODE_ENV is "production" and https does not exist.
 *
 * Getting this wrong is not subtle: `upgrade-insecure-requests` rewrote every
 * script URL to https, WebKit failed the TLS handshake against the local
 * server, and the whole app stopped loading its own JavaScript.
 */
export function isSecureOrigin(): boolean {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
}

/** Supabase, read from the environment because it differs per deployment. */
function supabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function contentSecurityPolicy(isDev: boolean): string {
  const supabase = supabaseOrigin();
  // Realtime uses a websocket on the same host.
  const supabaseSocket = supabase.replace(/^http/, "ws");

  return [
    "default-src 'self'",
    // 'unsafe-eval' is React rebuilding server stacks for the dev overlay.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind ships a stylesheet, but Next inlines critical CSS and several
    // components set a width or a transform through the style attribute.
    "style-src 'self' 'unsafe-inline'",
    // blob: and data: are the crop preview before a photo is uploaded.
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "media-src 'self' blob:",
    [`connect-src 'self'`, supabase, supabaseSocket].filter(Boolean).join(" "),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // Nothing here needs a plugin, an iframe, or a different base.
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    // A form on this site may only post to this site. Cheap defence against a
    // page injected to harvest a password.
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only where https exists to be upgraded to.
    ...(isSecureOrigin() ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/**
 * Headers every response carries.
 *
 * HSTS goes out only from an https origin. A browser ignores it over plain
 * http, so sending it locally would be harmless rather than dangerous, but
 * sending a header that cannot apply invites someone to copy it somewhere it
 * would.
 */
export function securityHeaders(isDev: boolean): { key: string; value: string }[] {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
    // Redundant next to frame-ancestors, kept for browsers that predate it.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Send the full URL within the site, only the origin when leaving it, and
    // nothing at all when downgrading to http.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // This product asks for none of these. Saying so stops an embedded frame
    // from asking on our behalf.
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "interest-cohort=()",
      ].join(", "),
    },
    { key: "X-DNS-Prefetch-Control", value: "on" },
    // Keeps a window we open from reaching back into this one.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];

  if (isSecureOrigin()) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}

/**
 * Paths a search engine must never index.
 *
 * Kept as prefixes rather than a regex so `robots.ts` and the header rule below
 * cannot drift apart. `/media` matters most: those are passports and visas, and
 * a crawler that reached one would be refused, but the URL itself is not
 * something to publish.
 */
export const PRIVATE_PATH_PREFIXES = [
  "/family",
  "/nanny",
  "/admin",
  "/account",
  "/media",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];
