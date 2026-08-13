import Link from "next/link";
import { SubmitButton } from "@/components/auth/form-parts";
import { Logo } from "@/components/brand/logo";
import type { StepDef } from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

/**
 * Wizard frame: progress at the top, one step at a time, never a wall of
 * fields. The step count is honest — no "almost done" when it isn't.
 */
export function OnboardingShell({
  steps,
  currentSlug,
  reachedStep,
  basePath,
  children,
}: {
  steps: StepDef[];
  currentSlug: string;
  /** Highest step the user has completed; earlier steps stay clickable. */
  reachedStep: number;
  basePath: string;
  children: React.ReactNode;
}) {
  const index = steps.findIndex((s) => s.slug === currentSlug);
  const step = steps[index];
  const percent = Math.round(((index + 1) / steps.length) * 100);

  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" aria-label="NaNanny UAE home">
            <Logo />
          </Link>
          <span className="text-sm text-muted">
            Step {index + 1} of {steps.length}
          </span>
        </div>

        <div
          className="h-1 bg-border"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full bg-foreground transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        {/* Step rail: completed steps remain reachable so nothing is a one-way door. */}
        <nav aria-label="Onboarding steps" className="mb-8 flex flex-wrap gap-x-5 gap-y-2">
          {steps.map((s, i) => {
            const done = i < reachedStep;
            const current = i === index;
            const reachable = i <= reachedStep;
            const content = (
              <span
                className={cn(
                  "text-xs font-medium transition-colors",
                  current && "text-foreground",
                  !current && done && "text-sage-deep",
                  !current && !done && "text-subtle",
                )}
              >
                {i + 1}. {s.title}
              </span>
            );
            return reachable && !current ? (
              <Link key={s.slug} href={`${basePath}/${s.slug}`} className="underline-offset-4 hover:underline">
                {content}
              </Link>
            ) : (
              <span key={s.slug}>{content}</span>
            );
          })}
        </nav>

        <h1 className="text-3xl font-semibold sm:text-4xl">{step.title}</h1>
        <p className="mt-2 text-muted">{step.blurb}</p>

        <div className="mt-8 rounded-lg border border-border bg-background p-6 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Back / Save for later / Continue, in one consistent row. */
export function StepNav({
  backHref,
  isLast = false,
  submitLabel,
}: {
  backHref: string | null;
  isLast?: boolean;
  submitLabel?: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
      <div>
        {backHref && (
          <Link href={backHref} className="tap-target text-sm text-muted underline underline-offset-4">
            Back
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          name="intent"
          value="save"
          className="tap-target text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Save and finish later
        </button>
        <SubmitContinue label={submitLabel ?? (isLast ? "Finish" : "Continue")} />
      </div>
    </div>
  );
}

function SubmitContinue({ label }: { label: string }) {
  return (
    <SubmitButton name="intent" value="continue" size="md" pendingLabel="Saving…">
      {label}
    </SubmitButton>
  );
}
