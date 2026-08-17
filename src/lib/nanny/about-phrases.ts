/**
 * The phrases a nanny can tap instead of facing a blank box.
 *
 * The blank box is where real people stopped. Christina and Leonor both reached
 * it and left, and it is the field that keeps a profile off the search page for
 * days. Federico's instinct was to remove free text entirely; the version that
 * shipped is pills first, because pills only produces fifteen profiles that read
 * the same, and a profile that reads like the last one is not a fast profile, it
 * is one no family bothers with.
 *
 * So these are written to compose. Four taps, one from each group in order,
 * should produce something a family would actually read: who she is, what she
 * has done, what she is like, what she wants next. Not decoration on top of a
 * box somebody still has to fill in.
 *
 * Two rules they all follow.
 *
 * No digits. Contact details are stripped from this field by a trigger, and a
 * run of nine or more digits is treated as a phone number. A phrase carrying a
 * number would be mangled by the time it was saved, and there is a test.
 *
 * Nothing anybody has to justify. "I am patient" is a claim about herself that
 * a family can weigh. "I have references" would be a claim about the world that
 * we have not checked, and putting it in her mouth would be us saying it.
 */

export type PhraseGroup = { label: string; phrases: string[] };

export const NANNY_ABOUT_PHRASES: PhraseGroup[] = [
  {
    label: "Start with who you are",
    phrases: [
      "I am a nanny living in the UAE",
      "I have been caring for children for several years",
      "I am new to professional childcare and I learn fast",
      "I have looked after children in my own family for years",
      "I moved here to work with families and children",
    ],
  },
  {
    label: "What you have done",
    phrases: [
      "I have cared for newborns",
      "I have looked after toddlers",
      "I have worked with school age children",
      "I have cared for a child with additional needs",
      "I have worked with more than one child at a time",
      "I have done school runs and homework",
      "I can cook family meals",
      "I help with the housework that comes with the children",
      "I am comfortable around pets",
    ],
  },
  {
    label: "What you are like",
    phrases: [
      "I am calm when things get busy",
      "I am patient and I do not raise my voice",
      "I am reliable and on time",
      "I like to keep a routine",
      "I play outside with children whenever I can",
      "I am tidy and I clean as I go",
      "I speak gently with children",
    ],
  },
  {
    label: "What you are looking for",
    phrases: [
      "I am looking for a family I can stay with for a long time",
      "I am available to start soon",
      "I am happy to live in or live out",
      "I would like to work full time",
      "I would like a few days a week",
      "I am open to talking about what a family needs",
    ],
  },
];

/** Flattened, in the order the groups are meant to be tapped. */
export const NANNY_ABOUT_PHRASE_LIST = NANNY_ABOUT_PHRASES.flatMap((g) => g.phrases);
