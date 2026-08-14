"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { absoluteUrl } from "@/lib/seo/site";
import type { ActionState } from "@/lib/auth/actions";

/**
 * Inviting an administrator.
 *
 * The action is a thin shell: the authority lives in admin_invite_create,
 * which checks the caller is a super_admin, refuses emails that already have
 * an account, and writes the audit row. The email sent here carries no role
 * and no token with authority; the role is applied at signup, server side,
 * only when the registered address matches the invited one. If this email
 * never arrives, the invite still works: the person just needs to sign up
 * with the invited address.
 */
export async function createInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("super_admin", "/admin/invites");
  const supabase = await createServerSupabase();

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "admin");

  if (!email) return { fieldErrors: { email: "An email address is required" } };
  if (role !== "admin" && role !== "super_admin") {
    return { fieldErrors: { role: "Choose a role" } };
  }

  const { error } = await supabase.rpc("admin_invite_create", {
    p_email: email,
    p_role: role,
  });

  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  const roleLabel = role === "super_admin" ? "super admin" : "admin";
  await sendEmail({
    to: email.toLowerCase(),
    subject: "You are invited to the NaNanny team",
    text: [
      `You have been invited to help run NaNanny as ${roleLabel}.`,
      "",
      `Create your account at ${absoluteUrl("/signup")} using this exact email address: ${email.toLowerCase()}.`,
      "The role is attached to this address and is applied automatically when you sign up.",
      "",
      "The invitation lasts 7 days. If you were not expecting this, you can ignore it.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111111;">
        <h2 style="font-weight: 700;">You are invited to the NaNanny team</h2>
        <p>You have been invited to help run NaNanny as <strong>${roleLabel}</strong>.</p>
        <p>Create your account using this exact email address: <strong>${email.toLowerCase()}</strong>. The role is attached to the address and is applied automatically when you sign up.</p>
        <p style="margin: 28px 0;">
          <a href="${absoluteUrl("/signup")}"
             style="background: #111111; color: #ffffff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 700;">
            Create my account
          </a>
        </p>
        <p style="font-size: 13px; color: #555555;">The invitation lasts 7 days. If you were not expecting this, you can ignore this email.</p>
      </div>
    `,
  });

  revalidatePath("/admin/invites");
  return { message: `Invited ${email.toLowerCase()} as ${roleLabel}.` };
}

export async function revokeInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("super_admin", "/admin/invites");
  const supabase = await createServerSupabase();

  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) return { error: "Missing invite" };

  const { error } = await supabase.rpc("admin_invite_revoke", { p_invite_id: inviteId });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/admin/invites");
  return { message: "Invite revoked." };
}
