"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Mic, Send, RotateCcw } from "lucide-react";
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
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const handleResetConversation = async () => {
    if (!sessionId || (!token && !shareToken) || isResetting) return;
    setIsResetting(true);
    try {
      await sessionApi.reset(sessionId, token ?? undefined, shareToken ?? undefined);
      // Reload messages after reset - should show empty conversation
      const records = await sessionApi.messages(sessionId, token ?? undefined, shareToken ?? undefined);
      setMessages(records.map(mapMessageRecord));
      setShowResetModal(false);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unable to reset conversation.";
      setError(errorMessage);
    } finally {
      setIsResetting(false);
    }
  };

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
      setError(null); // Clear any previous errors on success
    } catch (err) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      const errorMessage = err instanceof Error ? err.message : "Unable to send message.";
      if (errorMessage.includes("Session is not running") || errorMessage.includes("not running")) {
        setError("This session has stopped. The host needs to start a new run.");
      } else if (errorMessage.includes("Not authorized")) {
        setError("Session link is invalid or expired. Ask the host for a new link.");
      } else {
        setError(errorMessage);
      }
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
    <div className="flex h-screen flex-col bg-transparent text-[var(--foreground)]">
      {/* Fixed Header - Compact on mobile */}
      <header className="flex-shrink-0 border-b-2 border-[var(--card-shell)] bg-[var(--card-fill)] px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[var(--ink-dark)] sm:text-xl">{title}</h1>
            <p className="text-xs text-[var(--ink-muted)] sm:text-sm">Session {sessionId}</p>
          </div>
          <button
            onClick={() => setShowResetModal(true)}
            className="flex items-center gap-2 rounded-full border-2 border-[var(--card-shell)] bg-transparent px-3 py-2 text-xs text-[var(--ink-dark)] transition-all hover:bg-[var(--card-shell)]/20 sm:px-4 sm:py-2 sm:text-sm"
            title="Reset conversation"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </header>

      {/* Scrollable Messages Area */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-3 sm:space-y-4">
            {loading && (
              <div className="text-center">
                <p className="text-sm text-[var(--ink-muted)]">Loading messages…</p>
              </div>
            )}

            {error && (
              <div className="mx-auto max-w-md rounded-2xl bg-red-100 px-4 py-3 text-center">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 sm:max-w-[75%] sm:px-4 sm:py-3 ${
                    message.role === "user"
                      ? "bg-[var(--ink-dark)] text-[var(--card-fill)]"
                      : "bg-[var(--ink-muted)] text-[var(--card-fill)]"
                  }`}
                >
                  <p className="text-sm leading-relaxed sm:text-base">{message.content}</p>
                  <p className="mt-1 text-right text-[9px] opacity-70 sm:text-[10px]">
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                </div>
              </div>
            ))}

            {messages.length === 0 && !loading && !error && (
              <div className="flex h-full items-center justify-center">
                <p className="text-center text-sm text-[var(--ink-muted)] sm:text-base">
                  No messages yet. Start the conversation!
                </p>
              </div>
            )}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Fixed Input Bar - Sticky to bottom */}
        <div className="flex-shrink-0 border-t-2 border-[var(--card-shell)] bg-[var(--card-fill)] px-4 py-3 sm:px-6 sm:py-4">
          <form onSubmit={handleSend} className="mx-auto max-w-3xl">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Mic button */}
              <button
                type="button"
                title={isRecording ? "Recording…" : "Hold to talk"}
                className={`flex-shrink-0 rounded-full p-2 sm:p-2.5 transition-all ${
                  isRecording
                    ? "bg-red-500 text-white scale-110"
                    : "bg-transparent border-2 border-[var(--card-shell)] text-[var(--ink-muted)] hover:bg-[var(--card-shell)]/20"
                }`}
                {...recordingEvents}
              >
                <Mic className="h-5 w-5 sm:h-5 sm:w-5" />
              </button>

              {/* Input field */}
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Message..."
                className="min-w-0 flex-1 rounded-full border-2 border-[var(--card-shell)] bg-white px-4 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--ink-dark)] sm:px-5 sm:py-3 sm:text-base"
                autoComplete="off"
              />

              {/* Send button - Icon only on mobile, with text on desktop */}
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex-shrink-0 rounded-full bg-[var(--ink-dark)] p-2.5 text-[var(--card-fill)] transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 sm:px-4 sm:py-3"
                aria-label="Send message"
              >
                <Send className="h-5 w-5 sm:h-5 sm:w-5" />
              </button>
            </div>

            {/* Helper text - hidden on mobile, visible on desktop */}
            {isRecording && (
              <p className="mt-2 text-center text-xs text-red-600 sm:text-sm">
                Recording... Release to send
              </p>
            )}
          </form>
        </div>
      </main>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-[var(--card-fill)] p-6 shadow-xl">
            <h2 className="mb-3 text-xl font-bold text-[var(--ink-dark)]">Reset Conversation?</h2>
            <p className="mb-6 text-sm text-[var(--ink-muted)]">
              This will start a fresh conversation thread. Your chat history will be preserved in the database but won't be visible in this session.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="flex-1 rounded-full border-2 border-[var(--card-shell)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--ink-dark)] transition-all hover:bg-[var(--card-shell)]/20 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResetConversation}
                disabled={isResetting}
                className="flex-1 rounded-full bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50"
              >
                {isResetting ? "Resetting..." : "Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
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
