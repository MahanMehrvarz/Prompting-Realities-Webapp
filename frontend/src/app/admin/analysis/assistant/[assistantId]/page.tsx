"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Clock, FileText, MessageSquare, Plus, SlidersHorizontal, Tag, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { analysisApi, type ThreadSummary, type InstructionVersion, type AnalysisList } from "@/lib/backendApi";
import AnalysisShell from "../../AnalysisShell";
import { useAnalysisBreadcrumb } from "../../AnalysisBreadcrumbContext";
import InstructionTimeline from "@/components/analysis/InstructionTimeline";

const TOKEN_KEY = "pr-auth-token";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AssistantThreadsStandalonePage() {
  const router = useRouter();
  const params = useParams();
  const assistantId = params.assistantId as string;
  const { setCrumbs } = useAnalysisBreadcrumb();

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [assistantName, setAssistantName] = useState<string>("");
  const [instructions, setInstructions] = useState<InstructionVersion[]>([]);
  const [activeTab, setActiveTab] = useState<"sessions" | "instructions">("sessions");
  const [lists, setLists] = useState<AnalysisList[]>([]);
  const [memberships, setMemberships] = useState<string[]>([]);
  const [showAddToList, setShowAddToList] = useState(false);
  const [addingList, setAddingList] = useState<string | null>(null);

  // Filters
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
      const [threadsData, { data: aData }, instructionsData, listsData] = await Promise.all([
        analysisApi.getThreadsStandalone(assistantId, tok),
        supabase.from("assistants").select("name").eq("id", assistantId).maybeSingle(),
        analysisApi.getInstructionHistory(assistantId, tok),
        analysisApi.getLists(tok),
      ]);
      setThreads(threadsData);
      const name = aData?.name || "LLM Thing";
      setAssistantName(name);
      setCrumbs([{ label: name }]);
      setInstructions(instructionsData);
      setLists(listsData);
      // Compute memberships by checking each list's items
      const membershipChecks = await Promise.all(
        listsData.map(async (l) => {
          try {
            const items = await analysisApi.getListItems(l.id, tok);
            return items.some((i) => i.assistant_id === assistantId) ? l.id : null;
          } catch { return null; }
        })
      );
      setMemberships(membershipChecks.filter((x): x is string => !!x));
    } catch {
      router.push("/admin/analysis");
    }
  }, [assistantId, router, setCrumbs]);

  useEffect(() => {
    if (ready && token) fetchData(token);
  }, [ready, token, fetchData]);

  const handleAddToList = async (listId: string) => {
    if (!token || addingList) return;
    setAddingList(listId);
    try {
      await analysisApi.addListItem(listId, assistantId, token);
      setMemberships((prev) => [...prev, listId]);
      setShowAddToList(false);
    } catch {
      alert("Failed to add to list.");
    } finally {
      setAddingList(null);
    }
  };

  // Client-side filter + sort
  let visible = [...threads];
  if (filterFrom) visible = visible.filter((t) => { const v = t.last_message_at; return v ? v >= filterFrom : false; });
  if (filterTo) visible = visible.filter((t) => { const v = t.last_message_at; return v ? v <= filterTo + "T23:59:59" : false; });
  visible.sort((a, b) => {
    if (sortField === "message_count") return sortDir === "asc" ? a.message_count - b.message_count : b.message_count - a.message_count;
    const av = a[sortField] ?? ""; const bv = b[sortField] ?? "";
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const hasActiveFilters = filterFrom || filterTo || sortField !== "last_message_at" || sortDir !== "desc";

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
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Tab strip + page header */}
        <div className="px-6 pt-6 pb-0">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-black text-[var(--card-fill)] uppercase tracking-[0.06em]">{assistantName}</h1>
              <p className="text-sm text-[var(--card-fill)]/60 mt-1">{threads.length} session{threads.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b-[3px] border-[var(--card-shell)]">
            <button
              onClick={() => setActiveTab("sessions")}
              className={`px-4 py-2 text-sm font-bold transition rounded-t-[10px] -mb-[3px] border-[3px] border-b-0 ${
                activeTab === "sessions"
                  ? "border-[var(--card-shell)] bg-[var(--card-fill)] text-[var(--ink-dark)]"
                  : "border-transparent text-[var(--card-fill)]/70 hover:text-[var(--card-fill)]"
              }`}
            >
              Sessions
            </button>
            <button
              onClick={() => setActiveTab("instructions")}
              className={`px-4 py-2 text-sm font-bold transition rounded-t-[10px] -mb-[3px] border-[3px] border-b-0 flex items-center gap-2 ${
                activeTab === "instructions"
                  ? "border-[var(--card-shell)] bg-[var(--card-fill)] text-[var(--ink-dark)]"
                  : "border-transparent text-[var(--card-fill)]/70 hover:text-[var(--card-fill)]"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Instructions
              {instructions.length > 0 && (
                <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                  activeTab === "instructions"
                    ? "bg-[var(--ink-dark)] text-[var(--card-fill)]"
                    : "bg-white/20 text-[var(--card-fill)]"
                }`}>
                  {instructions.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab content */}
        {activeTab === "sessions" ? (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Session controls */}
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {memberships.length === 0 ? (
                  <>
                    <span className="text-xs text-[var(--card-fill)]/70">Not in any list</span>
                    <button
                      onClick={() => setShowAddToList(true)}
                      className="flex items-center gap-1.5 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] px-3 py-1 text-xs font-semibold text-[var(--ink-dark)] shadow-[3px_3px_0_var(--shadow-deep)] hover:-translate-y-0.5 transition"
                    >
                      <Plus className="h-3 w-3" />
                      Add to list to code
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-[var(--card-fill)]/70">In {memberships.length} list{memberships.length !== 1 ? "s" : ""}</span>
                    <button
                      onClick={() => setShowAddToList(true)}
                      className="flex items-center gap-1.5 rounded-full border-2 border-[var(--card-shell)] bg-white px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-dark)] hover:bg-[var(--card-fill)] transition"
                    >
                      <Plus className="h-3 w-3" />
                      Add to another list
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] px-3 py-1.5 text-xs font-semibold transition flex-shrink-0 ${
                  showFilters || hasActiveFilters ? "bg-[var(--ink-dark)] text-white shadow-[3px_3px_0_var(--shadow-deep)]" : "bg-white text-[var(--foreground)] hover:bg-[var(--card-fill)]"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filter & Sort
              </button>
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div className="mb-6 rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[4px_4px_0_var(--card-shell)]">
                <div className="flex flex-wrap gap-4 items-end">
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
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ink-dark)] mb-1.5">Order</label>
                    <div className="flex gap-2">
                      {(["desc", "asc"] as const).map((d) => (
                        <button key={d} onClick={() => setSortDir(d)}
                          className={`rounded-full border-2 border-[var(--card-shell)] px-3 py-1 text-xs font-medium transition ${sortDir === d ? "bg-[var(--ink-dark)] text-white" : "bg-white hover:bg-[var(--card-fill)]"}`}>
                          {sortField === "message_count" ? d === "desc" ? "High to low" : "Low to high" : d === "desc" ? "Newest first" : "Oldest first"}
                        </button>
                      ))}
                    </div>
                  </div>
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
                  {hasActiveFilters && (
                    <button onClick={() => { setSortField("last_message_at"); setSortDir("desc"); setFilterFrom(""); setFilterTo(""); }}
                      className="flex items-center gap-1 rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1.5 text-xs text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white transition">
                      <X className="h-3 w-3" />
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}

            {visible.length !== threads.length && (
              <p className="text-xs text-[var(--card-fill)]/60 mb-3">{visible.length} of {threads.length} sessions</p>
            )}

            {visible.length === 0 ? (
              <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-12 text-center">
                <MessageSquare className="h-10 w-10 text-[var(--ink-muted)] mx-auto mb-3" />
                <p className="text-[var(--ink-muted)]">No sessions found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visible.map((t) => (
                  <Link
                    key={t.thread_id}
                    href={`/admin/analysis/lists/none/thread/${t.thread_id}?session=${t.session_id}&assistant=${assistantId}`}
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
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Read-only notice + add to list */}
            <div className="px-6 pt-3 pb-2 flex items-center gap-3 flex-wrap">
              {memberships.length === 0 ? (
                <>
                  <span className="text-xs text-[var(--card-fill)]/70">
                    Read-only. Add to a list to code instructions.
                  </span>
                  <button
                    onClick={() => setShowAddToList(true)}
                    className="flex items-center gap-1.5 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] px-3 py-1 text-xs font-semibold text-[var(--ink-dark)] shadow-[3px_3px_0_var(--shadow-deep)] hover:-translate-y-0.5 transition"
                  >
                    <Plus className="h-3 w-3" />
                    Add to list
                  </button>
                </>
              ) : (
                <span className="text-xs text-[var(--card-fill)]/70">
                  Read-only overview. Open this LLM Thing inside a list to code instructions.
                </span>
              )}
            </div>
            <InstructionTimeline
              instructions={instructions}
              listId={null}
              token={token}
              assistantId={assistantId}
              codes={[]}
            />
          </div>
        )}

      </div>

      {/* Add to list modal */}
      {showAddToList && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !addingList && setShowAddToList(false)}>
          <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-6 shadow-[8px_8px_0_var(--shadow-deep)] w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-[var(--ink-dark)] uppercase tracking-wider">Add to list</h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">Pick a list to enable coding for this LLM Thing</p>
              </div>
              <button
                onClick={() => !addingList && setShowAddToList(false)}
                className="rounded-full border-2 border-[var(--card-shell)] bg-white p-1.5 hover:bg-[var(--ink-dark)] hover:text-white transition"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {lists.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)] text-center py-6">You don&apos;t have any lists yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {lists.map((l) => {
                  const isMember = memberships.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      disabled={isMember || !!addingList}
                      onClick={() => handleAddToList(l.id)}
                      className={`w-full flex items-center justify-between gap-3 rounded-[12px] border-2 border-[var(--card-shell)] px-3 py-2.5 text-left transition ${
                        isMember ? "bg-[var(--card-shell)]/10 text-[var(--ink-muted)] cursor-not-allowed" : "bg-white hover:bg-[var(--card-fill)]"
                      }`}
                    >
                      <span className="text-sm font-semibold text-[var(--ink-dark)] truncate">{l.name}</span>
                      {isMember ? (
                        <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase flex-shrink-0">Added</span>
                      ) : addingList === l.id ? (
                        <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase flex-shrink-0">Adding…</span>
                      ) : (
                        <Plus className="h-4 w-4 text-[var(--ink-dark)] flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </AnalysisShell>
  );
}
