"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSession, homeForRole, onboardingForRole } from "@/lib/auth/dal";

/**
 * Auth mutations.
 *
 * Server Actions are public endpoints — anything reachable here is reachable by
 * a crafted POST. Each one validates its own input and re-checks its own
 * preconditions; none of them trusts a hidden field.
 */

export type ActionState = { error?: string; message?: string; fieldErrors?: Record<string, string> };

// Supabase enforces its own minimum; this is the product's.
const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "That password is too long");

const signUpSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  password,
  // Only these two are selectable. Admin accounts are never created by signup,
  // and the database trigger clamps anything else to 'family' regardless.
  role: z.enum(["family", "nanny"]),
});

async function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured;
  const host = (await headers()).get("host") ?? "127.0.0.1:3100";
  return `http://${host}`;
}

export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const { email, password: pwd, role, firstName, lastName, phone } = parsed.data;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.auth.signUp({
    email,
    password: pwd,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/confirm`,
      // Metadata seeds the profile row, but the role written to public.users is
      // decided by handle_new_auth_user(), which only accepts family or nanny.
      data: { role, first_name: firstName, last_name: lastName, phone: phone || null },
    },
  });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  // With confirmations on, Supabase returns a user but no session. It also
  // returns a user for an address that already exists, without saying so — by
  // design, so signup cannot be used to enumerate accounts. We show the same
  // message either way.
  if (data.user && !data.session) {
    redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  redirect(onboardingForRole(role));
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
    }
    // Deliberately does not distinguish "no such account" from "wrong
    // password": that difference is an account-enumeration oracle.
    return { error: "That email and password do not match." };
  }

  const user = await getSession();
  if (!user) return { error: "Could not load your account. Please try again." };

  // Only accept a relative path — an open redirect here would let a phishing
  // link bounce a freshly authenticated user to another site.
  const next = parsed.data.next;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  revalidatePath("/", "layout");
  redirect(safeNext ?? homeForRole(user.role));
}

export async function logoutAction() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

const emailOnly = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = emailOnly.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?type=recovery&next=/reset-password`,
  });

  // Always the same answer, whether or not the address exists.
  return {
    message:
      "If an account exists for that address, a reset link is on its way. Check your inbox.",
  };
}

export async function resendVerificationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = emailOnly.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await createServerSupabase();
  await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/confirm` },
  });

  return { message: "Verification email sent. It can take a minute to arrive." };
}

const newPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "The two passwords do not match",
    path: ["confirmPassword"],
  });

export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await createServerSupabase();

  // The recovery link established a session before this page rendered; without
  // one there is nothing to update, and we must not silently succeed.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "This reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: friendlyAuthError(error.message) };

  revalidatePath("/", "layout");
  redirect("/account?password_updated=1");
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function friendlyAuthError(message: string): string {
  if (/password/i.test(message) && /weak|short|characters/i.test(message)) {
    return "Choose a longer password — at least 10 characters.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  return "Something went wrong. Please try again.";
}
