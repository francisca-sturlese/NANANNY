import { Fragment } from "react";

/**
 * Markdown-lite, rendered without ever touching innerHTML.
 *
 * The admin writes paragraphs, "## headings", "- lists", **bold** and
 * [links](https://...). That is the whole language, and everything is built
 * as React elements from plain strings, so there is no HTML injection
 * surface at all: a pasted <script> renders as the text "<script>", which is
 * exactly what a typo deserves. A richer editor can come later; a sanitiser
 * bug cannot.
 */

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  // Bold first, then links inside each fragment.
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) => {
    const content = renderLinks(part, `${keyBase}-${i}`);
    return i % 2 === 1 ? <strong key={`${keyBase}-b${i}`}>{content}</strong> : (
      <Fragment key={`${keyBase}-f${i}`}>{content}</Fragment>
    );
  });
}

function renderLinks(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  LINK.lastIndex = 0;
  while ((match = LINK.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <a
        key={`${keyBase}-l${n++}`}
        href={match[2]}
        className="underline underline-offset-4"
        rel="noreferrer"
      >
        {match[1]}
      </a>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderBlogBody(body: string): React.ReactNode {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("### ")) {
      return (
        <h3 key={i} className="mt-8 text-lg font-semibold">
          {renderInline(trimmed.slice(4), `h3-${i}`)}
        </h3>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-10 text-xl font-semibold sm:text-2xl">
          {renderInline(trimmed.slice(3), `h2-${i}`)}
        </h2>
      );
    }
    const lines = trimmed.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      return (
        <ul key={i} className="mt-4 list-disc space-y-1.5 pl-5 text-muted">
          {lines.map((l, j) => (
            <li key={j} className="leading-relaxed">
              {renderInline(l.trim().slice(2), `li-${i}-${j}`)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="mt-4 leading-relaxed text-muted">
        {renderInline(lines.join(" "), `p-${i}`)}
      </p>
    );
  });
}
