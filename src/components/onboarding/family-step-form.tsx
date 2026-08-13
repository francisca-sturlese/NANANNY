"use client";

import { useActionState, useState } from "react";
import { saveFamilyStep } from "@/lib/onboarding/family-actions";
import type { ActionState } from "@/lib/auth/actions";
import { StepNav } from "@/components/onboarding/shell";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ChoiceCard, ChoiceGroup, PillCheckbox, PillGroup } from "@/components/ui/choice";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import {
  AREAS,
  CHILD_AGE_BANDS,
  EMIRATES,
  EMPLOYMENT_TYPES,
  LANGUAGES,
  WORKING_DAYS,
} from "@/lib/uae";

type Profile = {
  display_name: string | null;
  emirate: string | null;
  area: string | null;
  description: string | null;
  children_count: number;
} | null;

type Requirements = {
  arrangement: string | null;
  employment_types: string[];
  working_days: string[];
  working_hours_start: string | null;
  working_hours_end: string | null;
  salary_min_aed: number | null;
  salary_max_aed: number | null;
  languages: string[];
  required_experience_years: number | null;
  needs_newborn_care: boolean;
  needs_toddler_care: boolean;
  needs_school_age_care: boolean;
  needs_special_needs_care: boolean;
  needs_driving: boolean;
  needs_cooking: boolean;
  needs_housekeeping: boolean;
  needs_first_aid: boolean;
  has_pets: boolean;
  start_date: string | null;
  additional_requirements: string | null;
} | null;

