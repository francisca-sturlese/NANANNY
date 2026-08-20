"use server";

import { revalidatePath } from "next/cache";
import { sendEmail, rejectionEmail } from "@/lib/email/send";
import { createServiceClient } from "@/lib/supabase/service";
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

  /**
   * A rejection is told, not only recorded.
   *
   * It used to write a notification inside the app and stop there, which
   * reaches a nanny only if she comes back on her own. One was rejected for a
   * photo that was not hers and still did not know two days later, which makes
   * the rejection a silence rather than a request.
   *
   * After the status write, never instead of it: a mail server having a bad
   * afternoon must not turn into a rejection that did not happen. If the send
   * fails the administrator is told, because a rejection she never hears about
   * is worse than one nobody sent.
   */
  let mailNote = "";
  if (parsed.data.status === "rejected") {
    const service = createServiceClient();
    const { data: nanny } = await service
      .from("nanny_profiles")
      .select("first_name, user_id")
      .eq("id", parsed.data.nannyId)
      .maybeSingle();

    const { data: account } = nanny?.user_id
      ? await service.from("users").select("email").eq("id", nanny.user_id).maybeSingle()
      : { data: null };

    if (account?.email) {
      const mail = rejectionEmail({
        name: nanny?.first_name,
        reason: parsed.data.reason ?? "",
      });
      const result = await sendEmail({ to: account.email, ...mail });
      const skipped = result.ok && "skipped" in result;

      /**
       * Recorded in the same register as every other send, so "what did she
       * actually receive" is answerable from one place. The key carries the
       * moment: a second rejection is a second thing to tell her, not a
       * duplicate of the first.
       */
      await service.from("email_events").insert({
        user_id: nanny?.user_id ?? null,
        email_type: "profile_rejected",
        recipient: account.email,
        subject: mail.subject,
        status: result.ok ? (skipped ? "skipped" : "sent") : "failed",
        error: result.ok ? null : result.error,
        idempotency_key: `profile_rejected:${parsed.data.nannyId}:${new Date().toISOString()}`,
        metadata: { subject: mail.subject, text: mail.text },
      });

      mailNote = result.ok
        ? skipped
          ? " She was not emailed: this machine cannot send."
          : " She has been emailed the reason."
        : ` She was NOT emailed: ${result.error}`;
    } else {
      mailNote = " She has no address on file, so nothing was emailed.";
    }
  }

  revalidatePath("/admin");
  return {
    message: `Profile moved to ${parsed.data.status.replace("_", " ")}.${mailNote}`,
  };
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

/**
 * Opening, moving or closing the launch window.
 *
 * Separate from the pricing form because it is a different decision with a
 * different blast radius: this one switches the paywall off for everybody.
 * Empty dates close it.
 */
const promoSchema = z.object({
  // Instants, converted in the browser. A datetime-local field submits a wall
  // clock string with no timezone, and parsing that here reads it in the
  // server's timezone rather than the one the person typing it was in.
  startsAt: z.string().trim(),
  endsAt: z.string().trim(),
  label: z.string().trim().max(80),
});

const referralSchema = z.object({
  enabled: z.boolean(),
  bonusContacts: z.coerce.number().int().min(0).max(10),
  bonusMax: z.coerce.number().int().min(0).max(100),
});

/**
 * The switch that starts giving free contacts away.
 *
 * Kept apart from the pricing form on purpose. Changing a price changes what
 * somebody pays; this changes how many people never reach the paywall at all,
 * and the two deserve separate deliberate presses.
 */
export async function updateReferralAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = referralSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    bonusContacts: formData.get("bonusContacts") ?? "1",
    bonusMax: formData.get("bonusMax") ?? "10",
  });
  if (!parsed.success) {
    return { error: "A reward is 0 to 10 contacts, and the ceiling is 0 to 100." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_update_referral", {
    p_enabled: parsed.data.enabled,
    p_bonus_contacts: parsed.data.bonusContacts,
    p_bonus_max: parsed.data.bonusMax,
  });
  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/referral");
  revalidatePath("/family");
  revalidatePath("/invite-a-family");
  return {
    message: parsed.data.enabled
      ? "Invitations are on. Both families get their extra contact once the invited one finishes setting up."
      : "Invitations are off. Links still work and still record who invited whom, and nothing is granted.",
  };
}

