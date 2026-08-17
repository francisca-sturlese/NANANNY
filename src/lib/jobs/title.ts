/**
 * A job title written from what a family already chose.
 *
 * Asking for one is asking somebody to name a thing they have not finished
 * describing, in a box at the top of a form, before they know what the form is
 * going to want. It is the first field on the page and the one people stare at.
 *
 * Everything a title needs is further down the same form and already picked
 * from lists: live in or live out, full time or by the hour, how many children,
 * which emirate. So it is composed rather than requested, shown as it composes,
 * and still editable by anybody who has a better one.
 *
 * Shared between the browser and the server on purpose. The browser shows it
 * as the family fills the form, and the server writes it when the box is left
 * empty, and a title that differed between the two would be the kind of small
 * wrongness nobody can explain later.
 */

const ARRANGEMENT: Record<string, string> = {
  live_in: "Live in",
  live_out: "Live out",
  flexible: "Live in or live out",
};

const EMPLOYMENT: Record<string, string> = {
  full_time: "full time",
  part_time: "part time",
  hourly: "by the hour",
  temporary: "temporary",
};

const COUNT_WORD = ["", "one", "two", "three", "four", "five", "six"];

export type JobTitleParts = {
  arrangement?: string | null;
  employmentType?: string | null;
  childrenCount?: number | null;
  emirate?: string | null;
  area?: string | null;
};

export function suggestJobTitle(parts: JobTitleParts): string {
  const arrangement = ARRANGEMENT[parts.arrangement ?? ""] ?? "";
  const employment = EMPLOYMENT[parts.employmentType ?? ""] ?? "";

  // "Live out full time nanny", or just "Nanny" when nothing is chosen yet.
  const lead = [arrangement, employment].filter(Boolean).join(" ");
  const opening = lead ? `${lead} nanny` : "Nanny";

  const count = parts.childrenCount ?? 0;
  const children =
    count > 0
      ? ` for ${COUNT_WORD[count] ?? count} ${count === 1 ? "child" : "children"}`
      : "";

  // The area if there is one, because "in Dubai Hills" tells a nanny whether
  // the commute is possible and "in Dubai" does not.
  const place = parts.area?.trim()
    ? ` in ${parts.area.trim()}`
    : parts.emirate?.trim()
      ? ` in ${parts.emirate.trim()}`
      : "";

  const title = `${opening}${children}${place}`;

  // Capitalised once, at the front. Everything after it is already lower case
  // by design: "Live out full time nanny", not "Live Out Full Time Nanny".
  return title.charAt(0).toUpperCase() + title.slice(1);
}
