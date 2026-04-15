export type DiffSegment = { type: "equal" | "added" | "removed"; text: string };

/**
 * Word-level diff using Longest Common Subsequence.
 * Splits on whitespace boundaries, compares words, then reassembles with original spacing.
 */
export function computeWordDiff(oldText: string, newText: string): DiffSegment[] {
  const oldWords = tokenize(oldText);
  const newWords = tokenize(newText);

  const lcs = buildLCS(oldWords, newWords);
  const segments: DiffSegment[] = [];

  let oi = 0;
  let ni = 0;
  let li = 0;

  while (oi < oldWords.length || ni < newWords.length) {
    if (li < lcs.length && oi < oldWords.length && ni < newWords.length && oldWords[oi] === lcs[li] && newWords[ni] === lcs[li]) {
      push(segments, "equal", oldWords[oi]);
      oi++;
      ni++;
      li++;
    } else if (li < lcs.length && ni < newWords.length && newWords[ni] === lcs[li]) {
      push(segments, "removed", oldWords[oi]);
      oi++;
    } else if (li < lcs.length && oi < oldWords.length && oldWords[oi] === lcs[li]) {
      push(segments, "added", newWords[ni]);
      ni++;
    } else {
      if (oi < oldWords.length) {
        push(segments, "removed", oldWords[oi]);
        oi++;
      }
      if (ni < newWords.length) {
        push(segments, "added", newWords[ni]);
        ni++;
      }
    }
  }

  return segments;
}

/** Count added/removed words (ignoring whitespace-only tokens). */
export function diffStats(segments: DiffSegment[]) {
  let added = 0;
  let removed = 0;
  for (const s of segments) {
    if (s.text.trim() === "") continue;
    if (s.type === "added") added++;
    if (s.type === "removed") removed++;
  }
  return { added, removed };
}

// --- internals ---

function tokenize(text: string): string[] {
  // Split into alternating words and whitespace runs so we preserve formatting
  return text.match(/\S+|\s+/g) || [];
}

function buildLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  // DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result.reverse();
}

function push(segments: DiffSegment[], type: DiffSegment["type"], text: string) {
  const last = segments[segments.length - 1];
  if (last && last.type === type) {
    last.text += text;
  } else {
    segments.push({ type, text });
  }
}
