"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Bot, MessageSquare, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
      const { data: adminData } = await supabase.from("admin_emails").select("email").eq("email", session.user.email!).maybeSingle();
      if (!adminData) { router.push("/"); return; }
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

  // Group highlights by thread_id
  const byThread = highlights.reduce<Record<string, CodeHighlight[]>>((acc, h) => {
    if (!acc[h.thread_id]) acc[h.thread_id] = [];
    acc[h.thread_id].push(h);
    return acc;
  }, {});

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

                {/* Quotation cards */}
                <div className="space-y-3 pl-4 border-l-2 border-[var(--card-shell)]">
                  {threadHighlights.map((h) => (
                    <div
                      key={h.highlight_id}
                      className="rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[4px_4px_0_var(--card-shell)]"
                      style={{ borderLeftColor: code.color, borderLeftWidth: 4 }}
                    >
                      {/* Message texts */}
                      {h.message_texts.map((mt) => (
                        <div key={mt.message_id} className="space-y-2 mb-3">
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

                      {/* Meta */}
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--card-shell)]/30">
                        <span className="text-xs text-[var(--ink-muted)]">by {h.created_by}</span>
                        <span className="text-xs text-[var(--ink-muted)]">{fmt(h.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AnalysisShell>
  );
}