export function FamilyStepForm({
  step,
  isLast,
  backHref,
  user,
  profile,
  requirements,
  photoUrl,
  // Named `kids`, not `children`: `children` is reserved by React, and passing
  // an array of records under that name across the server/client boundary
  // stops the component hydrating — the form renders but nothing responds.
  kids,
}: {
  step: string;
  isLast: boolean;
  backHref: string | null;
  user: { firstName: string | null; lastName: string | null };
  profile: Profile;
  requirements: Requirements;
  photoUrl: string | null;
  kids: { id: string; age_years: number | null }[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveFamilyStep, {});
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
                defaultValue={user.firstName ?? ""}
                autoComplete="given-name"
                required
              />
            </Field>
            <Field label="Last name" htmlFor="lastName" required error={err.lastName}>
              <Input
                id="lastName"
                name="lastName"
                defaultValue={user.lastName ?? ""}
                autoComplete="family-name"
                required
              />
            </Field>
          </div>

          <Field
            label="How should nannies refer to your family?"
            htmlFor="displayName"
            required
            hint="This is what nannies see. Most families use something like “The Hassan family”."
            error={err.displayName}
          >
            <Input
              id="displayName"
              name="displayName"
              defaultValue={profile?.display_name ?? ""}
              placeholder="The Hassan family"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Emirate" htmlFor="emirate" required error={err.emirate}>
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
              hint="Only the area is shown to nannies, never your address."
              error={err.area}
            >
              <Input
                id="area"
                name="area"
                list="area-suggestions"
                defaultValue={profile?.area ?? ""}
                placeholder="Dubai Hills"
              />
              <datalist id="area-suggestions">
                {Object.values(AREAS)
                  .flat()
                  .map((a) => (
                    <option key={a} value={a} />
                  ))}
              </datalist>
            </Field>
          </div>

          <Field
            label="Family photo"
            htmlFor="photo"
            hint="Optional. Nannies see your family name either way; a photo just makes the first message warmer."
            error={err.photo}
          >
            <div className="flex items-center gap-4">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Your current family photo"
                  width={64}
                  height={64}
                  className="size-16 rounded-full border border-border object-cover"
                />
              ) : (
                <span className="grid size-16 shrink-0 place-items-center rounded-full bg-peach-wash text-xs text-peach-deep">
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
          </Field>

          <Field
            label="A little about your family"
            htmlFor="description"
            hint="Optional now, but families who write a few lines get better replies."
            error={err.description}
          >
            <Textarea
              id="description"
              name="description"
              defaultValue={profile?.description ?? ""}
              placeholder="We're a family of four in Dubai Hills. Both parents work weekdays and we're looking for someone warm and reliable to be part of our routine."
            />
          </Field>
        </>
      )}

      {step === "children" && (
        <ChildrenStep
          defaultCount={profile?.children_count ?? kids.length}
          defaultAges={kids.map((c) => c.age_years ?? 0)}
          error={err.childrenCount ?? err.ages}
        />
      )}

      {step === "care" && (
        <>
          <ChoiceGroup legend="Live in or live out?" error={err.arrangement} columns={3}>
            {[
              { v: "live_out", l: "Live out", h: "She goes home at the end of the day" },
              { v: "live_in", l: "Live in", h: "She lives with your family" },
              { v: "either", l: "Either is fine", h: "Open to both" },
            ].map((o) => (
              <ChoiceCard
                key={o.v}
                type="radio"
                name="arrangement"
                value={o.v}
                label={o.l}
                hint={o.h}
                defaultChecked={requirements?.arrangement === o.v}
              />
            ))}
          </ChoiceGroup>

          <ChoiceGroup
            legend="What kind of schedule?"
            hint="Pick everything that could work."
            error={err.employmentTypes}
            columns={3}
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <ChoiceCard
                key={t.value}
                type="checkbox"
                name="employmentTypes"
                value={t.value}
                label={t.label}
                defaultChecked={requirements?.employment_types?.includes(t.value)}
              />
            ))}
          </ChoiceGroup>

          <PillGroup legend="Which days?" error={err.workingDays}>
            {WORKING_DAYS.map((d) => (
              <PillCheckbox
                key={d}
                name="workingDays"
                value={d}
                label={d.slice(0, 3)}
                defaultChecked={requirements?.working_days?.includes(d)}
              />
            ))}
          </PillGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start time" htmlFor="startTime" error={err.startTime}>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                defaultValue={requirements?.working_hours_start?.slice(0, 5) ?? ""}
              />
            </Field>
            <Field label="End time" htmlFor="endTime" error={err.endTime}>
              <Input
                id="endTime"
                name="endTime"
                type="time"
                defaultValue={requirements?.working_hours_end?.slice(0, 5) ?? ""}
              />
            </Field>
          </div>
        </>
      )}

      {step === "requirements" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Monthly budget from (AED)"
              htmlFor="salaryMin"
              error={err.salaryMin}
            >
              <Input
                id="salaryMin"
                name="salaryMin"
                type="number"
                min={0}
                step={100}
                defaultValue={requirements?.salary_min_aed ?? ""}
                placeholder="3000"
              />
            </Field>
            <Field label="Up to (AED)" htmlFor="salaryMax" error={err.salaryMax}>
              <Input
                id="salaryMax"
                name="salaryMax"
                type="number"
                min={0}
                step={100}
                defaultValue={requirements?.salary_max_aed ?? ""}
                placeholder="5000"
              />
            </Field>
          </div>

          <PillGroup
            legend="Languages she should speak"
            hint="Pick every language that would work."
            error={err.languages}
          >
            {LANGUAGES.map((l) => (
              <PillCheckbox
                key={l}
                name="languages"
                value={l}
                label={l}
                defaultChecked={requirements?.languages?.includes(l)}
              />
            ))}
          </PillGroup>

          <ChoiceGroup
            legend="Experience your children need"
            error={err.careNeeds}
            columns={2}
          >
            {CHILD_AGE_BANDS.map((b) => {
              const checkedMap: Record<string, boolean | undefined> = {
                newborn: requirements?.needs_newborn_care,
                toddler: requirements?.needs_toddler_care,
                school_age: requirements?.needs_school_age_care,
                special_needs: requirements?.needs_special_needs_care,
              };
              return (
                <ChoiceCard
                  key={b.value}
                  type="checkbox"
                  name="careNeeds"
                  value={b.value}
                  label={b.label}
                  defaultChecked={checkedMap[b.value]}
                />
              );
            })}
          </ChoiceGroup>

          <ChoiceGroup legend="Skills that matter to you" error={err.skills} columns={2}>
            {[
              { v: "driving", l: "Driving licence", c: requirements?.needs_driving },
              { v: "cooking", l: "Cooking", c: requirements?.needs_cooking },
              { v: "housekeeping", l: "Light housekeeping", c: requirements?.needs_housekeeping },
              { v: "first_aid", l: "First aid certified", c: requirements?.needs_first_aid },
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

          <Field
            label="Minimum years of experience"
            htmlFor="requiredExperience"
            error={err.requiredExperience}
          >
            <Select
              id="requiredExperience"
              name="requiredExperience"
              defaultValue={requirements?.required_experience_years?.toString() ?? ""}
            >
              <option value="">No minimum</option>
              {[1, 2, 3, 5, 8, 10].map((y) => (
                <option key={y} value={y}>
                  {y}+ years
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="hasPets"
              defaultChecked={requirements?.has_pets}
              className="size-4 accent-black"
            />
            <span className="text-sm">We have pets at home</span>
          </label>
        </>
      )}

      {step === "finishing" && (
        <>
          <Field
            label="When would you like her to start?"
            htmlFor="startDate"
            error={err.startDate}
          >
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={requirements?.start_date ?? ""}
            />
          </Field>

          <Field
            label="Anything else a nanny should know?"
            htmlFor="additionalRequirements"
            hint="Allergies, school runs, travel, a preferred routine. Anything that matters."
            error={err.additionalRequirements}
          >
            <Textarea
              id="additionalRequirements"
              name="additionalRequirements"
              defaultValue={requirements?.additional_requirements ?? ""}
            />
          </Field>

          <p className="rounded-md border border-sage bg-sage-wash px-4 py-3 text-sm text-sage-deep">
            That&apos;s everything. You can change any of this later from your profile.
          </p>
        </>
      )}

      <FormError message={state.error} />
      <StepNav backHref={backHref} isLast={isLast} />
    </form>
  );
}

/**
 * The one step that genuinely needs client state: the number of age inputs
 * follows the child count. Rows already filled keep their values when the
 * count changes.
 */
function ChildrenStep({
  defaultCount,
  defaultAges,
  error,
}: {
  defaultCount: number;
  defaultAges: number[];
  error?: string;
}) {
  const [count, setCount] = useState(Math.max(defaultCount, defaultAges.length, 1));

  return (
    <>
      <Field
        label="How many children need care?"
        htmlFor="childrenCount"
        required
        error={error}
      >
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            aria-label="One fewer child"
          >
            −
          </Button>
          <Input
            id="childrenCount"
            name="childrenCount"
            type="number"
            min={1}
            max={12}
            value={count}
            onChange={(e) => setCount(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
            className="w-20 text-center"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCount((c) => Math.min(12, c + 1))}
            aria-label="One more child"
          >
            +
          </Button>
        </div>
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">How old are they?</legend>
        <p className="mt-1 text-xs text-muted">
          Age in years. Use 0 for a baby under one.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: count }, (_, i) => (
            <label key={i} className="block">
              <span className="mb-1.5 block text-xs text-muted">Child {i + 1}</span>
              <Input
                name="childAge"
                type="number"
                min={0}
                max={21}
                defaultValue={defaultAges[i] ?? ""}
                placeholder="0"
              />
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
