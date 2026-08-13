"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A submit button that disables itself while the action is in flight.
 * useFormStatus must be read from a child of the <form>, not the form itself.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} {...props}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger"
    >
      {message}
    </p>
  );
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-md border border-sage bg-sage-wash px-4 py-3 text-sm text-sage-deep"
    >
      {message}
    </p>
  );
}

export function FieldError({ message, className }: { message?: string; className?: string }) {
  if (!message) return null;
  return <p className={cn("text-xs text-danger", className)}>{message}</p>;
}
