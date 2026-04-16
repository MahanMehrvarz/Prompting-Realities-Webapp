"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  CalendarDays,
  Clock,
  Download,
  MessageSquare,
  Tag,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/isAdmin";
import { analysisApi, type AnalysisList, type AnalysisListItem, type ThreadSummary } from "@/lib/backendApi";
import AnalysisShell from "../../AnalysisShell";
import { useAnalysisBreadcrumb } from "../../AnalysisBreadcrumbContext";
import ListTabStrip from "@/components/analysis/ListTabStrip";

const TOKEN_KEY = "pr-auth-token";

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Export button
// ---------------------------------------------------------------------------
function ExportButton({ listId, token }: { listId: string; token: string }) {
  const [open, setOpen] = useState(false);
  const doExport = async (format: "json" | "csv") => {
    setOpen(false);
    const url = analysisApi.getExportUrl(listId, format);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { alert("Export failed."); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `export.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] hover:bg-[#1d4ed8] transition">
        <Download className="h-4 w-4" />
        Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] shadow-[5px_5px_0_var(--card-shell)] overflow-hidden min-w-[160px]">
            <button onClick={() => doExport("json")} className="w-full px-4 py-2.5 text-sm text-left hover:bg-white font-medium text-[var(--ink-dark)] transition">Export as JSON</button>
            <button onClick={() => doExport("csv")} className="w-full px-4 py-2.5 text-sm text-left hover:bg-white font-medium text-[var(--ink-dark)] border-t border-[var(--card-shell)]/40 transition">Export as CSV</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant card — unified with main page design
// ---------------------------------------------------------------------------
type ThreadStats = { thread_count: number; message_count: number; last_used: string | null };

function ListAssistantCard({
  item, listId, token, stats, onRemoved,
}: {
  item: AnalysisListItem; listId: string; token: string;
  stats: ThreadStats | undefined; onRemoved: (assistantId: string) => void;
}) {
  const [removing, setRemoving] = useState(false);

  const remove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Remove "${item.assistant_name}" from this list?`)) return;
    setRemoving(true);
    try {
      await analysisApi.removeListItem(listId, item.assistant_id, token);
      onRemoved(item.assistant_id);
    } finally { setRemoving(false); }
  };

  return (
    <Link
      href={`/admin/analysis/lists/${listId}/assistant/${item.assistant_id}`}
      className="block rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[5px_5px_0_var(--card-shell)] hover:shadow-[8px_8px_0_var(--shadow-deep)] transition group"
    >
      {/* Dark header */}
      <div className="rounded-[12px] bg-[var(--ink-dark)] px-4 py-3 text-[var(--card-fill)] mb-3">
        <h3 className="font-bold truncate text-base">{item.assistant_name}</h3>
        <div className="flex items-center gap-1 mt-1.5 text-[var(--card-fill)]/50">
          <CalendarDays className="h-3 w-3 flex-shrink-0" />
          <span className="text-xs">Added {fmt(item.added_at)}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-[10px] bg-white border-2 border-[var(--card-shell)] px-2 py-2">
          <div className="flex items-center gap-1 text-[var(--ink-muted)] mb-0.5">
            <MessageSquare className="h-3 w-3 flex-shrink-0" />
            <span className="text-[10px] font-medium uppercase tracking-wide truncate">Threads</span>
          </div>
          <p className="text-lg font-black text-[var(--ink-dark)] leading-none">
            {stats ? stats.thread_count : <span className="text-sm animate-pulse">…</span>}
          </p>
        </div>
        <div className="rounded-[10px] bg-white border-2 border-[var(--card-shell)] px-2 py-2">
          <div className="flex items-center gap-1 text-[var(--ink-muted)] mb-0.5">
            <ArrowUpDown className="h-3 w-3 flex-shrink-0" />
            <span className="text-[10px] font-medium uppercase tracking-wide truncate">Messages</span>
          </div>
          <p className="text-lg font-black text-[var(--ink-dark)] leading-none">
            {stats ? stats.message_count : <span className="text-sm animate-pulse">…</span>}
          </p>
        </div>
        <div className="rounded-[10px] bg-white border-2 border-[var(--card-shell)] px-2 py-2">
          <div className="flex items-center gap-1 text-[var(--ink-muted)] mb-0.5">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span className="text-[10px] font-medium uppercase tracking-wide truncate">Last used</span>
          </div>
          <p className="text-[11px] font-semibold text-[var(--ink-dark)] leading-tight">
            {stats ? (stats.last_used ? fmt(stats.last_used) : "—") : <span className="text-sm animate-pulse">…</span>}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border-2 border-[var(--card-shell)] bg-[#e6fff5] px-2.5 py-1 text-xs font-semibold text-[#013022]">
          In this list
        </span>
        <button
          onClick={remove}
          disabled={removing}
          className="flex items-center gap-1.5 rounded-full border-[3px] border-[var(--card-shell)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white transition disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
          {removing ? "Removing…" : "Remove"}
        </button>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ListPage() {
  const router = useRouter();
  const params = useParams();
  const listId = params.listId as string;
  const { setCrumbs } = useAnalysisBreadcrumb();

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [list, setList] = useState<AnalysisList | null>(null);
  const [items, setItems] = useState<AnalysisListItem[]>([]);
  const [threadStats, setThreadStats] = useState<Record<string, ThreadStats>>({});
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

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
      const [listData, itemsData] = await Promise.all([
        analysisApi.getList(listId, tok),
        analysisApi.getListItems(listId, tok),
      ]);
      setList(listData);
      setItems(itemsData);
      setCrumbs([{ label: listData.name }]);

      // Fetch thread stats for all items in parallel
      const statsResults = await Promise.all(
        itemsData.map(async (item) => {
          try {
            const threads: ThreadSummary[] = await analysisApi.getThreads(listId, item.assistant_id, tok);
            const last_used = threads.reduce<string | null>((max, t) => {
              if (!t.last_message_at) return max;
              if (!max) return t.last_message_at;
              return t.last_message_at > max ? t.last_message_at : max;
            }, null);
            const message_count = threads.reduce((sum, t) => sum + (t.message_count ?? 0), 0);
            return { assistant_id: item.assistant_id, thread_count: threads.length, message_count, last_used };
          } catch {
            return { assistant_id: item.assistant_id, thread_count: 0, message_count: 0, last_used: null };
          }
        })
      );
      const statsMap: Record<string, ThreadStats> = {};
      for (const s of statsResults) statsMap[s.assistant_id] = { thread_count: s.thread_count, message_count: s.message_count, last_used: s.last_used };
      setThreadStats(statsMap);
    } catch {
      router.push("/admin/analysis");
    }
  }, [listId, router, setCrumbs]);

  useEffect(() => {
    if (ready && token) fetchData(token);
  }, [ready, token, fetchData]);

  const saveEdit = async () => {
    if (!token || !list) return;
    try {
      const updated = await analysisApi.updateList(listId, { name: editName, description: editDesc }, token);
      setList(updated);
      setCrumbs([{ label: updated.name }]);
      setEditing(false);
    } catch { alert("Failed to save."); }
  };

  if (!ready || !list) {
    return (
      <AnalysisShell>
        <div className="flex items-center justify-center py-24">
          <div className="text-[var(--card-fill)] text-lg font-semibold animate-pulse">Loading…</div>
        </div>
      </AnalysisShell>
    );
  }

  return (
    <AnalysisShell headerRight={token ? <ExportButton listId={listId} token={token} /> : undefined}>
      {/* List title + meta */}
      <div className="mb-8">
        {editing ? (
          <div className="space-y-2 max-w-xl">
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              className="text-2xl font-black uppercase tracking-[0.06em] bg-transparent border-b-2 border-[var(--ink-dark)] focus:outline-none w-full text-[var(--ink-dark)]" autoFocus />
            <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description…"
              className="text-sm bg-transparent border-b border-[var(--ink-muted)] focus:outline-none w-full text-[var(--ink-muted)]" />
            <div className="flex gap-2 pt-1">
              <button onClick={saveEdit} className="rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 transition">Save</button>
              <button onClick={() => setEditing(false)} className="rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-1.5 text-xs font-semibold hover:bg-[var(--card-fill)] transition">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <button onClick={() => { setEditName(list.name); setEditDesc(list.description || ""); setEditing(true); }} className="text-left group">
              <h1 className="text-3xl font-black text-[var(--card-fill)] uppercase tracking-[0.06em] group-hover:underline">{list.name}</h1>
            </button>
            {list.description && <p className="text-sm text-[var(--card-fill)]/70 mt-1">{list.description}</p>}
            <p className="text-xs text-[var(--card-fill)]/50 mt-1">Created by {list.created_by} · {fmt(list.created_at)}</p>
            <div className="flex gap-3 mt-3">
              <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1 text-xs font-medium">
                <BookOpen className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
                {items.length} LLM thing{items.length !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1 text-xs font-medium">
                <Tag className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
                {list.code_count ?? 0} codes
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tab strip */}
      <ListTabStrip listId={listId} />

      {/* Cards */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-bold text-[var(--card-fill)] uppercase tracking-wider">LLM Things in this list</h2>
        <Link href="/admin/analysis" className="flex items-center gap-1.5 text-sm text-[var(--card-fill)]/80 hover:text-[var(--card-fill)] transition">
          <ArrowLeft className="h-4 w-4" />
          Add more
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-12 text-center">
          <BookOpen className="h-10 w-10 text-[var(--ink-muted)] mx-auto mb-3" />
          <p className="text-[var(--ink-muted)]">No LLM things in this list yet.</p>
          <Link href="/admin/analysis" className="mt-4 inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] hover:-translate-y-0.5 transition">
            Browse & Add
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          {items.map((item) => (
            <ListAssistantCard
              key={item.id}
              item={item}
              listId={listId}
              token={token!}
              stats={threadStats[item.assistant_id]}
              onRemoved={(aid) => setItems((prev) => prev.filter((i) => i.assistant_id !== aid))}
            />
          ))}
        </div>
      )}
    </AnalysisShell>
  );
}
