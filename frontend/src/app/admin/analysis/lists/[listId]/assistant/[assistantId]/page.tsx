"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FlaskConical,
  MessageSquare,
  Tag,
  Clock,
  Monitor,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { analysisApi, type ThreadSummary } from "@/lib/backendApi";

const TOKEN_KEY = "pr-auth-token";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AssistantThreadsPage() {
  const router = useRouter();
  const params = useParams();
  const listId = params.listId as string;
  const assistantId = params.assistantId as string;

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [assistantName, setAssistantName] = useState<string>("");
  const [showOnlyCoded, setShowOnlyCoded] = useState(false);

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
      const [threadsData, items] = await Promise.all([
        analysisApi.getThreads(listId, assistantId, tok),
        analysisApi.getListItems(listId, tok),
      ]);
      setThreads(threadsData);
      const found = items.find((i) => i.assistant_id === assistantId);
      if (found) setAssistantName(found.assistant_name);
    } catch {
      router.push(`/admin/analysis/lists/${listId}`);
    }
  }, [listId, assistantId, router]);

  useEffect(() => {
    if (ready && token) fetchData(token);
  }, [ready, token, fetchData]);

  const visible = showOnlyCoded ? threads.filter((t) => t.has_codes) : threads;

  if (!ready) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--card-fill)] text-lg font-semibold animate-pulse">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b-4 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-5 shadow-[0_6px_0_var(--card-shell)]">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)] mb-3">
            <Link href="/admin/analysis" className="hover:text-[var(--ink-dark)] transition">Analysis</Link>
            <span>/</span>
            <Link href={`/admin/analysis/lists/${listId}`} className="hover:text-[var(--ink-dark)] transition">List</Link>
            <span>/</span>
            <span className="text-[var(--ink-dark)] font-semibold truncate max-w-[200px]">{assistantName || "LLM Thing"}</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-[var(--ink-dark)] uppercase tracking-[0.06em]">{assistantName || "Threads"}</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--ink-muted)]">{threads.length} session{threads.length !== 1 ? "s" : ""}</span>
              {/* Coded filter toggle */}
              <button
                onClick={() => setShowOnlyCoded((v) => !v)}
                className={`flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] px-3 py-1.5 text-xs font-semibold transition ${
                  showOnlyCoded
                    ? "bg-[var(--ink-dark)] text-white shadow-[3px_3px_0_var(--shadow-deep)]"
                    : "bg-white text-[var(--foreground)] hover:bg-[var(--card-fill)]"
                }`}
              >
                <Tag className="h-3.5 w-3.5" />
                {showOnlyCoded ? "Showing coded only" : "Show coded only"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {visible.length === 0 ? (
          <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-12 text-center">
            <MessageSquare className="h-10 w-10 text-[var(--ink-muted)] mx-auto mb-3" />
            <p className="text-[var(--ink-muted)]">
              {showOnlyCoded ? "No coded sessions yet." : "No sessions found."}
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
                    <div className="flex flex-wrap gap-3 text-xs text-[var(--ink-muted)]">
                      {t.device_id && (
                        <span className="flex items-center gap-1">
                          <Monitor className="h-3 w-3" />
                          {t.device_id.slice(0, 12)}…
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {t.message_count} msg{t.message_count !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(t.first_message_at)} → {formatDate(t.last_message_at)}
                      </span>
                    </div>
                  </div>
                  <div className="text-[var(--ink-muted)] group-hover:translate-x-0.5 transition flex-shrink-0">›</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
