import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-border bg-background px-4 text-[0.9375rem] text-foreground placeholder:text-subtle transition-colors hover:border-border-strong focus:border-foreground focus:outline-none disabled:bg-surface disabled:text-subtle";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(control, "h-11", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(control, "min-h-28 py-3 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

/**
 * `appearance-none` strips the native arrow, so the chevron has to come back as
 * a background image — without it a select is visually indistinguishable from a
 * text input and nobody knows it opens.
 */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%236b6862' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6.5L8 10.5L12 6.5'/%3E%3C/svg%3E\")";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, style, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(control, "h-11 cursor-pointer appearance-none pr-10", className)}
    style={{
      backgroundImage: CHEVRON,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 0.875rem center",
      backgroundSize: "1rem 1rem",
      ...style,
    }}
    {...props}
  />
));
Select.displayName = "Select";

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("block text-sm font-medium text-foreground", className)} {...props}>
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
