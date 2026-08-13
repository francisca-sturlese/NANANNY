import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1.5 rounded-pill font-medium leading-none",
  {
    variants: {
      variant: {
        neutral: "bg-surface text-muted border border-border",
        sage: "bg-sage-wash text-sage-deep border border-sage",
        peach: "bg-peach-wash text-peach-deep border border-peach",
        butter: "bg-butter-wash text-butter-deep border border-butter",
        solid: "bg-foreground text-background",
      },
      size: {
        sm: "px-2 py-1 text-[0.6875rem]",
        md: "px-3 py-1.5 text-xs",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
);

export function Badge({
  className,
  variant,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ variant, size }), className)} {...props} />;
}

/**
 * Verification badges are deliberately specific (PRD §12): we never render a
 * generic "Background Checked" claim for a check that was not actually run.
 */
export const VERIFICATION_BADGES = {
  identity_verified: { label: "Identity Verified", variant: "sage" },
  documents_reviewed: { label: "Documents Reviewed", variant: "sage" },
  video_reviewed: { label: "Video Reviewed", variant: "peach" },
  reference_provided: { label: "Reference Provided", variant: "peach" },
  first_aid_certificate: { label: "First Aid Certificate", variant: "butter" },
  driving_licence: { label: "Driving Licence", variant: "neutral" },
} as const;

export type VerificationBadgeKey = keyof typeof VERIFICATION_BADGES;

export function VerificationBadge({ badge: key }: { badge: VerificationBadgeKey }) {
  const meta = VERIFICATION_BADGES[key];
  if (!meta) return null;
  return (
    <Badge variant={meta.variant} size="sm">
      {meta.label}
    </Badge>
  );
}
