"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  PanelRight,
  Plus,
  Search,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  analysisApi,
  type AnalysisCode,
  type AnalysisCodeGroup,
  type AnalysisHighlight,
  type ThreadConversation,
} from "@/lib/backendApi";
import AnalysisShell from "../../../../AnalysisShell";
import { useAnalysisBreadcrumb } from "../../../../AnalysisBreadcrumbContext";

const TOKEN_KEY = "pr-auth-token";

const PRESET_COLORS = ["#fde68a", "#a7f3d0", "#bfdbfe", "#fecaca", "#ddd6fe", "#fed7aa", "#e9d5ff", "#99f6e4"];
let colorIdx = 0;
function nextColor() { const c = PRESET_COLORS[colorIdx % PRESET_COLORS.length]; colorIdx++; return c; }

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Code tooltip (triggered by floating action bar)
// ---------------------------------------------------------------------------
function CodeTooltip({
  codes,
  onCodeSelect,
  onCodeCreate,
  onDismiss,
}: {
  codes: AnalysisCode[];
  onCodeSelect: (codeId: string) => void;
  onCodeCreate: (name: string, color: string) => Promise<string>;
  onDismiss: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = codes.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = codes.some((c) => c.name.toLowerCase() === query.toLowerCase());

  const handleCreate = async () => {
    if (!query.trim()) return;
    const color = nextColor();
    const id = await onCodeCreate(query.trim(), color);
    onCodeSelect(id);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onDismiss} />
      <div
        className="fixed z-50 bottom-24 left-1/2 -translate-x-1/2 rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] shadow-[8px_8px_0_var(--shadow-deep)] overflow-hidden"
        style={{ width: 300, maxHeight: 340 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-[var(--card-shell)]">
          <Search className="h-4 w-4 text-[var(--ink-muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onDismiss();
              if (e.key === "Enter" && filtered.length === 1) onCodeSelect(filtered[0].id);
              if (e.key === "Enter" && filtered.length === 0 && query.trim()) handleCreate();
            }}
            placeholder="Search or create code…"
            className="flex-1 bg-transparent text-sm outline-none text-[var(--ink-dark)] placeholder:text-[var(--ink-muted)]"
          />
        </div>
        <div className="max-h-60 overflow-y-auto">
          {filtered.map((code) => (
            <button key={code.id} onClick={() => onCodeSelect(code.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-white transition group">
              <span className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10" style={{ backgroundColor: code.color }} />
              <span className="flex-1 text-[var(--ink-dark)] font-medium truncate">{code.name}</span>
              {code.usage_count !== undefined && (
                <span className="text-xs text-[var(--ink-muted)] group-hover:text-[var(--ink-dark)]">×{code.usage_count}</span>
              )}
            </button>
          ))}
          {!exactMatch && query.trim() && (
            <>
              {filtered.length > 0 && <div className="border-t border-[var(--card-shell)]/50" />}
              <button onClick={handleCreate}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-[#2563eb] hover:bg-[#e5f5ff] transition">
                <span className="w-3 h-3 rounded-full border-2 border-dashed border-[#2563eb] flex-shrink-0 flex items-center justify-center">
                  <Plus className="h-2 w-2" />
                </span>
                <span>Create &ldquo;{query.trim()}&rdquo;</span>
              </button>
            </>
          )}
          {filtered.length === 0 && !query.trim() && (
            <div className="px-3 py-4 text-sm text-[var(--ink-muted)] text-center">No codes yet. Type to create one.</div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Codebook sidebar
// ---------------------------------------------------------------------------
function CodebookPanel({
  listId, codes, codeGroups, token, onCodesChange,
}: {
  listId: string; codes: AnalysisCode[]; codeGroups: AnalysisCodeGroup[];
  token: string; onCodesChange: (codes: AnalysisCode[]) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const saveEdit = async (code: AnalysisCode) => {
    if (!editName.trim() || editName === code.name) { setEditingId(null); return; }
    try {
      const updated = await analysisApi.updateCode(listId, code.id, { name: editName.trim() }, token);
      onCodesChange(codes.map((c) => c.id === code.id ? { ...c, name: updated.name } : c));
    } catch { /* ignore */ }
    setEditingId(null);
  };

  const deleteCode = async (codeId: string) => {
    if (!confirm("Delete this code? All its assignments will be removed (highlights stay).")) return;
    try {
      await analysisApi.deleteCode(listId, codeId, token);
      onCodesChange(codes.filter((c) => c.id !== codeId));
    } catch { /* ignore */ }
  };

  const grouped = codeGroups.map((g) => ({ group: g, codes: codes.filter((c) => c.group_id === g.id) }));
  const ungrouped = codes.filter((c) => !c.group_id);

  const CodeRow = ({ code }: { code: AnalysisCode }) => (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--card-shell)]/20 hover:bg-white/60 transition group">
      <span className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10" style={{ backgroundColor: code.color }} />
      {editingId === code.id ? (
        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
          onBlur={() => saveEdit(code)}
          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(code); if (e.key === "Escape") setEditingId(null); }}
          className="flex-1 text-sm bg-white rounded px-1 py-0.5 border border-[var(--card-shell)] focus:outline-none" autoFocus />
      ) : (
        <Link href={`/admin/analysis/lists/${listId}/codes/${code.id}`}
          className="flex-1 text-sm text-[var(--ink-dark)] truncate hover:underline">
          {code.name}
        </Link>
      )}
      <span className="text-xs text-[var(--ink-muted)] flex-shrink-0">×{code.usage_count ?? 0}</span>
      <button onClick={() => { setEditingId(code.id); setEditName(code.name); }}
        className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-[var(--ink-muted)] hover:text-[var(--ink-dark)] transition text-xs">
        ✎
      </button>
      <button onClick={() => deleteCode(code.id)}
        className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white transition">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--card-shell)]">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-[var(--ink-dark)]" />
          <h3 className="font-bold text-[var(--ink-dark)] text-sm">Codebook</h3>
        </div>
        <span className="text-xs text-[var(--ink-muted)]">{codes.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {grouped.map(({ group, codes: gc }) => (
          <div key={group.id}>
            <button onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center gap-2 px-4 py-2 bg-white/60 border-b border-[var(--card-shell)]/30 hover:bg-white transition">
              {collapsed.has(group.id) ? <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-muted)]" /> : <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-muted)]" />}
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.color }} />
              <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider flex-1 text-left">{group.name}</span>
              <span className="text-xs text-[var(--ink-muted)]">{gc.length}</span>
            </button>
            {!collapsed.has(group.id) && gc.map((code) => <CodeRow key={code.id} code={code} />)}
          </div>
        ))}
        {ungrouped.length > 0 && (
          <div>
            {codeGroups.length > 0 && (
              <div className="px-4 py-1.5 bg-white/60 border-b border-[var(--card-shell)]/30">
                <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider">Ungrouped</span>
              </div>
            )}
            {ungrouped.map((code) => <CodeRow key={code.id} code={code} />)}
          </div>
        )}
        {codes.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
            No codes yet.<br />Select messages to create one.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble with coding badge
// ---------------------------------------------------------------------------
function MessageBubble({
  msgId,
  text,
  field,
  isSelected,
  onToggle,
  highlights,
  codes,
}: {
  msgId: string;
  text: string;
  field: "user_text" | "response_text";
  isSelected: boolean;
  onToggle?: () => void;
  highlights: AnalysisHighlight[];
  codes: AnalysisCode[];
}) {
  const isUser = field === "user_text";
  const msgHighlights = highlights.filter(
    (h) => h.message_ids.includes(msgId) && (h.source_field === field || h.source_field === "both")
  );

  return (
    <div
      onClick={onToggle}
      className={`relative rounded-[16px] border-[3px] px-4 py-3 text-sm leading-relaxed transition select-none ${onToggle ? "cursor-pointer" : ""} ${
        isSelected
          ? "border-[var(--ink-dark)] shadow-[4px_4px_0_var(--ink-dark)] bg-[var(--card-fill)]"
          : isUser
          ? "border-transparent bg-[var(--ink-dark)] text-[var(--card-fill)] hover:border-[var(--ink-dark)]/40"
          : "border-[var(--card-shell)] bg-[var(--card-fill)] text-[var(--ink-dark)] hover:border-[var(--ink-dark)]/40"
      }`}
    >
      {/* Selected checkmark */}
      {isSelected && (
        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[var(--ink-dark)] flex items-center justify-center">
          <Check className="h-3 w-3 text-white" />
        </span>
      )}

      <p className={isUser ? "text-[var(--card-fill)]" : "text-[var(--ink-dark)]"}>{text}</p>

      {/* Code chips */}
      {msgHighlights.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-black/10">
          {msgHighlights.flatMap((h) =>
            h.codes.map((c) => {
              const fullCode = codes.find((fc) => fc.id === c.id);
              return (
                <span
                  key={`${h.id}-${c.id}`}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border border-black/10"
                  style={{ backgroundColor: hexToRgba(c.color, 0.35) }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </span>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main thread page
// ---------------------------------------------------------------------------
export default function ThreadPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const listId = params.listId as string;
  const threadId = params.threadId as string;
  const sessionId = searchParams.get("session") || "";
  const assistantId = searchParams.get("assistant") || "";
  const { setCrumbs } = useAnalysisBreadcrumb();

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ThreadConversation | null>(null);
  const [codes, setCodes] = useState<AnalysisCode[]>([]);
  const [codeGroups, setCodeGroups] = useState<AnalysisCodeGroup[]>([]);
  const [codebookOpen, setCodebookOpen] = useState(true);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [showCodeTooltip, setShowCodeTooltip] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const readOnly = listId === "none";

  const fetchData = useCallback(async (tok: string) => {
    try {
      const convo = await analysisApi.getThreadConversation(listId, threadId, tok);
      setConversation(convo);

      if (!readOnly) {
        const [codesData, groupsData, items, listData] = await Promise.all([
          analysisApi.getCodes(listId, tok),
          analysisApi.getCodeGroups(listId, tok),
          analysisApi.getListItems(listId, tok),
          analysisApi.getList(listId, tok),
        ]);
        setCodes(codesData);
        setCodeGroups(groupsData);
        const found = items.find((i) => i.assistant_id === (assistantId || convo.assistant_id));
        const aName = found?.assistant_name || "LLM Thing";
        setCrumbs([
          { label: listData.name, href: `/admin/analysis/lists/${listId}` },
          { label: aName, href: `/admin/analysis/lists/${listId}/assistant/${assistantId || convo.assistant_id}` },
          { label: `…${threadId.slice(-8)}` },
        ]);
      } else {
        // Read-only: fetch assistant name directly
        const { data: aData } = await supabase.from("assistants").select("name").eq("id", assistantId || convo.assistant_id).maybeSingle();
        const aName = aData?.name || "LLM Thing";
        setCrumbs([
          { label: aName, href: `/admin/analysis/assistant/${assistantId || convo.assistant_id}` },
          { label: `…${threadId.slice(-8)}` },
        ]);
      }
    } catch {
      router.push(readOnly ? "/admin/analysis" : `/admin/analysis/lists/${listId}`);
    }
  }, [listId, threadId, assistantId, readOnly, router, setCrumbs]);

  useEffect(() => {
    if (ready && token) fetchData(token);
  }, [ready, token, fetchData]);

  const toggleMessage = (msgId: string) => {
    setSelectedMsgIds((prev) => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
  };

  const handleCodeSelect = async (codeId: string) => {
    if (!token || !conversation || selectedMsgIds.size === 0 || saving) return;
    setSaving(true);
    setShowCodeTooltip(false);
    try {
      const selectedMessages = conversation.messages.filter((m) => selectedMsgIds.has(m.id));
      await Promise.all(
        selectedMessages.map(async (msg) => {
          const userLen = msg.user_text?.length ?? 0;
          const respLen = msg.response_text?.length ?? 0;
          const charEnd = Math.max(userLen, respLen, 1);
          const selectedText = (msg.response_text || msg.user_text || "").slice(0, 120);
          const sourceField = userLen > 0 && respLen > 0 ? "both" : respLen > 0 ? "response_text" : "user_text";
          const highlight = await analysisApi.createHighlight({
            list_id: listId,
            thread_id: threadId,
            session_id: sessionId || conversation.messages[0]?.session_id || "",
            assistant_id: assistantId || conversation.assistant_id || "",
            selected_text: selectedText,
            message_ids: [msg.id],
            char_start: 0,
            char_end: charEnd,
            source_field: sourceField,
          }, token);
          await analysisApi.assignCode(highlight.id, codeId, token);
        })
      );
      setSelectedMsgIds(new Set());
      await fetchData(token);
    } catch {
      alert("Failed to save codes.");
    } finally {
      setSaving(false);
    }
  };

  const handleCodeCreate = async (name: string, color: string): Promise<string> => {
    if (!token) throw new Error("No token");
    const code = await analysisApi.createCode(listId, { name, color }, token);
    setCodes((prev) => [...prev, { ...code, usage_count: 0 }]);
    return code.id;
  };

  const deleteHighlight = async (highlightId: string) => {
    if (!token) return;
    try {
      await analysisApi.deleteHighlight(highlightId, token);
      if (token) await fetchData(token);
    } catch { /* ignore */ }
  };

  if (!ready || !conversation) {
    return (
      <AnalysisShell fullBleed>
        <div className="flex items-center justify-center py-24">
          <div className="text-[var(--card-fill)] text-lg font-semibold animate-pulse">Loading…</div>
        </div>
      </AnalysisShell>
    );
  }

  return (
    <AnalysisShell
      fullBleed
      headerRight={
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--ink-muted)]">{conversation.messages.length} messages</span>
          {readOnly && (
            <span className="rounded-full border-2 border-[var(--card-shell)] bg-white px-3 py-1 text-xs text-[var(--ink-muted)]">
              Read-only — add to a list to start coding
            </span>
          )}
          {!readOnly && (
            <button
              onClick={() => setCodebookOpen((o) => !o)}
              className={`flex items-center gap-1.5 rounded-full border-[3px] border-[var(--card-shell)] px-3 py-1.5 text-xs font-semibold transition ${
                codebookOpen ? "bg-[var(--ink-dark)] text-white" : "bg-white text-[var(--foreground)] hover:bg-[var(--card-fill)]"
              }`}
            >
              <PanelRight className="h-3.5 w-3.5" />
              Codebook
            </button>
          )}
        </div>
      }
    >
      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {conversation.messages.length === 0 && (
            <div className="text-center text-[var(--card-fill)]/60 py-12">No messages in this thread.</div>
          )}

          {conversation.messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              {/* User message */}
              {msg.user_text && (
                <div className="flex justify-end">
                  <div className="max-w-[70%]">
                    <div className="flex items-center gap-1.5 justify-end mb-1">
                      <span className="text-xs text-[var(--card-fill)]/50">User</span>
                      <User className="h-3.5 w-3.5 text-[var(--card-fill)]/50" />
                    </div>
                    <MessageBubble
                      msgId={msg.id}
                      text={msg.user_text}
                      field="user_text"
                      isSelected={selectedMsgIds.has(msg.id)}
                      onToggle={readOnly ? undefined : () => toggleMessage(msg.id)}
                      highlights={conversation.highlights}
                      codes={codes}
                    />
                    <p className="text-xs text-[var(--card-fill)]/40 mt-1 text-right">
                      {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              )}

              {/* Assistant message */}
              {msg.response_text && (
                <div className="flex justify-start">
                  <div className="max-w-[70%]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Bot className="h-3.5 w-3.5 text-[var(--card-fill)]/50" />
                      <span className="text-xs text-[var(--card-fill)]/50">Assistant</span>
                    </div>
                    <MessageBubble
                      msgId={msg.id}
                      text={msg.response_text}
                      field="response_text"
                      isSelected={selectedMsgIds.has(msg.id)}
                      onToggle={readOnly ? undefined : () => toggleMessage(msg.id)}
                      highlights={conversation.highlights}
                      codes={codes}
                    />
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-[var(--card-fill)]/40">
                        {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {msg.reaction && (
                        <span className="text-xs text-[var(--ink-muted)]">{msg.reaction === "like" ? "👍" : "👎"}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Highlights summary */}
          {conversation.highlights.length > 0 && (
            <div className="border-t-2 border-[var(--card-shell)]/30 pt-6 mt-4">
              <h3 className="text-xs font-semibold text-[var(--card-fill)]/60 uppercase tracking-wider mb-3">
                {conversation.highlights.length} highlight{conversation.highlights.length !== 1 ? "s" : ""} in this thread
              </h3>
              <div className="space-y-2">
                {conversation.highlights.map((h) => (
                  <div key={h.id} className="rounded-[12px] border-2 border-[var(--card-shell)] bg-[var(--card-fill)] px-3 py-2 text-sm flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {h.codes.map((c) => (
                          <span key={c.id}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border border-black/10"
                            style={{ backgroundColor: hexToRgba(c.color, 0.3) }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                            {c.name}
                          </span>
                        ))}
                        {h.codes.length === 0 && <span className="text-xs text-[var(--ink-muted)] italic">No codes</span>}
                      </div>
                      <p className="text-xs text-[var(--ink-muted)] line-clamp-2 italic">&ldquo;{h.selected_text}&rdquo;</p>
                      <p className="text-xs text-[var(--ink-muted)]/60 mt-0.5">by {h.created_by}</p>
                    </div>
                    <button onClick={() => deleteHighlight(h.id)}
                      className="rounded p-1 text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white transition flex-shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spacer for floating bar */}
          {selectedMsgIds.size > 0 && <div className="h-20" />}
        </div>

        {/* Codebook sidebar */}
        {!readOnly && codebookOpen && (
          <aside className="w-72 border-l-4 border-[var(--card-shell)] bg-[var(--card-fill)] flex-shrink-0 overflow-hidden flex flex-col">
            {token && (
              <CodebookPanel
                listId={listId}
                codes={codes}
                codeGroups={codeGroups}
                token={token}
                onCodesChange={setCodes}
              />
            )}
          </aside>
        )}
      </div>

      {/* Floating action bar when messages are selected */}
      {!readOnly && selectedMsgIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-3 shadow-[6px_6px_0_var(--shadow-deep)]">
          <span className="text-white text-sm font-semibold">
            {selectedMsgIds.size} message{selectedMsgIds.size !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={() => setShowCodeTooltip(true)}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-full border-2 border-white/30 bg-white text-[var(--ink-dark)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--card-fill)] transition disabled:opacity-50"
          >
            <Tag className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Assign code"}
          </button>
          <button
            onClick={() => setSelectedMsgIds(new Set())}
            className="rounded-full border-2 border-white/30 p-1.5 text-white hover:bg-white/20 transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Code picker tooltip */}
      {showCodeTooltip && (
        <CodeTooltip
          codes={codes}
          onCodeSelect={handleCodeSelect}
          onCodeCreate={handleCodeCreate}
          onDismiss={() => setShowCodeTooltip(false)}
        />
      )}
    </AnalysisShell>
  );
}
