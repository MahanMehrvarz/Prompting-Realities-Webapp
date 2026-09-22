import { Fragment, type ReactNode } from "react";

/**
 * Renders the small inline syntax used in tutorial copy: **bold**, `code` and
 * [label](href). Parsed into React nodes rather than injected as HTML, so
 * nothing in the content can smuggle markup through.
 */
const PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

export function RichText({ body }: { body: string }) {
  const parts = body.split(PATTERN).filter(Boolean);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-bold text-[var(--ink-dark)]">
              {part.slice(2, -2)}
            </strong>
          );
        }

        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded border border-[var(--card-shell)]/25 bg-[var(--card-shell)]/[0.07] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--ink-dark)] [overflow-wrap:anywhere]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
          const [, label, href] = link;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--ink-dark)] underline decoration-2 underline-offset-2 transition hover:text-[var(--accent-green)]"
            >
              {label}
            </a>
          );
        }

        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function renderRich(body: string): ReactNode {
  return <RichText body={body} />;
}
