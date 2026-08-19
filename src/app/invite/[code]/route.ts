import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * Where an invitation link lands.
 *
 * A route handler rather than a page, and not as a matter of taste: a cookie
 * can only be written from a route handler or a server action. Written during
 * a page render it throws, the redirect never happens, and the visitor sits on
 * a blank screen. The first version of this was a page, and the browser test
 * caught it by hanging on a link that never went anywhere.
 *
 * The code is remembered and the visitor is sent to the ordinary signup. It is
 * deliberately not a field on the form: Federico's standing rule is that
 * nothing new may be asked during registration, and an invite code is exactly
 * the sort of box that turns a shared link into an abandoned one.
 *
 * The cookie outlives the email confirmation round trip, which is the whole
 * reason it is a cookie: a family signs up, leaves for their inbox, and comes
 * back through a link we did not write.
 *
 * Nothing is granted here and nothing is recorded. The invitation is attached
 * only once there is an account to attach it to.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  // Validated to the shape the database mints rather than trusted: this value
  // arrives from a stranger's URL and is about to live in somebody's browser.
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  const response = NextResponse.redirect(absoluteUrl("/signup?role=family"));

  if (clean.length === 6) {
    response.cookies.set("nananny.ref", clean, {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: "lax",
      secure: absoluteUrl("/").startsWith("https"),
      path: "/",
    });
  }

  return response;
}
