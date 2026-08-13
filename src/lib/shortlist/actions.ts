"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/dal";

/**
 * Shortlist.
 *
 * Saving is free and always will be — it must never touch
 * family_nanny_contacts. Only start_conversation() records a contact.
 */

export type SaveResult = { saved?: boolean; error?: string; needsAuth?: boolean };

const schema = z.object({
  nannyId: z.string().uuid(),
  stage: z.enum(["interested", "interview", "finalists", "hired"]).optional(),
});

export async function toggleSaveAction(
  _prev: SaveResult,
  formData: FormData,
): Promise<SaveResult> {
  const user = await getSession();

  // Anonymous browsing is deliberate, so this is a prompt to sign up rather
  // than a redirect that would lose the profile they were looking at.
  if (!user) return { needsAuth: true, error: "Create a free account to save profiles." };
  if (user.role !== "family") return { error: "Only families can save nanny profiles." };

  const parsed = schema.safeParse({ nannyId: formData.get("nannyId") });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();

  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) return { error: "Finish your family profile first." };

  const { data: existing } = await supabase
    .from("saved_profiles")
    .select("id")
    .eq("family_id", family.id)
    .eq("nanny_id", parsed.data.nannyId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("saved_profiles").delete().eq("id", existing.id);
    if (error) return { error: "Could not remove that. Please try again." };
    revalidatePath("/family/saved");
    revalidatePath("/nannies");
    return { saved: false };
  }

  const { error } = await supabase
    .from("saved_profiles")
    .insert({ family_id: family.id, nanny_id: parsed.data.nannyId });

  if (error) return { error: "Could not save that. Please try again." };

  revalidatePath("/family/saved");
  revalidatePath("/nannies");
  return { saved: true };
}

export async function moveShortlistStageAction(
  _prev: SaveResult,
  formData: FormData,
): Promise<SaveResult> {
  const user = await getSession();
  if (!user || user.role !== "family") return { error: "Not allowed." };

  const parsed = schema.safeParse({
    nannyId: formData.get("nannyId"),
    stage: formData.get("stage"),
  });
  if (!parsed.success || !parsed.data.stage) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) return { error: "No family profile." };

  // RLS also scopes this to the caller's own family; the filter is here so the
  // update cannot silently match nothing and look like a success.
  const { error } = await supabase
    .from("saved_profiles")
    .update({ stage: parsed.data.stage })
    .eq("family_id", family.id)
    .eq("nanny_id", parsed.data.nannyId);

  if (error) return { error: "Could not move that. Please try again." };

  revalidatePath("/family/saved");
  return { saved: true };
}

/** Which of these nannies the signed-in family has already saved. */
export async function loadSavedIds(nannyIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (nannyIds.length === 0) return out;

  const user = await getSession();
  if (!user || user.role !== "family") return out;

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) return out;

  const { data } = await supabase
    .from("saved_profiles")
    .select("nanny_id")
    .eq("family_id", family.id)
    .in("nanny_id", nannyIds);

  for (const row of data ?? []) out.add(row.nanny_id);
  return out;
}
