"use client";

import { useActionState } from "react";
import { createInviteAction, revokeInviteAction } from "@/app/admin/invites/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

export function InviteForm() {
  const [state, action] = useActionState<ActionState, FormData>(createInviteAction, {});

  return (
    <form action={action} className="space-y-4 rounded-lg border border-border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="invite-email" required error={state.fieldErrors?.email}>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="colleague@example.com"
          />
        </Field>
        <Field
          label="Role"
          htmlFor="invite-role"
          required
          error={state.fieldErrors?.role}
          hint="An admin moderates. Only a super admin can appoint others."
        >
          <Select id="invite-role" name="role" defaultValue="admin" required>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </Select>
        </Field>
      </div>

      <FormError message={state.error} />
      <FormMessage message={state.message} />

      <SubmitButton pendingLabel="Inviting…">Send invite</SubmitButton>
    </form>
  );
}

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(revokeInviteAction, {});

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="inviteId" value={inviteId} />
      <SubmitButton size="sm" variant="outline" pendingLabel="…">
        Revoke
      </SubmitButton>
      <FormError message={state.error} />
    </form>
  );
}
