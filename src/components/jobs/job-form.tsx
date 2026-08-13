"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveJobAction } from "@/lib/jobs/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ChoiceCard, ChoiceGroup, PillCheckbox, PillGroup } from "@/components/ui/choice";
import { FormError, SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { ARRANGEMENTS, EMIRATES, EMPLOYMENT_TYPES, LANGUAGES, WORKING_DAYS } from "@/lib/uae";

export type JobDefaults = {
  id?: string;
  title?: string | null;
  emirate?: string | null;
  area?: string | null;
  arrangement?: string | null;
  employment_type?: string | null;
  start_date?: string | null;
  working_days?: string[] | null;
  working_hours_start?: string | null;
  working_hours_end?: string | null;
  salary_min_aed?: number | null;
  salary_max_aed?: number | null;
  children_count?: number | null;
  responsibilities?: string | null;
  required_experience_years?: number | null;
  required_languages?: string[] | null;
  driving_required?: boolean | null;
  cooking_required?: boolean | null;
  housekeeping_required?: boolean | null;
  has_pets?: boolean | null;
  additional_information?: string | null;
  status?: string | null;
};

/**
 * Post or edit a job.
 *
 * One screen rather than a wizard: a family writing a job post is already
 * committed, and the fields prefill from their profile so most of it is
 * confirmation rather than typing. Two submit buttons — save a draft, or
 * publish — because a half-written job post is normal.
 */
export function JobForm({
  job,
  prefill,
}: {
  job?: JobDefaults;
  prefill?: { emirate?: string | null; area?: string | null; childrenCount?: number };
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveJobAction, {});
  const err = state.fieldErrors ?? {};
  const d = job ?? {};

  return (
    <form action={action} className="space-y-7">
      {d.id && <input type="hidden" name="jobId" value={d.id} />}

      <Field label="Job title" htmlFor="title" required error={err.title}>
        <Input
          id="title"
          name="title"
          defaultValue={d.title ?? ""}
          placeholder="Live-out nanny for two children in Dubai Hills"
          required
          maxLength={140}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Emirate" htmlFor="emirate" required error={err.emirate}>
          <Select
            id="emirate"
            name="emirate"
            defaultValue={d.emirate ?? prefill?.emirate ?? ""}
            required
          >
            <option value="" disabled>
              Choose
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
          hint="Nannies see the area, never your address."
          error={err.area}
        >
          <Input id="area" name="area" defaultValue={d.area ?? prefill?.area ?? ""} />
        </Field>
      </div>

      <ChoiceGroup legend="Live in or live out" error={err.arrangement} columns={3}>
        {ARRANGEMENTS.map((a) => (
          <ChoiceCard
            key={a.value}
            type="radio"
            name="arrangement"
            value={a.value}
            label={a.label}
            defaultChecked={(d.arrangement ?? "live_out") === a.value}
          />
        ))}
      </ChoiceGroup>

      <Field label="Type of work" htmlFor="employmentType" required error={err.employmentType}>
        <Select
          id="employmentType"
          name="employmentType"
          defaultValue={d.employment_type ?? "full_time"}
        >
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

      <PillGroup legend="Working days" error={err.workingDays}>
        {WORKING_DAYS.map((day) => (
          <PillCheckbox
            key={day}
            name="workingDays"
            value={day}
            label={day.slice(0, 3)}
            defaultChecked={d.working_days?.includes(day)}
          />
        ))}
      </PillGroup>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="From" htmlFor="startTime" error={err.startTime}>
          <Input
            id="startTime"
            name="startTime"
            type="time"
            defaultValue={d.working_hours_start?.slice(0, 5) ?? ""}
          />
        </Field>
        <Field label="Until" htmlFor="endTime" error={err.endTime}>
          <Input
            id="endTime"
            name="endTime"
            type="time"
            defaultValue={d.working_hours_end?.slice(0, 5) ?? ""}
          />
        </Field>
        <Field label="Start date" htmlFor="startDate" error={err.startDate}>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={d.start_date ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Salary from (AED)" htmlFor="salaryMin" error={err.salaryMin}>
          <Input
            id="salaryMin"
            name="salaryMin"
            type="number"
            min={0}
            step={100}
            defaultValue={d.salary_min_aed ?? ""}
          />
        </Field>
        <Field label="Up to (AED)" htmlFor="salaryMax" error={err.salaryMax}>
          <Input
            id="salaryMax"
            name="salaryMax"
            type="number"
            min={0}
            step={100}
            defaultValue={d.salary_max_aed ?? ""}
          />
        </Field>
        <Field label="Children" htmlFor="childrenCount" error={err.childrenCount}>
          <Input
            id="childrenCount"
            name="childrenCount"
            type="number"
            min={0}
            max={12}
            defaultValue={d.children_count ?? prefill?.childrenCount ?? 1}
          />
        </Field>
      </div>

      <Field
        label="What the role involves"
        htmlFor="responsibilities"
        required
        hint="School runs, meals, play, bedtime. The day as it actually is."
        error={err.responsibilities}
      >
        <Textarea
          id="responsibilities"
          name="responsibilities"
          defaultValue={d.responsibilities ?? ""}
          className="min-h-32"
          required
        />
      </Field>

      <Field
        label="Minimum experience"
        htmlFor="requiredExperience"
        error={err.requiredExperience}
      >
        <Select
          id="requiredExperience"
          name="requiredExperience"
          defaultValue={d.required_experience_years?.toString() ?? ""}
        >
          <option value="">No minimum</option>
          {[1, 2, 3, 5, 8, 10].map((y) => (
            <option key={y} value={y}>
              {y}+ years
            </option>
          ))}
        </Select>
      </Field>

      <PillGroup legend="Languages needed" error={err.requiredLanguages}>
        {LANGUAGES.map((l) => (
          <PillCheckbox
            key={l}
            name="requiredLanguages"
            value={l}
            label={l}
            defaultChecked={d.required_languages?.includes(l)}
          />
        ))}
      </PillGroup>

      <ChoiceGroup legend="She will also need to" error={err.skills} columns={3}>
        {[
          { v: "driving", l: "Drive", c: d.driving_required },
          { v: "cooking", l: "Cook", c: d.cooking_required },
          { v: "housekeeping", l: "Light housekeeping", c: d.housekeeping_required },
        ].map((o) => (
          <ChoiceCard
            key={o.v}
            type="checkbox"
            name="skills"
            value={o.v}
            label={o.l}
            defaultChecked={Boolean(o.c)}
          />
        ))}
      </ChoiceGroup>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="hasPets"
          defaultChecked={Boolean(d.has_pets)}
          className="size-4 accent-black"
        />
        <span className="text-sm">We have pets at home</span>
      </label>

      <Field
        label="Anything else"
        htmlFor="additionalInformation"
        error={err.additionalInformation}
      >
        <Textarea
          id="additionalInformation"
          name="additionalInformation"
          defaultValue={d.additional_information ?? ""}
        />
      </Field>

      <FormError message={state.error} />

      {/* Stacked and full width on a phone; side by side once there is room. */}
      <div className="flex flex-col gap-2.5 border-t border-border pt-6 sm:flex-row sm:justify-between">
        <Link href="/family/jobs" className="order-3 sm:order-1">
          <Button type="button" variant="ghost" size="lg" block className="sm:w-auto">
            Cancel
          </Button>
        </Link>
        <div className="order-1 flex flex-col gap-2.5 sm:order-2 sm:flex-row">
          <SubmitButton name="intent" value="draft" variant="outline" size="lg" block>
            Save as draft
          </SubmitButton>
          <SubmitButton name="intent" value="publish" size="lg" block pendingLabel="Publishing…">
            {d.status === "active" ? "Save changes" : "Publish job"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
