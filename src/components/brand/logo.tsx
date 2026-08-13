/**
 * NaNanny brand marks, rebuilt as vectors from the brand sheet.
 *
 * The mark is two figures — a sage one and a peach one — whose bodies form the
 * two lobes of a heart, with a butter-yellow heart nested where they meet.
 * Everything is geometry, no raster: it stays crisp at favicon size and at
 * 1024px app-icon size from the same source.
 */

type Tone = "brand" | "black" | "white";

const TONES: Record<Tone, { sage: string; peach: string; butter: string; text: string }> = {
  brand: { sage: "#C7D2CC", peach: "#FCE1D8", butter: "#FCF6CA", text: "#000000" },
  black: { sage: "#000000", peach: "#000000", butter: "#FFFFFF", text: "#000000" },
  white: { sage: "#FFFFFF", peach: "#FFFFFF", butter: "#000000", text: "#FFFFFF" },
};

export function LogoMark({
  tone = "brand",
  className,
  title = "NaNanny",
}: {
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  const c = TONES[tone];
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Heads */}
      <circle cx="31" cy="21" r="11.5" fill={c.sage} />
      <circle cx="69" cy="19" r="12.5" fill={c.peach} />

      {/* Bodies — the left and right lobes of a single heart silhouette */}
      <path
        d="M50 90C34.5 81.5 18 70.5 18 55.5C18 43.5 26 35.5 36 35.5C43.5 35.5 49 41 50 47.5Z"
        fill={c.sage}
      />
      <path
        d="M50 90C65.5 81.5 82 70.5 82 55.5C82 43.5 74 35.5 64 35.5C56.5 35.5 51 41 50 47.5Z"
        fill={c.peach}
      />

      {/* The heart held between them */}
      <path
        d="M50 81.5C42.5 76.5 33 69.5 33 60.5C33 53.8 37.4 49.5 43 49.5C46.4 49.5 48.9 51.6 50 54.4C51.1 51.6 53.6 49.5 57 49.5C62.6 49.5 67 53.8 67 60.5C67 69.5 57.5 76.5 50 81.5Z"
        fill={c.butter}
      />
    </svg>
  );
}

/**
 * Horizontal lockup: mark + "NaNanny" + the ruled "U A E" line.
 * `withTagline` adds FIND. MATCH. CONNECT. underneath.
 */
export function Logo({
  tone = "brand",
  withTagline = false,
  className,
}: {
  tone?: Tone;
  withTagline?: boolean;
  className?: string;
}) {
  const c = TONES[tone];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark tone={tone} className="h-9 w-9 shrink-0" />
      <span className="flex flex-col leading-none">
        <span
          className="text-[1.6rem] font-medium tracking-[-0.03em]"
          style={{ color: c.text }}
        >
          NaNanny
        </span>
        <span className="mt-1 flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-px w-3 shrink-0"
            style={{ background: tone === "brand" ? "var(--sage)" : c.text, opacity: 0.7 }}
          />
          <span
            className="text-[0.5rem] font-medium tracking-[0.34em]"
            style={{ color: c.text }}
          >
            UAE
          </span>
          <span
            aria-hidden
            className="h-px w-3 shrink-0"
            style={{ background: tone === "brand" ? "var(--sage)" : c.text, opacity: 0.7 }}
          />
        </span>
        {withTagline && (
          <span
            className="mt-1.5 text-[0.5rem] font-medium tracking-[0.24em]"
            style={{ color: c.text, opacity: 0.6 }}
          >
            FIND. MATCH. CONNECT.
          </span>
        )}
      </span>
    </span>
  );
}
