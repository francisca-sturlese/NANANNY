/**
 * UAE reference data shared by search, onboarding and job posting.
 * Kept as one list so a filter and a profile form can never drift apart.
 */

export const EMIRATES = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Fujairah",
  "Umm Al Quwain",
] as const;

/** Popular residential areas, used as search suggestions rather than a closed set. */
export const AREAS: Record<string, string[]> = {
  Dubai: [
    "Dubai Hills",
    "Arabian Ranches",
    "Downtown Dubai",
    "Dubai Marina",
    "Jumeirah",
    "Umm Suqeim",
    "Emirates Hills",
    "Mirdif",
    "Al Barsha",
    "Business Bay",
    "Palm Jumeirah",
    "Jumeirah Village Circle",
    "The Springs",
    "Motor City",
    "Silicon Oasis",
  ],
  "Abu Dhabi": [
    "Al Reem Island",
    "Saadiyat Island",
    "Yas Island",
    "Khalifa City",
    "Al Raha Beach",
    "Al Bateen",
    "Corniche",
    "Masdar City",
  ],
  Sharjah: ["Al Majaz", "Al Khan", "Muweilah", "Al Nahda"],
};

export const LANGUAGES = [
  "English",
  "Arabic",
  "Hindi",
  "Urdu",
  "Tagalog",
  "Malayalam",
  "Tamil",
  "Bengali",
  "Nepali",
  "Amharic",
  "Sinhala",
  "French",
  "Russian",
  "Spanish",
] as const;

export const NATIONALITIES = [
  "Filipino",
  "Indian",
  "Sri Lankan",
  "Nepali",
  "Ethiopian",
  "Kenyan",
  "Ugandan",
  "Indonesian",
  "Bangladeshi",
  "Pakistani",
  "Moroccan",
  "Egyptian",
  "South African",
  "British",
  "Other",
] as const;

export const WORKING_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const ARRANGEMENTS = [
  { value: "live_out", label: "Live out" },
  { value: "live_in", label: "Live in" },
  { value: "either", label: "Either" },
] as const;

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  // A few afternoons a week is not part time in any sense the rest of this
  // list captures, and it is what a lot of families in the UAE actually want.
  { value: "hourly", label: "By the hour" },
  { value: "weekend", label: "Weekend" },
  { value: "night_care", label: "Night care" },
  { value: "temporary", label: "Temporary" },
] as const;

/**
 * What a family will accept on visas.
 *
 * Optional, unlike the nanny's own status which is required. A nanny always
 * knows hers. A family often has not decided whether it would sponsor until it
 * meets somebody worth sponsoring, and forcing the question turns a real "we
 * are open to it" into a wrong answer.
 */
export const VISA_PREFERENCES = [
  { value: "any", label: "No preference", forNannies: "Open to any visa status" },
  {
    value: "own_visa_only",
    label: "Own visa only",
    forNannies: "You need your own visa or to be on a family visa",
  },
  {
    value: "will_sponsor",
    label: "Willing to sponsor",
    forNannies: "This family is willing to sponsor your visa",
  },
] as const;

export const CHILD_AGE_BANDS = [
  { value: "newborn", label: "Newborn (0 to 12 months)" },
  { value: "toddler", label: "Toddler (1 to 3 years)" },
  { value: "school_age", label: "School age (4 to 11 years)" },
  { value: "special_needs", label: "Special needs" },
] as const;

export const EXPERIENCE_BANDS = [
  { value: "1", label: "1+ years" },
  { value: "3", label: "3+ years" },
  { value: "5", label: "5+ years" },
  { value: "10", label: "10+ years" },
] as const;

export const SALARY_BANDS = [
  { value: "2000", label: "Up to AED 2,000" },
  { value: "3000", label: "Up to AED 3,000" },
  { value: "4000", label: "Up to AED 4,000" },
  { value: "5000", label: "Up to AED 5,000" },
  { value: "6000", label: "Up to AED 6,000" },
  { value: "99999", label: "Any budget" },
] as const;
