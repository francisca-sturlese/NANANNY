/**
 * The phrases a family can tap instead of writing a job description.
 *
 * The same move as the nanny's About box, for the same reason and with the same
 * limit. Free text at the end of a long form is where people stop, and a family
 * who stops has posted nothing, which on the demand side of a marketplace with
 * no demand is the expensive kind of nothing.
 *
 * Grouped so that a few taps across the groups describe an actual day rather
 * than listing chores: the mornings, the afternoons, what else the role
 * involves, and what the family is like to work for. A nanny reading it wants
 * to know what her day looks like, not to receive a specification.
 *
 * No digits, because contact details are stripped from this field by a trigger
 * and a long run of them is read as a phone number. Asserted in the suite
 * rather than checked by eye.
 */

import type { PhraseGroup } from "@/lib/nanny/about-phrases";

export const JOB_RESPONSIBILITY_PHRASES: PhraseGroup[] = [
  {
    label: "Mornings",
    phrases: [
      "Getting the children ready in the morning",
      "Breakfast and the school run",
      "Nursery drop off",
      "Looking after a baby through the morning",
    ],
  },
  {
    label: "Afternoons and evenings",
    phrases: [
      "School pick up",
      "Homework and reading",
      "Taking the children to activities",
      "Playing outside and at the park",
      "Preparing the children's meals",
      "Bath and bedtime",
    ],
  },
  {
    label: "Around the house",
    phrases: [
      "Keeping the children's rooms tidy",
      "The children's laundry",
      "Cooking family meals",
      "Light housekeeping",
      "Helping with the family pet",
    ],
  },
  {
    label: "What we are like",
    phrases: [
      "We are a calm household with a steady routine",
      "Both parents work during the week",
      "We would like someone who can stay with us long term",
      "We speak English at home",
      "We travel with the family in the summer",
      "Weekends are usually free",
    ],
  },
];
