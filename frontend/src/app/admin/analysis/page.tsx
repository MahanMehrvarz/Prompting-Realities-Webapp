"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  Trash2,
  X,
  BookOpen,
  ChevronRight,
  Tag,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { analysisApi, type AnalysisList, type AssistantBrowseItem } from "@/lib/backendApi";
import AnalysisShell from "./AnalysisShell";
import { useAnalysisBreadcrumb } from "./AnalysisBreadcrumbContext";

const TOKEN_KEY = "pr-auth-token";

// ---------------------------------------------------------------------------
// Add-to-list modal
// ---------------------------------------------------------------------------
function AddToListModal({
  assistant, lists, onClose, onSaved, token,
}: {
  assistant: AssistantBrowseItem; lists: AnalysisList[];
  onClose: () => void; onSaved: () => void; token: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(assistant.list_memberships));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setChecked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const save = async () => {
    setSaving(true);
    const original = new Set(assistant.list_memberships);
    const toAdd = [...checked].filter((id) => !original.has(id));
    const toRemove = [...original].filter((id) => !checked.has(id));
    await Promise.all([
      ...toAdd.map((listId) => analysisApi.addListItem(listId, assistant.id, token).catch(() => null)),
      ...toRemove.map((listId) => analysisApi.removeListItem(listId, assistant.id, token).catch(() => null)),
    ]);
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-6 shadow-[8px_8px_0_var(--shadow-deep)] w-full max-w-sm mx-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--ink-dark)]">Add to List</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5 truncate max-w-[220px]">{assistant.name}</p>
          </div>
          <button onClick={onClose} className="rounded-full border-2 border-[var(--card-shell)] bg-white p-1.5 hover:bg-[var(--ink-dark)] hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        {lists.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)] py-4 text-center">No lists yet. Create one first.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {lists.map((list) => (
              <label key={list.id} className="flex items-center gap-3 cursor-pointer rounded-[12px] border-2 border-[var(--card-shell)] bg-white px-3 py-2.5 hover:bg-[var(--card-fill)] transition">
                <input type="checkbox" checked={checked.has(list.id)} onChange={() => toggle(list.id)}
                  className="h-4 w-4 rounded border-2 border-[var(--card-shell)] text-[var(--ink-dark)] cursor-pointer" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--ink-dark)] truncate">{list.name}</p>
                  {list.item_count !== undefined && (
                    <p className="text-xs text-[var(--ink-muted)]">{list.item_count} assistant{list.item_count !== 1 ? "s" : ""}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-2 text-sm font-semibold hover:bg-[var(--card-fill)] transition">Cancel</button>
          <button onClick={save} disabled={saving || lists.length === 0}
            className="flex-1 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] hover:-translate-y-0.5 transition disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create list modal
// ---------------------------------------------------------------------------
function CreateListModal({ onClose, onCreated, token }: { onClose: () => void; onCreated: (list: AnalysisList) => void; token: string }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const list = await analysisApi.createList({ name: name.trim(), description: desc.trim() || undefined }, token);
      onCreated(list);
      onClose();
    } catch { alert("Failed to create list."); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-6 shadow-[8px_8px_0_var(--shadow-deep)] w-full max-w-sm mx-4">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--ink-dark)]">New List</h2>
          <button onClick={onClose} className="rounded-full border-2 border-[var(--card-shell)] bg-white p-1.5 hover:bg-[var(--ink-dark)] hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-1.5">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Study 1 – Resistance Patterns" autoFocus
              className="w-full rounded-[12px] border-2 border-[var(--card-shell)] bg-white px-4 py-2.5 text-sm placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)]" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-1.5">Description</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional description…" rows={3}
              className="w-full rounded-[12px] border-2 border-[var(--card-shell)] bg-white px-4 py-3 text-sm placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)] resize-none" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-full border-[3px] border-[var(--card-shell)] bg-white px-4 py-2 text-sm font-semibold hover:bg-[var(--card-fill)] transition">Cancel</button>
            <button type="submit" disabled={!name.trim() || saving}
              className="flex-1 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-2 text-sm font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] hover:-translate-y-0.5 transition disabled:opacity-50">
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant card
// ---------------------------------------------------------------------------
function AssistantCard({ assistant, lists, onAddToList }: { assistant: AssistantBrowseItem; lists: AnalysisList[]; onAddToList: (a: AssistantBrowseItem) => void }) {
  const memberCount = assistant.list_memberships.length;
  return (
    <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[5px_5px_0_var(--card-shell)] flex flex-col gap-3">
      <div className="rounded-[12px] bg-[var(--ink-dark)] px-4 py-3 text-[var(--card-fill)]">
        <h3 className="font-semibold truncate">{assistant.name}</h3>
        <p className="text-xs text-[var(--card-fill)]/60 mt-1 line-clamp-2 leading-relaxed">
          {assistant.prompt_instruction || "No system prompt"}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        {memberCount > 0 ? (
          <span className="rounded-full border-2 border-[var(--card-shell)] bg-[#e6fff5] px-2.5 py-1 text-xs font-semibold text-[#013022]">
            In {memberCount} list{memberCount !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="rounded-full border-2 border-[var(--card-shell)] bg-white px-2.5 py-1 text-xs text-[var(--ink-muted)]">
            Not in any list
          </span>
        )}
        <button onClick={() => onAddToList(assistant)}
          className="flex items-center gap-1.5 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-dark)] shadow-[3px_3px_0_var(--shadow-deep)] hover:-translate-y-0.5 transition">
          <Plus className="h-3 w-3" />
          Lists
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AnalysisPage() {
  const router = useRouter();
  const { setCrumbs } = useAnalysisBreadcrumb();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [lists, setLists] = useState<AnalysisList[]>([]);
  const [assistants, setAssistants] = useState<AssistantBrowseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [addToListTarget, setAddToListTarget] = useState<AssistantBrowseItem | null>(null);
  const [showCreateList, setShowCreateList] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setCrumbs([]); }, [setCrumbs]);

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

  const fetchLists = useCallback(async (tok: string) => {
    try { setLists(await analysisApi.getLists(tok)); } catch { /* ignore */ }
  }, []);

  const fetchAssistants = useCallback(async (tok: string, q: string, p: number) => {
    try {
      const data = await analysisApi.browseAssistants({ search: q || undefined, page: p, page_size: PAGE_SIZE }, tok);
      setAssistants(data.items);
      setTotal(data.total);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    fetchLists(token);
    fetchAssistants(token, search, page);
  }, [ready, token, fetchLists, fetchAssistants, search, page]);

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { if (token) fetchAssistants(token, val, 1); }, 300);
  };

  const handleDeleteList = async (listId: string) => {
    if (!token) return;
    setDeletingListId(listId);
    try {
      await analysisApi.deleteList(listId, token);
      setLists((prev) => prev.filter((l) => l.id !== listId));
    } finally { setDeletingListId(null); }
  };

  if (!ready) {
    return (
      <AnalysisShell>
        <div className="flex items-center justify-center py-24">
          <div className="text-[var(--card-fill)] text-lg font-semibold animate-pulse">Loading…</div>
        </div>
      </AnalysisShell>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AnalysisShell>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        {/* LEFT: Assistant browse */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[var(--card-fill)]">LLM Things</h2>
            <span className="text-sm text-[var(--card-fill)]/70">{total} total</span>
          </div>
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ink-muted)]" />
            <input type="text" value={search} onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search LLM things…"
              className="w-full rounded-[12px] border-2 border-[var(--card-shell)] bg-white pl-9 pr-4 py-2.5 text-sm placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-dark)]" />
            {search && (
              <button onClick={() => handleSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink-dark)]">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {assistants.length === 0 ? (
            <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-10 text-center">
              <p className="text-[var(--ink-muted)]">No LLM things found.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {assistants.map((a) => (
                  <AssistantCard key={a.id} assistant={a} lists={lists} onAddToList={setAddToListTarget} />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-6">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="rounded-full border-2 border-[var(--card-shell)] bg-white px-4 py-1.5 text-sm font-semibold disabled:opacity-40 hover:bg-[var(--card-fill)] transition">← Prev</button>
                  <span className="text-sm text-[var(--card-fill)]">{page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="rounded-full border-2 border-[var(--card-shell)] bg-white px-4 py-1.5 text-sm font-semibold disabled:opacity-40 hover:bg-[var(--card-fill)] transition">Next →</button>
                </div>
              )}
            </>
          )}
        </section>

        {/* RIGHT: Lists panel */}
        <aside>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[var(--card-fill)]">My Lists</h2>
            <button onClick={() => setShowCreateList(true)}
              className="flex items-center gap-1.5 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-3 py-1.5 text-xs font-semibold text-white shadow-[3px_3px_0_var(--shadow-deep)] hover:-translate-y-0.5 transition">
              <Plus className="h-3 w-3" />
              New List
            </button>
          </div>
          {lists.length === 0 ? (
            <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-8 text-center">
              <BookOpen className="h-8 w-8 text-[var(--ink-muted)] mx-auto mb-2" />
              <p className="text-sm text-[var(--ink-muted)]">No lists yet.</p>
              <p className="text-xs text-[var(--ink-muted)] mt-1">Create a list to start your analysis project.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lists.map((list) => (
                <div key={list.id} className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[5px_5px_0_var(--card-shell)] hover:shadow-[8px_8px_0_var(--shadow-deep)] transition group">
                  <Link href={`/admin/analysis/lists/${list.id}`} className="block">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[var(--ink-dark)] truncate">{list.name}</h3>
                        {list.description && <p className="text-xs text-[var(--ink-muted)] mt-0.5 line-clamp-2">{list.description}</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-[var(--ink-muted)] flex-shrink-0 mt-0.5 group-hover:translate-x-0.5 transition" />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <span className="flex items-center gap-1 rounded-full border-2 border-[var(--card-shell)] bg-white px-2.5 py-1 text-xs">
                        <BookOpen className="h-3 w-3 text-[var(--ink-muted)]" />
                        {list.item_count ?? 0}
                      </span>
                      <span className="flex items-center gap-1 rounded-full border-2 border-[var(--card-shell)] bg-white px-2.5 py-1 text-xs">
                        <Tag className="h-3 w-3 text-[var(--ink-muted)]" />
                        {list.code_count ?? 0} codes
                      </span>
                    </div>
                  </Link>
                  <div className="mt-2 pt-2 border-t border-[var(--card-shell)]/30 flex justify-end">
                    <button onClick={() => handleDeleteList(list.id)} disabled={deletingListId === list.id}
                      className="rounded-full border-2 border-[var(--card-shell)] p-1.5 text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white transition disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {addToListTarget && token && (
        <AddToListModal assistant={addToListTarget} lists={lists} token={token}
          onClose={() => setAddToListTarget(null)}
          onSaved={() => { if (token) { fetchAssistants(token, search, page); fetchLists(token); } }} />
      )}
      {showCreateList && token && (
        <CreateListModal token={token} onClose={() => setShowCreateList(false)}
          onCreated={(list) => setLists((prev) => [list, ...prev])} />
      )}
    </AnalysisShell>
  );
}
