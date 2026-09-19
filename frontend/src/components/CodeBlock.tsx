"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Standard code-block affordance: the copy button sits inside the block at the
 * top right, over the code, the way GitHub/MDN/Stripe do it — not on a separate
 * row above. The filename sits in a header bar so the button has something to
 * align against and never covers the first line of code.
 */
export function CodeBlock({ body, caption }: { body: string; caption?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // The clipboard API needs a secure context and can be blocked outright;
      // fall back to a hidden textarea so the button still works.
      const textarea = document.createElement("textarea");
      textarea.value = body;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        return;
      } finally {
        document.body.removeChild(textarea);
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const button = (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : "Copy code to clipboard"}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--card-fill)]/25 bg-[var(--card-fill)]/10 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--card-fill)] transition hover:bg-[var(--card-fill)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-green)]"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-[var(--accent-green)]" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" aria-hidden="true" />
          Copy
        </>
      )}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] shadow-[4px_4px_0_var(--shadow-deep)]">
      {caption ? (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--card-fill)]/15 px-4 py-2">
          <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--card-fill)]/70">
            {caption}
          </span>
          {button}
        </div>
      ) : (
        <div className="flex justify-end px-3 pt-3">{button}</div>
      )}

      {/* Wraps rather than scrolls: long lines stay readable without a
          horizontal scrollbar, and nothing is hidden off the right edge.
          `anywhere` so an unbroken token (a long URL) still breaks. */}
      <pre className="whitespace-pre-wrap p-4 text-[12px] leading-relaxed text-[var(--card-fill)] [overflow-wrap:anywhere] lg:text-[13px]">
        <code>{body}</code>
      </pre>
    </div>
  );
}
