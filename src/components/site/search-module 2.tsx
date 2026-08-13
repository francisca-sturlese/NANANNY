import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import {
  ARRANGEMENTS,
  CHILD_AGE_BANDS,
  EMIRATES,
  EMPLOYMENT_TYPES,
  EXPERIENCE_BANDS,
  LANGUAGES,
  SALARY_BANDS,
} from "@/lib/uae";

/**
 * The homepage search (PRD §6). A plain GET form pointed at /nannies: the
 * results page reads the same query params whether they came from here, from a
 * shared link, or from the filter rail on the results page itself.
 */
export function SearchModule() {
  return (
    <form
      action="/nannies"
      method="get"
      className="rounded-xl border border-border bg-surface-raised p-5 shadow-raised sm:p-7"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FieldWrap label="Location">
          <Select name="emirate" defaultValue="">
            <option value="">Any emirate</option>
            {EMIRATES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </FieldWrap>

        <FieldWrap label="Live in or live out">
          <Select name="arrangement" defaultValue="">
            <option value="">Either</option>
            {ARRANGEMENTS.filter((a) => a.value !== "either").map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </FieldWrap>

        <FieldWrap label="Availability">
          <Select name="employment" defaultValue="">
            <option value="">Any schedule</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </FieldWrap>

        <FieldWrap label="Children age">
          <Select name="child_age" defaultValue="">
            <option value="">Any age</option>
            {CHILD_AGE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </FieldWrap>

        <FieldWrap label="Experience">
          <Select name="experience" defaultValue="">
            <option value="">Any experience</option>
            {EXPERIENCE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </FieldWrap>

        <FieldWrap label="Languages">
          <Select name="language" defaultValue="">
            <option value="">Any language</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </FieldWrap>

        <FieldWrap label="Salary">
          <Select name="salary_max" defaultValue="">
            <option value="">Any budget</option>
            {SALARY_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </FieldWrap>

        <div className="flex items-end">
          <Button type="submit" size="lg" block>
            Find Matches
          </Button>
        </div>
      </div>

      <p className="mt-4 text-xs text-subtle">
        Browsing and viewing profiles is always free. No account needed to look around.
      </p>
    </form>
  );
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
