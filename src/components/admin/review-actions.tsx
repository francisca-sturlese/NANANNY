"use client";

import { useActionState, useState } from "react";
import { setNannyStatusAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge, VERIFICATION_BADGES, type VerificationBadgeKey } from "@/components/ui/badge";
import { toggleBadgeAction } from "@/app/admin/actions";
import { FileText } from "lucide-react";

export type ReviewDocument = {
  id: string;
  kind: string;
  label: string | null;
  original_filename: string | null;
  storage_path: string;
  reviewed: boolean;
};

export function ReviewActions({
  nannyId,
  status,
  documents = [],
}: {
  nannyId: string;
  status: string;
  documents?: ReviewDocument[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(setNannyStatusAction, {});
  const [badgeState, badgeAction] = useActionState<ActionState, FormData>(
    toggleBadgeAction,
    {},
  );
  const [rejecting, setRejecting] = useState(false);
  const [granting, setGranting] = useState(false);

  return (
    <div className="w-full max-w-sm space-y-3">
      {/* Open the file before making any claim about it. A badge is what the
          product says in public, so it should never be granted from a filename. */}
      {documents.length > 0 && (
        <ul className="space-y-1.5 rounded-md border border-border p-2.5">
          {documents.map((document) => (
            <li key={document.id}>
              <a
                href={`/media/nanny-documents/${document.storage_path}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center gap-2 text-xs underline underline-offset-4"
              >
                <FileText className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {document.label || document.original_filename || document.kind}
                </span>
                <span className="ml-auto shrink-0 text-subtle">{document.kind}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button size="sm" variant="ghost" onClick={() => setGranting((v) => !v)}>
          {granting ? "Done with badges" : "Badges"}
        </Button>

        {granting && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(VERIFICATION_BADGES) as VerificationBadgeKey[]).map((key) => (
              <form key={key} action={badgeAction}>
                <input type="hidden" name="nannyId" value={nannyId} />
                <input type="hidden" name="badge" value={key} />
                <input type="hidden" name="granted" value="true" />
                <button type="submit" className="min-h-9">
                  <Badge variant={VERIFICATION_BADGES[key].variant} size="sm">
                    + {VERIFICATION_BADGES[key].label}
                  </Badge>
                </button>
              </form>
            ))}
            <p className="mt-1 w-full text-[0.6875rem] leading-relaxed text-subtle">
              Grant one only for something you have actually opened and checked.
            </p>
            <FormMessage message={badgeState.message} />
            <FormError message={badgeState.error} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "submitted" && (
          <StatusForm action={action} nannyId={nannyId} status="under_review" label="Start review" />
        )}
        {status !== "approved" && (
          <StatusForm
            action={action}
            nannyId={nannyId}
            status="approved"
            label="Approve"
            variant="secondary"
          />
        )}
        {status === "approved" && (
          <StatusForm
            action={action}
            nannyId={nannyId}
            status="suspended"
            label="Suspend"
            variant="outline"
          />
        )}
        {status !== "rejected" && (
          <Button size="sm" variant="outline" onClick={() => setRejecting((v) => !v)}>
            {rejecting ? "Cancel" : "Reject"}
          </Button>
        )}
      </div>

      {/* A rejection must say what to fix — the nanny reads this verbatim. */}
      {rejecting && (
        <form action={action} className="space-y-2">
          <input type="hidden" name="nannyId" value={nannyId} />
          <input type="hidden" name="status" value="rejected" />
          <Textarea
            name="reason"
            required
            className="min-h-20 text-sm"
            placeholder="What needs to change before this profile can be approved?"
          />
          <SubmitButton size="sm" variant="danger" pendingLabel="Rejecting…">
            Send rejection
          </SubmitButton>
        </form>
      )}

      <FormError message={state.error} />
      <FormMessage message={state.message} />
    </div>
  );
}

function StatusForm({
  action,
  nannyId,
  status,
  label,
  variant = "primary",
}: {
  action: (formData: FormData) => void;
  nannyId: string;
  status: string;
  label: string;
  variant?: "primary" | "secondary" | "outline";
}) {
  return (
    <form action={action}>
      <input type="hidden" name="nannyId" value={nannyId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" variant={variant} pendingLabel="Saving…">
        {label}
      </SubmitButton>
    </form>
  );
}
