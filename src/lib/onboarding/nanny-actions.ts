"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/dal";
import { NANNY_STEPS, nextSlug, stepIndex } from "@/lib/onboarding/steps";
import { ownedPath } from "@/lib/storage/private-assets";
import sharp from "sharp";
import type { ActionState } from "@/lib/auth/actions";

/**
 * Nanny onboarding.
 *
 * Same shape as the family wizard: each step writes through immediately, so
 * progress survives a closed tab. Uploads go to private buckets under the
 * nanny's own uuid — the storage policy pins the folder to auth.uid(), so a
 * forged path in the form cannot write anywhere else.
 */

export async function ensureNannyProfile(userId: string): Promise<string> {
  const supabase = await createServerSupabase();

  const { data: existing } = await supabase
    .from("nanny_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("nanny_profiles")
    .insert({ user_id: userId, status: "draft" })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Could not create nanny profile: ${error?.message}`);
  }

  return created.id;
}

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

const aboutSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  nationality: z.string().trim().min(1, "Choose your nationality"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  emirate: z.string().trim().min(1, "Choose where you are based"),
  area: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
});

const experienceSchema = z.object({
  yearsExperience: z.coerce.number().int().min(0, "Enter your years of experience").max(60),
  uaeExperience: z.coerce.number().int().min(0).max(60),
  ageGroups: z.array(z.enum(["newborn", "toddler", "school_age", "special_needs"])),
  previousExperience: z.preprocess(emptyToNull, z.string().trim().max(4000).nullable()),
});

const skillsSchema = z.object({
  languages: z.array(z.string()).min(1, "Pick at least one language"),
  englishLevel: z.enum(["none", "basic", "conversational", "fluent", "native"]),
  arabicLevel: z.enum(["none", "basic", "conversational", "fluent", "native"]),
  skills: z.array(z.enum(["driving", "cooking", "housekeeping", "pets", "first_aid"])),
  education: z.preprocess(emptyToNull, z.string().trim().max(200).nullable()),
  certificates: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []),
    z.array(z.string().max(120)),
  ),
});

const availabilitySchema = z.object({
  arrangement: z.enum(["live_in", "live_out", "either"]),
  employmentTypes: z
    .array(z.enum(["full_time", "part_time", "weekend", "night_care", "temporary"]))
    .min(1, "Pick at least one"),
  availableDays: z.array(z.string()),
  startTime: z.preprocess(emptyToNull, z.string().nullable()),
  endTime: z.preprocess(emptyToNull, z.string().nullable()),
  availableFrom: z.string().min(1, "Tell families when you can start"),
  salaryMin: z.coerce.number().int().min(0, "Enter an amount").max(100000),
  salaryMax: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(100000).nullable()),
  preferredLocations: z.array(z.string()),
});

const storySchema = z.object({
  headline: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  description: z
    .string()
    .trim()
    .min(80, "Families read this first. Write at least a couple of sentences (80 characters)")
    .max(4000),
});

export async function saveNannyStep(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("nanny");
  const slug = String(formData.get("step") ?? "");
  const index = stepIndex(NANNY_STEPS, slug);
  if (index < 0) return { error: "Unknown onboarding step." };

  const supabase = await createServerSupabase();
  const nannyId = await ensureNannyProfile(user.id);
  const saveOnly = formData.get("intent") === "save";

  try {
    switch (slug) {
      case "about": {
        const parsed = aboutSchema.safeParse({
          firstName: formData.get("firstName"),
          lastName: formData.get("lastName"),
          nationality: formData.get("nationality"),
          dateOfBirth: formData.get("dateOfBirth"),
          emirate: formData.get("emirate"),
          area: formData.get("area"),
        });
        if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

        // A nanny must be an adult. Checked server-side; a date input's `max`
        // attribute is a hint, not a constraint.
        const dob = new Date(parsed.data.dateOfBirth);
        const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
        if (!Number.isFinite(age) || age < 18) {
          return { fieldErrors: { dateOfBirth: "You must be 18 or older to join NaNanny" } };
        }
        if (age > 80) {
          return { fieldErrors: { dateOfBirth: "Please check that date" } };
        }

        const photoPath = await uploadIfPresent(
          formData.get("photo"),
          "nanny-photos",
          user.id,
          MAX_PHOTO_BYTES,
        );
        if (photoPath?.error) return { fieldErrors: { photo: photoPath.error } };

        await supabase
          .from("users")
          .update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName })
          .eq("id", user.id);

        await supabase
          .from("nanny_profiles")
          .update({
            first_name: parsed.data.firstName,
            nationality: parsed.data.nationality,
            date_of_birth: parsed.data.dateOfBirth,
            emirate: parsed.data.emirate,
            area: parsed.data.area,
            ...(photoPath?.path ? { photo_url: photoPath.path } : {}),
          })
          .eq("id", nannyId);
        break;
      }

      case "experience": {
        const parsed = experienceSchema.safeParse({
          yearsExperience: formData.get("yearsExperience"),
          uaeExperience: formData.get("uaeExperience") || 0,
          ageGroups: formData.getAll("ageGroups"),
          previousExperience: formData.get("previousExperience"),
        });
        if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

        if (parsed.data.uaeExperience > parsed.data.yearsExperience) {
          return {
            fieldErrors: {
              uaeExperience: "UAE experience cannot exceed your total experience",
            },
          };
        }

        const groups = parsed.data.ageGroups;
        await supabase
          .from("nanny_profiles")
          .update({
            years_experience: parsed.data.yearsExperience,
            uae_experience_years: parsed.data.uaeExperience,
            newborn_experience: groups.includes("newborn"),
            toddler_experience: groups.includes("toddler"),
            school_age_experience: groups.includes("school_age"),
            special_needs_experience: groups.includes("special_needs"),
            previous_experience: parsed.data.previousExperience
              ? [{ summary: parsed.data.previousExperience }]
              : [],
          })
          .eq("id", nannyId);
        break;
      }

      case "skills": {
        const parsed = skillsSchema.safeParse({
          languages: formData.getAll("languages"),
          englishLevel: formData.get("englishLevel"),
          arabicLevel: formData.get("arabicLevel"),
          skills: formData.getAll("skills"),
          education: formData.get("education"),
          certificates: formData.get("certificates"),
        });
        if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

        const skills = parsed.data.skills;
        await supabase
          .from("nanny_profiles")
          .update({
            languages: parsed.data.languages,
            english_level: parsed.data.englishLevel,
            arabic_level: parsed.data.arabicLevel,
            has_driving_licence: skills.includes("driving"),
            can_cook: skills.includes("cooking"),
            can_housekeep: skills.includes("housekeeping"),
            pet_experience: skills.includes("pets"),
            // Claiming a certificate is not the same as it being verified.
            // The First Aid Certificate badge is granted by an admin who has
            // actually seen the document (PRD §12).
            first_aid_certified: skills.includes("first_aid"),
            education: parsed.data.education,
            certificates: parsed.data.certificates,
          })
          .eq("id", nannyId);
        break;
      }

      case "availability": {
        const parsed = availabilitySchema.safeParse({
          arrangement: formData.get("arrangement"),
          employmentTypes: formData.getAll("employmentTypes"),
          availableDays: formData.getAll("availableDays"),
          startTime: formData.get("startTime"),
          endTime: formData.get("endTime"),
          availableFrom: formData.get("availableFrom"),
          salaryMin: formData.get("salaryMin"),
          salaryMax: formData.get("salaryMax"),
          preferredLocations: formData.getAll("preferredLocations"),
        });
        if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

        const { salaryMin, salaryMax } = parsed.data;
        if (salaryMax != null && salaryMax < salaryMin) {
          return { fieldErrors: { salaryMax: "Maximum must be at least the minimum" } };
        }

        await supabase
          .from("nanny_profiles")
          .update({
            arrangement: parsed.data.arrangement,
            employment_types: parsed.data.employmentTypes,
            available_days: parsed.data.availableDays,
            available_hours_start: parsed.data.startTime,
            available_hours_end: parsed.data.endTime,
            available_from: parsed.data.availableFrom,
            salary_expectation_min_aed: salaryMin,
            salary_expectation_max_aed: salaryMax,
            preferred_locations: parsed.data.preferredLocations,
          })
          .eq("id", nannyId);
        break;
      }

      case "story": {
        const parsed = storySchema.safeParse({
          headline: formData.get("headline"),
          description: formData.get("description"),
        });
        if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

        const video = await uploadIfPresent(
          formData.get("video"),
          "nanny-videos",
          user.id,
          MAX_VIDEO_BYTES,
        );
        if (video?.error) return { fieldErrors: { video: video.error } };

        await supabase
          .from("nanny_profiles")
          .update({
            headline: parsed.data.headline,
            description: parsed.data.description,
            ...(video?.path ? { video_url: video.path } : {}),
          })
          .eq("id", nannyId);
        break;
      }

      case "documents":
        // Files are uploaded by their own action as they are chosen, so there
        // is nothing to save when the step is submitted.
        break;

      case "review":
        // Nothing to save; submission is its own action.
        break;
    }
  } catch (error) {
    console.error("[nanny onboarding]", slug, error);
    return { error: "We could not save that. Please try again." };
  }

  const { data: current } = await supabase
    .from("nanny_profiles")
    .select("onboarding_step")
    .eq("id", nannyId)
    .single();

  await supabase
    .from("nanny_profiles")
    .update({
      onboarding_step: Math.min(
        Math.max(current?.onboarding_step ?? 0, index + 1),
        NANNY_STEPS.length - 1,
      ),
    })
    .eq("id", nannyId);

  revalidatePath("/nanny", "layout");

  if (saveOnly) redirect("/nanny");

  const next = nextSlug(NANNY_STEPS, slug);
  redirect(next ? `/nanny/onboarding/${next}` : "/nanny");
}

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

const documentSchema = z.object({
  kind: z.enum([
    "cv",
    "id",
    "passport",
    "visa",
    "certificate",
    "reference",
    "first_aid",
    "police_clearance",
    "other",
  ]),
  label: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
});

/**
 * Uploads one document.
 *
 * Documents are the most sensitive thing a nanny gives us, so they go to a
 * private bucket under her own uuid and are never shown to a family. Only she
 * and the review team can open them, and only through /media, which checks that
 * on every request.
 */
export async function uploadDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("nanny");
  const nannyId = await ensureNannyProfile(user.id);

  const parsed = documentSchema.safeParse({
    kind: formData.get("kind"),
    label: formData.get("label"),
  });
  if (!parsed.success) return { error: "Choose what the file is." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file first." };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { error: "That file is too large (max 15 MB)." };
  }

  // The bucket also enforces this, but a clear message beats a storage error.
  const allowed = ["application/pdf", "image/jpeg", "image/png"];
  if (!allowed.includes(file.type)) {
    return { error: "Upload a PDF, JPG or PNG." };
  }

  const supabase = await createServerSupabase();
  const path = ownedPath(user.id, file.name);

  const { error: uploadError } = await supabase.storage
    .from("nanny-documents")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[documents]", uploadError.message);
    return { error: "We could not upload that. Please try again." };
  }

  const { error } = await supabase.from("nanny_documents").insert({
    nanny_id: nannyId,
    kind: parsed.data.kind,
    label: parsed.data.label,
    storage_path: path,
    original_filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  });

  if (error) {
    // Do not leave an orphan file behind if the row failed.
    await supabase.storage.from("nanny-documents").remove([path]);
    return { error: "We could not save that. Please try again." };
  }

  revalidatePath("/nanny/onboarding/documents");
  revalidatePath("/nanny/profile");
  return { message: "Uploaded." };
}

export async function deleteDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("nanny");
  const documentId = String(formData.get("documentId") ?? "");
  if (!z.string().uuid().safeParse(documentId).success) return { error: "Invalid request." };

  const supabase = await createServerSupabase();

  // RLS scopes this to her own documents; reading the path first means the file
  // is removed too rather than being left behind in the bucket forever.
  const { data: document } = await supabase
    .from("nanny_documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (!document) return { error: "That file is already gone." };

  await supabase.storage.from("nanny-documents").remove([document.storage_path]);
  const { error } = await supabase.from("nanny_documents").delete().eq("id", documentId);

  if (error) return { error: "Could not remove that." };

  revalidatePath("/nanny/onboarding/documents");
  revalidatePath("/nanny/profile");
  return { message: "Removed." };
}

/**
 * Moves the profile into the review queue. The completeness gate lives in the
 * database function, not here — so it holds for any caller.
 */
export async function submitNannyProfileAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireRole("nanny");
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("submit_nanny_profile");

  if (error) {
    // INCM1 carries the human-readable list of what is still missing.
    return { error: error.message.replace(/^.*?:\s*/, "") };
  }

  revalidatePath("/nanny", "layout");
  redirect("/nanny?submitted=1");
}

async function uploadIfPresent(
  value: FormDataEntryValue | null,
  bucket: "nanny-photos" | "nanny-videos",
  userId: string,
  maxBytes: number,
): Promise<{ path?: string; error?: string } | null> {
  if (!(value instanceof File) || value.size === 0) return null;

  if (value.size > maxBytes) {
    return { error: `That file is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)` };
  }

  const supabase = await createServerSupabase();

  let body: File | Buffer = value;
  let contentType = value.type;
  let filename = value.name;

  // Photos are resized here, on upload, rather than on every read. A phone
  // camera produces 3–5 MB images, and a search page showing twelve cards
  // would otherwise pull tens of megabytes over mobile data. 800px is more
  // than the largest place a profile photo is ever displayed.
  if (bucket === "nanny-photos") {
    try {
      const resized = await sharp(Buffer.from(await value.arrayBuffer()))
        .rotate() // honour EXIF orientation before stripping it
        .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      body = resized;
      contentType = "image/webp";
      filename = filename.replace(/\.[^.]+$/, "") + ".webp";
    } catch (error) {
      // A photo we cannot decode is not a photo we should store.
      console.error("[upload] could not process image:", error);
      return { error: "We could not read that image. Try a JPG or PNG." };
    }
  }

  const path = ownedPath(userId, filename);

  // Uploaded through the user's own session, so the storage policy — not this
  // code — is what enforces that the folder belongs to them.
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: false,
  });

  if (error) {
    console.error("[upload]", bucket, error.message);
    return { error: "We could not upload that file. Please try again." };
  }

  return { path };
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
