"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setApplicationStatusAction } from "@/lib/jobs/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Select } from "@/components/ui/field";

const STATUSES = [
  { value: "viewed", label: "Viewed" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview", label: "Interview" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Not selected" },
];

/**
 * Move an application through its stages. Changing the stage is bookkeeping —
 * it never messages the nanny and never spends a contact.
 */
export function ApplicationStatusControl({
  applicationId,
  status,
}: {
  applicationId: string;
  status: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    setApplicationStatusAction,
    {},
  );
  // Controlled, for the same reason as the shortlist stage: the select must
  // not end up disagreeing with what was actually saved.
  const initial = status === "applied" || status === "withdrawn" ? "viewed" : status;
  const [shown, setShown] = useState(initial);
  const [lastServer, setLastServer] = useState(initial);
  if (initial !== lastServer) {
    setLastServer(initial);
    setShown(initial);
  }

  // Same reason as the shortlist stage: revalidatePath alone re-rendered this
  // from the router cache with the pre-save status.
  const router = useRouter();
  useEffect(() => {
    if (state.message) router.refresh();
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <label className="flex items-center gap-2">
        <span className="text-xs text-muted">Stage</span>
        <Select
          name="status"
          value={shown}
          onChange={(e) => {
            setShown(e.target.value);
            e.currentTarget.form?.requestSubmit();
          }}
          className="h-10 w-auto pr-9 pl-3 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>
      {state.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
