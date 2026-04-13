"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Plus,
  Tag,
  Trash2,
  X,
  Search,
  Check,
  PanelRight,
  User,
  Bot,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  analysisApi,
  type AnalysisCode,
  type AnalysisCodeGroup,
  type AnalysisHighlight,
  type ThreadConversation,
} from "@/lib/backendApi";

const TOKEN_KEY = "pr-auth-token";

// Preset colors for new codes
const PRESET_COLORS = [
  "#fde68a", "#a7f3d0", "#bfdbfe", "#fecaca",
  "#ddd6fe", "#fed7aa", "#e9d5ff", "#99f6e4",
];
let colorIdx = 0;
function nextColor() { const c = PRESET_COLORS[colorIdx % PRESET_COLORS.length]; colorIdx++; return c; }

// ---------------------------------------------------------------------------
// Hex to rgba helper
// ---------------------------------------------------------------------------
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Selection state
// ---------------------------------------------------------------------------
type SelectionState = {
  selectedText: string;
  messageIds: string[];
  charStart: number;
  charEnd: number;
  sourceField: "user_text" | "response_text" | "both";
  anchorX: number;
  anchorY: number;
};

// ---------------------------------------------------------------------------
// Code tooltip
// ---------------------------------------------------------------------------
function CodeTooltip({
  x,
  y,
  codes,
  listId,
  token,
  onCodeSelect,
  onCodeCreate,
  onDismiss,
}: {
  x: number;
  y: number;
  codes: AnalysisCode[];
  listId: string;
  token: string;
  onCodeSelect: (codeId: string) => void;
  onCodeCreate: (name: string, color: string) => Promise<string>;
  onDismiss: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = codes.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );
  const exactMatch = codes.some((c) => c.name.toLowerCase() === query.toLowerCase());

  const handleCreate = async () => {
    if (!query.trim()) return;
    const color = nextColor();
    const id = await onCodeCreate(query.trim(), color);
    onCodeSelect(id);
  };

  // Position: above click point if enough room, else below
  const TOP_OFFSET = 8;
  const TOOLTIP_H = 300;
  const top = y - TOOLTIP_H - TOP_OFFSET < 60
    ? y + TOP_OFFSET
    : y - TOOLTIP_H - TOP_OFFSET;

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onDismiss} />
      <div
        className="fixed z-50 rounded-[16px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] shadow-[8px_8px_0_var(--shadow-deep)] overflow-hidden"
        style={{ left: Math.min(x - 120, window.innerWidth - 320), top, width: 280, maxHeight: 320 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
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

        {/* Code list */}
        <div className="max-h-52 overflow-y-auto">
          {filtered.map((code) => (
            <button
              key={code.id}
              onClick={() => onCodeSelect(code.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-white transition group"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                style={{ backgroundColor: code.color }}
              />
              <span className="flex-1 text-[var(--ink-dark)] font-medium truncate">{code.name}</span>
              {code.usage_count !== undefined && (
                <span className="text-xs text-[var(--ink-muted)] group-hover:text-[var(--ink-dark)]">×{code.usage_count}</span>
              )}
            </button>
          ))}

          {!exactMatch && query.trim() && (
            <>
              {filtered.length > 0 && <div className="border-t border-[var(--card-shell)]/50" />}
              <button
                onClick={handleCreate}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-[#2563eb] hover:bg-[#e5f5ff] transition"
              >
                <span className="w-3 h-3 rounded-full border-2 border-dashed border-[#2563eb] flex-shrink-0 flex items-center justify-center">
                  <Plus className="h-2 w-2" />
                </span>
                <span>Create &ldquo;{query.trim()}&rdquo;</span>
              </button>
            </>
          )}

          {filtered.length === 0 && !query.trim() && (
            <div className="px-3 py-4 text-sm text-[var(--ink-muted)] text-center">
              No codes yet. Type to create one.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Codebook panel
// ---------------------------------------------------------------------------
function CodebookPanel({
  listId,
  codes,
  codeGroups,
  token,
  onCodesChange,
}: {
  listId: string;
  codes: AnalysisCode[];
  codeGroups: AnalysisCodeGroup[];
  token: string;
  onCodesChange: (codes: AnalysisCode[]) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (code: AnalysisCode) => {
    setEditingId(code.id);
    setEditName(code.name);
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

  const grouped = codeGroups.map((g) => ({
    group: g,
    codes: codes.filter((c) => c.group_id === g.id),
  }));
  const ungrouped = codes.filter((c) => !c.group_id);

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
        {/* Grouped codes */}
        {grouped.map(({ group, codes: gc }) => (
          <div key={group.id}>
            <button
              onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center gap-2 px-4 py-2 bg-white/60 border-b border-[var(--card-shell)]/30 hover:bg-white transition"
            >
              {collapsed.has(group.id) ? <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-muted)]" /> : <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-muted)]" />}
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: group.color }}
              />
              <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider flex-1 text-left">{group.name}</span>
              <span className="text-xs text-[var(--ink-muted)]">{gc.length}</span>
            </button>
            {!collapsed.has(group.id) && gc.map((code) => (
              <CodeRow key={code.id} code={code} editingId={editingId} editName={editName} setEditName={setEditName} onStartEdit={startEdit} onSaveEdit={saveEdit} onDelete={deleteCode} />
            ))}
          </div>
        ))}

        {/* Ungrouped */}
        {ungrouped.length > 0 && (
          <div>
            {(codeGroups.length > 0) && (
              <div className="px-4 py-1.5 bg-white/60 border-b border-[var(--card-shell)]/30">
                <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider">Ungrouped</span>
              </div>
            )}
            {ungrouped.map((code) => (
              <CodeRow key={code.id} code={code} editingId={editingId} editName={editName} setEditName={setEditName} onStartEdit={startEdit} onSaveEdit={saveEdit} onDelete={deleteCode} />
            ))}
          </div>
        )}

        {codes.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
            No codes yet.<br />Select text to create one.
          </div>
        )}
      </div>
    </div>
  );
}

function CodeRow({ code, editingId, editName, setEditName, onStartEdit, onSaveEdit, onDelete }: {
  code: AnalysisCode;
  editingId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  onStartEdit: (c: AnalysisCode) => void;
  onSaveEdit: (c: AnalysisCode) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--card-shell)]/20 hover:bg-white/60 transition group">
      <span
        className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
        style={{ backgroundColor: code.color }}
      />
      {editingId === code.id ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={() => onSaveEdit(code)}
          onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(code); if (e.key === "Escape") onSaveEdit({ ...code, name: code.name }); }}
          className="flex-1 text-sm bg-white rounded px-1 py-0.5 border border-[var(--card-shell)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-dark)]"
          autoFocus
        />
      ) : (
        <button
          onClick={() => onStartEdit(code)}
          className="flex-1 text-sm text-[var(--ink-dark)] text-left truncate hover:underline"
        >
          {code.name}
        </button>
      )}
      <span className="text-xs text-[var(--ink-muted)] flex-shrink-0">×{code.usage_count ?? 0}</span>
      <button
        onClick={() => onDelete(code.id)}
        className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white transition"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message with inline highlights
