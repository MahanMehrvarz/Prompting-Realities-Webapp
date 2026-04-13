"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Clock, MessageSquare, SlidersHorizontal, Tag, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { analysisApi, type ThreadSummary } from "@/lib/backendApi";
import AnalysisShell from "../../../../AnalysisShell";
import { useAnalysisBreadcrumb } from "../../../../AnalysisBreadcrumbContext";

const TOKEN_KEY = "pr-auth-token";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
  const [listName, setListName] = useState<string>("");

  // Filters
  const [showOnlyCoded, setShowOnlyCoded] = useState(false);
  const [sortField, setSortField] = useState<"first_message_at" | "last_message_at">("last_message_at");
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
      const [threadsData, items, listData] = await Promise.all([
        analysisApi.getThreads(listId, assistantId, tok),
        analysisApi.getListItems(listId, tok),
        analysisApi.getList(listId, tok),
      ]);
      setThreads(threadsData);
      const found = items.find((i) => i.assistant_id === assistantId);
      const aName = found?.assistant_name || "LLM Thing";
      setAssistantName(aName);
      setListName(listData.name);
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
  if (filterFrom) visible = visible.filter((t) => {
    const val = t[sortField];
    return val ? val >= filterFrom : false;
  });
  if (filterTo) visible = visible.filter((t) => {
    const val = t[sortField];
    const toEnd = filterTo + "T23:59:59";
    return val ? val <= toEnd : false;
  });
  visible.sort((a, b) => {
    const av = a[sortField] ?? "";
    const bv = b[sortField] ?? "";
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const hasActiveFilters = showOnlyCoded || filterFrom || filterTo || sortField !== "last_message_at" || sortDir !== "desc";

  if (!ready) {
    return (
      <AnalysisShell>
        <div className="flex items-center justify-center py-24">
          <div className="text-[var(--card-fill)] text-lg font-semibold animate-pulse">Loading…</div>
        </div>
      </AnalysisShell>
    );
  }

  return (
    <AnalysisShell>
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
                {(["first_message_at", "last_message_at"] as const).map((f) => (
                  <button key={f} onClick={() => setSortField(f)}
                    className={`rounded-full border-2 border-[var(--card-shell)] px-3 py-1 text-xs font-medium transition ${sortField === f ? "bg-[var(--ink-dark)] text-white" : "bg-white hover:bg-[var(--card-fill)]"}`}>
                    {f === "first_message_at" ? "Date started" : "Last activity"}
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
                    {d === "desc" ? "Newest first" : "Oldest first"}
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
    </AnalysisShell>
  );
}
