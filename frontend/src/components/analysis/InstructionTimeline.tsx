"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, GitCompareArrows, ArrowRight, X, Search, Plus, Tag, Trash2 } from "lucide-react";
import { analysisApi, type InstructionVersion, type InstructionHighlight, type AnalysisCode } from "@/lib/backendApi";
import { computeWordDiff, diffStats, type DiffSegment } from "@/lib/textDiff";

const PRESET_COLORS = ["#fde68a", "#a7f3d0", "#bfdbfe", "#fecaca", "#ddd6fe", "#fed7aa", "#e9d5ff", "#99f6e4"];
function randomColor() { return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]; }

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Code tooltip (inline in diff view)
// ---------------------------------------------------------------------------
function CodeTooltip({
  codes,
  position,
  saving = false,
  onCodeSelect,
  onCodeCreate,
  onDismiss,
}: {
  codes: AnalysisCode[];
  position: { x: number; y: number };
  saving?: boolean;
  onCodeSelect: (codeId: string) => void;
  onCodeCreate: (name: string, color: string) => Promise<string>;
  onDismiss: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = codes.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = codes.some((c) => c.name.toLowerCase() === query.toLowerCase());

  const handleCreate = async () => {
    if (!query.trim()) return;
    const color = randomColor();
    const id = await onCodeCreate(query.trim(), color);
    onCodeSelect(id);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={saving ? undefined : onDismiss} />
      <div
        role="dialog"
        aria-label="Assign code"
        className="fixed z-50 rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] shadow-[8px_8px_0_var(--shadow-deep)] overflow-hidden"
        style={{ left: position.x, top: position.y, width: 280, maxHeight: 320, opacity: saving ? 0.6 : 1, pointerEvents: saving ? "none" : "auto" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-[var(--card-shell)]">
          <Search className="h-4 w-4 text-[var(--ink-muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter on exact single match assigns. Enter on an empty /
              // partial query requires the explicit "Create" button so
              // users don't accidentally spawn stray codes mid-typing —
              // same rule as the thread-page picker.
              if (e.key === "Escape") onDismiss();
              if (e.key === "Enter" && filtered.length === 1) onCodeSelect(filtered[0].id);
            }}
            placeholder="Search or create code…"
            className="flex-1 bg-transparent text-sm outline-none text-[var(--ink-dark)] placeholder:text-[var(--ink-muted)]"
          />
        </div>
        <div className="max-h-56 overflow-y-auto">
          {filtered.map((code) => (
            <button key={code.id} onClick={() => onCodeSelect(code.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-white transition group">
              <span className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10" style={{ backgroundColor: code.color }} />
              <span className="flex-1 text-[var(--ink-dark)] font-medium truncate">{code.name}</span>
              {code.usage_count !== undefined && (
                <span className="text-xs text-[var(--ink-muted)] group-hover:text-[var(--ink-dark)]">×{code.usage_count}</span>
              )}
            </button>
          ))}
          {!exactMatch && query.trim() && (
            <>
              {filtered.length > 0 && <div className="border-t border-[var(--card-shell)]/50" />}
              <button onClick={handleCreate}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-[#2563eb] hover:bg-[#e5f5ff] transition">
                <span className="w-3 h-3 rounded-full border-2 border-dashed border-[#2563eb] flex-shrink-0 flex items-center justify-center">
                  <Plus className="h-2 w-2" />
                </span>
                <span>Create &ldquo;{query.trim()}&rdquo;</span>
              </button>
            </>
          )}
          {filtered.length === 0 && !query.trim() && (
            <div className="px-3 py-4 text-sm text-[var(--ink-muted)] text-center">No codes yet. Type to create one.</div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Diff renderer with highlight support + text selection
// ---------------------------------------------------------------------------
function DiffView({
  older,
  newer,
  instructions,
  highlights,
  codes,
  listId,
  token,
  assistantId,
  onHighlightCreated,
  onCodeCreate,
  onDeleteHighlight,
}: {
  older: InstructionVersion;
  newer: InstructionVersion;
  instructions: InstructionVersion[];
  highlights: InstructionHighlight[];
  codes: AnalysisCode[];
  listId: string | null;
  token: string | null;
  assistantId: string;
  onHighlightCreated: () => void;
  onCodeCreate: (name: string, color: string) => Promise<string>;
  onDeleteHighlight: (id: string) => void;
}) {
  const segments = computeWordDiff(older.instruction_text, newer.instruction_text);
  const stats = diffStats(segments);
  const idxOlder = instructions.findIndex((v) => v.id === older.id);
  const idxNewer = instructions.findIndex((v) => v.id === newer.id);
  const diffRef = useRef<HTMLPreElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ text: string; start: number; end: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Filter highlights for this specific comparison
  const activeHighlights = highlights.filter(
    (h) => h.older_version_id === older.id && h.newer_version_id === newer.id
  );

  const handleMouseUp = useCallback(() => {
    if (!listId || !token) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !diffRef.current) return;

    const range = sel.getRangeAt(0);
    if (!diffRef.current.contains(range.commonAncestorContainer)) return;

    const text = sel.toString().trim();
    if (!text) return;

    // Compute char offset relative to diffRef textContent
    const preRange = document.createRange();
    preRange.setStart(diffRef.current, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const charStart = preRange.toString().length;
    const charEnd = charStart + sel.toString().length;

    // Position tooltip near the selection
    const rect = range.getBoundingClientRect();
    setTooltipPos({ x: Math.min(rect.left, window.innerWidth - 300), y: rect.bottom + 8 });
    setPendingSelection({ text, start: charStart, end: charEnd });
  }, [listId, token]);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const handleCodeSelect = async (codeId: string) => {
    if (!pendingSelection || !listId || !token || saving) return;
    setSaving(true);
    try {
      await analysisApi.createInstructionHighlight({
        list_id: listId,
        assistant_id: assistantId,
        older_version_id: older.id,
        newer_version_id: newer.id,
        selected_text: pendingSelection.text.slice(0, 200),
        char_start: pendingSelection.start,
        char_end: pendingSelection.end,
        code_id: codeId,
      }, token);
      window.getSelection()?.removeAllRanges();
      setTooltipPos(null);
      setPendingSelection(null);
      onHighlightCreated();
    } catch {
      alert("Failed to save highlight.");
    } finally {
      setSaving(false);
    }
  };

  const dismissTooltip = () => {
    window.getSelection()?.removeAllRanges();
    setTooltipPos(null);
    setPendingSelection(null);
  };

  // Build highlighted text with inline code chips
  const fullText = segments.map((s) => s.text).join("");
  const renderWithHighlights = () => {
    if (activeHighlights.length === 0) {
      return segments.map((seg, i) => <DiffSpan key={i} segment={seg} />);
    }

    // Build char-level map of highlight coverage
    type HlMark = { highlight: InstructionHighlight; code: InstructionHighlight["codes"][0] };
    const marks: (HlMark | null)[] = new Array(fullText.length).fill(null);
    for (const hl of activeHighlights) {
      for (let i = hl.char_start; i < hl.char_end && i < marks.length; i++) {
        if (!marks[i] && hl.codes.length > 0) {
          marks[i] = { highlight: hl, code: hl.codes[0] };
        }
      }
    }

    // Render segments with highlight backgrounds
    let charPos = 0;
    return segments.map((seg, si) => {
      const segStart = charPos;
      charPos += seg.text.length;

      // Check if any part of this segment is highlighted
      let hasHl = false;
      for (let i = segStart; i < charPos; i++) {
        if (marks[i]) { hasHl = true; break; }
      }

      if (!hasHl) {
        return <DiffSpan key={si} segment={seg} />;
      }

      // Split segment into highlighted/unhighlighted runs
      const parts: React.ReactNode[] = [];
      let runStart = segStart;
      let currentMark: HlMark | null = marks[segStart];

      for (let i = segStart + 1; i <= charPos; i++) {
        const m = i < charPos ? marks[i] : null;
        const sameRun = m?.highlight.id === currentMark?.highlight.id;
        if (!sameRun || i === charPos) {
          const text = fullText.slice(runStart, i);
          if (currentMark) {
            parts.push(
              <span
                key={`${si}-${runStart}`}
                className="rounded-sm px-0.5"
                style={{ backgroundColor: hexToRgba(currentMark.code.color, 0.35), borderBottom: `2px solid ${currentMark.code.color}` }}
                title={currentMark.code.name}
              >
                {seg.type === "added" ? (
                  <span className="text-[#065f46]">{text}</span>
                ) : seg.type === "removed" ? (
                  <span className="text-[#991b1b] line-through">{text}</span>
                ) : (
                  text
                )}
              </span>
            );
          } else {
            const subSeg = { ...seg, text };
            parts.push(<DiffSpan key={`${si}-${runStart}`} segment={subSeg} />);
          }
          runStart = i;
          currentMark = m;
        }
      }
      return <span key={si}>{parts}</span>;
    });
  };

  if (stats.added === 0 && stats.removed === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <div>
          <FileText className="h-10 w-10 text-[var(--ink-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--ink-muted)] font-medium">These versions are identical.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      {/* Diff header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="rounded-full bg-[var(--card-shell)] px-2.5 py-1 text-[10px] font-bold text-[var(--card-fill)]">
          v{instructions.length - idxOlder}
        </span>
        <ArrowRight className="h-4 w-4 text-[var(--ink-muted)]" />
        <span className="rounded-full bg-[var(--card-shell)] px-2.5 py-1 text-[10px] font-bold text-[var(--card-fill)]">
          v{instructions.length - idxNewer}
        </span>
        <span className="text-xs text-[var(--ink-muted)]">
          {formatDateShort(older.saved_at)} → {formatDateShort(newer.saved_at)}
        </span>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-5">
        {stats.added > 0 && (
          <span className="rounded-full bg-[#d1fae5] px-2.5 py-1 text-xs font-semibold text-[#065f46]">
            +{stats.added} added
          </span>
        )}
        {stats.removed > 0 && (
          <span className="rounded-full bg-[#fee2e2] px-2.5 py-1 text-xs font-semibold text-[#991b1b]">
            −{stats.removed} removed
          </span>
        )}
        {listId && (
          <span className="rounded-full bg-white border-2 border-[var(--card-shell)] px-2.5 py-1 text-xs text-[var(--ink-muted)]">
            Select text to code
          </span>
        )}
      </div>

      {/* Diff body */}
      <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-6 shadow-[4px_4px_0_var(--card-shell)]">
        <pre ref={diffRef} className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
          {renderWithHighlights()}
        </pre>
      </div>

      {/* Coded annotations for this comparison */}
      {activeHighlights.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-black text-[var(--ink-dark)] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Tag className="h-3.5 w-3.5" />
            Coded changes ({activeHighlights.length})
          </h3>
          <div className="space-y-2">
            {activeHighlights.map((hl) => (
              <div
                key={hl.id}
                className="rounded-[12px] border-2 border-[var(--card-shell)] bg-[var(--card-fill)] p-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {hl.codes.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: hexToRgba(c.color, 0.35), color: "#1d1d1d" }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    ))}
                    {hl.codes.length === 0 && (
                      <span className="text-[10px] text-[var(--ink-muted)] italic">No codes</span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--ink-muted)] line-clamp-2 italic">
                    &ldquo;{hl.selected_text}&rdquo;
                  </p>
                </div>
                {listId && (
                  <button
                    onClick={() => onDeleteHighlight(hl.id)}
                    className="rounded-full border-2 border-[var(--card-shell)] bg-white p-1.5 hover:bg-[var(--accent-red)] hover:text-white hover:border-[var(--accent-red)] transition flex-shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code tooltip */}
      {tooltipPos && pendingSelection && listId && (
        <CodeTooltip
          codes={codes}
          position={tooltipPos}
          saving={saving}
          onCodeSelect={handleCodeSelect}
          onCodeCreate={onCodeCreate}
          onDismiss={dismissTooltip}
        />
      )}
    </div>
  );
}

function DiffSpan({ segment }: { segment: DiffSegment }) {
  if (segment.type === "equal") return <>{segment.text}</>;
  if (segment.type === "added") {
    return (
      <span className="bg-[#d1fae5] text-[#065f46] rounded-sm px-0.5">{segment.text}</span>
    );
  }
  return (
    <span className="bg-[#fee2e2] text-[#991b1b] line-through rounded-sm px-0.5">{segment.text}</span>
  );
}

// ---------------------------------------------------------------------------
// Single-version reader with text selection + coding
// ---------------------------------------------------------------------------
function ReaderView({
  version,
  instructions,
  highlights,
  codes,
  listId,
  token,
  assistantId,
  onHighlightCreated,
  onCodeCreate,
  onDeleteHighlight,
}: {
  version: InstructionVersion;
  instructions: InstructionVersion[];
  highlights: InstructionHighlight[];
  codes: AnalysisCode[];
  listId: string | null;
  token: string | null;
  assistantId: string;
  onHighlightCreated: () => void;
  onCodeCreate: (name: string, color: string) => Promise<string>;
  onDeleteHighlight: (id: string) => void;
}) {
  const readerRef = useRef<HTMLPreElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ text: string; start: number; end: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // For single-version highlights, we use the version as both older and newer
  const versionHighlights = highlights.filter(
    (h) => h.older_version_id === version.id && h.newer_version_id === version.id
  );

  const handleMouseUp = useCallback(() => {
    if (!listId || !token) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !readerRef.current) return;

    const range = sel.getRangeAt(0);
    if (!readerRef.current.contains(range.commonAncestorContainer)) return;

    const text = sel.toString().trim();
    if (!text) return;

    const preRange = document.createRange();
    preRange.setStart(readerRef.current, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const charStart = preRange.toString().length;
    const charEnd = charStart + sel.toString().length;

    const rect = range.getBoundingClientRect();
    setTooltipPos({ x: Math.min(rect.left, window.innerWidth - 300), y: rect.bottom + 8 });
    setPendingSelection({ text, start: charStart, end: charEnd });
  }, [listId, token]);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const handleCodeSelect = async (codeId: string) => {
    if (!pendingSelection || !listId || !token || saving) return;
    setSaving(true);
    try {
      await analysisApi.createInstructionHighlight({
        list_id: listId,
        assistant_id: assistantId,
        older_version_id: version.id,
        newer_version_id: version.id,
        selected_text: pendingSelection.text.slice(0, 200),
        char_start: pendingSelection.start,
        char_end: pendingSelection.end,
        code_id: codeId,
      }, token);
      window.getSelection()?.removeAllRanges();
      setTooltipPos(null);
      setPendingSelection(null);
      onHighlightCreated();
    } catch {
      alert("Failed to save highlight.");
    } finally {
      setSaving(false);
    }
  };

  const dismissTooltip = () => {
    window.getSelection()?.removeAllRanges();
    setTooltipPos(null);
    setPendingSelection(null);
  };

  const vIdx = instructions.findIndex((v) => v.id === version.id);

  // Render text with highlights
  const renderText = () => {
    const text = version.instruction_text;
    if (versionHighlights.length === 0) return text;

    type HlMark = { highlight: InstructionHighlight; code: InstructionHighlight["codes"][0] };
    const marks: (HlMark | null)[] = new Array(text.length).fill(null);
    for (const hl of versionHighlights) {
      for (let i = hl.char_start; i < hl.char_end && i < marks.length; i++) {
        if (!marks[i] && hl.codes.length > 0) {
          marks[i] = { highlight: hl, code: hl.codes[0] };
        }
      }
    }

    const parts: React.ReactNode[] = [];
    let runStart = 0;
    let currentMark: HlMark | null = marks[0];

    for (let i = 1; i <= text.length; i++) {
      const m = i < text.length ? marks[i] : null;
      if (m?.highlight.id !== currentMark?.highlight.id || i === text.length) {
        const chunk = text.slice(runStart, i);
        if (currentMark) {
          parts.push(
            <span
              key={runStart}
              className="rounded-sm px-0.5"
              style={{ backgroundColor: hexToRgba(currentMark.code.color, 0.35), borderBottom: `2px solid ${currentMark.code.color}` }}
              title={currentMark.code.name}
            >
              {chunk}
            </span>
          );
        } else {
          parts.push(<span key={runStart}>{chunk}</span>);
        }
        runStart = i;
        currentMark = m;
      }
    }
    return parts;
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      {/* Reader header */}
      <div className="flex items-center gap-3 mb-5">
        <span className="rounded-full bg-[var(--card-shell)] px-2.5 py-1 text-[10px] font-bold text-[var(--card-fill)]">
          v{instructions.length - vIdx}
        </span>
        <span className="text-sm font-medium text-[var(--ink-dark)]">
          {formatDateShort(version.saved_at)}
        </span>
        <span className="text-xs text-[var(--ink-muted)]">
          {wordCount(version.instruction_text)} words
        </span>
        {vIdx === 0 && (
          <span className="rounded-full bg-[var(--accent-green)] px-2.5 py-1 text-[10px] font-bold text-[var(--ink-dark)]">
            current
          </span>
        )}
        {listId && (
          <span className="rounded-full bg-white border-2 border-[var(--card-shell)] px-2.5 py-1 text-xs text-[var(--ink-muted)]">
            Select text to code
          </span>
        )}
      </div>

      {/* Instruction text */}
      <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-6 shadow-[4px_4px_0_var(--card-shell)]">
        <pre ref={readerRef} className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-[var(--ink-dark)]">
          {renderText()}
        </pre>
      </div>

      {/* Coded quotes for this version */}
      {versionHighlights.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-black text-[var(--ink-dark)] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Tag className="h-3.5 w-3.5" />
            Coded quotes ({versionHighlights.length})
          </h3>
          <div className="space-y-2">
            {versionHighlights.map((hl) => (
              <div
                key={hl.id}
                className="rounded-[12px] border-2 border-[var(--card-shell)] bg-[var(--card-fill)] p-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {hl.codes.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: hexToRgba(c.color, 0.35), color: "#1d1d1d" }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--ink-muted)] line-clamp-2 italic">
                    &ldquo;{hl.selected_text}&rdquo;
                  </p>
                </div>
                {listId && (
                  <button
                    onClick={() => onDeleteHighlight(hl.id)}
                    className="rounded-full border-2 border-[var(--card-shell)] bg-white p-1.5 hover:bg-[var(--accent-red)] hover:text-white hover:border-[var(--accent-red)] transition flex-shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code tooltip */}
      {tooltipPos && pendingSelection && listId && (
        <CodeTooltip
          codes={codes}
          position={tooltipPos}
          saving={saving}
          onCodeSelect={handleCodeSelect}
          onCodeCreate={onCodeCreate}
          onDismiss={dismissTooltip}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function InstructionTimeline({
  instructions,
  listId = null,
  token = null,
  assistantId,
  codes = [],
  onCodesChange,
}: {
  instructions: InstructionVersion[];
  listId?: string | null;
  token?: string | null;
  assistantId: string;
  codes?: AnalysisCode[];
  onCodesChange?: (codes: AnalysisCode[]) => void;
}) {
  const [selected, setSelected] = useState<InstructionVersion | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<InstructionVersion | null>(null);
  const [compareB, setCompareB] = useState<InstructionVersion | null>(null);
  const [highlights, setHighlights] = useState<InstructionHighlight[]>([]);

  // Auto-select latest on mount
  useEffect(() => {
    if (instructions.length > 0 && !selected) {
      setSelected(instructions[0]);
    }
  }, [instructions, selected]);

  // Fetch instruction highlights
  const fetchHighlights = useCallback(async () => {
    if (!token || !assistantId) return;
    try {
      const data = await analysisApi.getInstructionHighlights(assistantId, listId, token);
      setHighlights(data);
    } catch { /* ignore */ }
  }, [listId, token, assistantId]);

  useEffect(() => {
    fetchHighlights();
  }, [fetchHighlights]);

  const handleCodeCreate = async (name: string, color: string): Promise<string> => {
    if (!token || !listId) throw new Error("No token/list");
    const code = await analysisApi.createCode(listId, { name, color }, token);
    onCodesChange?.([...codes, { ...code, usage_count: 0 }]);
    return code.id;
  };

  const handleDeleteHighlight = async (id: string) => {
    if (!token) return;
    try {
      await analysisApi.deleteInstructionHighlight(id, token);
      await fetchHighlights();
    } catch { /* ignore */ }
  };

  // Reset compare selections when toggling off
  const toggleCompare = () => {
    setCompareA(null);
    setCompareB(null);
    setCompareMode((v) => !v);
  };

  const handleTimelineClick = (v: InstructionVersion) => {
    if (!compareMode) {
      setSelected(v);
      return;
    }
    if (!compareA) {
      setCompareA(v);
    } else if (!compareB) {
      if (v.id === compareA.id) return;
      setCompareB(v);
    } else {
      setCompareA(v);
      setCompareB(null);
    }
  };

  const isSelected = (v: InstructionVersion) => {
    if (compareMode) return v.id === compareA?.id || v.id === compareB?.id;
    return v.id === selected?.id;
  };

  const getCompareLabel = (v: InstructionVersion) => {
    if (!compareMode) return null;
    if (v.id === compareA?.id) return "A";
    if (v.id === compareB?.id) return "B";
    return null;
  };

  // Count coded comparisons per version pair for timeline badges
  const codedPairCounts = new Map<string, number>();
  for (const h of highlights) {
    const key = `${h.older_version_id}:${h.newer_version_id}`;
    codedPairCounts.set(key, (codedPairCounts.get(key) || 0) + 1);
  }

  // Empty state
  if (instructions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center">
        <div>
          <FileText className="h-12 w-12 text-[var(--ink-muted)] mx-auto mb-3" />
          <p className="text-base font-semibold text-[var(--ink-muted)]">No instruction history yet.</p>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Versions are saved each time the system prompt is updated.
          </p>
        </div>
      </div>
    );
  }

  // Sort compare selections so older is first
  let diffOlder: InstructionVersion | null = null;
  let diffNewer: InstructionVersion | null = null;
  if (compareA && compareB) {
    const idxA = instructions.findIndex((v) => v.id === compareA.id);
    const idxB = instructions.findIndex((v) => v.id === compareB.id);
    if (idxA > idxB) {
      diffOlder = compareA;
      diffNewer = compareB;
    } else {
      diffOlder = compareB;
      diffNewer = compareA;
    }
  }

  // Coded comparisons list (unique pairs)
  const codedPairs = Array.from(codedPairCounts.entries()).map(([key, count]) => {
    const [olderId, newerId] = key.split(":");
    const olderV = instructions.find((v) => v.id === olderId);
    const newerV = instructions.find((v) => v.id === newerId);
    return { olderId, newerId, olderV, newerV, count };
  }).filter((p) => p.olderV && p.newerV);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* LEFT: Timeline */}
      <div className="w-72 flex-shrink-0 border-r-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] flex flex-col overflow-hidden">
        {/* Timeline header */}
        <div className="px-4 pt-4 pb-3 border-b-2 border-[var(--card-shell)] flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--ink-dark)]" />
            <h2 className="text-xs font-black text-[var(--ink-dark)] uppercase tracking-wider">
              {instructions.length} Version{instructions.length !== 1 ? "s" : ""}
            </h2>
          </div>
          {instructions.length > 1 && (
            <button
              onClick={toggleCompare}
              className={`flex items-center gap-1.5 rounded-full border-[3px] border-[var(--card-shell)] px-3 py-1.5 text-xs font-semibold transition w-fit ${
                compareMode
                  ? "bg-[var(--ink-dark)] text-white shadow-[3px_3px_0_var(--shadow-deep)]"
                  : "bg-white text-[var(--foreground)] hover:bg-[var(--card-fill)]"
              }`}
            >
              <GitCompareArrows className="h-3.5 w-3.5" />
              {compareMode ? "Exit compare" : "Compare"}
            </button>
          )}
          {compareMode && (
            <p className="text-[10px] text-[var(--ink-muted)]">
              {!compareA ? "Select first version" : !compareB ? "Select second version" : "Showing diff — select text to code"}
            </p>
          )}
        </div>

        {/* Version list */}
        <div className={`overflow-y-auto ${codedPairs.length > 0 ? "" : "flex-1"}`} style={codedPairs.length > 0 ? { maxHeight: "60%" } : undefined}>
          {instructions.map((v, idx) => {
            const vNum = instructions.length - idx;
            const active = isSelected(v);
            const cLabel = getCompareLabel(v);

            return (
              <button
                key={v.id}
                onClick={() => handleTimelineClick(v)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--card-shell)]/30 transition relative ${
                  active
                    ? "bg-[var(--ink-dark)] text-[var(--card-fill)]"
                    : "hover:bg-white/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="relative flex-shrink-0">
                    <div
                      className={`w-5 h-5 rounded-full border-[3px] flex items-center justify-center text-[8px] font-bold ${
                        active
                          ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-[var(--ink-dark)]"
                          : "border-[var(--card-shell)] bg-white text-[var(--ink-muted)]"
                      }`}
                    >
                      {cLabel || ""}
                    </div>
                    {idx < instructions.length - 1 && (
                      <div className="absolute top-5 left-1/2 -translate-x-1/2 w-0.5 h-[calc(100%+0.5rem)] bg-[var(--card-shell)]/20" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                          active
                            ? "bg-white/20 text-[var(--card-fill)]"
                            : "bg-[var(--card-shell)] text-[var(--card-fill)]"
                        }`}
                      >
                        v{vNum}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          active ? "text-[var(--card-fill)]" : "text-[var(--ink-dark)]"
                        }`}
                      >
                        {formatDateShort(v.saved_at)}
                      </span>
                      {idx === 0 && (
                        <span
                          className={`text-[10px] font-bold rounded-full px-2 py-0.5 ml-auto ${
                            active
                              ? "bg-white/20 text-[var(--card-fill)]"
                              : "bg-[var(--accent-green)] text-[var(--ink-dark)]"
                          }`}
                        >
                          current
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs mt-1 line-clamp-2 ${
                        active ? "text-[var(--card-fill)]/70" : "text-[var(--ink-muted)]"
                      }`}
                    >
                      {v.instruction_text}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Coded comparisons section */}
        {codedPairs.length > 0 && (
          <div className="border-t-[3px] border-[var(--card-shell)] flex-1 overflow-y-auto">
            <div className="px-4 pt-3 pb-2">
              <h3 className="text-[10px] font-black text-[var(--ink-dark)] uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="h-3 w-3" />
                Coded comparisons
              </h3>
            </div>
            {codedPairs.map(({ olderId, newerId, olderV, newerV, count }) => {
              const olderIdx = instructions.findIndex((v) => v.id === olderId);
              const newerIdx = instructions.findIndex((v) => v.id === newerId);
              const isActive = diffOlder?.id === olderId && diffNewer?.id === newerId;
              return (
                <button
                  key={`${olderId}:${newerId}`}
                  onClick={() => {
                    if (!compareMode) setCompareMode(true);
                    setCompareA(olderV!);
                    setCompareB(newerV!);
                  }}
                  className={`w-full text-left px-4 py-2.5 border-b border-[var(--card-shell)]/20 transition text-xs ${
                    isActive ? "bg-[var(--ink-dark)] text-[var(--card-fill)]" : "hover:bg-white/60"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold ${isActive ? "text-[var(--card-fill)]" : "text-[var(--ink-dark)]"}`}>
                      v{instructions.length - olderIdx} → v{instructions.length - newerIdx}
                    </span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      isActive ? "bg-white/20 text-[var(--card-fill)]" : "bg-[#fde68a] text-[#78350f]"
                    }`}>
                      {count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT: Reader / Diff */}
      {compareMode && diffOlder && diffNewer ? (
        <DiffView
          older={diffOlder}
          newer={diffNewer}
          instructions={instructions}
          highlights={highlights}
          codes={codes}
          listId={listId}
          token={token}
          assistantId={assistantId}
          onHighlightCreated={fetchHighlights}
          onCodeCreate={handleCodeCreate}
          onDeleteHighlight={handleDeleteHighlight}
        />
      ) : compareMode ? (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <GitCompareArrows className="h-10 w-10 text-[var(--ink-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--ink-muted)] font-medium">
              {!compareA ? "Select a version (A) from the timeline" : "Select a second version (B) to see the diff"}
            </p>
          </div>
        </div>
      ) : selected ? (
        <ReaderView
          version={selected}
          instructions={instructions}
          highlights={highlights}
          codes={codes}
          listId={listId}
          token={token}
          assistantId={assistantId}
          onHighlightCreated={fetchHighlights}
          onCodeCreate={handleCodeCreate}
          onDeleteHighlight={handleDeleteHighlight}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <p className="text-sm text-[var(--ink-muted)]">Select a version to read it.</p>
        </div>
      )}
    </div>
  );
}
