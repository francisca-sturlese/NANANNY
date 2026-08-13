"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/auth/actions";

/**
 * Back-office actions.
 *
 * Every one of these calls a SECURITY DEFINER function that checks is_admin()
 * inside the database and writes to audit_logs. The requireAdmin() here is the
 * belt; the database check is the braces, and it holds even if this file is
 * bypassed entirely.
 */

/**
 * Minimal review queue actions: submitted → under_review → approved | rejected.
 *
 * The role check here is belt; the braces are that admin_set_nanny_status()
 * checks is_admin() itself inside the database, so this cannot be bypassed by
 * calling the RPC directly with a stolen anon key.
 */

const schema = z.object({
  nannyId: z.string().uuid(),
  status: z.enum(["under_review", "approved", "rejected", "suspended", "draft"]),
  reason: z.string().trim().max(1000).optional(),
});

export async function setNannyStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    nannyId: formData.get("nannyId"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) return { error: "Invalid request." };

  if (parsed.data.status === "rejected" && !parsed.data.reason) {
    return { error: "A rejection needs a reason. The nanny sees it and acts on it." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_set_nanny_status", {
    p_nanny_id: parsed.data.nannyId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? undefined,
  });

  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/admin");
  return { message: `Profile moved to ${parsed.data.status.replace("_", " ")}.` };
}


const userStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().max(1000).optional(),
});

export async function setUserStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = userStatusSchema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_user_id: parsed.data.userId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? undefined,
  });

  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/users");
  return {
    message:
      parsed.data.status === "suspended"
        ? "Account suspended. The profile is hidden from families."
        : "Account reactivated. A nanny profile goes back into the review queue.",
  };
}

const badgeSchema = z.object({
  nannyId: z.string().uuid(),
  badge: z.enum([
    "identity_verified",
    "documents_reviewed",
    "video_reviewed",
    "reference_provided",
    "first_aid_certificate",
    "driving_licence",
  ]),
  granted: z.enum(["true", "false"]),
});

export async function toggleBadgeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = badgeSchema.safeParse({
    nannyId: formData.get("nannyId"),
    badge: formData.get("badge"),
    granted: formData.get("granted"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const grant = parsed.data.granted === "true";

  const { error } = grant
    ? await supabase.rpc("admin_grant_badge", {
        p_nanny_id: parsed.data.nannyId,
        p_badge: parsed.data.badge,
      })
    : await supabase.rpc("admin_revoke_badge", {
        p_nanny_id: parsed.data.nannyId,
        p_badge: parsed.data.badge,
      });

  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/review");
  return { message: grant ? "Badge granted." : "Badge removed." };
}

const reportSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["under_review", "actioned", "dismissed"]),
  resolution: z.string().trim().max(2000).optional(),
});

export async function resolveReportAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = reportSchema.safeParse({
    reportId: formData.get("reportId"),
    status: formData.get("status"),
    resolution: formData.get("resolution") || undefined,
  });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_resolve_report", {
    p_report_id: parsed.data.reportId,
    p_status: parsed.data.status,
    p_resolution: parsed.data.resolution ?? undefined,
  });

  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/reports");
  return { message: "Report updated." };
}

const jobStatusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["draft", "active", "paused", "closed", "filled"]),
  reason: z.string().trim().max(1000).optional(),
});

export async function moderateJobAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = jobStatusSchema.safeParse({
    jobId: formData.get("jobId"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_set_job_status", {
    p_job_id: parsed.data.jobId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? undefined,
  });

  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/jobs");
  revalidatePath("/jobs");
  return { message: "Job updated." };
}

const pricingSchema = z.object({
  freeContacts: z.coerce.number().int().min(0).max(50),
  weeklyPrice: z.coerce.number().min(0).max(100000),
  monthlyPrice: z.coerce.number().min(0).max(100000),
  weeklyEnabled: z.coerce.boolean(),
  monthlyEnabled: z.coerce.boolean(),
  monthlyIsBestValue: z.coerce.boolean(),
});

export async function updatePricingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = pricingSchema.safeParse({
    freeContacts: formData.get("freeContacts"),
    weeklyPrice: formData.get("weeklyPrice"),
    monthlyPrice: formData.get("monthlyPrice"),
    weeklyEnabled: formData.get("weeklyEnabled") === "on",
    monthlyEnabled: formData.get("monthlyEnabled") === "on",
    monthlyIsBestValue: formData.get("monthlyIsBestValue") === "on",
  });
  if (!parsed.success) return { error: "Check the values and try again." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_update_pricing", {
    p_free_contacts: parsed.data.freeContacts,
    p_weekly_price: parsed.data.weeklyPrice,
    p_monthly_price: parsed.data.monthlyPrice,
    p_weekly_enabled: parsed.data.weeklyEnabled,
    p_monthly_enabled: parsed.data.monthlyEnabled,
    p_monthly_is_best_value: parsed.data.monthlyIsBestValue,
  });

  if (error) return { error: cleanMessage(error.message) };

  // Pricing appears on the marketing pages too, so they all need rebuilding.
  for (const path of ["/", "/pricing", "/admin/pricing", "/nannies", "/how-it-works", "/for-families"]) {
    revalidatePath(path);
  }

  return { message: "Pricing updated. It is live everywhere immediately." };
}

const noteSchema = z.object({
  subjectUserId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export async function addAdminNoteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = noteSchema.safeParse({
    subjectUserId: formData.get("subjectUserId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: "Write something first." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("admin_notes").insert({
    subject_user_id: parsed.data.subjectUserId,
    author_id: admin.id,
    body: parsed.data.body,
  });

  if (error) return { error: "Could not save the note." };

  revalidatePath("/admin/users");
  return { message: "Note saved." };
}

/** Postgres prefixes its messages; the operator only needs the sentence. */
function cleanMessage(message: string): string {
  return message.replace(/^.*?:\s*/, "");
}