export async function updatePromoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = promoSchema.safeParse({
    startsAt: formData.get("startsAtIso") ?? "",
    endsAt: formData.get("endsAtIso") ?? "",
    label: formData.get("label") ?? "",
  });
  if (!parsed.success) return { error: "Check the dates and try again." };

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;

  if (startsAt && Number.isNaN(startsAt.getTime())) return { error: "That start date is not a date." };
  if (endsAt && Number.isNaN(endsAt.getTime())) return { error: "That end date is not a date." };

  // Half a window is never what anyone meant. Saving with one date blanked used
  // to wipe it and keep the other, which is how a running promotion lost its
  // start date without anybody being told.
  if (Boolean(startsAt) !== Boolean(endsAt)) {
    return {
      error:
        "Fill in both dates, or clear both to close the window. Saving with only one would leave it in a state nobody chose.",
    };
  }

  if (startsAt && endsAt && endsAt <= startsAt) {
    return { error: "The window has to end after it starts." };
  }

  const supabase = await createServerSupabase();
  // Nulls clear the window. The generated types declare the parameters as
  // required strings because the function has no defaults for them, so the cast
  // is what lets an empty form close the promotion.
  const { error } = await supabase.rpc("admin_set_promo", {
    p_starts_at: startsAt ? startsAt.toISOString() : (null as unknown as string),
    p_ends_at: endsAt ? endsAt.toISOString() : (null as unknown as string),
    p_label: parsed.data.label,
  });

  if (error) return { error: cleanMessage(error.message) };

  // The banner reads this on every page a family can reach.
  for (const path of ["/", "/pricing", "/admin/pricing", "/family", "/nannies"]) {
    revalidatePath(path);
  }

  return {
    message:
      startsAt || endsAt
        ? "Launch window saved. The banner and the paywall follow these dates."
        : "Launch window cleared. The paywall is back to normal.",
  };
}

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


const supportUpdateSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["open", "in_progress", "answered", "closed"]),
  internalNote: z.string().trim().max(4000).optional(),
});

export async function updateSupportRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = supportUpdateSchema.safeParse({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    internalNote: formData.get("internalNote") || undefined,
  });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_update_support_request", {
    p_request_id: parsed.data.requestId,
    p_status: parsed.data.status,
    p_internal_note: parsed.data.internalNote ?? undefined,
  });

  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/support");
  return { message: "Updated." };
}

const supportReplySchema = z.object({
  requestId: z.string().uuid(),
  reply: z.string().trim().min(1, "Write the reply first.").max(5000),
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Reply to a support request from the panel.
 *
 * The admin writes every word; nothing is composed for them. The mail goes to
 * the address on the request, the send is recorded in email_events like every
 * other mail this product sends, and the request moves to answered through the
 * same audited function the buttons use.
 */
export async function replySupportRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = supportReplySchema.safeParse({
    requestId: formData.get("requestId"),
    reply: formData.get("reply"),
  });
  if (!parsed.success) return { error: "Write the reply first." };

  const service = createServiceClient();
  const { data: request } = await service
    .from("support_requests")
    .select("id, user_id, contact_email, contact_name, subject")
    .eq("id", parsed.data.requestId)
    .maybeSingle();
  if (!request) return { error: "Request not found." };

  const subject = request.subject?.trim()
    ? `Re: ${request.subject.trim()}`
    : "Re: your message to NaNanny";
  const bodyText = `${parsed.data.reply}\n\nNaNanny Support\nsupport@nananny.com`;
  const bodyHtml = `<p>${escapeHtml(parsed.data.reply).replace(/\n/g, "<br>")}</p><p style="color:#666">NaNanny Support · support@nananny.com</p>`;

  const result = await sendEmail({
    to: request.contact_email,
    subject,
    html: bodyHtml,
    text: bodyText,
    replyTo: "support@nananny.com",
  });

  await service.from("email_events").insert({
    user_id: request.user_id,
    email_type: "support_reply",
    recipient: request.contact_email,
    subject,
    status: result.ok ? "sent" : "failed",
    provider: "resend",
    provider_message_id: result.ok ? result.id : null,
    error: result.ok ? null : ("error" in result ? String(result.error) : "skipped"),
    idempotency_key: `support_reply:${request.id}:${Date.now()}`,
    sent_at: result.ok ? new Date().toISOString() : null,
    metadata: { request_id: request.id },
  });

  if (!result.ok) {
    return { error: "The email could not be sent. Nothing was marked answered." };
  }

  const supabase = await createServerSupabase();
  await supabase.rpc("admin_update_support_request", {
    p_request_id: request.id,
    p_status: "answered",
  });

  revalidatePath("/admin/support");
  return { message: `Reply sent to ${request.contact_email}.` };
}

/**
 * Mark a support request as spam.
 *
 * "Disappear" here means: out of Needs a reply, out of the badge, out of every
 * view except the Sales archive, which exists for exactly one reason — the
 * failure that matters is not letting a pitch through, it is hiding a real
 * person, and that is only discoverable while the message still exists
 * somewhere. Nothing is deleted; it is filed where nobody has to look.
 */
export async function markSupportSpamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const requestId = z.string().uuid().safeParse(formData.get("requestId"));
  if (!requestId.success) return { error: "Invalid request." };

  const service = createServiceClient();
  const { error: categoryError } = await service
    .from("support_requests")
    .update({ category: "sales" })
    .eq("id", requestId.data);
  if (categoryError) return { error: cleanMessage(categoryError.message) };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_update_support_request", {
    p_request_id: requestId.data,
    p_status: "closed",
    p_internal_note: "Marked as spam from the panel.",
  });
  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/support");
  return { message: "Filed as spam." };
}

