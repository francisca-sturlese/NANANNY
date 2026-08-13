import "server-only";

import type { NextRequest } from "next/server";

/**
 * The origin the browser actually used, taken from the request headers.
 *
 * `request.nextUrl.origin` is not that: it reflects the server's own idea of
 * its address. In dev it returns `http://localhost:3100` even for a request
 * that arrived on `http://127.0.0.1:3100`, and behind a reverse proxy it
 * returns the internal address rather than the public domain.
 *
 * Redirecting to the wrong origin silently breaks authentication: cookies are
 * scoped per host, so a session set on one host is simply absent on the other
 * and the user lands back on the login page having done everything right.
 *
 * Forwarded headers are only trusted for building a redirect back to the same
 * site — never as an authorization input.
 */
export function requestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (!host) return request.nextUrl.origin;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto =
    forwardedProto?.split(",")[0].trim() ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}
