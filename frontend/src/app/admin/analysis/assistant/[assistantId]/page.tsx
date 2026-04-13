"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Clock, MessageSquare, Tag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { analysisApi, type ThreadSummary } from "@/lib/backendApi";
import AnalysisShell from "../../AnalysisShell";
import { useAnalysisBreadcrumb } from "../../AnalysisBreadcrumbContext";

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
      const [threadsData, { data: aData }] = await Promise.all([
        analysisApi.getThreadsStandalone(assistantId, tok),
        supabase.from("assistants").select("name").eq("id", assistantId).maybeSingle(),
      ]);
      setThreads(threadsData);
      const name = aData?.name || "LLM Thing";
      setAssistantName(name);
      setCrumbs([{ label: name }]);
    } catch {
      router.push("/admin/analysis");
    }
  }, [assistantId, router, setCrumbs]);

  useEffect(() => {
    if (ready && token) fetchData(token);
  }, [ready, token, fetchData]);

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
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-[var(--card-fill)] uppercase tracking-[0.06em]">{assistantName}</h1>
          <p className="text-sm text-[var(--card-fill)]/60 mt-1">{threads.length} session{threads.length !== 1 ? "s" : ""}</p>
          <p className="text-xs text-[var(--card-fill)]/40 mt-0.5">Not in any list — threads are read-only (add to a list to start coding)</p>
        </div>
      </div>

      {threads.length === 0 ? (
        <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-12 text-center">
          <MessageSquare className="h-10 w-10 text-[var(--ink-muted)] mx-auto mb-3" />
          <p className="text-[var(--ink-muted)]">No sessions found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map((t) => (
            <div
              key={t.thread_id}
              className="block rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] p-4 shadow-[5px_5px_0_var(--card-shell)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <code className="text-xs font-mono bg-[var(--ink-dark)] text-[var(--card-fill)] px-2 py-0.5 rounded-md">
                      …{t.thread_id.slice(-8)}
                    </code>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </AnalysisShell>
  );
}
