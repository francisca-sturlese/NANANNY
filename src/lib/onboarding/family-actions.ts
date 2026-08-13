"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/dal";
import { FAMILY_STEPS, nextSlug, stepIndex } from "@/lib/onboarding/steps";
import type { ActionState } from "@/lib/auth/actions";

/**
 * Family onboarding.
 *
 * Every step writes straight to the database, so nothing is held in browser
 * state waiting to be lost. Leaving halfway and coming back a week later
 * resumes exactly where it stopped.
 *
 * Each action re-checks the caller's role: a Server Action is a public endpoint,
 * and the wizard route guard is not a substitute for that.
 */

/** Creates the profile and its primary requirements row on first use. */
export async function ensureFamilyProfile(userId: string): Promise<string> {
  const supabase = await createServerSupabase();

  const { data: existing } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("family_profiles")
    .insert({ user_id: userId })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Could not create family profile: ${error?.message}`);
  }

  await supabase.from("family_requirements").insert({ family_id: created.id });

  return created.id;
}

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const aboutSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  displayName: z.string().trim().min(1, "Tell nannies what to call you").max(120),
  emirate: z.string().trim().min(1, "Choose your emirate"),
  area: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  description: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
});

const childrenSchema = z.object({
  childrenCount: z.coerce.number().int().min(0).max(12),
  // Ages arrive as parallel arrays from the repeated fields.
  ages: z.array(z.coerce.number().int().min(0).max(21)),
});

const careSchema = z.object({
  arrangement: z.enum(["live_in", "live_out", "either"]),
  employmentTypes: z.array(z.enum(["full_time", "part_time", "weekend", "night_care", "temporary"])).min(1, "Pick at least one"),
  workingDays: z.array(z.string()).min(1, "Pick at least one day"),
  startTime: z.preprocess(emptyToNull, z.string().nullable()),
  endTime: z.preprocess(emptyToNull, z.string().nullable()),
});

const requirementsSchema = z.object({
  salaryMin: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(100000).nullable()),
  salaryMax: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(100000).nullable()),
  languages: z.array(z.string()).min(1, "Pick at least one language"),
  requiredExperience: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(40).nullable()),
  careNeeds: z.array(z.enum(["newborn", "toddler", "school_age", "special_needs"])),
  skills: z.array(z.enum(["driving", "cooking", "housekeeping", "first_aid"])),
  hasPets: z.coerce.boolean(),
});

const finishingSchema = z.object({
  startDate: z.preprocess(emptyToNull, z.string().nullable()),
  additionalRequirements: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
});

export async function saveFamilyStep(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("family");
  const slug = String(formData.get("step") ?? "");
  const index = stepIndex(FAMILY_STEPS, slug);

  if (index < 0) return { error: "Unknown onboarding step." };

  const supabase = await createServerSupabase();
  const familyId = await ensureFamilyProfile(user.id);
  const saveOnly = formData.get("intent") === "save";

  try {
    switch (slug) {
      case "about": {
        const parsed = aboutSchema.safeParse({
          firstName: formData.get("firstName"),
          lastName: formData.get("lastName"),
          displayName: formData.get("displayName"),
          emirate: formData.get("emirate"),
          area: formData.get("area"),
          description: formData.get("description"),
        });
        if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

        await supabase
          .from("users")
          .update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName })
          .eq("id", user.id);

        await supabase
          .from("family_profiles")
          .update({
            display_name: parsed.data.displayName,
            emirate: parsed.data.emirate,
            area: parsed.data.area,
            description: parsed.data.description,
          })
          .eq("id", familyId);
        break;
      }

      case "children": {
        const parsed = childrenSchema.safeParse({
          childrenCount: formData.get("childrenCount"),
          ages: formData.getAll("childAge").filter((v) => String(v).trim() !== ""),
        });
        if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

        await supabase
          .from("family_profiles")
          .update({ children_count: parsed.data.childrenCount })
          .eq("id", familyId);

        // Replace wholesale: the form always submits the complete set, and a
        // partial merge would strand a child the family just removed.
        await supabase.from("family_children").delete().eq("family_id", familyId);
        if (parsed.data.ages.length > 0) {
          await supabase.from("family_children").insert(
            parsed.data.ages.map((age) => ({ family_id: familyId, age_years: age })),
          );
        }
        break;
      }

      case "care": {
        const parsed = careSchema.safeParse({
          arrangement: formData.get("arrangement"),
          employmentTypes: formData.getAll("employmentTypes"),
          workingDays: formData.getAll("workingDays"),
          startTime: formData.get("startTime"),
          endTime: formData.get("endTime"),
        });
        if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

        await supabase
          .from("family_requirements")
          .update({
            arrangement: parsed.data.arrangement,
            employment_types: parsed.data.employmentTypes,
            working_days: parsed.data.workingDays,
            working_hours_start: parsed.data.startTime,
            working_hours_end: parsed.data.endTime,
          })
          .eq("family_id", familyId)
          .eq("is_primary", true);
        break;
      }

      case "requirements": {
        const parsed = requirementsSchema.safeParse({
          salaryMin: formData.get("salaryMin"),
          salaryMax: formData.get("salaryMax"),
          languages: formData.getAll("languages"),
          requiredExperience: formData.get("requiredExperience"),
          careNeeds: formData.getAll("careNeeds"),
          skills: formData.getAll("skills"),
          hasPets: formData.get("hasPets") === "on",
        });
        if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

        const { salaryMin, salaryMax } = parsed.data;
        if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
          return { fieldErrors: { salaryMax: "Maximum must be at least the minimum" } };
        }

        const needs = parsed.data.careNeeds;
        const skills = parsed.data.skills;

        await supabase
          .from("family_requirements")
          .update({
            salary_min_aed: salaryMin,
            salary_max_aed: salaryMax,
            languages: parsed.data.languages,
            required_experience_years: parsed.data.requiredExperience,
            needs_newborn_care: needs.includes("newborn"),
            needs_toddler_care: needs.includes("toddler"),
            needs_school_age_care: needs.includes("school_age"),
            needs_special_needs_care: needs.includes("special_needs"),
            needs_driving: skills.includes("driving"),
            needs_cooking: skills.includes("cooking"),
            needs_housekeeping: skills.includes("housekeeping"),
            needs_first_aid: skills.includes("first_aid"),
            has_pets: parsed.data.hasPets,
          })
          .eq("family_id", familyId)
          .eq("is_primary", true);
        break;
      }

      case "finishing": {
        const parsed = finishingSchema.safeParse({
          startDate: formData.get("startDate"),
          additionalRequirements: formData.get("additionalRequirements"),
        });
        if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

        await supabase
          .from("family_requirements")
          .update({
            start_date: parsed.data.startDate,
            additional_requirements: parsed.data.additionalRequirements,
          })
          .eq("family_id", familyId)
          .eq("is_primary", true);
        break;
      }
    }
  } catch (error) {
    console.error("[family onboarding]", slug, error);
    return { error: "We could not save that. Please try again." };
  }

  // Only ever move the marker forward: revisiting step 1 must not reset the
  // resume point for someone who has already reached step 4.
  const { data: current } = await supabase
    .from("family_profiles")
    .select("onboarding_step")
    .eq("id", familyId)
    .single();

  const reached = Math.max(current?.onboarding_step ?? 0, index + 1);
  const isLast = index === FAMILY_STEPS.length - 1;

  await supabase
    .from("family_profiles")
    .update({
      onboarding_step: Math.min(reached, FAMILY_STEPS.length - 1),
      ...(isLast ? { onboarding_completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", familyId);

  revalidatePath("/family", "layout");

  if (saveOnly) redirect("/family");

  const next = nextSlug(FAMILY_STEPS, slug);
  redirect(next ? `/family/onboarding/${next}` : "/family?welcome=1");
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
