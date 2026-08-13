import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { homeForRole, onboardingForRole } from "@/lib/auth/dal";
import { requestOrigin } from "@/lib/auth/request-origin";

/**
 * Landing point for every emailed auth link: signup confirmation, password
 * recovery, email change.
 *
 * Supabase can arrive here two ways, and both are handled:
 *
 *   ?code=…        PKCE. The default email template points at Supabase's own
 *                  /auth/v1/verify, which consumes the token and redirects
 *                  here with an authorization code to exchange.
 *   ?token_hash=…  The link went straight to the app, and the one-time hash is
 *                  verified here.
 *
 * Either way the exchange happens server-side, so no token ever reaches client
 * JavaScript or sits in a rendered page's URL where the Referer header could
 * carry it off-site.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // The host the browser used, not the one the server assumes — see
  // requestOrigin(). Redirecting to a different host drops the session cookie.
  const origin = requestOrigin(request);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  const failure = new URL("/verify-email?error=invalid_link", origin);
  const supabase = await createServerSupabase();

  let verified = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    verified = !error;
  }

  if (!verified) return NextResponse.redirect(failure);

  // Recovery links carry their own destination — the reset form.
  if (type === "recovery" || next?.includes("reset-password")) {
    const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/reset-password";
    return NextResponse.redirect(new URL(safeNext, origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(failure);

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "family";

  // Send them to onboarding if they have not finished it, otherwise home.
  if (role === "family" || role === "nanny") {
    const table = role === "nanny" ? "nanny_profiles" : "family_profiles";
    const { data: existingProfile } = await supabase
      .from(table)
      .select("onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingProfile?.onboarding_completed_at) {
      return NextResponse.redirect(new URL(onboardingForRole(role), origin));
    }
  }

  return NextResponse.redirect(new URL(homeForRole(role), origin));
}
