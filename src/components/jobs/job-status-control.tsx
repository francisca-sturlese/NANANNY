"use client";

import { useActionState } from "react";
import { setJobStatusAction } from "@/lib/jobs/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Select } from "@/components/ui/field";

const TRANSITIONS: Record<string, { value: string; label: string }[]> = {
  draft: [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Publish" },
  ],
  active: [
    { value: "active", label: "Active" },
    { value: "paused", label: "Pause" },
    { value: "filled", label: "Filled" },
    { value: "closed", label: "Close" },
  ],
  paused: [
    { value: "paused", label: "Paused" },
    { value: "active", label: "Reactivate" },
    { value: "closed", label: "Close" },
  ],
  filled: [
    { value: "filled", label: "Filled" },
    { value: "active", label: "Reopen" },
  ],
  closed: [
    { value: "closed", label: "Closed" },
    { value: "active", label: "Reopen" },
  ],
};

/**
 * Job status, changed in one tap. Only transitions that make sense from the
 * current state are offered, so there is no way to reach a nonsensical one.
 */
export function JobStatusControl({ jobId, status }: { jobId: string; status: string }) {
  const [state, action] = useActionState<ActionState, FormData>(setJobStatusAction, {});
  const options = TRANSITIONS[status] ?? TRANSITIONS.draft;

  return (
    <form action={action}>
      <input type="hidden" name="jobId" value={jobId} />
      <label>
        <span className="sr-only">Job status</span>
        <Select
          name="status"
          defaultValue={status}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-10 w-auto pr-9 pl-3 text-sm"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      {state.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
