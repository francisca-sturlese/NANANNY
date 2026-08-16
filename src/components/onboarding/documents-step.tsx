"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, Trash2, Check, Plus } from "lucide-react";
import {
  uploadDocumentAction,
  deleteDocumentAction,
  saveNannyStep,
} from "@/lib/onboarding/nanny-actions";
import type { ActionState } from "@/lib/auth/actions";
import { StepNav } from "@/components/onboarding/shell";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";
import { Badge } from "@/components/ui/badge";

const KINDS = [
  { value: "cv", label: "CV" },
  { value: "certificate", label: "Certificate" },
  { value: "first_aid", label: "First aid certificate" },
  { value: "reference", label: "Written reference" },
  { value: "id", label: "ID card" },
  { value: "passport", label: "Passport" },
  { value: "visa", label: "Visa" },
  { value: "police_clearance", label: "Police clearance" },
  { value: "other", label: "Something else" },
];

const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

export type NannyDocument = {
  id: string;
  kind: string;
  label: string | null;
  original_filename: string | null;
  size_bytes: number | null;
  reviewed: boolean;
  created_at: string;
};

/**
 * Documents.
 *
 * Everything here is optional: a nanny with no CV must still be able to submit
 * her profile. Uploading one file at a time rather than a bulk picker, because
 * each file needs to be labelled to be useful to whoever reviews it.
 *
 * The copy is explicit about who can see these, since that is the first thing
 * anyone wonders before uploading a passport.
 */
export function DocumentsStep({
  documents,
  backHref,
}: {
  documents: NannyDocument[];
  backHref: string | null;
}) {
  const [uploadState, upload] = useActionState<ActionState, FormData>(
    uploadDocumentAction,
    {},
  );
  const [deleteState, remove] = useActionState<ActionState, FormData>(
    deleteDocumentAction,
    {},
  );
  const [navState, navAction] = useActionState<ActionState, FormData>(saveNannyStep, {});
  const formRef = useRef<HTMLFormElement>(null);
  // The upload form lives behind a button. Its own fields are marked required,
  // and with the form always visible the asterisks read as "this step is
  // mandatory", which it is not: it made the person who built the product
  // hesitate, so it would certainly make a nanny hesitate.
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="space-y-7">
      <div className="rounded-md border border-sage bg-sage-wash px-4 py-3">
        <p className="text-sm leading-relaxed text-sage-deep">
          Your passport, ID and visa can be opened only by you and our review team,
          never by a family. Your CV, certificates and references can also be seen by
          a family after you apply to their job, because they are part of what you are
          putting forward. Nothing here appears on your public profile.
        </p>
      </div>

      {documents.length > 0 && (
        <ul className="space-y-2">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center gap-3 rounded-md border border-border p-3"
            >
              <FileText className="size-5 shrink-0 text-muted" aria-hidden />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {document.label || KIND_LABEL[document.kind] || document.kind}
                </p>
                <p className="truncate text-xs text-muted">
                  {[
                    KIND_LABEL[document.kind],
                    document.original_filename,
                    document.size_bytes
                      ? `${Math.round(document.size_bytes / 1024)} KB`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              {document.reviewed && (
                <Badge variant="sage" size="sm">
                  <Check className="size-3" aria-hidden />
                  Seen
                </Badge>
              )}

              <form action={remove}>
                <input type="hidden" name="documentId" value={document.id} />
                <button
                  type="submit"
                  aria-label={`Remove ${document.label ?? document.kind}`}
                  className="grid size-11 shrink-0 place-items-center rounded-pill text-muted hover:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {!showUpload && (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted">
            You can skip this step and add documents any time later from your profile.
          </p>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="tap-target flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong px-5 py-4 text-sm font-medium hover:border-foreground"
          >
            <Plus className="size-4" aria-hidden />
            Add a document (optional)
          </button>
        </div>
      )}

      {showUpload && (
      <form
        ref={formRef}
        action={(formData) => {
          upload(formData);
          formRef.current?.reset();
        }}
        className="space-y-4 rounded-lg border border-dashed border-border-strong p-5"
      >
        <Field label="What is this file?" htmlFor="kind" required>
          <Select id="kind" name="kind" defaultValue="cv" required>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Give it a name"
          htmlFor="label"
          hint="Optional. Helps if you upload more than one of the same kind."
        >
          <Input id="label" name="label" maxLength={120} placeholder="Paediatric first aid 2024" />
        </Field>

        <Field label="File" htmlFor="file" required hint="PDF, JPG or PNG, up to 15 MB.">
          <Input
            id="file"
            name="file"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
            className="h-auto py-2.5"
          />
        </Field>

        <FormError message={uploadState.error} />
        <FormMessage message={uploadState.message} />

        <SubmitButton variant="outline" block pendingLabel="Uploading…">
          Add this file
        </SubmitButton>

        <button
          type="button"
          onClick={() => setShowUpload(false)}
          className="tap-target block w-full text-center text-sm text-muted underline"
        >
          Not now
        </button>
      </form>
      )}

      <FormError message={deleteState.error} />

      <p className="text-xs leading-relaxed text-subtle">
        Uploading a certificate is not the same as it being verified. A badge appears on
        your profile only after someone on our team has opened the document itself.
      </p>

      {/* Continue must be wired to the step action like every other step: a
          bare form submits a GET back to the same page, which looks like a
          dead button. That is what it did until today. */}
      <form action={navAction}>
        <input type="hidden" name="step" value="documents" />
        <FormError message={navState.error} />
        <StepNav backHref={backHref} />
      </form>
    </div>
  );
}
