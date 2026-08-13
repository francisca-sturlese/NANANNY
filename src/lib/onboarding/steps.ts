/**
 * Step definitions for both onboarding wizards.
 *
 * One source of truth for the order, the slugs and the labels, so the progress
 * bar, the resume logic and the server actions cannot disagree about which step
 * is which.
 */

export type StepDef = { slug: string; title: string; blurb: string };

export const FAMILY_STEPS: StepDef[] = [
  { slug: "about", title: "About your family", blurb: "Who you are and where you live." },
  { slug: "children", title: "Your children", blurb: "How many, and how old." },
  { slug: "care", title: "Type of care", blurb: "Live in or live out, and the schedule." },
  { slug: "requirements", title: "What matters most", blurb: "Budget, languages and skills." },
  { slug: "finishing", title: "Finishing touches", blurb: "Start date and anything else." },
];

export const NANNY_STEPS: StepDef[] = [
  { slug: "about", title: "About you", blurb: "Your photo and the basics." },
  { slug: "experience", title: "Your experience", blurb: "Years worked and ages cared for." },
  { slug: "skills", title: "Languages & skills", blurb: "What you speak and what you can do." },
  { slug: "availability", title: "Availability & pay", blurb: "When you can work and for how much." },
  { slug: "story", title: "Your story", blurb: "Introduce yourself to families." },
  {
    slug: "documents",
    title: "Documents",
    blurb: "Your CV and anything you want our team to see. All optional.",
  },
  { slug: "review", title: "Review & submit", blurb: "Check everything, then send for review." },
];

export function stepIndex(steps: StepDef[], slug: string): number {
  return steps.findIndex((s) => s.slug === slug);
}

export function nextSlug(steps: StepDef[], slug: string): string | null {
  const i = stepIndex(steps, slug);
  return i >= 0 && i < steps.length - 1 ? steps[i + 1].slug : null;
}

export function prevSlug(steps: StepDef[], slug: string): string | null {
  const i = stepIndex(steps, slug);
  return i > 0 ? steps[i - 1].slug : null;
}

/** Where to send someone who returns to onboarding later. */
export function resumeSlug(steps: StepDef[], onboardingStep: number): string {
  const clamped = Math.min(Math.max(onboardingStep, 0), steps.length - 1);
  return steps[clamped].slug;
}
