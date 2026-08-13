"use client";

import { useActionState } from "react";
import Image from "next/image";
import { saveNannyStep } from "@/lib/onboarding/nanny-actions";
import type { ActionState } from "@/lib/auth/actions";
import { StepNav } from "@/components/onboarding/shell";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ChoiceCard, ChoiceGroup, PillCheckbox, PillGroup } from "@/components/ui/choice";
import { FormError } from "@/components/auth/form-parts";
import {
  AREAS,
  EMIRATES,
  EMPLOYMENT_TYPES,
  LANGUAGES,
  NATIONALITIES,
  WORKING_DAYS,
} from "@/lib/uae";

const LEVELS = [
  { value: "none", label: "Not at all" },
  { value: "basic", label: "Basic" },
  { value: "conversational", label: "Conversational" },
  { value: "fluent", label: "Fluent" },
  { value: "native", label: "Native" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NannyProfile = any;

export function NannyStepForm({
  step,
  isLast,
  backHref,
  user,
  profile,
  photoUrl,
}: {
  step: string;
  isLast: boolean;
  backHref: string | null;
  user: { firstName: string | null; lastName: string | null };
  profile: NannyProfile;
  photoUrl: string | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveNannyStep, {});
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-7">
      <input type="hidden" name="step" value={step} />

      {step === "about" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName" required error={err.firstName}>
              <Input
                id="firstName"
                name="firstName"
                defaultValue={profile?.first_name ?? user.firstName ?? ""}
                required
              />
              <p className="mt-1 text-xs text-muted">
                Families only ever see your first name.
              </p>
            </Field>
            <Field label="Last name" htmlFor="lastName" required error={err.lastName}>
              <Input id="lastName" name="lastName" defaultValue={user.lastName ?? ""} required />
              <p className="mt-1 text-xs text-muted">Kept private, for your account only.</p>
            </Field>
          </div>

          <Field
            label="Profile photo"
            htmlFor="photo"
            required
            hint="A clear, friendly photo of your face. JPG or PNG, up to 5 MB."
            error={err.photo}
          >
            <div className="flex items-center gap-4">
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt="Your current profile photo"
                  width={64}
                  height={64}
                  unoptimized
                  className="size-16 rounded-full border border-border object-cover"
                />
              ) : (
                <span className="grid size-16 shrink-0 place-items-center rounded-full bg-sage-wash text-xs text-sage-deep">
                  Photo
                </span>
              )}
              <Input
                id="photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="h-auto py-2.5"
              />
            </div>
            {photoUrl && (
              <p className="mt-2 text-xs text-muted">
                Leave empty to keep the photo you already uploaded.
              </p>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nationality" htmlFor="nationality" required error={err.nationality}>
              <Select
                id="nationality"
                name="nationality"
                defaultValue={profile?.nationality ?? ""}
                required
              >
                <option value="" disabled>
                  Choose
                </option>
                {NATIONALITIES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Date of birth"
              htmlFor="dateOfBirth"
              required
              hint="Never shown publicly. Families see your age range only."
              error={err.dateOfBirth}
            >
              <Input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                defaultValue={profile?.date_of_birth ?? ""}
                required
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Where are you based?" htmlFor="emirate" required error={err.emirate}>
              <Select id="emirate" name="emirate" defaultValue={profile?.emirate ?? ""} required>
                <option value="" disabled>
                  Choose an emirate
                </option>
                {EMIRATES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Area"
              htmlFor="area"
              hint="Private. Used to sort by distance, never shown to families."
              error={err.area}
            >
              <Input
                id="area"
                name="area"
                list="nanny-areas"
                defaultValue={profile?.area ?? ""}
              />
              <datalist id="nanny-areas">
                {Object.values(AREAS)
                  .flat()
                  .map((a) => (
                    <option key={a} value={a} />
                  ))}
              </datalist>
            </Field>
          </div>
        </>
      )}

      {step === "experience" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Years of childcare experience"
              htmlFor="yearsExperience"
              required
              error={err.yearsExperience}
            >
              <Input
                id="yearsExperience"
                name="yearsExperience"
                type="number"
                min={0}
                max={60}
                defaultValue={profile?.years_experience ?? ""}
                required
              />
            </Field>
            <Field
              label="Of which, in the UAE"
              htmlFor="uaeExperience"
              error={err.uaeExperience}
            >
              <Input
                id="uaeExperience"
                name="uaeExperience"
                type="number"
                min={0}
                max={60}
                defaultValue={profile?.uae_experience_years ?? 0}
              />
            </Field>
          </div>

          <ChoiceGroup
            legend="Which ages have you cared for?"
            hint="Pick everything you have real experience with."
            error={err.ageGroups}
            columns={2}
          >
            {[
              { v: "newborn", l: "Newborn", h: "0–12 months", c: profile?.newborn_experience },
              { v: "toddler", l: "Toddler", h: "1–3 years", c: profile?.toddler_experience },
              { v: "school_age", l: "School age", h: "4–11 years", c: profile?.school_age_experience },
              { v: "special_needs", l: "Special needs", h: "Additional care needs", c: profile?.special_needs_experience },
            ].map((o) => (
              <ChoiceCard
                key={o.v}
                type="checkbox"
                name="ageGroups"
                value={o.v}
                label={o.l}
                hint={o.h}
                defaultChecked={o.c}
              />
            ))}
          </ChoiceGroup>

          <Field
            label="Tell us about your previous roles"
            htmlFor="previousExperience"
            hint="Which families, how long, what you did day to day."
            error={err.previousExperience}
          >
            <Textarea
              id="previousExperience"
              name="previousExperience"
              defaultValue={profile?.previous_experience?.[0]?.summary ?? ""}
              placeholder="2021–2025, a family in Dubai Marina with two children aged 3 and 6. School runs, meals, homework and bedtime routine."
            />
          </Field>
        </>
      )}

      {step === "skills" && (
        <>
          <PillGroup
            legend="Languages you speak"
            error={err.languages}
            hint="Pick every language you can hold a conversation in."
          >
            {LANGUAGES.map((l) => (
              <PillCheckbox
                key={l}
                name="languages"
                value={l}
                label={l}
                defaultChecked={profile?.languages?.includes(l)}
              />
            ))}
          </PillGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="English level" htmlFor="englishLevel" required error={err.englishLevel}>
              <Select
                id="englishLevel"
                name="englishLevel"
                defaultValue={profile?.english_level ?? "conversational"}
              >
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Arabic level" htmlFor="arabicLevel" required error={err.arabicLevel}>
              <Select
                id="arabicLevel"
                name="arabicLevel"
                defaultValue={profile?.arabic_level ?? "none"}
              >
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <ChoiceGroup legend="What else can you do?" error={err.skills} columns={2}>
            {[
              { v: "driving", l: "I have a driving licence", c: profile?.has_driving_licence },
              { v: "cooking", l: "Cooking", c: profile?.can_cook },
              { v: "housekeeping", l: "Light housekeeping", c: profile?.can_housekeep },
              { v: "pets", l: "Comfortable with pets", c: profile?.pet_experience },
              { v: "first_aid", l: "First aid trained", c: profile?.first_aid_certified },
            ].map((o) => (
              <ChoiceCard
                key={o.v}
                type="checkbox"
                name="skills"
                value={o.v}
                label={o.l}
                defaultChecked={o.c}
              />
            ))}
          </ChoiceGroup>

          <p className="rounded-md border border-butter bg-butter-wash px-4 py-3 text-xs text-butter-deep">
            Ticking a skill tells families what you can do. A badge on your profile is
            different — we only add one after our team has actually seen the certificate.
          </p>

          <Field label="Education" htmlFor="education" error={err.education}>
            <Input
              id="education"
              name="education"
              defaultValue={profile?.education ?? ""}
              placeholder="High school diploma, nursing certificate…"
            />
          </Field>

          <Field
            label="Certificates"
            htmlFor="certificates"
            hint="Separate with commas. You can upload the documents later."
            error={err.certificates}
          >
            <Input
              id="certificates"
              name="certificates"
              defaultValue={profile?.certificates?.join(", ") ?? ""}
              placeholder="Paediatric first aid, Montessori level 1"
            />
          </Field>
        </>
      )}

      {step === "availability" && (
        <>
          <ChoiceGroup legend="Live in or live out?" error={err.arrangement} columns={3}>
            {[
              { v: "live_out", l: "Live out", h: "I go home each day" },
              { v: "live_in", l: "Live in", h: "I can live with the family" },
              { v: "either", l: "Either", h: "Open to both" },
            ].map((o) => (
              <ChoiceCard
                key={o.v}
                type="radio"
                name="arrangement"
                value={o.v}
                label={o.l}
                hint={o.h}
                defaultChecked={(profile?.arrangement ?? "either") === o.v}
              />
            ))}
          </ChoiceGroup>

          <ChoiceGroup legend="What work suits you?" error={err.employmentTypes} columns={3}>
            {EMPLOYMENT_TYPES.map((t) => (
              <ChoiceCard
                key={t.value}
                type="checkbox"
                name="employmentTypes"
                value={t.value}
                label={t.label}
                defaultChecked={profile?.employment_types?.includes(t.value)}
              />
            ))}
          </ChoiceGroup>

          <PillGroup legend="Days you can work" error={err.availableDays}>
            {WORKING_DAYS.map((d) => (
              <PillCheckbox
                key={d}
                name="availableDays"
                value={d}
                label={d.slice(0, 3)}
                defaultChecked={profile?.available_days?.includes(d)}
              />
            ))}
          </PillGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" htmlFor="startTime" error={err.startTime}>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                defaultValue={profile?.available_hours_start?.slice(0, 5) ?? ""}
              />
            </Field>
            <Field label="Until" htmlFor="endTime" error={err.endTime}>
              <Input
                id="endTime"
                name="endTime"
                type="time"
                defaultValue={profile?.available_hours_end?.slice(0, 5) ?? ""}
              />
            </Field>
          </div>

          <Field
            label="I can start from"
            htmlFor="availableFrom"
            required
            error={err.availableFrom}
          >
            <Input
              id="availableFrom"
              name="availableFrom"
              type="date"
              defaultValue={profile?.available_from ?? ""}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Monthly salary from (AED)"
              htmlFor="salaryMin"
              required
              error={err.salaryMin}
            >
              <Input
                id="salaryMin"
                name="salaryMin"
                type="number"
                min={0}
                step={100}
                defaultValue={profile?.salary_expectation_min_aed ?? ""}
                placeholder="3500"
                required
              />
            </Field>
            <Field label="Up to (AED)" htmlFor="salaryMax" error={err.salaryMax}>
              <Input
                id="salaryMax"
                name="salaryMax"
                type="number"
                min={0}
                step={100}
                defaultValue={profile?.salary_expectation_max_aed ?? ""}
                placeholder="5000"
              />
            </Field>
          </div>

          <PillGroup
            legend="Where would you like to work?"
            hint="Leave empty if you're happy to travel anywhere."
            error={err.preferredLocations}
          >
            {EMIRATES.map((e) => (
              <PillCheckbox
                key={e}
                name="preferredLocations"
                value={e}
                label={e}
                defaultChecked={profile?.preferred_locations?.includes(e)}
              />
            ))}
          </PillGroup>
        </>
      )}

      {step === "story" && (
        <>
          <Field
            label="A one-line introduction"
            htmlFor="headline"
            hint="This appears under your name in search results."
            error={err.headline}
          >
            <Input
              id="headline"
              name="headline"
              defaultValue={profile?.headline ?? ""}
              maxLength={120}
              placeholder="Warm, patient nanny with 8 years caring for toddlers in Dubai"
            />
          </Field>

          <Field
            label="Tell families about yourself"
            htmlFor="description"
            required
            hint="This is the part families read most closely. Write as you'd speak."
            error={err.description}
          >
            <Textarea
              id="description"
              name="description"
              defaultValue={profile?.description ?? ""}
              className="min-h-44"
              required
              placeholder="I've looked after children in Dubai for eight years, mostly toddlers and school-age. I love cooking with children and I'm calm about the messy parts. I'm looking for a family I can stay with long term."
            />
          </Field>

          <Field
            label="Video introduction"
            htmlFor="video"
            hint="Optional, but profiles with a video get many more replies. Up to 80 MB, one minute is plenty."
            error={err.video}
          >
            <Input
              id="video"
              name="video"
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="h-auto py-2.5"
            />
            {profile?.video_url && (
              <p className="mt-2 text-xs text-sage-deep">
                A video is already uploaded. Choosing a new file replaces it.
              </p>
            )}
          </Field>
        </>
      )}

      <FormError message={state.error} />
      <StepNav backHref={backHref} isLast={isLast} />
    </form>
  );
}
