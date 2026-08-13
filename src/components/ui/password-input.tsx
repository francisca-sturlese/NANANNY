"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * A password field you can read while typing it.
 *
 * On a phone this matters more than on a desktop: the keyboard covers half the
 * screen, the character preview is gone in a blink, and a mistyped password on
 * signup is only discovered at the login screen days later.
 *
 * The toggle sits inside the field rather than beside it, so the input keeps
 * its full width, and it is a real 44px target despite looking small.
 */
export function PasswordInput({
  id,
  name,
  autoComplete = "current-password",
  required,
  minLength,
  autoFocus,
  className,
  showLabel = "Show password",
  hideLabel = "Hide password",
}: {
  id?: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  autoFocus?: boolean;
  className?: string;
  showLabel?: string;
  hideLabel?: string;
}) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className={cn("relative", className)}>
      <Input
        id={fieldId}
        name={name}
        // `text` rather than a masked field when revealed. Password managers key
        // off the name and autocomplete attributes, which do not change, so
        // saving and filling still work.
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
        // Never let a keyboard "help" with a password.
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="pr-12"
      />

      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        aria-controls={fieldId}
        // Absolutely positioned so the input keeps its full width, but still a
        // 44px square for a thumb.
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted transition-colors hover:text-foreground"
      >
        {visible ? (
          <EyeOff className="size-[1.15rem]" aria-hidden />
        ) : (
          <Eye className="size-[1.15rem]" aria-hidden />
        )}
      </button>
    </div>
  );
}
