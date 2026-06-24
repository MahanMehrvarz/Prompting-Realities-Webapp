import type { DiffSegment } from "./textDiff";

export type DiffExportContext = {
  assistantName: string;
  olderLabel: string;
  newerLabel: string;
  olderDate: string;
  newerDate: string;
  segments: DiffSegment[];
  stats: { added: number; removed: number };
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "");
}

export function buildDiffFilename(ctx: DiffExportContext, ext: "html" | "md"): string {
  const name = sanitizeForFilename(ctx.assistantName) || "assistant";
  const today = new Date().toISOString().slice(0, 10);
  return `prompt-diff_${name}_${ctx.olderLabel}-to-${ctx.newerLabel}_${today}.${ext}`;
}

export function buildDiffHtml(ctx: DiffExportContext): string {
  const body = ctx.segments
    .map((seg) => {
      const text = escapeHtml(seg.text);
      if (seg.type === "added") return `<ins>${text}</ins>`;
      if (seg.type === "removed") return `<del>${text}</del>`;
      return text;
    })
    .join("");

  const title = `Prompt diff ${ctx.olderLabel} → ${ctx.newerLabel} — ${ctx.assistantName}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1d1d1d; background: #f8f7f2; margin: 0; padding: 32px; }
  .wrap { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; font-size: 12px; }
  .chip { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; background: #1d1d1d; color: #f8f7f2; }
  .arrow, .date { color: #6b7280; }
  .added-chip { background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .removed-chip { background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  pre.diff { white-space: pre-wrap; font-family: inherit; background: #fff; border: 3px solid #1d1d1d; border-radius: 20px; padding: 24px; box-shadow: 4px 4px 0 #1d1d1d; margin: 0; }
  ins { background: #d1fae5; color: #065f46; text-decoration: none; border-radius: 2px; padding: 0 2px; }
  del { background: #fee2e2; color: #991b1b; text-decoration: line-through; border-radius: 2px; padding: 0 2px; }
  @media print {
    body { background: #fff; padding: 0; }
    pre.diff { box-shadow: none; border-width: 2px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>${escapeHtml(ctx.assistantName)}</h1>
  <div class="meta">
    <span class="chip">${escapeHtml(ctx.olderLabel)}</span>
    <span class="arrow">→</span>
    <span class="chip">${escapeHtml(ctx.newerLabel)}</span>
    <span class="date">${escapeHtml(formatDate(ctx.olderDate))} → ${escapeHtml(formatDate(ctx.newerDate))}</span>
  </div>
  <div class="meta">
    ${ctx.stats.added > 0 ? `<span class="added-chip">+${ctx.stats.added} added</span>` : ""}
    ${ctx.stats.removed > 0 ? `<span class="removed-chip">−${ctx.stats.removed} removed</span>` : ""}
  </div>
  <pre class="diff">${body}</pre>
</div>
</body>
</html>
`;
}

export function buildDiffMarkdown(ctx: DiffExportContext): string {
  const wrap = (text: string, marker: string) =>
    text.split(/(\s+)/).map((part) => (/\S/.test(part) ? `${marker}${part}${marker}` : part)).join("");

  const body = ctx.segments
    .map((seg) => {
      if (seg.type === "added") return wrap(seg.text, "**");
      if (seg.type === "removed") return wrap(seg.text, "~~");
      return seg.text;
    })
    .join("");

  const statsLine = [
    ctx.stats.added > 0 ? `+${ctx.stats.added} added` : null,
    ctx.stats.removed > 0 ? `−${ctx.stats.removed} removed` : null,
  ].filter(Boolean).join(" · ");

  return [
    `# ${ctx.assistantName}`,
    "",
    `**${ctx.olderLabel} → ${ctx.newerLabel}**  `,
    `${formatDate(ctx.olderDate)} → ${formatDate(ctx.newerDate)}`,
    "",
    statsLine,
    "",
    "---",
    "",
    body,
    "",
  ].join("\n");
}

export function downloadTextFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
