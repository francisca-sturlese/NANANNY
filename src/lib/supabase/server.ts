import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";

/**
 * Server client bound to the caller's session cookies. Still the anon key, so
 * RLS remains in force — this is how server components and route handlers read
 * data *as the signed-in user*, never as an escalated one.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled by the middleware instead.
          }
        },
      },
    },
  );
}

/**
 * The authenticated user plus their application role, in one call.
 *
 * Always uses getUser(), never getSession(): getSession() returns whatever the
 * cookie claims without revalidating it against the auth server, so it must
 * never be the basis of an authorization decision.
 */
export async function getCurrentUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, role, status, first_name, last_name, phone, location, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  return profile;
}
