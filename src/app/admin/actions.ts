"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/auth/actions";

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
    return { error: "A rejection needs a reason — the nanny sees it and acts on it." };
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