// ---------------------------------------------------------------------------
function HighlightedText({
  text,
  messageId,
  field,
  highlights,
  onSelect,
}: {
  text: string;
  messageId: string;
  field: "user_text" | "response_text";
  highlights: AnalysisHighlight[];
  onSelect: (e: MouseEvent, messageId: string, field: "user_text" | "response_text") => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: MouseEvent) => onSelect(e, messageId, field);
    el.addEventListener("mouseup", handler);
    return () => el.removeEventListener("mouseup", handler);
  }, [messageId, field, onSelect]);

  // Compute spans: split text into highlighted and non-highlighted segments
  const relevantHighlights = highlights.filter(
    (h) => h.message_ids.includes(messageId) &&
      (h.source_field === field || h.source_field === "both")
  );

  if (relevantHighlights.length === 0) {
    return (
      <div ref={ref} className="select-text cursor-text">
        {text}
      </div>
    );
  }

  // Build segments
  type Span = { start: number; end: number; highlight?: AnalysisHighlight };
  const spans: Span[] = [];
  const sorted = [...relevantHighlights].sort((a, b) => a.char_start - b.char_start);

  let cursor = 0;
  for (const h of sorted) {
    const s = Math.max(0, h.char_start);
    const e = Math.min(text.length, h.char_end);
    if (s > cursor) spans.push({ start: cursor, end: s });
    if (s < e) spans.push({ start: s, end: e, highlight: h });
    cursor = Math.max(cursor, e);
  }
  if (cursor < text.length) spans.push({ start: cursor, end: text.length });

  return (
    <div ref={ref} className="select-text cursor-text">
      {spans.map((span, i) => {
        if (!span.highlight) {
          return <span key={i}>{text.slice(span.start, span.end)}</span>;
        }
        const firstCode = span.highlight.codes[0];
        const bg = firstCode ? hexToRgba(firstCode.color, 0.45) : "rgba(251,191,36,0.4)";
        return (
          <mark
            key={i}
            style={{ backgroundColor: bg, borderRadius: 3, padding: "1px 0" }}
            title={span.highlight.codes.map((c) => c.name).join(", ") + ` — ${span.highlight.created_by}`}
          >
            {text.slice(span.start, span.end)}
            {span.highlight.codes.length > 0 && (
              <span className="inline-flex gap-0.5 ml-0.5 align-middle">
                {span.highlight.codes.slice(0, 3).map((c) => (
                  <span
                    key={c.id}
                    className="inline-block w-2 h-2 rounded-full border border-black/10"
                    style={{ backgroundColor: c.color }}
                  />
                ))}
                {span.highlight.codes.length > 3 && (
                  <span className="text-[9px] text-[var(--ink-muted)]">+{span.highlight.codes.length - 3}</span>
                )}
              </span>
            )}
          </mark>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main thread view page
// ---------------------------------------------------------------------------
export default function ThreadPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const listId = params.listId as string;
  const threadId = params.threadId as string;
  const sessionId = searchParams.get("session") || "";
  const assistantId = searchParams.get("assistant") || "";

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ThreadConversation | null>(null);
  const [codes, setCodes] = useState<AnalysisCode[]>([]);
  const [codeGroups, setCodeGroups] = useState<AnalysisCodeGroup[]>([]);
  const [codebookOpen, setCodebookOpen] = useState(true);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [adminEmail, setAdminEmail] = useState("");

  // Auth gate
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/hidden-login"); return; }
      const tok = session.access_token;
      window.localStorage.setItem(TOKEN_KEY, tok);
      setToken(tok);
      setAdminEmail(session.user.email || "");
      const { data: adminData } = await supabase.from("admin_emails").select("email").eq("email", session.user.email!).maybeSingle();
      if (!adminData) { router.push("/"); return; }
      setReady(true);
    });
  }, [router]);

  const fetchData = useCallback(async (tok: string) => {
    try {
      const [convo, codesData, groupsData] = await Promise.all([
        analysisApi.getThreadConversation(listId, threadId, tok),
        analysisApi.getCodes(listId, tok),
        analysisApi.getCodeGroups(listId, tok),
      ]);
      setConversation(convo);
      setCodes(codesData);
      setCodeGroups(groupsData);
    } catch {
      router.push(`/admin/analysis/lists/${listId}`);
    }
  }, [listId, threadId, router]);

  useEffect(() => {
    if (ready && token) fetchData(token);
  }, [ready, token, fetchData]);

  // Handle text selection
  const handleSelect = useCallback((e: MouseEvent, messageId: string, field: "user_text" | "response_text") => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setSelection(null); return; }
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) { setSelection(null); return; }

    // Get the container text to compute char offsets
    const container = (e.currentTarget as HTMLElement) || range.commonAncestorContainer.parentElement;
    const fullText = container?.textContent || "";
    // Walk to find start offset
    const preRange = document.createRange();
    preRange.setStart(range.startContainer.parentElement?.closest("[data-msg]") || document.body, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const charStart = preRange.toString().length;
    const charEnd = charStart + selectedText.length;

    const rect = range.getBoundingClientRect();
    setSelection({
      selectedText,
      messageIds: [messageId],
      charStart,
      charEnd,
      sourceField: field,
      anchorX: rect.left + rect.width / 2,
      anchorY: rect.top + window.scrollY,
    });
  }, []);

  const dismissSelection = () => setSelection(null);

  const handleCodeSelect = async (codeId: string) => {
    if (!selection || !token || !conversation) return;
    try {
      // Create highlight
      const highlight = await analysisApi.createHighlight({
        list_id: listId,
        thread_id: threadId,
        session_id: sessionId || conversation.messages[0]?.session_id || "",
        assistant_id: assistantId || conversation.assistant_id || "",
        selected_text: selection.selectedText,
        message_ids: selection.messageIds,
        char_start: selection.charStart,
        char_end: selection.charEnd,
        source_field: selection.sourceField,
      }, token);
      // Assign code
      await analysisApi.assignCode(highlight.id, codeId, token);
      // Refresh
      await fetchData(token);
    } catch (err) {
      alert("Failed to save highlight.");
    }
    setSelection(null);
    window.getSelection()?.removeAllRanges();
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
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--card-fill)] text-lg font-semibold animate-pulse">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      {/* Header */}
      <header className="border-b-4 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-4 shadow-[0_6px_0_var(--card-shell)] flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <Link href="/admin/analysis" className="hover:text-[var(--ink-dark)] transition">Analysis</Link>
            <span>/</span>
            <Link href={`/admin/analysis/lists/${listId}`} className="hover:text-[var(--ink-dark)] transition">List</Link>
            <span>/</span>
            <Link href={`/admin/analysis/lists/${listId}/assistant/${assistantId}`} className="hover:text-[var(--ink-dark)] transition">Threads</Link>
            <span>/</span>
            <code className="text-xs font-mono bg-[var(--ink-dark)] text-[var(--card-fill)] px-1.5 py-0.5 rounded">
              …{threadId.slice(-8)}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--ink-muted)]">{conversation.messages.length} messages</span>
            <button
              onClick={() => setCodebookOpen((o) => !o)}
              className={`flex items-center gap-1.5 rounded-full border-[3px] border-[var(--card-shell)] px-3 py-1.5 text-xs font-semibold transition ${
                codebookOpen
                  ? "bg-[var(--ink-dark)] text-white"
                  : "bg-white text-[var(--foreground)] hover:bg-[var(--card-fill)]"
              }`}
            >
              <PanelRight className="h-3.5 w-3.5" />
              Codebook
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {conversation.messages.length === 0 && (
            <div className="text-center text-[var(--ink-muted)] py-12">No messages in this thread.</div>
          )}

          {conversation.messages.map((msg) => (
            <div key={msg.id} className="space-y-3" data-msg={msg.id}>
              {/* User message */}
              {msg.user_text && (
                <div className="flex justify-end">
                  <div className="max-w-[70%]">
                    <div className="flex items-center gap-1.5 justify-end mb-1">
                      <span className="text-xs text-[var(--card-fill)]/70">User</span>
                      <User className="h-3.5 w-3.5 text-[var(--card-fill)]/70" />
                    </div>
                    <div className="rounded-[16px] rounded-tr-[4px] bg-[var(--ink-dark)] px-4 py-3 text-[var(--card-fill)] text-sm leading-relaxed">
                      <HighlightedText
                        text={msg.user_text}
                        messageId={msg.id}
                        field="user_text"
                        highlights={conversation.highlights}
                        onSelect={handleSelect}
                      />
                    </div>
                    <p className="text-xs text-[var(--card-fill)]/50 mt-1 text-right">
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
                      <Bot className="h-3.5 w-3.5 text-[var(--card-fill)]/70" />
                      <span className="text-xs text-[var(--card-fill)]/70">Assistant</span>
                    </div>
                    <div className="rounded-[16px] rounded-tl-[4px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] px-4 py-3 text-sm leading-relaxed text-[var(--ink-dark)]">
                      <HighlightedText
                        text={msg.response_text}
                        messageId={msg.id}
                        field="response_text"
                        highlights={conversation.highlights}
                        onSelect={handleSelect}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-[var(--card-fill)]/50">
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

          {/* Highlights summary at bottom */}
          {conversation.highlights.length > 0 && (
            <div className="border-t-2 border-[var(--card-shell)]/30 pt-6">
              <h3 className="text-xs font-semibold text-[var(--card-fill)]/70 uppercase tracking-wider mb-3">
                {conversation.highlights.length} highlight{conversation.highlights.length !== 1 ? "s" : ""} in this thread
              </h3>
              <div className="space-y-2">
                {conversation.highlights.map((h) => (
                  <div key={h.id} className="rounded-[12px] border-2 border-[var(--card-shell)] bg-[var(--card-fill)] px-3 py-2 text-sm flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {h.codes.map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border border-black/10"
                            style={{ backgroundColor: hexToRgba(c.color, 0.3) }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                            {c.name}
                          </span>
                        ))}
                        {h.codes.length === 0 && (
                          <span className="text-xs text-[var(--ink-muted)] italic">No codes</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--ink-muted)] line-clamp-1 italic">&ldquo;{h.selected_text}&rdquo;</p>
                      <p className="text-xs text-[var(--ink-muted)]/60 mt-0.5">by {h.created_by}</p>
                    </div>
                    <button
                      onClick={() => deleteHighlight(h.id)}
                      className="rounded p-1 text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:text-white transition flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Codebook sidebar */}
        {codebookOpen && (
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

      {/* Code tooltip */}
      {selection && token && (
        <CodeTooltip
          x={selection.anchorX}
          y={selection.anchorY}
          codes={codes}
          listId={listId}
          token={token}
          onCodeSelect={handleCodeSelect}
          onCodeCreate={handleCodeCreate}
          onDismiss={dismissSelection}
        />
      )}
    </div>
  );
}
