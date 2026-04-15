"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Clock, FileText, MessageSquare, SlidersHorizontal, Tag, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { analysisApi, type ThreadSummary, type InstructionVersion } from "@/lib/backendApi";
import AnalysisShell from "../../../../AnalysisShell";
import { useAnalysisBreadcrumb } from "../../../../AnalysisBreadcrumbContext";

const TOKEN_KEY = "pr-auth-token";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AssistantThreadsPage() {
  const router = useRouter();
  const params = useParams();
  const listId = params.listId as string;
  const assistantId = params.assistantId as string;
  const { setCrumbs } = useAnalysisBreadcrumb();

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [assistantName, setAssistantName] = useState<string>("");
  const [instructions, setInstructions] = useState<InstructionVersion[]>([]);
  const [selectedInstruction, setSelectedInstruction] = useState<InstructionVersion | null>(null);

  // Filters
  const [showOnlyCoded, setShowOnlyCoded] = useState(false);
  const [sortField, setSortField] = useState<"first_message_at" | "last_message_at" | "message_count">("last_message_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

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
      const [threadsData, items, listData, instructionsData] = await Promise.all([
        analysisApi.getThreads(listId, assistantId, tok),
        analysisApi.getListItems(listId, tok),
        analysisApi.getList(listId, tok),
        analysisApi.getInstructionHistory(assistantId, tok),
      ]);
      setThreads(threadsData);
      const found = items.find((i) => i.assistant_id === assistantId);
      const aName = found?.assistant_name || "LLM Thing";
      setAssistantName(aName);
      setInstructions(instructionsData);
      setCrumbs([
        { label: listData.name, href: `/admin/analysis/lists/${listId}` },
        { label: aName },
      ]);
    } catch {
      router.push(`/admin/analysis/lists/${listId}`);
    }
  }, [listId, assistantId, router, setCrumbs]);

  useEffect(() => {
    if (ready && token) fetchData(token);
  }, [ready, token, fetchData]);

  // Derive visible threads
  let visible = [...threads];
  if (showOnlyCoded) visible = visible.filter((t) => t.has_codes);
  // Date filters always apply to last_message_at
  if (filterFrom) visible = visible.filter((t) => { const v = t.last_message_at; return v ? v >= filterFrom : false; });
  if (filterTo) visible = visible.filter((t) => { const v = t.last_message_at; return v ? v <= filterTo + "T23:59:59" : false; });
  visible.sort((a, b) => {
    if (sortField === "message_count") {
      return sortDir === "asc" ? a.message_count - b.message_count : b.message_count - a.message_count;
    }
    const av = a[sortField] ?? "";
    const bv = b[sortField] ?? "";
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const hasActiveFilters = showOnlyCoded || filterFrom || filterTo || sortField !== "last_message_at" || sortDir !== "desc";

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
      <div className="flex flex-1 overflow-hidden">

        {/* MAIN: thread list */}
        <div className="flex-1 overflow-y-auto px-6 py-8">
          {/* Page header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-black text-[var(--card-fill)] uppercase tracking-[0.06em]">{assistantName}</h1>
              <p className="text-sm text-[var(--card-fill)]/60 mt-1">{threads.length} session{threads.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Coded filter */}
              <button
                onClick={() => setShowOnlyCoded((v) => !v)}
                className={`flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] px-3 py-1.5 text-xs font-semibold transition ${
                  showOnlyCoded ? "bg-[var(--ink-dark)] text-white shadow-[3px_3px_0_var(--shadow-deep)]" : "bg-white text-[var(--foreground)] hover:bg-[var(--card-fill)]"
                }`}
              >
                <Tag className="h-3.5 w-3.5" />
                {showOnlyCoded ? "Coded only" : "All sessions"}
              </button>

              {/* Filters toggle */}
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] px-3 py-1.5 text-xs font-semibold transition ${
                  showFilters || hasActiveFilters ? "bg-[var(--ink-dark)] text-white shadow-[3px_3px_0_var(--shadow-deep)]" : "bg-white text-[var(--foreground)] hover:bg-[var(--card-fill)]"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filter & Sort
              </button>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="mb-6 rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[4px_4px_0_var(--card-shell)]">
              <div className="flex flex-wrap gap-4 items-end">
                {/* Sort field */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-dark)] mb-1.5">Sort by</label>
                  <div className="flex gap-2">
                    {([
                      ["first_message_at", "Date started"],
                      ["last_message_at", "Last activity"],
                      ["message_count", "Message count"],
                    ] as const).map(([f, label]) => (
                      <button key={f} onClick={() => setSortField(f)}
                        className={`rounded-full border-2 border-[var(--card-shell)] px-3 py-1 text-xs font-medium transition ${sortField === f ? "bg-[var(--ink-dark)] text-white" : "bg-white hover:bg-[var(--card-fill)]"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort direction */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-dark)] mb-1.5">Order</label>
                  <div className="flex gap-2">
                    {(["desc", "asc"] as const).map((d) => (
                      <button key={d} onClick={() => setSortDir(d)}
                        className={`rounded-full border-2 border-[var(--card-shell)] px-3 py-1 text-xs font-medium transition ${sortDir === d ? "bg-[var(--ink-dark)] text-white" : "bg-white hover:bg-[var(--card-fill)]"}`}>
                        {sortField === "message_count"
                          ? d === "desc" ? "High to low" : "Low to high"
                          : d === "desc" ? "Newest first" : "Oldest first"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date range */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-dark)] mb-1.5">From</label>
                  <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
                    className="rounded-[10px] border-2 border-[var(--card-shell)] bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-dark)] mb-1.5">To</label>
                  <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
                    className="rounded-[10px] border-2 border-[var(--card-shell)] bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)]" />
                </div>

                {/* Reset */}
                {hasActiveFilters && (
                  <button onClick={() => { setShowOnlyCoded(false); setSortField("last_message_at"); setSortDir("desc"); setFilterFrom(""); setFilterTo(""); }}
                    className="flex items-center gap-1 rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1.5 text-xs text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white transition">
                    <X className="h-3 w-3" />
                    Reset
                  </button>
                )}
              </div>
              {(filterFrom || filterTo) && (
                <p className="text-xs text-[var(--ink-muted)] mt-2">Filtering by <strong>{sortField === "first_message_at" ? "date started" : "last activity"}</strong></p>
              )}
            </div>
          )}

          {/* Results count */}
          {visible.length !== threads.length && (
            <p className="text-xs text-[var(--card-fill)]/60 mb-3">{visible.length} of {threads.length} sessions</p>
          )}

          {/* Thread list */}
          {visible.length === 0 ? (
            <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-12 text-center">
              <MessageSquare className="h-10 w-10 text-[var(--ink-muted)] mx-auto mb-3" />
              <p className="text-[var(--ink-muted)]">
                {showOnlyCoded ? "No coded sessions match your filters." : "No sessions found."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((t) => (
                <Link
                  key={t.thread_id}
                  href={`/admin/analysis/lists/${listId}/thread/${t.thread_id}?session=${t.session_id}&assistant=${assistantId}`}
                  className="block rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[5px_5px_0_var(--card-shell)] hover:shadow-[8px_8px_0_var(--shadow-deep)] transition group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <code className="text-xs font-mono bg-[var(--ink-dark)] text-[var(--card-fill)] px-2 py-0.5 rounded-md">
                          …{t.thread_id.slice(-8)}
                        </code>
                        {t.has_codes && (
                          <span className="flex items-center gap-1 rounded-full bg-[#fde68a] px-2 py-0.5 text-xs font-semibold text-[#78350f]">
                            <Tag className="h-3 w-3" />
                            {t.highlight_count} code{t.highlight_count !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-[var(--ink-muted)]">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {t.message_count} msg{t.message_count !== 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Started {formatDate(t.first_message_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last {formatDate(t.last_message_at)}
                        </span>
                      </div>
                    </div>
                    <div className="text-[var(--ink-muted)] group-hover:translate-x-0.5 transition flex-shrink-0">›</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* SIDEBAR: instruction history */}
        <aside className="w-80 flex-shrink-0 border-l-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] flex flex-col overflow-hidden">
          <div className="px-4 pt-5 pb-3 border-b-2 border-[var(--card-shell)]">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--ink-dark)]" />
              <h2 className="text-sm font-black text-[var(--ink-dark)] uppercase tracking-wider">Instruction Versions</h2>
              <span className="ml-auto text-xs text-[var(--ink-muted)]">{instructions.length}</span>
            </div>
            {instructions.length > 0 && (
              <p className="text-xs text-[var(--ink-muted)] mt-1">Click a version to read it</p>
            )}
          </div>

          {instructions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center px-4 text-center">
              <div>
                <FileText className="h-8 w-8 text-[var(--ink-muted)] mx-auto mb-2" />
                <p className="text-sm text-[var(--ink-muted)]">No instruction history yet.</p>
                <p className="text-xs text-[var(--ink-muted)] mt-1">Versions are saved each time the system prompt is updated.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Version list */}
              <div className={`overflow-y-auto ${selectedInstruction ? "max-h-48 border-b-2 border-[var(--card-shell)]" : "flex-1"}`}>
                {instructions.map((v, idx) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedInstruction(selectedInstruction?.id === v.id ? null : v)}
                    className={`w-full text-left px-4 py-3 border-b border-[var(--card-shell)]/40 transition ${
                      selectedInstruction?.id === v.id
                        ? "bg-[var(--ink-dark)] text-[var(--card-fill)]"
                        : "hover:bg-white/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 flex-shrink-0 ${
                          selectedInstruction?.id === v.id ? "bg-white/20 text-[var(--card-fill)]" : "bg-[var(--card-shell)] text-[var(--ink-muted)]"
                        }`}>
                          v{instructions.length - idx}
                        </span>
                        <span className={`text-xs font-medium truncate ${selectedInstruction?.id === v.id ? "text-[var(--card-fill)]" : "text-[var(--ink-dark)]"}`}>
                          {formatDateShort(v.saved_at)}
                        </span>
                      </div>
                      {idx === 0 && (
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 flex-shrink-0 ${
                          selectedInstruction?.id === v.id ? "bg-white/20 text-[var(--card-fill)]" : "bg-[var(--accent-green)] text-[var(--ink-dark)]"
                        }`}>current</span>
                      )}
                    </div>
                    <p className={`text-xs mt-1 line-clamp-2 ${selectedInstruction?.id === v.id ? "text-[var(--card-fill)]/70" : "text-[var(--ink-muted)]"}`}>
                      {v.instruction_text}
                    </p>
                  </button>
                ))}
              </div>

              {/* Expanded instruction text */}
              {selectedInstruction && (
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[var(--ink-dark)] uppercase tracking-wider">
                      v{instructions.length - instructions.findIndex(v => v.id === selectedInstruction.id)} · {formatDateShort(selectedInstruction.saved_at)}
                    </span>
                    <button
                      onClick={() => setSelectedInstruction(null)}
                      className="rounded-full border-2 border-[var(--card-shell)] bg-white p-1 hover:bg-[var(--card-fill)] transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <pre className="text-xs text-[var(--ink-dark)] whitespace-pre-wrap leading-relaxed font-sans rounded-[12px] border-2 border-[var(--card-shell)] bg-white p-3">
                    {selectedInstruction.instruction_text}
                  </pre>
                </div>
              )}
            </div>
          )}
        </aside>

      </div>
    </AnalysisShell>
  );
}
