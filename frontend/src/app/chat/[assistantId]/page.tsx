"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Mic, Send, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  sessionService,
  messageService,
  type ChatMessage as DbChatMessage,
} from "@/lib/supabaseClient";
import { backendApi } from "@/lib/backendApi";

const TOKEN_STORAGE_KEY = "pr-auth-token";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: string;
  mqttFailed?: boolean; // Flag to indicate MQTT publish failure
};

export default function AssistantChatPage() {
  const router = useRouter();
  const params = useParams<{ assistantId?: string }>();
  const assistantId = params?.assistantId ?? "assistant";
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get("session");
  // Session ID is actually a UUID string, not a number
  const sessionId = sessionIdParam || null;
  const shareToken = searchParams.get("share");
  const assistantName = searchParams.get("name");

  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);

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

  // Load messages only once when component mounts or sessionId changes
  useEffect(() => {
    if ((!token && !shareToken) || !sessionId) return;
    
    let isMounted = true;
    
    const load = async () => {
      setLoading(true);
      try {
        // Check session status
        const session = await sessionService.get(sessionId);
        if (isMounted) {
          setSessionActive(session.active);
        }
        
        // Load ALL messages for this session, regardless of thread_id
        const records = await messageService.listBySession(sessionId);
        if (isMounted) {
          const mappedMessages = records.flatMap((record) => mapMessageRecord(record));
          setMessages(mappedMessages);
        }
      } catch (err) {
        if (isMounted) {
          setError("Unable to load chat history.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    load();
    
    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const title = useMemo(() => {
    if (assistantName) return assistantName;
    return assistantId
      .split("-")
      .map((tokenPart) => tokenPart.charAt(0).toUpperCase() + tokenPart.slice(1))
      .join(" ");
  }, [assistantName, assistantId]);

  const handleBackToDashboard = () => {
    router.push("/");
  };

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("🚀 [Frontend] handleSend triggered");
    
    if (!sessionId || (!token && !shareToken)) {
      console.log("❌ [Frontend] Missing sessionId or token");
      return;
    }
    
    const trimmed = input.trim();
    if (!trimmed) {
      console.log("❌ [Frontend] Empty message");
      return;
    }
    
    console.log("📝 [Frontend] User message:", trimmed);
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
      // Get session info
      console.log("🔍 [Frontend] Fetching session info for:", sessionId);
      const session = await sessionService.get(sessionId);
      console.log("✅ [Frontend] Session retrieved:", { active: session.active, thread_id: session.current_thread_id });
      
      // Check if session is active
      if (!session.active) {
        throw new Error("Session is not running");
      }
      
      // Get assistant info to make AI call
      const { data: { user } } = await supabase.auth.getUser();
      if (!user && !shareToken) {
        throw new Error("Not authorized");
      }
      
      // Get assistant config from database
      console.log("🔍 [Frontend] Fetching assistant configuration...");
      const { data: assistantData, error: assistantError } = await supabase
        .from("assistants")
        .select("*")
        .eq("id", assistantId)
        .single();
      
      if (assistantError || !assistantData) {
        throw new Error("Failed to fetch assistant configuration");
      }
      
      // Get API key from localStorage
      const API_KEY_STORAGE_PREFIX = "pr-openai-api-key-";
      const storedApiKey = window.localStorage.getItem(`${API_KEY_STORAGE_PREFIX}${assistantId}`);
      
      if (!storedApiKey) {
        throw new Error("API key not found. Please configure the assistant first.");
      }
      
      console.log("🤖 [Frontend] Calling backend AI API...");
      const aiResponse = await backendApi.chat(
        {
          previous_response_id: null, // TODO: Track conversation history
          user_message: trimmed,
          assistant_config: {
            prompt_instruction: assistantData.prompt_instruction || "You are a helpful assistant.",
            json_schema: assistantData.json_schema || null,
            api_key: storedApiKey,
          },
        },
        token ?? ""
      );
      console.log("✅ [Frontend] Backend response received:", aiResponse);
      
      // Publish to MQTT if we have a payload
      let mqttPublishSuccess = false;
      let mqttPublishAttempted = false;
      
      if (aiResponse.payload && assistantData.mqtt_host && assistantData.mqtt_topic) {
        console.log("📡 [Frontend] Publishing to MQTT...");
        const MQTT_PASS_STORAGE_PREFIX = "pr-mqtt-pass-";
        const storedMqttPass = window.localStorage.getItem(`${MQTT_PASS_STORAGE_PREFIX}${assistantId}`);
        
        mqttPublishAttempted = true;
        
        try {
          const mqttResult = await backendApi.publishMqtt(
            {
              host: assistantData.mqtt_host,
              port: assistantData.mqtt_port || 1883,
              topic: assistantData.mqtt_topic,
              payload: aiResponse.payload,
              username: assistantData.mqtt_user || null,
              password: storedMqttPass || null,
            },
            token ?? undefined
          );
          
          if (mqttResult.success) {
            console.log("✅ [Frontend] MQTT publish successful");
            mqttPublishSuccess = true;
          } else {
            console.warn("⚠️ [Frontend] MQTT publish failed:", mqttResult.message);
            mqttPublishSuccess = false;
          }
        } catch (mqttError) {
          console.error("❌ [Frontend] MQTT publish error:", mqttError);
          mqttPublishSuccess = false;
        }
      } else {
        console.log("⏭️ [Frontend] Skipping MQTT publish - missing payload or MQTT config");
      }
      
      // Save complete conversation turn (user + assistant) in a single entry
      console.log("� [Frontend] Saving conversation turn to database...");
      
      // Extract the text response from the payload
      let responseText = null;
      if (aiResponse.payload) {
        // Try to extract text from common fields
        const possibleFields = ["answer", "response", "text", "content", "message"];
        for (const field of possibleFields) {
          if (typeof aiResponse.payload[field] === "string") {
            responseText = aiResponse.payload[field];
            break;
          }
        }
        // If no common field found, stringify the whole payload
        if (!responseText) {
          responseText = JSON.stringify(aiResponse.payload);
        }
      }

      // Only save mqtt_payload if MQTT publish was successful
      const conversationMessage = await messageService.create({
        session_id: sessionId,
        assistant_id: assistantId,
        user_text: trimmed, // Store user's message
        assistant_payload: aiResponse.payload, // Store as actual JSON object
        response_text: responseText, // Store just the text response
        mqtt_payload: (mqttPublishAttempted && mqttPublishSuccess) ? aiResponse.payload : null, // Only store if MQTT publish succeeded
      });
      console.log("✅ [Frontend] Conversation turn saved:", conversationMessage.id);
      
      // Reload all messages for this session (all threads)
      console.log("🔄 [Frontend] Reloading messages from database...");
      const records = await messageService.listBySession(sessionId);
      const mappedMessages = records.flatMap((record) => mapMessageRecord(record));
      
      setMessages(mappedMessages);
      console.log("✅ [Frontend] Messages reloaded, count:", records.length);
      setError(null);
    } catch (err) {
      console.error("❌ [Frontend] Error in handleSend:", err);
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      const errorMessage = err instanceof Error ? err.message : "Unable to send message.";
      if (errorMessage.includes("Session is not running") || errorMessage.includes("not running") || errorMessage.includes("not active")) {
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
          const result = await backendApi.transcribe(file, token ?? undefined);
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
            onClick={handleBackToDashboard}
            className="flex items-center gap-2 rounded-full border-2 border-[var(--card-shell)] bg-transparent px-3 py-2 text-xs text-[var(--ink-dark)] transition-all hover:bg-[var(--card-shell)]/20 sm:px-4 sm:py-2 sm:text-sm"
            title="Return to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
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
                <div className="flex flex-col gap-1 max-w-[85%] sm:max-w-[75%]">
                  <div
                    className={`rounded-2xl px-3 py-2 sm:px-4 sm:py-3 ${
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
                  {message.mqttFailed && (
                    <div className="flex items-center gap-1 px-2 py-1 text-xs text-[#8b3b00] bg-[#fff0dc] rounded-lg border border-[#ffb347]">
                      <span className="text-[10px]">⚠️</span>
                      <span>MQTT publish failed</span>
                    </div>
                  )}
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
          {sessionActive === false ? (
            <div className="mx-auto max-w-3xl">
              <div className="rounded-2xl border-2 border-[var(--card-shell)] bg-[#fff0dc] px-4 py-3 text-center">
                <p className="text-sm font-medium text-[#4a2100]">
                  Session stopped. Restart the session to send messages.
                </p>
              </div>
            </div>
          ) : (
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
          )}
        </div>
      </main>
    </div>
  );
}

function normalizeAssistantText(text?: string | null): string {
  if (!text) return "";
  const trimmed = text.trim();
  
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(trimmed);
    
    // If it's an object, extract text from common fields
    if (typeof parsed === "object" && parsed !== null) {
      // Try common field names for the actual response text
      const possibleFields = ["answer", "response", "text", "content", "message"];
      
      for (const field of possibleFields) {
        if (typeof parsed[field] === "string") {
          return parsed[field];
        }
      }
      
      // If no common field found, return the whole JSON as formatted string
      return JSON.stringify(parsed, null, 2);
    }
    
    // If it's a string, return it
    if (typeof parsed === "string") {
      return parsed;
    }
  } catch {
    // Not valid JSON, continue with original logic
  }
  
  // Fallback to original fragment-based parsing
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

function mapMessageRecord(message: DbChatMessage): ChatMessage[] {
  const messages: ChatMessage[] = [];
  
  // If there's a user message, add it first
  if (message.user_text) {
    messages.push({
      id: `${message.id}-user`,
      role: "user",
      content: message.user_text,
      timestamp: message.created_at,
    });
  }
  
  // If there's an assistant response, add it
  if (message.response_text || message.assistant_payload) {
    // Check if MQTT publish failed: assistant_payload exists but mqtt_payload is null
    const mqttFailed = message.assistant_payload !== null && message.mqtt_payload === null;
    
    messages.push({
      id: `${message.id}-assistant`,
      role: "assistant",
      content: normalizeAssistantText(message.response_text),
      timestamp: message.created_at,
      mqttFailed: mqttFailed,
    });
  }
  
  return messages;
}
