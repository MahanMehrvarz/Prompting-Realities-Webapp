"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Bot, MessageSquare, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/isAdmin";
import { analysisApi, type AnalysisCode, type CodeHighlight } from "@/lib/backendApi";
import AnalysisShell from "../../../../AnalysisShell";
import { useAnalysisBreadcrumb } from "../../../../AnalysisBreadcrumbContext";
import Link from "next/link";

const TOKEN_KEY = "pr-auth-token";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CodeHighlightsPage() {
  const router = useRouter();
  const params = useParams();
  const listId = params.listId as string;
  const codeId = params.codeId as string;
  const { setCrumbs } = useAnalysisBreadcrumb();

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState<AnalysisCode | null>(null);
  const [highlights, setHighlights] = useState<CodeHighlight[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/hidden-login"); return; }
      const tok = session.access_token;
      window.localStorage.setItem(TOKEN_KEY, tok);
      setToken(tok);
      if (!(await isAdmin(session.user.email!))) { router.push("/"); return; }
      setReady(true);
    });
  }, [router]);

  const fetchData = useCallback(async (tok: string) => {
    try {
      const [listData, codesData, highlightsData] = await Promise.all([
        analysisApi.getList(listId, tok),
        analysisApi.getCodes(listId, tok),
        analysisApi.getCodeHighlights(listId, codeId, tok),
      ]);
      const foundCode = codesData.find((c) => c.id === codeId);
      if (!foundCode) { router.push(`/admin/analysis/lists/${listId}`); return; }
      setCode(foundCode);
      setHighlights(highlightsData);
      setCrumbs([
        { label: listData.name, href: `/admin/analysis/lists/${listId}` },
        { label: foundCode.name },
      ]);
    } catch {
      router.push(`/admin/analysis/lists/${listId}`);
    }
  }, [listId, codeId, router, setCrumbs]);

  useEffect(() => {
    if (ready && token) fetchData(token);
  }, [ready, token, fetchData]);

  if (!ready || !code) {
    return (
      <AnalysisShell>
        <div className="flex items-center justify-center py-24">
          <div className="text-[var(--card-fill)] text-lg font-semibold animate-pulse">Loading…</div>
        </div>
      </AnalysisShell>
    );
  }

  // Only message highlights are shown on this code detail page (instruction highlights are on the main codes overview)
  const messageHighlights = highlights.filter((h) => h.kind !== "instruction" && h.thread_id);
  // Group highlights by thread_id, sorted by created_at
  const byThread = messageHighlights.reduce<Record<string, CodeHighlight[]>>((acc, h) => {
    const tid = h.thread_id!;
    if (!acc[tid]) acc[tid] = [];
    acc[tid].push(h);
    return acc;
  }, {});
  // Sort each thread's highlights chronologically
  for (const arr of Object.values(byThread)) {
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  // Merge consecutive highlights (within 5 min) into "runs" for a single card
  type HighlightRun = { highlights: CodeHighlight[]; isMerged: boolean };
  function buildRuns(hs: CodeHighlight[]): HighlightRun[] {
    const runs: HighlightRun[] = [];
    for (const h of hs) {
      const last = runs[runs.length - 1];
      const lastH = last?.highlights[last.highlights.length - 1];
      const gap = lastH ? (new Date(h.created_at).getTime() - new Date(lastH.created_at).getTime()) / 1000 : Infinity;
      if (last && gap < 300) {
        last.highlights.push(h);
        last.isMerged = true;
      } else {
        runs.push({ highlights: [h], isMerged: false });
      }
    }
    return runs;
  }

  return (
    <AnalysisShell>
      {/* Code header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="w-6 h-6 rounded-full border-2 border-black/10 flex-shrink-0"
            style={{ backgroundColor: code.color }}
          />
          <h1 className="text-3xl font-black text-[var(--card-fill)] uppercase tracking-[0.06em]">{code.name}</h1>
        </div>
        <p className="text-sm text-[var(--card-fill)]/60">
          {highlights.length} quotation{highlights.length !== 1 ? "s" : ""} across {Object.keys(byThread).length} thread{Object.keys(byThread).length !== 1 ? "s" : ""}
        </p>
        {code.description && <p className="text-sm text-[var(--card-fill)]/70 mt-1">{code.description}</p>}
      </div>

      {highlights.length === 0 ? (
        <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-12 text-center">
          <MessageSquare className="h-10 w-10 text-[var(--ink-muted)] mx-auto mb-3" />
          <p className="text-[var(--ink-muted)]">No messages coded with this label yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byThread).map(([threadId, threadHighlights]) => {
            const first = threadHighlights[0];
            return (
              <div key={threadId}>
                {/* Thread header */}
                <div className="flex items-center gap-3 mb-3">
                  <Link
                    href={`/admin/analysis/lists/${listId}/thread/${threadId}?session=${first.session_id}&assistant=${first.assistant_id}`}
                    className="flex items-center gap-2 group"
                  >
                    <code className="text-xs font-mono bg-[var(--ink-dark)] text-[var(--card-fill)] px-2 py-0.5 rounded-md group-hover:bg-[var(--ink-dark)]/80 transition">
                      …{threadId.slice(-8)}
                    </code>
                    <span className="text-sm text-[var(--card-fill)]/60 group-hover:text-[var(--card-fill)] transition">
                      {first.assistant_name || "LLM Thing"}
                    </span>
                    <span className="text-xs text-[var(--card-fill)]/40">→ view thread</span>
                  </Link>
                  <span className="text-xs text-[var(--card-fill)]/40 ml-auto">
                    {threadHighlights.length} quotation{threadHighlights.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Quotation cards — consecutive highlights merged into one card */}
                <div className="space-y-3 pl-4 border-l-2 border-[var(--card-shell)]">
                  {buildRuns(threadHighlights).map((run, ri) => {
                    const first = run.highlights[0];
                    const last = run.highlights[run.highlights.length - 1];
                    return (
                      <div
                        key={`run-${ri}`}
                        className="rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[4px_4px_0_var(--card-shell)]"
                        style={{ borderLeftColor: code.color, borderLeftWidth: 4 }}
                      >
                        {/* Sequence label if merged */}
                        {run.isMerged && (
                          <div className="flex items-center gap-1.5 mb-3">
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-semibold"
                              style={{ backgroundColor: hexToRgba(code.color, 0.3), color: "var(--ink-dark)" }}
                            >
                              {run.highlights.length} messages · continuous dialogue
                            </span>
                          </div>
                        )}

                        {/* All messages in this run */}
                        {run.highlights.map((h, hi) => (
                          <div key={h.highlight_id}>
                            {/* Divider between merged highlights */}
                            {hi > 0 && (
                              <div className="my-2 border-t border-dashed border-[var(--card-shell)]/50" />
                            )}
                            {(h.message_texts || []).map((mt) => (
                              <div key={mt.message_id} className="space-y-2 mb-2">
                                {mt.user_text && (
                                  <div className="flex justify-end">
                                    <div className="max-w-[85%]">
                                      <div className="flex items-center gap-1 justify-end mb-1">
                                        <span className="text-xs text-[var(--ink-muted)]">User</span>
                                        <User className="h-3 w-3 text-[var(--ink-muted)]" />
                                      </div>
                                      <div
                                        className="rounded-[12px] rounded-tr-[4px] px-3 py-2 text-sm"
                                        style={{ backgroundColor: hexToRgba(code.color, 0.25), border: `2px solid ${hexToRgba(code.color, 0.5)}` }}
                                      >
                                        {mt.user_text}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {mt.response_text && (
                                  <div className="flex justify-start">
                                    <div className="max-w-[85%]">
                                      <div className="flex items-center gap-1 mb-1">
                                        <Bot className="h-3 w-3 text-[var(--ink-muted)]" />
                                        <span className="text-xs text-[var(--ink-muted)]">Assistant</span>
                                      </div>
                                      <div
                                        className="rounded-[12px] rounded-tl-[4px] px-3 py-2 text-sm"
                                        style={{ backgroundColor: hexToRgba(code.color, 0.25), border: `2px solid ${hexToRgba(code.color, 0.5)}` }}
                                      >
                                        {mt.response_text}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}

                        {/* Meta */}
                        <div className="flex items-center justify-between pt-2 border-t border-[var(--card-shell)]/30 mt-2">
                          <span className="text-xs text-[var(--ink-muted)]">by {first.created_by}</span>
                          <span className="text-xs text-[var(--ink-muted)]">{fmt(run.isMerged ? last.created_at : first.created_at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AnalysisShell>
  );
}
