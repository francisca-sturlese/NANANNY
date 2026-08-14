import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { PRIVATE_PATH_PREFIXES } from "@/lib/security/headers";

/**
 * Next 16 renamed this file to `proxy.ts`, and `middleware.ts` is deprecated.
 * It is still called `middleware.ts` here because of the deployment target,
 * not by preference.
 *
 * `proxy.ts` runs on the Node runtime and refuses a `runtime` config outright:
 * setting it throws. OpenNext, which is what packages this app for Cloudflare
 * Workers, does not support a Node proxy and fails the build with "Node.js
 * middleware is not currently supported". The deprecated convention is the only
 * one that builds for Workers today.
 *
 * The code inside needs nothing from Node: it is @supabase/ssr, cookies and a
 * redirect. If Workers stops being the host, or OpenNext gains Node proxy
 * support, this goes back to `proxy.ts` with a rename of the file and the
 * exported function and nothing else.
 *
 * Two jobs only:
 *   1. Refresh the Supabase auth cookie so a session survives a page load.
 *   2. An OPTIMISTIC redirect of signed-out visitors away from private URLs.
 *
 * Job 2 is a convenience, not the gate. This runs on every request including
 * prefetches, so it must stay cheap: no database reads, no role lookups. The
 * authorization that actually matters happens in the DAL (`lib/auth/dal.ts`)
 * and in RLS. If this file were deleted the app would still be secure — just
 * uglier, with private pages redirecting a beat later.
 */

const PRIVATE_PREFIXES = ["/family", "/nanny", "/admin", "/account"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

/**
 * Keeps signed-in areas out of search results.
 *
 * Set here rather than only in next.config, because the rules there are
 * applied to rendered routes and are lost on a response this file produces.
 * On Cloudflare Workers that meant every private path answered a redirect with
 * no `X-Robots-Tag` at all, while the same paths carried it correctly under
 * `next start`. Setting it on the way out covers both.
 */
function markPrivate(response: NextResponse, path: string): NextResponse {
  if (PRIVATE_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes an expiring token and writes the new cookie onto `response`.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPrivate = PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const isAuthPage = AUTH_PAGES.includes(path);

  if (!user && isPrivate) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return markPrivate(NextResponse.redirect(url), path);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    // Role is unknown here on purpose — /account routes the user onward using
    // the role read from the database.
    url.pathname = "/account";
    url.search = "";
    return markPrivate(NextResponse.redirect(url), path);
  }

  return markPrivate(response, path);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Auth cookies still need
     * refreshing on public pages, so the matcher is broad rather than limited
     * to the private prefixes.
     */
    "/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
