import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/**
 * Data Access Layer.
 *
 * Every authorization decision in the app goes through this file. Not through
 * layouts: with partial rendering a layout does not re-run on navigation, and
 * it cannot stop the segments below it from rendering either — so a check
 * there is not a gate, it is a suggestion.
 *
 * `proxy.ts` only does an optimistic cookie check to keep signed-out users off
 * private URLs. The real gate is here, next to the data, backed by RLS.
 */

export type UserRole = Database["public"]["Enums"]["user_role"];

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  status: Database["public"]["Enums"]["account_status"];
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  location: string | null;
  emailVerified: boolean;
};

/**
 * React.cache dedupes this across a single render pass, so a page, its nested
 * server components and its actions share one round trip.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabase();

  // getUser(), never getSession(): getSession() trusts whatever the cookie
  // claims without revalidating it, so it must never back an auth decision.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, role, status, first_name, last_name, phone, location")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    // The role comes from the database row, never from user metadata the
    // client could have influenced at signup.
    role: profile.role,
    status: profile.status,
    firstName: profile.first_name,
    lastName: profile.last_name,
    phone: profile.phone,
    location: profile.location,
    emailVerified: Boolean(user.email_confirmed_at),
  };
});

/** Requires a signed-in, non-suspended account. Redirects otherwise. */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSession();

  if (!user) {
    const target = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
    redirect(target);
  }

  if (user.status === "suspended") redirect("/account-suspended");

  return user;
}

/** Requires a specific role. A family cannot open a nanny route by URL. */
export async function requireRole(
  role: UserRole | UserRole[],
  nextPath?: string,
): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  const allowed = Array.isArray(role) ? role : [role];

  if (!allowed.includes(user.role)) {
    redirect(homeForRole(user.role));
  }

  return user;
}

export async function requireAdmin(nextPath?: string): Promise<SessionUser> {
  return requireRole(["admin", "super_admin"], nextPath);
}

/**
 * Requires a verified email address as well as a session. Used for anything
 * that creates real state — a profile, a job, a message.
 */
export async function requireVerifiedUser(nextPath?: string): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (!user.emailVerified) redirect("/verify-email");
  return user;
}

export function homeForRole(role: UserRole): string {
  switch (role) {
    case "nanny":
      return "/nanny";
    case "admin":
    case "super_admin":
      return "/admin";
    default:
      return "/family";
  }
}

export function onboardingForRole(role: UserRole): string {
  return role === "nanny" ? "/nanny/onboarding" : "/family/onboarding";
}
