"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSession } from "@/lib/auth/dal";

/**
 * Safety and support.
 *
 * Reporting resolves the account behind the reported thing inside the database,
 * because the person reporting knows the message they are looking at, not who
 * owns it, and an admin should not have to work that out by hand.
 */

export type SafetyState = { error?: string; message?: string };

const reportSchema = z.object({
  targetKind: z.enum(["profile", "message", "job", "review", "user"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(1).max(200),
  details: z.string().trim().max(4000).optional(),
});

export async function reportContentAction(
  _prev: SafetyState,
  formData: FormData,
): Promise<SafetyState> {
  const user = await getSession();
  if (!user) return { error: "Please log in to report something." };

  const parsed = reportSchema.safeParse({
    targetKind: formData.get("targetKind"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason"),
    details: formData.get("details") || undefined,
  });
  if (!parsed.success) return { error: "Choose a reason and try again." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("report_content", {
    p_target_kind: parsed.data.targetKind,
    p_target_id: parsed.data.targetId,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details ?? undefined,
  });

  if (error) {
    if (error.code === "RPT1" || error.code === "RPT2") {
      return { error: error.message.replace(/^.*?:\s*/, "") };
    }
    console.error("[safety] report failed:", error);
    return { error: "We could not send that report. Please try again." };
  }

  const result = data as { already_reported: boolean } | null;

  return {
    message: result?.already_reported
      ? "You have already reported this. Our team is looking at it."
      : "Thank you. Our team will review this. The person reported is not told who reported them.",
  };
}

const blockSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().max(1000).optional(),
});

export async function blockUserAction(
  _prev: SafetyState,
  formData: FormData,
): Promise<SafetyState> {
  const user = await getSession();
  if (!user) return { error: "Please log in." };

  const parsed = blockSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("block_user", {
    p_blocked_id: parsed.data.userId,
    p_reason: parsed.data.reason ?? undefined,
  });

  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  const result = data as { conversations_closed: number } | null;
  const base = user.role === "nanny" ? "/nanny/messages" : "/family/messages";
  revalidatePath(base, "layout");

  return {
    message:
      (result?.conversations_closed ?? 0) > 0
        ? "Blocked. Neither of you can send messages in that conversation now."
        : "Blocked. They cannot start a conversation with you.",
  };
}

const supportSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter an email we can reply to"),
  name: z.string().trim().max(120).optional(),
  category: z.enum(["account", "profile", "billing", "safety", "technical", "other"]),
  subject: z.string().trim().min(3, "Give it a short subject").max(200),
  message: z.string().trim().min(10, "Tell us a bit more so we can help").max(5000),
});

/**
 * Opens a support request.
 *
 * Works signed out on purpose: someone locked out of their account is exactly
 * the person who most needs to reach us. The service client is used only to
 * attach a user_id when we can identify them, so the queue can show history.
 */
export async function submitSupportRequestAction(
  _prev: SafetyState,
  formData: FormData,
): Promise<SafetyState> {
  const user = await getSession();

  const parsed = supportSchema.safeParse({
    email: formData.get("email") || user?.email,
    name: formData.get("name") || undefined,
    category: formData.get("category"),
    subject: formData.get("subject"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  // Written with the service client so a signed-out visitor can reach support
  // at all; the row records who they said they are, not who they claim to be.
  const supabase = createServiceClient();
  const { error } = await supabase.from("support_requests").insert({
    user_id: user?.id ?? null,
    contact_email: parsed.data.email,
    contact_name: parsed.data.name ?? [user?.firstName, user?.lastName].filter(Boolean).join(" ") ?? null,
    category: parsed.data.category,
    subject: parsed.data.subject,
    message: parsed.data.message,
  });

  if (error) {
    console.error("[support] could not open request:", error);
    return { error: "We could not send that. Please email support@nananny.ae instead." };
  }

  revalidatePath("/admin/support");

  return {
    message:
      "Thank you. We have your message and will reply to that address, usually within one working day.",
  };
}
