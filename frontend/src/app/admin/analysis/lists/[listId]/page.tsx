"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Download,
  FlaskConical,
  MessageSquare,
  Tag,
  Trash2,
  X,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  analysisApi,
  type AnalysisList,
  type AnalysisListItem,
} from "@/lib/backendApi";

const TOKEN_KEY = "pr-auth-token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Export dropdown
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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] hover:bg-[#1d4ed8] transition"
      >
        <Download className="h-4 w-4" />
        Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] shadow-[5px_5px_0_var(--card-shell)] overflow-hidden min-w-[160px]">
            <button
              onClick={() => doExport("json")}
              className="w-full px-4 py-2.5 text-sm text-left hover:bg-white font-medium text-[var(--ink-dark)] transition"
            >
              Export as JSON
            </button>
            <button
              onClick={() => doExport("csv")}
              className="w-full px-4 py-2.5 text-sm text-left hover:bg-white font-medium text-[var(--ink-dark)] border-t border-[var(--card-shell)]/40 transition"
            >
              Export as CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant card (within a list)
// ---------------------------------------------------------------------------
function ListAssistantCard({
  item,
  listId,
  token,
  onRemoved,
}: {
  item: AnalysisListItem;
  listId: string;
  token: string;
  onRemoved: (assistantId: string) => void;
}) {
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    setRemoving(true);
    try {
      await analysisApi.removeListItem(listId, item.assistant_id, token);
      onRemoved(item.assistant_id);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[5px_5px_0_var(--card-shell)] flex flex-col gap-3">
      <Link href={`/admin/analysis/lists/${listId}/assistant/${item.assistant_id}`} className="block group">
        <div className="rounded-[12px] bg-[var(--ink-dark)] px-4 py-3 text-[var(--card-fill)] group-hover:bg-[#333] transition">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold truncate">{item.assistant_name}</h3>
            <ChevronRight className="h-4 w-4 text-[var(--card-fill)]/60 flex-shrink-0 mt-0.5 group-hover:translate-x-0.5 transition" />
          </div>
          <p className="text-xs text-[var(--card-fill)]/60 mt-1 line-clamp-2 leading-relaxed">
            {item.assistant_system_prompt || "No system prompt"}
          </p>
        </div>
      </Link>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--ink-muted)]">Added by {item.added_by}</span>
        <button
          onClick={remove}
          disabled={removing}
          className="rounded-full border-2 border-[var(--card-shell)] p-1.5 text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white transition disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ListPage() {
  const router = useRouter();
  const params = useParams();
  const listId = params.listId as string;

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [list, setList] = useState<AnalysisList | null>(null);
  const [items, setItems] = useState<AnalysisListItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Auth gate
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
      const [listData, itemsData] = await Promise.all([
        analysisApi.getList(listId, tok),
        analysisApi.getListItems(listId, tok),
      ]);
      setList(listData);
      setItems(itemsData);
    } catch {
      router.push("/admin/analysis");
    }
  }, [listId, router]);

  useEffect(() => {
    if (ready && token) fetchData(token);
  }, [ready, token, fetchData]);

  const saveEdit = async () => {
    if (!token || !list) return;
    try {
      const updated = await analysisApi.updateList(listId, { name: editName, description: editDesc }, token);
      setList(updated);
      setEditing(false);
    } catch {
      alert("Failed to save.");
    }
  };

  if (!ready || !list) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--card-fill)] text-lg font-semibold animate-pulse">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Header */}
      <header className="border-b-4 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-5 shadow-[0_6px_0_var(--card-shell)]">
        <div className="mx-auto max-w-7xl">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)] mb-3">
            <Link href="/" className="hover:text-[var(--ink-dark)] transition">Dashboard</Link>
            <span>/</span>
            <Link href="/admin/analysis" className="hover:text-[var(--ink-dark)] transition flex items-center gap-1">
              <FlaskConical className="h-3.5 w-3.5" />
              Analysis
            </Link>
            <span>/</span>
            <span className="text-[var(--ink-dark)] font-semibold truncate max-w-[200px]">{list.name}</span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              {editing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-2xl font-black uppercase tracking-[0.06em] bg-transparent border-b-2 border-[var(--ink-dark)] focus:outline-none w-full text-[var(--ink-dark)]"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Description…"
                    className="text-sm bg-transparent border-b border-[var(--ink-muted)] focus:outline-none w-full text-[var(--ink-muted)]"
                  />
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveEdit} className="rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 transition">
                      Save
                    </button>
                    <button onClick={() => setEditing(false)} className="rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-1.5 text-xs font-semibold hover:bg-[var(--card-fill)] transition">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => { setEditName(list.name); setEditDesc(list.description || ""); setEditing(true); }}
                    className="text-left group"
                  >
                    <h1 className="text-2xl font-black text-[var(--ink-dark)] uppercase tracking-[0.06em] group-hover:underline">{list.name}</h1>
                  </button>
                  {list.description && (
                    <p className="text-sm text-[var(--ink-muted)] mt-1">{list.description}</p>
                  )}
                  <p className="text-xs text-[var(--ink-muted)] mt-1">Created by {list.created_by}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {token && <ExportButton listId={listId} token={token} />}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-3 mt-4">
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
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[var(--card-fill)]">LLM Things in this list</h2>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {items.map((item) => (
              <ListAssistantCard
                key={item.id}
                item={item}
                listId={listId}
                token={token!}
                onRemoved={(aid) => setItems((prev) => prev.filter((i) => i.assistant_id !== aid))}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
