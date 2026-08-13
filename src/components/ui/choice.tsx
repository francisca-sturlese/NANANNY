import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Native inputs styled as cards. No JavaScript state — the browser owns
 * checked/unchecked, so a half-filled form survives a refresh and works with
 * keyboard and screen readers for free.
 */

export function ChoiceCard({
  type,
  name,
  value,
  label,
  hint,
  defaultChecked,
  className,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "group relative flex cursor-pointer items-start gap-3 rounded-md border border-border p-4 transition-colors",
        "hover:border-border-strong",
        "has-checked:border-foreground has-checked:bg-surface",
        className,
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className={cn(
          "mt-0.5 size-4 shrink-0 accent-black",
          type === "radio" ? "rounded-full" : "rounded-sm",
        )}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function ChoiceGroup({
  legend,
  hint,
  error,
  columns = 2,
  children,
}: {
  legend: string;
  hint?: string;
  error?: string;
  columns?: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <div
        className={cn(
          "mt-3 grid gap-2.5",
          columns === 1 && "grid-cols-1",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {children}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </fieldset>
  );
}

/** Compact pill checkboxes, for long lists like languages. */
export function PillCheckbox({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className="inline-flex items-center rounded-pill border border-border px-3.5 py-2 text-sm transition-colors peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground hover:border-border-strong">
        {label}
      </span>
    </label>
  );
}

export function PillGroup({
  legend,
  hint,
  error,
  children,
}: {
  legend: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </fieldset>
  );
}
