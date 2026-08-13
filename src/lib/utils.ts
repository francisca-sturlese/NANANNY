import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** AED amounts are always whole dirhams in this product — 89, 250, 4000. */
export function formatAed(amount: number, opts?: { compact?: boolean }) {
  const value = new Intl.NumberFormat("en-AE", {
    maximumFractionDigits: 0,
  }).format(amount);
  return opts?.compact ? `${value} AED` : `AED ${value}`;
}

export function formatSalaryRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return `${formatAed(min)} – ${formatAed(max)}`;
  }
  return min != null ? `From ${formatAed(min)}` : `Up to ${formatAed(max!)}`;
}

export function initials(first?: string | null, last?: string | null) {
  return [first?.[0], last?.[0]].filter(Boolean).join("").toUpperCase() || "?";
}
