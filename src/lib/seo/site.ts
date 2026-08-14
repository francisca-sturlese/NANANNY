/**
 * The site's own address, and the small helpers built on it.
 *
 * Everything that produces a URL for someone else to store, follow, or index
 * goes through here: canonical links, the sitemap, structured data. Building
 * those from the request would let a request arriving on a stray hostname mint
 * canonicals pointing at that hostname, which is how a staging domain ends up
 * in search results.
 */

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Canonical link for a page, in the shape `metadata.alternates` expects. */
export function canonical(path: string): { canonical: string } {
  return { canonical: absoluteUrl(path) };
}

/**
 * JSON-LD as a string safe to place inside a script tag.
 *
 * `JSON.stringify` will happily emit a literal `</script>` if a nanny writes
 * one in her headline, which closes the tag early and lets whatever follows be
 * parsed as HTML. Escaping the angle bracket is what stops that, and it is why
 * this goes through one function rather than being inlined at each call site.
 *
 * The result is passed as a child of `<script>`, not through
 * `dangerouslySetInnerHTML`. React renders it as text either way, and keeping
 * that API unused across the whole codebase is an assumption the Content
 * Security Policy leans on.
 */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
