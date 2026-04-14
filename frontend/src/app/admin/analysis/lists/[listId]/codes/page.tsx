"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { BookOpen, Bot, MessageSquare, Tag, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  analysisApi,
  type AnalysisList,
  type AnalysisCode,
  type AnalysisCodeGroup,
  type CodeHighlight,
} from "@/lib/backendApi";
import AnalysisShell from "../../../AnalysisShell";
import { useAnalysisBreadcrumb } from "../../../AnalysisBreadcrumbContext";
import ListTabStrip from "@/components/analysis/ListTabStrip";

const TOKEN_KEY = "pr-auth-token";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Code chip — toggleable
function CodeChip({ code, selected, onToggle }: { code: AnalysisCode; selected: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border-2 transition ${
        selected
          ? "border-[var(--ink-dark)] shadow-[2px_2px_0_var(--ink-dark)]"
          : "border-[var(--card-shell)] bg-white hover:border-[var(--ink-dark)]/40"
      }`}
      style={selected ? { backgroundColor: code.color } : undefined}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0 border border-black/10"
        style={{ backgroundColor: code.color }}
      />
      <span className={selected ? "text-[var(--ink-dark)]" : "text-[var(--ink-dark)]"}>{code.name}</span>
      {code.usage_count !== undefined && (
        <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${selected ? "bg-black/10" : "bg-[var(--card-shell)] text-[var(--ink-muted)]"}`}>
          {code.usage_count}
        </span>
      )}
    </button>
  );
}

