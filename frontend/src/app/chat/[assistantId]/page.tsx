"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Mic, Send, ArrowLeft, Loader2, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  sessionService,
  messageService,
  type ChatMessage as DbChatMessage,
} from "@/lib/supabaseClient";
import { backendApi } from "@/lib/backendApi";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  const [activeViewers, setActiveViewers] = useState<number>(0);
  const [viewersList, setViewersList] = useState<any[]>([]);
  const [isActiveUser, setIsActiveUser] = useState<boolean>(false);
  const [queuePosition, setQueuePosition] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const deviceIdRef = useRef<string>("");
  
  // Initialize device ID from localStorage or create new one
  useEffect(() => {
    if (hydrated) {
      const DEVICE_ID_KEY = "pr-device-id";
      let storedDeviceId = window.localStorage.getItem(DEVICE_ID_KEY);
      if (!storedDeviceId) {
        storedDeviceId = crypto.randomUUID();
        window.localStorage.setItem(DEVICE_ID_KEY, storedDeviceId);
      }
      deviceIdRef.current = storedDeviceId;
    }
  }, [hydrated]);

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

  // Presence tracking with Supabase Realtime
  useEffect(() => {
    if (!sessionId || !hydrated) return;

    const setupPresence = async () => {
      try {
        // Get user info
        const { data: { user } } = await supabase.auth.getUser();
        const userEmail = user?.email || "anonymous";

        // Create presence channel for this session
        const channelName = `session:${sessionId}`;
        const channel = supabase.channel(channelName, {
          config: {
            presence: {
              key: deviceIdRef.current, // Unique key per tab/device
            },
          },
        });

        // Track presence state changes
        channel
          .on("presence", { event: "sync" }, () => {
            const state = channel.presenceState();
            const viewers = Object.values(state).flat();
            setActiveViewers(viewers.length);
            setViewersList(viewers);
            
            // Determine queue position based on join time
            // Sort viewers by joined_at timestamp (earliest first)
            const sortedViewers = [...viewers].sort((a: any, b: any) => {
              const timeA = new Date(a.joined_at).getTime();
              const timeB = new Date(b.joined_at).getTime();
              return timeA - timeB;
            });
            
            // Find current user's position in queue
            const myPosition = sortedViewers.findIndex((v: any) => v.device_id === deviceIdRef.current);
            setQueuePosition(myPosition + 1); // 1-indexed position
            
            // Only the first person in queue (position 1) can use the chat
            setIsActiveUser(myPosition === 0);
            
            console.log("👥 Active viewers:", viewers.length, viewers);
            console.log("📍 My queue position:", myPosition + 1, "Active:", myPosition === 0);
          })
          .on("presence", { event: "join" }, ({ key, newPresences }) => {
            console.log("👋 Viewer joined:", key, newPresences);
          })
          .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
            console.log("👋 Viewer left:", key, leftPresences);
          });

        // Subscribe and track presence
        await channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            // Track this viewer's presence
            await channel.track({
              user_email: userEmail,
              device_id: deviceIdRef.current,
              joined_at: new Date().toISOString(),
            });
            console.log("✅ Presence tracking started for session:", sessionId);
          }
        });

        presenceChannelRef.current = channel;
      } catch (error) {
        console.error("❌ Error setting up presence:", error);
      }
    };

    setupPresence();

    // Cleanup: unsubscribe from presence when component unmounts
    return () => {
      if (presenceChannelRef.current) {
        presenceChannelRef.current.untrack();
        presenceChannelRef.current.unsubscribe();
        console.log("🔌 Presence tracking stopped");
      }
    };
  }, [sessionId, hydrated]);

  // Load messages only once when component mounts or sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    
    // Wait for hydration to complete
    if (!hydrated) return;
    
    let isMounted = true;
    
    const load = async () => {
      setLoading(true);
      console.log("Loading chat history with token:", !!token, "shareToken:", !!shareToken);
      try {
        // Check session status - use direct query without RLS
        // The issue is that RLS policies are blocking anonymous access
        // We need to query without authentication context
        console.log("Querying session with ID:", sessionId, "Type:", typeof sessionId);
        
        const { data: session, error: sessionError } = await supabase
          .from("assistant_sessions")
          .select("*")
          .eq("id", sessionId)
          .maybeSingle();
        
        console.log("Session query result:", { 
          session, 
          sessionError, 
          hasToken: !!token,
          sessionId,
          sessionIdType: typeof sessionId 
        });
        
        if (sessionError) {
          console.error("Session error details:", sessionError);
          throw sessionError;
        }
        if (!session) {
          console.error("Session not found for ID:", sessionId);
          throw new Error("Session not found");
        }
        
        console.log("Session retrieved:", session);
        if (isMounted) {
          setSessionActive(session.active);
        }
        
        // Validate share token if using shared access
        if (shareToken && session.share_token !== shareToken) {
          throw new Error("Invalid share token");
        }
        
        // For anonymous users, only load messages for this device
        // For authenticated users, load all messages
        const { data: { user } } = await supabase.auth.getUser();
        const isAuthenticated = !!user;
        
        let query = supabase
          .from("chat_messages")
          .select("*")
          .eq("session_id", sessionId);
        
        // Anonymous users only see their own device's messages
        if (!isAuthenticated && deviceIdRef.current) {
          query = query.eq("device_id", deviceIdRef.current);
        }
        
        const { data: records, error: messagesError } = await query.order("created_at", { ascending: true });
        
        console.log("Messages query result:", { count: records?.length || 0, messagesError });
        
        if (messagesError) {
          console.error("Messages error details:", messagesError);
          throw messagesError;
        }
        
        console.log("Messages loaded:", records?.length || 0);
        if (isMounted && records) {
          const mappedMessages = records.flatMap((record) => mapMessageRecord(record));
          setMessages(mappedMessages);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Error loading chat history:", err);
          const errorMessage = err instanceof Error ? err.message : "Unable to load chat history.";
          if (errorMessage.includes("Invalid share token")) {
            setError("Session link is invalid or expired. Ask the host for a new link.");
          } else if (errorMessage.includes("Session not found")) {
            setError("Session not found. Please check the link.");
          } else {
            setError("Unable to load chat history.");
          }
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
  }, [sessionId, token, shareToken, hydrated]);

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
      
      // Build conversation history from current messages (excluding the optimistic message we just added)
      const conversationHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      
      console.log("🤖 [Frontend] Calling backend AI API...");
      console.log("📜 [Frontend] Sending conversation history with", conversationHistory.length, "messages");
      
      // Use token if available, otherwise allow anonymous access
      const aiResponse = await backendApi.chat(
        {
          previous_response_id: null,
          user_message: trimmed,
          assistant_id: assistantId,  // Backend will fetch config and API key
          conversation_history: conversationHistory,  // Send full conversation history
        },
        token || undefined
      );
      console.log("✅ [Frontend] Backend response received:", aiResponse);
      
      // Publish to MQTT if we have a payload
      let mqttPublishSuccess = false;
      let mqttPublishAttempted = false;
      let mqttValueToSave = null;
      
      if (aiResponse.payload && assistantData.mqtt_host && assistantData.mqtt_topic) {
        console.log("📡 [Frontend] Publishing to MQTT...");
        const MQTT_PASS_STORAGE_PREFIX = "pr-mqtt-pass-";
        // MQTT password is stored in localStorage, which won't be available on other devices
        // This is expected - MQTT will only work on the device where it was configured
        const storedMqttPass = window.localStorage.getItem(`${MQTT_PASS_STORAGE_PREFIX}${assistantId}`);
        
        mqttPublishAttempted = true;
        
        // Extract MQTT_value from payload if present
        const mqttValue = aiResponse.payload.MQTT_value;
        if (mqttValue !== undefined && mqttValue !== null) {
          console.log("📤 [Frontend] Extracted MQTT_value from payload:", mqttValue);
          mqttValueToSave = mqttValue;
        } else {
          console.log("⚠️ [Frontend] No MQTT_value field found in payload");
        }
        
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
            token || undefined
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
      console.log("💾 [Frontend] Saving conversation turn to database...");
      
      // Use the display_text extracted by the backend
      const responseText = aiResponse.display_text || null;
      console.log("📝 [Frontend] Using display_text from backend:", responseText?.substring(0, 100));

      // Only save mqtt_payload if MQTT publish was successful
      // mqtt_payload now stores only the MQTT_value field, not the entire payload
      // For anonymous users, save device_id; for authenticated users, leave it null
      const conversationMessage = await messageService.create({
        session_id: sessionId,
        assistant_id: assistantId,
        user_text: trimmed, // Store user's message
        assistant_payload: aiResponse.payload, // Store as actual JSON object
        response_text: responseText, // Store the extracted text from backend
        mqtt_payload: (mqttPublishAttempted && mqttPublishSuccess) ? mqttValueToSave : null, // Only store MQTT_value if MQTT publish succeeded
        device_id: user ? null : deviceIdRef.current, // Anonymous users get device_id, authenticated users get null
      });
      console.log("✅ [Frontend] Conversation turn saved:", conversationMessage.id);
      
      // Reload messages for this session
      // For anonymous users, only reload their device's messages
      console.log("🔄 [Frontend] Reloading messages from database...");
      const records = await messageService.listBySession(
        sessionId,
        undefined, // threadId
        user ? undefined : deviceIdRef.current // deviceId for anonymous users only
      );
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
      } else if (errorMessage.includes("Not authorized") || errorMessage.includes("Authentication required")) {
        setError("You need to log in to send messages. Viewing history works without login.");
      } else {
        setError(errorMessage);
      }
    }
  };

  const beginRecording = async () => {
    if (!sessionId || (!token && !shareToken) || isRecording || isTranscribing) return;
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
        setIsRecording(false);
        const blob = new Blob(recordedChunks.current, { type: recorder.mimeType });
        if (blob.size === 0) {
          return;
        }
        const file = new File([blob], "voice-input.webm", { type: blob.type });
        setIsTranscribing(true);
        try {
          // Backend will fetch API key from database (same approach as chat)
          const result = await backendApi.transcribe(file, assistantId, token || undefined);
          setInput((prev) => (prev ? `${prev} ${result.text}` : result.text));
        } catch (err) {
          const errorMsg = "Unable to transcribe audio.";
          setTranscriptionError(errorMsg);
          // Clear the transcription error after 3 seconds
          setTimeout(() => {
            setTranscriptionError(null);
          }, 3000);
        } finally {
          setIsTranscribing(false);
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
          <div className="flex-1">
            <h1 className="text-lg font-bold text-[var(--ink-dark)] sm:text-xl">{title}</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[var(--ink-muted)] sm:text-sm">Session {sessionId}</p>
              {activeViewers > 0 && (
                <div 
                  className="flex items-center gap-1 text-xs text-[var(--ink-muted)] bg-[var(--card-shell)]/30 px-2 py-0.5 rounded-full"
                  title={viewersList.map((v: any) => v.user_email || "Anonymous").join(", ")}
                >
                  <Users className="h-3 w-3" />
                  <span>{activeViewers} viewing</span>
                </div>
              )}
            </div>
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

            {/* Queue waiting message - shown when not the active user */}
            {!isActiveUser && activeViewers > 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="mx-auto max-w-md rounded-2xl border-2 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-8 text-center shadow-lg">
                  <div className="mb-4">
                    <Users className="mx-auto h-12 w-12 text-[var(--ink-muted)]" />
                  </div>
                  <h2 className="mb-2 text-xl font-bold text-[var(--ink-dark)]">Session In Use</h2>
                  <p className="mb-4 text-sm text-[var(--ink-muted)]">
                    There is currently an active session. Please wait for your turn.
                  </p>
                  <div className="rounded-lg bg-[var(--card-shell)]/30 px-4 py-3">
                    <p className="text-xs text-[var(--ink-muted)]">Your position in queue:</p>
                    <p className="text-2xl font-bold text-[var(--ink-dark)]">#{queuePosition}</p>
                    <p className="mt-2 text-xs text-[var(--ink-muted)]">
                      {activeViewers - 1} {activeViewers - 1 === 1 ? 'person' : 'people'} ahead of you
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Messages - only shown to active user */}
            {isActiveUser && messages.map((message) => (
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

            {isActiveUser && messages.length === 0 && !loading && !error && (
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
        <div className="flex-shrink-0 border-t-2 border-[var(--card-shell)] bg-[var(--card-fill)]">
          {/* Helper text - positioned above the input controls, outside the padding */}
          {isRecording && (
            <div className="px-4 pt-3 sm:px-6 sm:pt-4">
              <div className="mx-auto max-w-3xl">
                <p className="text-center text-xs text-red-600 sm:text-sm">
                  Recording... Release to send
                </p>
              </div>
            </div>
          )}
          {isTranscribing && !transcriptionError && (
            <div className="px-4 pt-3 sm:px-6 sm:pt-4">
              <div className="mx-auto max-w-3xl">
                <p className="text-center text-xs text-blue-600 sm:text-sm">
                  Transcribing...
                </p>
              </div>
            </div>
          )}
          {transcriptionError && (
            <div className="px-4 pt-3 sm:px-6 sm:pt-4">
              <div className="mx-auto max-w-3xl">
                <p className="text-center text-xs text-red-600 sm:text-sm">
                  {transcriptionError}
                </p>
              </div>
            </div>
          )}
          
          <div className="px-4 py-3 sm:px-6 sm:py-4">
            {sessionActive === false ? (
              <div className="mx-auto max-w-3xl">
                <div className="rounded-2xl border-2 border-[var(--card-shell)] bg-[#fff0dc] px-4 py-3 text-center">
                  <p className="text-sm font-medium text-[#4a2100]">
                    Session stopped. Restart the session to send messages.
                  </p>
                </div>
              </div>
            ) : !isActiveUser ? (
              <div className="mx-auto max-w-3xl">
                <div className="rounded-2xl border-2 border-[var(--card-shell)] bg-[var(--card-fill)] px-4 py-3 text-center">
                  <p className="text-sm font-medium text-[var(--ink-dark)]">
                    Waiting in queue... You'll be able to chat when it's your turn.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSend} className="mx-auto max-w-3xl">
                <div className="flex items-center gap-2 sm:gap-3">
                {/* Mic button */}
                <button
                  type="button"
                  title={isTranscribing ? "Transcribing…" : isRecording ? "Recording…" : "Hold to talk"}
                  disabled={isTranscribing}
                  className={`flex-shrink-0 rounded-full p-2 sm:p-2.5 transition-all ${
                    isTranscribing
                      ? "bg-blue-500 text-white cursor-not-allowed"
                      : isRecording
                      ? "bg-red-500 text-white scale-110"
                      : "bg-transparent border-2 border-[var(--card-shell)] text-[var(--ink-muted)] hover:bg-[var(--card-shell)]/20"
                  }`}
                  {...(!isTranscribing ? recordingEvents : {})}
                >
                  {isTranscribing ? (
                    <Loader2 className="h-5 w-5 sm:h-5 sm:w-5 animate-spin" />
                  ) : (
                    <Mic className="h-5 w-5 sm:h-5 sm:w-5" />
                  )}
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
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
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
    // IMPORTANT: Only flag as failed if assistant_payload is not null (meaning MQTT was attempted)
    // If assistant_payload is null, MQTT was never attempted, so don't show warning
    const mqttFailed = 
      message.assistant_payload !== null && 
      message.assistant_payload !== undefined &&
      (message.mqtt_payload === null || message.mqtt_payload === undefined);
    
    // Use response_text directly - backend now handles extraction
    const content = message.response_text || JSON.stringify(message.assistant_payload, null, 2);
    
    messages.push({
      id: `${message.id}-assistant`,
      role: "assistant",
      content: content,
      timestamp: message.created_at,
      mqttFailed: mqttFailed,
    });
  }
  
  return messages;
}
