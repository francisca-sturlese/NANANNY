"use client";

import { useState } from "react";

/**
 * Tap-to-write: a row of short phrases that fill a nearby field.
 *
 * Born from the founder's brief — "semplificare e velocizzare" — and from a
 * measured fact: the blank "About you" box is where real people stalled
 * (Christina, Leonor). A pill never sends anything by itself; it puts words
 * into the field, still editable, so the person keeps the last word. Used
 * pills fade out so the row shrinks as the text grows.
 *
 * `mode="append"` composes prose (each phrase becomes a sentence);
 * `mode="replace"` drafts a message (chat quick replies), where tapping a
 * second pill before sending replaces the draft rather than gluing questions
 * together.
 */
export function PhrasePills({
  targetId,
  phrases,
  mode = "append",
  label,
}: {
  /** id of the <textarea> or <input> the pills write into. */
  targetId: string;
  phrases: string[];
  mode?: "append" | "replace";
  label?: string;
}) {
  const [used, setUsed] = useState<Set<string>>(new Set());

  function apply(phrase: string) {
    const el = document.getElementById(targetId) as
      | HTMLTextAreaElement
      | HTMLInputElement
      | null;
    if (!el) return;

    if (mode === "append") {
      const current = el.value.trim();
      const sentence = phrase.endsWith(".") ? phrase : `${phrase}.`;
      el.value = current ? `${current} ${sentence}` : sentence;
      setUsed((prev) => new Set(prev).add(phrase));
    } else {
      el.value = phrase;
      // In replace mode the previous pill becomes available again: only the
      // one currently in the box counts as spent.
      setUsed(new Set([phrase]));
    }

    // React and any auto-resize handlers listen for input, not for us.
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }

  const visible = mode === "append" ? phrases.filter((p) => !used.has(p)) : phrases;
  if (visible.length === 0) return null;

  return (
    <div>
      {label && <p className="mb-1.5 text-xs text-muted">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {visible.map((phrase) => (
          <button
            key={phrase}
            type="button"
            onClick={() => apply(phrase)}
            className={`rounded-pill border px-3 py-1.5 text-xs leading-snug transition-colors ${
              mode === "replace" && used.has(phrase)
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-surface text-foreground hover:border-border-strong"
            }`}
          >
            {phrase}
          </button>
        ))}
      </div>
    </div>
  );
}