// Quotation card — shows one highlight with all its code chips + message context
function QuotationCard({ highlight, listId }: { highlight: CodeHighlight; listId: string }) {
  const isMulti = highlight.message_texts.length > 1;
  const threadHref = `/admin/analysis/lists/${listId}/thread/${highlight.thread_id}?session=${highlight.session_id}&assistant=${highlight.assistant_id}&back=codes`;

  return (
    <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] shadow-[5px_5px_0_var(--card-shell)] overflow-hidden">
      {/* Header: code chips + meta */}
      <div className="px-4 pt-3 pb-2 border-b-2 border-[var(--card-shell)] flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5 flex-1">
          {(highlight.codes || []).map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border border-black/10"
              style={{ backgroundColor: hexToRgba(c.color, 0.35) }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isMulti && (
            <span className="rounded-full bg-[var(--ink-dark)] text-[var(--card-fill)] px-2 py-0.5 text-[10px] font-bold">
              {highlight.message_texts.length} messages
            </span>
          )}
          <span className="text-xs text-[var(--ink-muted)]">{highlight.assistant_name}</span>
        </div>
      </div>

      {/* Message context — each message_text is one exchange, show with dividers if multiple */}
      <div className="px-4 py-3 space-y-3">
        {highlight.message_texts.map((mt, idx) => (
          <div key={mt.message_id}>
            {idx > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 border-t-2 border-dashed border-[var(--card-shell)]" />
                <span className="text-[10px] text-[var(--ink-muted)] font-semibold uppercase tracking-wider flex-shrink-0">continued</span>
                <div className="flex-1 border-t-2 border-dashed border-[var(--card-shell)]" />
              </div>
            )}
            <div className="space-y-1.5">
              {mt.user_text && (
                <div className="flex justify-end">
                  <div className="max-w-[80%]">
                    <div className="flex items-center gap-1 justify-end mb-0.5">
                      <span className="text-[10px] text-[var(--ink-muted)]">User</span>
                      <User className="h-3 w-3 text-[var(--ink-muted)]" />
                    </div>
                    <div className="rounded-[12px] bg-[var(--ink-dark)] text-[var(--card-fill)] px-3 py-2 text-sm leading-relaxed">
                      {mt.user_text}
                    </div>
                  </div>
                </div>
              )}
              {mt.response_text && (
                <div className="flex justify-start">
                  <div className="max-w-[80%]">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Bot className="h-3 w-3 text-[var(--ink-muted)]" />
                      <span className="text-[10px] text-[var(--ink-muted)]">Assistant</span>
                    </div>
                    <div className="rounded-[12px] border-2 border-[var(--card-shell)] bg-white text-[var(--ink-dark)] px-3 py-2 text-sm leading-relaxed">
                      {mt.response_text}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer: thread link + timestamp */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <Link
          href={threadHref}
          className="text-xs font-semibold text-[#2563eb] hover:underline flex items-center gap-1"
        >
          <MessageSquare className="h-3 w-3" />
          View thread
        </Link>
        <span className="text-xs text-[var(--ink-muted)]">{fmtDate(highlight.created_at)}</span>
      </div>
    </div>
  );
}

// Main page
export default function CodesOverviewPage() {
  const router = useRouter();
  const params = useParams();
  const listId = params.listId as string;
  const { setCrumbs } = useAnalysisBreadcrumb();

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [list, setList] = useState<AnalysisList | null>(null);
  const [codes, setCodes] = useState<AnalysisCode[]>([]);
  const [groups, setGroups] = useState<AnalysisCodeGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlights, setHighlights] = useState<CodeHighlight[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(false);

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

  const fetchInitial = useCallback(async (tok: string) => {
    try {
      const [codesData, groupsData, listData] = await Promise.all([
        analysisApi.getCodes(listId, tok),
        analysisApi.getCodeGroups(listId, tok),
        analysisApi.getList(listId, tok),
      ]);
      setCodes(codesData);
      setGroups(groupsData);
      setList(listData);
      setCrumbs([
        { label: listData.name, href: `/admin/analysis/lists/${listId}` },
        { label: "Codes & Quotations" },
      ]);
    } catch {
      router.push("/admin/analysis");
    }
  }, [listId, router, setCrumbs]);

  useEffect(() => {
    if (ready && token) fetchInitial(token);
  }, [ready, token, fetchInitial]);

  // Fetch highlights when selection changes
  useEffect(() => {
    if (!token || selectedIds.size === 0) {
      setHighlights([]);
      return;
    }
    let cancelled = false;
    setLoadingHighlights(true);
    analysisApi.getListHighlights(listId, [...selectedIds], token)
      .then((data) => { if (!cancelled) setHighlights(data); })
      .catch(() => { if (!cancelled) setHighlights([]); })
      .finally(() => { if (!cancelled) setLoadingHighlights(false); });
    return () => { cancelled = true; };
  }, [selectedIds, listId, token]);

  const toggleCode = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Group codes
  const grouped = groups.map((g) => ({ group: g, codes: codes.filter((c) => c.group_id === g.id) })).filter((g) => g.codes.length > 0);
  const ungrouped = codes.filter((c) => !c.group_id);

  if (!ready) {
    return (
      <AnalysisShell fullBleed>
        <div className="flex items-center justify-center py-24">
          <div className="text-[var(--card-fill)] text-lg font-semibold animate-pulse">Loading…</div>
        </div>
      </AnalysisShell>
    );
  }

  return (
    <AnalysisShell fullBleed>
      <div className="flex flex-col h-full overflow-hidden">
        {/* List header — same as list page */}
        {list && (
          <div className="px-6 pt-8 pb-0">
            <h1 className="text-3xl font-black text-[var(--card-fill)] uppercase tracking-[0.06em]">{list.name}</h1>
            {list.description && <p className="text-sm text-[var(--card-fill)]/70 mt-1">{list.description}</p>}
            <p className="text-xs text-[var(--card-fill)]/50 mt-1">Created by {list.created_by}</p>
            <div className="flex gap-3 mt-3">
              <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1 text-xs font-medium">
                <BookOpen className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
                {list.item_count ?? 0} LLM thing{(list.item_count ?? 0) !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1 text-xs font-medium">
                <Tag className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
                {codes.length} codes
              </span>
            </div>
          </div>
        )}

        {/* Tab strip */}
        <div className="px-6 pt-6">
          <ListTabStrip listId={listId} />
        </div>

        {/* Split pane */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT: codes sidebar */}
          <aside className="w-64 flex-shrink-0 border-r-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] overflow-y-auto flex flex-col">
            <div className="px-4 pt-4 pb-2 border-b-2 border-[var(--card-shell)]">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-[var(--ink-dark)]" />
                <h2 className="text-sm font-black text-[var(--ink-dark)] uppercase tracking-wider">Codes</h2>
                <span className="ml-auto text-xs text-[var(--ink-muted)]">{codes.length}</span>
              </div>
            </div>

            <div className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
              {grouped.map(({ group, codes: gc }) => (
                <div key={group.id}>
                  <div className="flex items-center gap-1.5 mb-2 px-1">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                    <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase tracking-wider truncate">{group.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {gc.map((c) => (
                      <CodeChip key={c.id} code={c} selected={selectedIds.has(c.id)} onToggle={() => toggleCode(c.id)} />
                    ))}
                  </div>
                </div>
              ))}

              {ungrouped.length > 0 && (
                <div>
                  {groups.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-2 px-1">
                      <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase tracking-wider">Ungrouped</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {ungrouped.map((c) => (
                      <CodeChip key={c.id} code={c} selected={selectedIds.has(c.id)} onToggle={() => toggleCode(c.id)} />
                    ))}
                  </div>
                </div>
              )}

              {codes.length === 0 && (
                <div className="text-center py-8 text-sm text-[var(--ink-muted)]">
                  No codes yet.<br />Start coding conversations to see codes here.
                </div>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="px-3 py-3 border-t-2 border-[var(--card-shell)]">
                <button
                  onClick={clearSelection}
                  className="w-full rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--accent-red)] hover:border-[var(--accent-red)] transition"
                >
                  Clear selection
                </button>
              </div>
            )}
          </aside>

          {/* RIGHT: quotation stream */}
          <main className="flex-1 overflow-y-auto">
            {/* Sticky summary bar */}
            {selectedIds.size > 0 && (
              <div className="sticky top-0 z-10 bg-[var(--card-fill)]/90 backdrop-blur-sm border-b-2 border-[var(--card-shell)] px-6 py-2.5 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--ink-dark)]">
                  {loadingHighlights ? "Loading…" : `${highlights.length} quotation${highlights.length !== 1 ? "s" : ""}`}
                  <span className="font-normal text-[var(--ink-muted)] ml-1">
                    for {selectedIds.size} code{selectedIds.size !== 1 ? "s" : ""} selected
                  </span>
                </p>
              </div>
            )}

            <div className="px-6 py-6 space-y-4">
              {selectedIds.size === 0 && (
                <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-16 text-center">
                  <Tag className="h-10 w-10 text-[var(--ink-muted)] mx-auto mb-3" />
                  <p className="text-[var(--ink-dark)] font-semibold">Select a code to see its quotations</p>
                  <p className="text-sm text-[var(--ink-muted)] mt-1">Click one or more codes in the sidebar to filter quotations</p>
                </div>
              )}

              {selectedIds.size > 0 && loadingHighlights && (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-6 animate-pulse">
                      <div className="h-4 bg-[var(--card-shell)] rounded w-1/3 mb-4" />
                      <div className="h-12 bg-[var(--card-shell)] rounded mb-2" />
                      <div className="h-12 bg-[var(--card-shell)] rounded w-4/5" />
                    </div>
                  ))}
                </div>
              )}

              {selectedIds.size > 0 && !loadingHighlights && highlights.length === 0 && (
                <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-12 text-center">
                  <p className="text-[var(--ink-muted)]">No quotations tagged with the selected codes yet.</p>
                </div>
              )}

              {!loadingHighlights && highlights.map((h) => (
                <QuotationCard key={h.highlight_id} highlight={h} listId={listId} />
              ))}
            </div>
          </main>
        </div>
      </div>
    </AnalysisShell>
  );
}
