"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/dal";
import type { ActionState } from "@/lib/auth/actions";
import { DISCOVERABLE_STATUSES } from "@/lib/nanny/discoverable";

/**
 * Job posts and applications.
 *
 * One rule runs through all of it: a nanny applying to a job must never consume
 * a family's free contact. Applications live in their own table and touch
 * family_nanny_contacts nowhere — only start_conversation() records a contact,
 * and only a family can call it.
 */

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const jobSchema = z.object({
  title: z.string().trim().min(4, "Give the job a title").max(140),
  emirate: z.string().trim().min(1, "Choose an emirate"),
  area: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  arrangement: z.enum(["live_in", "live_out", "either"]),
  employmentType: z.enum(["full_time", "part_time", "weekend", "night_care", "temporary"]),
  startDate: z.preprocess(emptyToNull, z.string().nullable()),
  workingDays: z.array(z.string()),
  startTime: z.preprocess(emptyToNull, z.string().nullable()),
  endTime: z.preprocess(emptyToNull, z.string().nullable()),
  salaryMin: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(100000).nullable()),
  salaryMax: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(100000).nullable()),
  childrenCount: z.coerce.number().int().min(0).max(12),
  responsibilities: z
    .string()
    .trim()
    .min(30, "Describe the day to day, at least a couple of sentences")
    .max(4000),
  requiredExperience: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(40).nullable()),
  requiredLanguages: z.array(z.string()),
  skills: z.array(z.enum(["driving", "cooking", "housekeeping"])),
  hasPets: z.coerce.boolean(),
  additionalInformation: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
  status: z.enum(["draft", "active"]),
});

export async function saveJobAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("family");
  const jobId = String(formData.get("jobId") ?? "") || null;

  const parsed = jobSchema.safeParse({
    title: formData.get("title"),
    emirate: formData.get("emirate"),
    area: formData.get("area"),
    arrangement: formData.get("arrangement"),
    employmentType: formData.get("employmentType"),
    startDate: formData.get("startDate"),
    workingDays: formData.getAll("workingDays"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    salaryMin: formData.get("salaryMin"),
    salaryMax: formData.get("salaryMax"),
    childrenCount: formData.get("childrenCount") || 0,
    responsibilities: formData.get("responsibilities"),
    requiredExperience: formData.get("requiredExperience"),
    requiredLanguages: formData.getAll("requiredLanguages"),
    skills: formData.getAll("skills"),
    hasPets: formData.get("hasPets") === "on",
    additionalInformation: formData.get("additionalInformation"),
    status: formData.get("intent") === "publish" ? "active" : "draft",
  });

  if (!parsed.success) {
    const out: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!out[key]) out[key] = issue.message;
    }
    return { fieldErrors: out };
  }

  const d = parsed.data;
  if (d.salaryMin != null && d.salaryMax != null && d.salaryMin > d.salaryMax) {
    return { fieldErrors: { salaryMax: "Maximum must be at least the minimum" } };
  }

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!family) return { error: "Finish your family profile first." };

  const row = {
    family_id: family.id,
    title: d.title,
    emirate: d.emirate,
    area: d.area,
    arrangement: d.arrangement,
    employment_type: d.employmentType,
    start_date: d.startDate,
    working_days: d.workingDays,
    working_hours_start: d.startTime,
    working_hours_end: d.endTime,
    salary_min_aed: d.salaryMin,
    salary_max_aed: d.salaryMax,
    children_count: d.childrenCount,
    responsibilities: d.responsibilities,
    required_experience_years: d.requiredExperience,
    required_languages: d.requiredLanguages,
    driving_required: d.skills.includes("driving"),
    cooking_required: d.skills.includes("cooking"),
    housekeeping_required: d.skills.includes("housekeeping"),
    has_pets: d.hasPets,
    additional_information: d.additionalInformation,
    status: d.status,
    published_at: d.status === "active" ? new Date().toISOString() : null,
  };

  if (jobId) {
    // The family_id filter matters: RLS would also block it, but without this
    // an update aimed at someone else's job would report success on zero rows.
    const { error } = await supabase
      .from("jobs")
      .update(row)
      .eq("id", jobId)
      .eq("family_id", family.id);
    if (error) return { error: "Could not save the job. Please try again." };
  } else {
    const { error } = await supabase.from("jobs").insert(row);
    if (error) return { error: "Could not create the job. Please try again." };
  }

  revalidatePath("/family/jobs");
  revalidatePath("/jobs");
  redirect(d.status === "active" ? "/family/jobs?published=1" : "/family/jobs");
}

const statusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["draft", "active", "paused", "closed", "filled"]),
});

export async function setJobStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("family");
  const parsed = statusSchema.safeParse({
    jobId: formData.get("jobId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { data: family } = await supabase
    .from("family_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!family) return { error: "No family profile." };

  const { error } = await supabase
    .from("jobs")
    .update({
      status: parsed.data.status,
      published_at: parsed.data.status === "active" ? new Date().toISOString() : undefined,
    })
    .eq("id", parsed.data.jobId)
    .eq("family_id", family.id);

  if (error) return { error: "Could not update the job." };

  revalidatePath("/family/jobs");
  revalidatePath("/jobs");
  return { message: `Job ${parsed.data.status}.` };
}

/**
 * A nanny applies to a job.
 *
 * Deliberately does NOT create a conversation or a contact row. The family
 * decides whether to open a conversation, and that is the moment a contact is
 * spent — never this one.
 */
export async function applyToJobAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("nanny");
  const jobId = String(formData.get("jobId") ?? "");
  const note = String(formData.get("coverNote") ?? "").trim().slice(0, 2000);

  if (!z.string().uuid().safeParse(jobId).success) return { error: "Invalid job." };

  const supabase = await createServerSupabase();

  const { data: nanny } = await supabase
    .from("nanny_profiles")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!nanny) return { error: "Complete your profile first." };
  // Discoverable, not approved. Being findable and being able to apply are the
  // same question from where she is standing, and letting her be seen while
  // refusing her the button is the dead end this was meant to remove. The
  // family sees "not reviewed yet" on her application.
  if (!DISCOVERABLE_STATUSES.includes(nanny.status as never)) {
    return {
      error:
        "Finish your profile before applying. Families need something to read.",
    };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (!job || job.status !== "active") {
    return { error: "This job is no longer accepting applications." };
  }

  const { error } = await supabase
    .from("job_applications")
    .insert({ job_id: jobId, nanny_id: nanny.id, cover_note: note || null });

  if (error) {
    // The unique (job_id, nanny_id) constraint is what makes this idempotent.
    if (error.code === "23505") return { message: "You have already applied to this job." };
    return { error: "Could not send your application. Please try again." };
  }

  revalidatePath("/nanny/applications");
  revalidatePath(`/jobs/${jobId}`);
  return { message: "Application sent." };
}

export async function withdrawApplicationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("nanny");
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!z.string().uuid().safeParse(applicationId).success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();
  const { data: nanny } = await supabase
    .from("nanny_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!nanny) return { error: "No profile." };

  const { error } = await supabase
    .from("job_applications")
    .update({ status: "withdrawn", status_changed_at: new Date().toISOString() })
    .eq("id", applicationId)
    .eq("nanny_id", nanny.id);

  if (error) return { error: "Could not withdraw." };

  revalidatePath("/nanny/applications");
  return { message: "Application withdrawn." };
}

const applicationStatusSchema = z.object({
  applicationId: z.string().uuid(),
  status: z.enum(["viewed", "shortlisted", "interview", "rejected", "hired"]),
});

/** A family moves an application through its stages. */
export async function setApplicationStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Called for its authorization check; the returned user is not needed here.
  await requireRole("family");
  const parsed = applicationStatusSchema.safeParse({
    applicationId: formData.get("applicationId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();

  // RLS allows a family to update only applications on its own jobs.
  const { error } = await supabase
    .from("job_applications")
    .update({
      status: parsed.data.status,
      status_changed_at: new Date().toISOString(),
      viewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.applicationId);

  if (error) return { error: "Could not update the application." };

  revalidatePath("/family/jobs");
  return { message: "Updated." };
}
