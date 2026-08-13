"use client";

import { useActionState, useState } from "react";
import { Ban } from "lucide-react";
import { blockUserAction, type SafetyState } from "@/lib/safety/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

/**
 * Block someone. Two taps, because it closes the conversation for both sides
 * and a mis-tap in a chat should not end a working relationship.
 */
export function BlockButton({ userId, name }: { userId: string; name: string }) {
  const [state, action] = useActionState<SafetyState, FormData>(blockUserAction, {});
  const [confirming, setConfirming] = useState(false);

  if (state.message) return <FormMessage message={state.message} />;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="tap-target inline-flex items-center gap-1.5 text-xs text-subtle underline underline-offset-4 hover:text-muted"
      >
        <Ban className="size-3.5" aria-hidden />
        Block
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-xs text-muted">
        Block {name}? Neither of you will be able to send messages.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <SubmitButton variant="danger" size="sm" pendingLabel="Blocking…">
          Block {name}
        </SubmitButton>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