const blogPostSchema = z.object({
  postId: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug: lowercase words joined by hyphens.")
    .min(3)
    .max(80),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(300),
  body: z.string().max(50000),
  published: z.coerce.boolean(),
});

export async function saveBlogPostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = blogPostSchema.safeParse({
    postId: formData.get("postId") || undefined,
    slug: formData.get("slug"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    body: formData.get("body") ?? "",
    published: formData.get("published") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the fields." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_save_blog_post", {
    // Absent rather than null when the post is new: the function's default is
    // what decides between an insert and an update.
    p_id: parsed.data.postId ?? undefined,
    p_slug: parsed.data.slug,
    p_title: parsed.data.title,
    p_description: parsed.data.description,
    p_body: parsed.data.body,
    p_published: parsed.data.published,
  });
  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  return {
    message: parsed.data.published ? "Published." : "Saved as a draft.",
  };
}

export async function toggleCodePostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = z
    .object({
      slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      hidden: z.enum(["true", "false"]),
    })
    .safeParse({ slug: formData.get("slug"), hidden: formData.get("hidden") });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_set_code_post_hidden", {
    p_slug: parsed.data.slug,
    p_hidden: parsed.data.hidden === "true",
  });
  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  return {
    message: parsed.data.hidden === "true" ? "Hidden from the blog." : "Visible again.",
  };
}

export async function deleteBlogPostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const postId = z.string().uuid().safeParse(formData.get("postId"));
  if (!postId.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_delete_blog_post", {
    p_id: postId.data,
  });
  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  return { message: "Deleted." };
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

const remindersSchema = z.object({
  audience: z.enum(["paying", "everyone", "off"]),
  nudgeAfterHours: z.coerce.number().int().min(1).max(24 * 30),
  unreadAfterHours: z.coerce.number().int().min(1).max(24 * 30),
  minGapHours: z.coerce.number().int().min(1).max(24 * 90),
});

/**
 * When the reminders go out, and to whom.
 *
 * Every bound here is deliberately wide. Nobody knows yet whether "a long time"
 * is four hours or three days, and the point of putting these in a row rather
 * than in code is that finding out does not need a deploy.
 *
 * The gap is the one that matters. Everything else decides whether an email is
 * useful; the gap decides whether we are a product or a nuisance, and it is the
 * number somebody will be tempted to lower on a quiet week.
 */
export async function updateRemindersAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = remindersSchema.safeParse({
    audience: formData.get("audience"),
    nudgeAfterHours: formData.get("nudgeAfterHours"),
    unreadAfterHours: formData.get("unreadAfterHours"),
    minGapHours: formData.get("minGapHours"),
  });

  if (!parsed.success) {
    return { error: "Check the numbers. Hours have to be whole and at least one." };
  }

  if (parsed.data.minGapHours < parsed.data.unreadAfterHours) {
    return {
      error:
        "The gap between reminders has to be at least as long as the wait before the first one. A shorter gap means somebody can be written to again before the reason for the first email has changed.",
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_update_reminders", {
    p_audience: parsed.data.audience,
    p_nudge_after_hours: parsed.data.nudgeAfterHours,
    p_unread_after_hours: parsed.data.unreadAfterHours,
    p_min_gap_hours: parsed.data.minGapHours,
  });

  if (error) return { error: cleanMessage(error.message) };

  revalidatePath("/admin/reminders");

  return {
    message:
      parsed.data.audience === "off"
        ? "Saved. No reminders will be sent to anybody."
        : "Saved. The next scheduled run uses these.",
  };
}
