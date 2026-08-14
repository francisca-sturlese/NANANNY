"use client";

import { useState } from "react";
import { Select } from "@/components/ui/field";

/**
 * Three scrollable selects instead of a native date input.
 *
 * The native input defaulted its year segment to the current year and asked
 * the person to type over it, which on a phone is exactly where a first-time
 * user gives up. Day, month and year as selects scroll like everything else
 * on the phone; the year list runs newest-adult first, back to 1910.
 *
 * The form contract is unchanged: a hidden input still submits
 * `dateOfBirth` as YYYY-MM-DD, and stays empty until all three parts are
 * chosen, so the server-side "Date of birth is required" check keeps working.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const OLDEST_YEAR = 1910;
const ADULT_AGE = 18;

function compose(day: string, month: string, year: string): string {
  if (!day || !month || !year) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function DateOfBirthSelect({ defaultValue }: { defaultValue?: string | null }) {
  const [initYear, initMonth, initDay] = (defaultValue ?? "").split("-");
  const [day, setDay] = useState(initDay ? String(Number(initDay)) : "");
  const [month, setMonth] = useState(initMonth ? String(Number(initMonth)) : "");
  const [year, setYear] = useState(initYear ?? "");

  const newestYear = new Date().getFullYear() - ADULT_AGE;
  const years: number[] = [];
  for (let y = newestYear; y >= OLDEST_YEAR; y--) years.push(y);

  return (
    <div className="grid grid-cols-3 gap-2">
      <Select
        id="dateOfBirth-day"
        aria-label="Day of birth"
        value={day}
        onChange={(e) => setDay(e.target.value)}
        required
      >
        <option value="">Day</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={String(d)}>
            {d}
          </option>
        ))}
      </Select>
      <Select
        id="dateOfBirth-month"
        aria-label="Month of birth"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        required
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1)}>
            {m}
          </option>
        ))}
      </Select>
      <Select
        id="dateOfBirth-year"
        aria-label="Year of birth"
        value={year}
        onChange={(e) => setYear(e.target.value)}
        required
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </Select>
      <input type="hidden" id="dateOfBirth" name="dateOfBirth" value={compose(day, month, year)} />
    </div>
  );
}
