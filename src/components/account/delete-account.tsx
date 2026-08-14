"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction } from "@/lib/auth/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton, FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";

/**
 * Closing an account for good.
 *
 * Behind a disclosure rather than sitting open, and the confirmation is typed
 * rather than ticked. Neither is friction for its own sake: this cannot be
 * undone, and a checkbox on a phone is one mis-tap away from being pressed.
 *
 * The page says plainly what goes and what stays before asking. Somebody who
 * only wanted to stop the emails should find out here that this is not that.
 */
export function DeleteAccount({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(deleteAccountAction, {});

  return (
    <div className="rounded-lg border border-border p-5">
      <h2 className="text-base font-semibold">Close your account</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        This removes your profile and everything on it, for good. It cannot be undone.
      </p>

      {!open ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpen(true)}>
          Close my account
        </Button>
      ) : (
        <form action={action} className="mt-4 space-y-4">
          <div className="rounded-md border border-border bg-surface px-4 py-3">
            <p className="text-sm font-medium">What goes</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Your profile, your photo{role === "nanny" ? ", your documents and references" : ""},
              {role === "family" ? " your job posts," : " your applications,"} your saved list
              and your notifications.
            </p>

            <p className="mt-3 text-sm font-medium">What stays</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Messages you have already sent stay in the other person&apos;s conversation,
              shown as coming from a deleted account. Removing them would rewrite
              somebody else&apos;s history. Payment records are kept because the law
              requires it.
            </p>
          </div>

          <Field
            label="Type delete to confirm"
            htmlFor="confirmation"
            error={state.fieldErrors?.confirmation}
          >
            <Input
              id="confirmation"
              name="confirmation"
              autoComplete="off"
              placeholder="delete"
              required
            />
          </Field>

          <FormError message={state.error} />

          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" pendingLabel="Closing…">
              Close my account for good
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
