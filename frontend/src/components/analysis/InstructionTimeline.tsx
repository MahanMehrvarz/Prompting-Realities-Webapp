"use client";

import { useState, useEffect } from "react";
import { FileText, GitCompareArrows, ArrowRight, X } from "lucide-react";
import type { InstructionVersion } from "@/lib/backendApi";
import { computeWordDiff, diffStats, type DiffSegment } from "@/lib/textDiff";

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Diff renderer
// ---------------------------------------------------------------------------
function DiffView({
  older,
  newer,
  instructions,
}: {
  older: InstructionVersion;
  newer: InstructionVersion;
  instructions: InstructionVersion[];
}) {
  const segments = computeWordDiff(older.instruction_text, newer.instruction_text);
  const stats = diffStats(segments);
  const idxOlder = instructions.findIndex((v) => v.id === older.id);
  const idxNewer = instructions.findIndex((v) => v.id === newer.id);

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
      </div>

      {/* Diff body */}
      <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-6 shadow-[4px_4px_0_var(--card-shell)]">
        <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
          {segments.map((seg, i) => (
            <DiffSpan key={i} segment={seg} />
          ))}
        </pre>
      </div>
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
// Main component
// ---------------------------------------------------------------------------
export default function InstructionTimeline({
  instructions,
}: {
  instructions: InstructionVersion[];
}) {
  const [selected, setSelected] = useState<InstructionVersion | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<InstructionVersion | null>(null);
  const [compareB, setCompareB] = useState<InstructionVersion | null>(null);

  // Auto-select latest on mount
  useEffect(() => {
    if (instructions.length > 0 && !selected) {
      setSelected(instructions[0]);
    }
  }, [instructions, selected]);

  // Reset compare selections when toggling off
  const toggleCompare = () => {
    if (compareMode) {
      setCompareA(null);
      setCompareB(null);
    } else {
      setCompareA(null);
      setCompareB(null);
    }
    setCompareMode((v) => !v);
  };

  const handleTimelineClick = (v: InstructionVersion) => {
    if (!compareMode) {
      setSelected(v);
      return;
    }
    // Compare mode: fill A then B
    if (!compareA) {
      setCompareA(v);
    } else if (!compareB) {
      if (v.id === compareA.id) return;
      setCompareB(v);
    } else {
      // Reset and start over
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
    // instructions is newest-first, so higher index = older
    if (idxA > idxB) {
      diffOlder = compareA;
      diffNewer = compareB;
    } else {
      diffOlder = compareB;
      diffNewer = compareA;
    }
  }

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
              {!compareA ? "Select first version" : !compareB ? "Select second version" : "Showing diff"}
            </p>
          )}
        </div>

        {/* Version list */}
        <div className="flex-1 overflow-y-auto">
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
                  {/* Timeline dot */}
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
                    {/* Connecting line */}
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
      </div>

      {/* RIGHT: Reader / Diff */}
      {compareMode && diffOlder && diffNewer ? (
        <DiffView older={diffOlder} newer={diffNewer} instructions={instructions} />
      ) : selected ? (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Reader header */}
          <div className="flex items-center gap-3 mb-5">
            <span className="rounded-full bg-[var(--card-shell)] px-2.5 py-1 text-[10px] font-bold text-[var(--card-fill)]">
              v{instructions.length - instructions.findIndex((v) => v.id === selected.id)}
            </span>
            <span className="text-sm font-medium text-[var(--ink-dark)]">
              {formatDateShort(selected.saved_at)}
            </span>
            <span className="text-xs text-[var(--ink-muted)]">
              {wordCount(selected.instruction_text)} words
            </span>
            {instructions.findIndex((v) => v.id === selected.id) === 0 && (
              <span className="rounded-full bg-[var(--accent-green)] px-2.5 py-1 text-[10px] font-bold text-[var(--ink-dark)]">
                current
              </span>
            )}
          </div>

          {/* Instruction text */}
          <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-6 shadow-[4px_4px_0_var(--card-shell)]">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-[var(--ink-dark)]">
              {selected.instruction_text}
            </pre>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <p className="text-sm text-[var(--ink-muted)]">Select a version to read it.</p>
        </div>
      )}
    </div>
  );
}
