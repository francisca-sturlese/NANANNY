import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-pill font-medium whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        /* The one primary action on a screen. Black on white is the brand. */
        primary: "bg-foreground text-background hover:bg-[#1c1c1c]",
        /* Secondary actions sit on a brand wash rather than a grey. */
        secondary: "bg-sage text-foreground hover:bg-[#b8c6bf]",
        outline: "border border-border-strong bg-background text-foreground hover:bg-surface",
        ghost: "text-foreground hover:bg-surface",
        /* Reserved for the paywall's continue buttons. */
        peach: "bg-peach text-foreground hover:bg-[#f8cfc2]",
        danger: "bg-danger text-white hover:bg-[#961f18]",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-[0.9375rem]",
        lg: "h-13 px-8 text-base",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size, block }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { button as buttonVariants };
