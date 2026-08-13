import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`. Same runtime, same matcher.
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

export async function proxy(request: NextRequest) {
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
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    // Role is unknown here on purpose — /account routes the user onward using
    // the role read from the database.
    url.pathname = "/account";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
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
