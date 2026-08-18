"use client";

import { useActionState } from "react";
import { toggleCodePostAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { SubmitButton, FormError } from "@/components/auth/form-parts";

/** Hide or show a post that lives in code, without a deploy. */
export function CodePostToggle({ slug, hidden }: { slug: string; hidden: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(toggleCodePostAction, {});

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="hidden" value={hidden ? "false" : "true"} />
      <SubmitButton size="sm" variant="outline" pendingLabel="…">
        {hidden ? "Show on blog" : "Hide from blog"}
      </SubmitButton>
      <FormError message={state.error} />
    </form>
  );
}
