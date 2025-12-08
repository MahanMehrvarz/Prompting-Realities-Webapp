"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Mic, Send } from "lucide-react";
import { TOKEN_STORAGE_KEY, sessionApi, MessageRecord } from "@/lib/api";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: string;
};

export default function AssistantChatPage() {
  const params = useParams<{ assistantId?: string }>();
  const assistantId = params?.assistantId ?? "assistant";
  const searchParams = useSearchParams();
  const sessionId = Number(searchParams.get("session") ?? "");
  const shareToken = searchParams.get("share");
  const assistantName = searchParams.get("name");

  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      setToken(stored);
    }
  }, []);

  useEffect(() => {
    if ((!token && !shareToken) || !sessionId) return;
    const load = async () => {
      setLoading(true);
      try {
        const records = await sessionApi.messages(sessionId, token ?? undefined, shareToken ?? undefined);
        setMessages(records.map(mapMessageRecord));
      } catch (err) {
        setError("Unable to load chat history.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, shareToken, sessionId]);

  const title = useMemo(() => {
    if (assistantName) return assistantName;
    return assistantId
      .split("-")
      .map((tokenPart) => tokenPart.charAt(0).toUpperCase() + tokenPart.slice(1))
      .join(" ");
  }, [assistantName, assistantId]);

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId || (!token && !shareToken)) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    try {
      await sessionApi.sendMessage(sessionId, trimmed, token ?? undefined, shareToken ?? undefined);
      const records = await sessionApi.messages(sessionId, token ?? undefined, shareToken ?? undefined);
      setMessages(records.map(mapMessageRecord));
    } catch (err) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      setError("Unable to send message.");
    }
  };

  const beginRecording = async () => {
    if (!sessionId || (!token && !shareToken) || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordedChunks.current, { type: recorder.mimeType });
        if (blob.size === 0) {
          setIsRecording(false);
          return;
        }
        const file = new File([blob], "voice-input.webm", { type: blob.type });
        try {
          const result = await sessionApi.transcribe(sessionId, file, token ?? undefined, shareToken ?? undefined);
          setInput((prev) => (prev ? `${prev} ${result.text}` : result.text));
        } catch (err) {
          setError("Unable to transcribe audio.");
        } finally {
          setIsRecording(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const recordingEvents = {
    onMouseDown: beginRecording,
    onMouseUp: stopRecording,
    onMouseLeave: () => isRecording && stopRecording(),
    onTouchStart: (event: React.TouchEvent) => {
      event.preventDefault();
      beginRecording();
    },
    onTouchEnd: (event: React.TouchEvent) => {
      event.preventDefault();
      stopRecording();
    },
  };

  if (!hydrated) {
    return null;
  }

  if (!token && !shareToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent px-4 py-6 text-[var(--foreground)]">
        <p className="card-panel px-5 py-4 text-center">
          This session link is invalid or expired. Ask the host to start a new run.
        </p>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent px-4 py-6 text-[var(--foreground)]">
        <p className="card-panel px-5 py-4 text-center">
          Session ID missing. Launch a session from the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-transparent px-4 py-6 text-[var(--foreground)] sm:px-8 max-w-3xl mx-auto w-full">
      <header className="card-panel flex flex-col gap-3 px-5 py-4">
        <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em] text-[var(--card-fill)]">
          Prompting Realities Chat
        </p>
        <h1 className="text-2xl font-semibold text-[var(--ink-dark)]">{title}</h1>
        <p className="text-xs text-[var(--ink-muted)]">Session: {sessionId}</p>
      </header>

      <main className="mt-6 flex flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-2 sm:px-4">
          {loading && <p className="text-sm text-[var(--ink-muted)]">Loading messages…</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-full sm:max-w-[80%] rounded-[20px] px-4 py-3 text-base font-semibold leading-relaxed ${
                  message.role === "user"
                    ? "bg-[var(--ink-dark)] text-[var(--card-fill)]"
                    : "bg-[var(--ink-muted)] text-[var(--card-fill)]"
                }`}
              >
                <p>{message.content}</p>
                <p className="mt-2 text-right text-[10px] font-semibold uppercase tracking-[0.3em] text-[#defbe6]">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
          {messages.length === 0 && !loading && (
            <p className="text-center text-sm text-[var(--ink-muted)]">
              This session is live locally. Messages will appear here as soon as you or your LLM thing send them.
            </p>
          )}
        </div>

        <form onSubmit={handleSend} className="mt-4">
          <div className="card-panel flex flex-col gap-3 px-5 py-4">
            <div className="flex items-center gap-3 rounded-[20px] bg-[var(--card-fill)] px-4 py-2 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                title={isRecording ? "Recording…" : "Hold to talk"}
                className={`rounded-full border-[3px] border-[var(--card-shell)] px-4 py-2 text-[var(--ink-muted)] ${
                  isRecording ? "bg-[var(--ink-muted)] text-[var(--card-fill)]" : "bg-transparent"
                }`}
                {...recordingEvents}
              >
                <Mic className="h-4 w-4" />
              </button>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type a message"
                className="min-w-0 flex-1 bg-transparent text-base text-[var(--foreground)] outline-none placeholder:text-[#7aa88d]"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--ink-dark)] px-4 py-2 text-base font-semibold text-[var(--card-fill)] transition hover:-translate-y-0.5"
              >
                Send
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--ink-muted)]">
              Hold the mic button to record a quick voice note or type to send instantly.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}

function normalizeAssistantText(text?: string | null): string {
  if (!text) return "";
  const trimmed = text.trim();
  const fragments: string[] = [];
  let depth = 0;
  let buffer = "";
  for (const char of trimmed) {
    if (char === "{") depth++;
    if (depth > 0) buffer += char;
    if (char === "}") {
      depth--;
      if (depth === 0 && buffer) {
        fragments.push(buffer);
        buffer = "";
      }
    }
  }
  if (fragments.length === 0) return trimmed;
  const responses: string[] = [];
  for (const fragment of fragments) {
    try {
      const parsed = JSON.parse(fragment);
      if (typeof parsed?.response === "string") {
        responses.push(parsed.response);
      }
    } catch {
      responses.push(fragment);
    }
  }
  return responses.join("\n\n");
}

function mapMessageRecord(message: MessageRecord): ChatMessage {
  const content =
    message.role === "assistant"
      ? normalizeAssistantText(message.response_text)
      : message.user_text ?? "";

  return {
    id: `${message.id}`,
    role: message.role,
    content,
    timestamp: message.created_at,
  };
}
