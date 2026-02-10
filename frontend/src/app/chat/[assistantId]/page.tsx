"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Mic, Send, ArrowLeft, Loader2, Users, RotateCcw, ThumbsUp, ThumbsDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { ConfirmationModal } from "@/components/ConfirmationModal";
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
  dbMessageId?: string; // The actual database ID for updating reactions
  role: "assistant" | "user";
  content: string;
  timestamp: string;
  mqttFailed?: boolean; // Flag to indicate MQTT publish failure
  reaction?: "like" | "dislike" | null; // User reaction to assistant message
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
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);
  const [activeViewers, setActiveViewers] = useState<number>(0);
  const [viewersList, setViewersList] = useState<any[]>([]);
  const [isActiveUser, setIsActiveUser] = useState<boolean>(false);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isAiResponding, setIsAiResponding] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const deviceIdRef = useRef<string>("");
  const threadIdRef = useRef<string>("");
  
  // Initialize device ID and thread ID from localStorage or create new ones
  useEffect(() => {
    if (hydrated && sessionId) {
      const DEVICE_ID_KEY = "pr-device-id";
      let storedDeviceId = window.localStorage.getItem(DEVICE_ID_KEY);
      if (!storedDeviceId) {
        storedDeviceId = crypto.randomUUID();
        window.localStorage.setItem(DEVICE_ID_KEY, storedDeviceId);
      }
      deviceIdRef.current = storedDeviceId;
      
      // Generate thread ID synchronously to avoid race conditions
      // Use a synchronous approach: check auth state from localStorage/session
      const initializeThreadId = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const userIdentifier = user?.id || storedDeviceId;
        const THREAD_ID_KEY = `pr-thread-${sessionId}-${userIdentifier}`;
        let storedThreadId = window.localStorage.getItem(THREAD_ID_KEY);
        if (!storedThreadId) {
          storedThreadId = crypto.randomUUID();
          window.localStorage.setItem(THREAD_ID_KEY, storedThreadId);
          logger.log("🧵 [Frontend] Created new thread_id:", storedThreadId, "for user:", userIdentifier);
        } else {
          logger.log("🧵 [Frontend] Using existing thread_id:", storedThreadId, "for user:", userIdentifier);
        }
        threadIdRef.current = storedThreadId;
      };
      
      initializeThreadId();
    }
  }, [hydrated, sessionId]);

  // Auto-scroll to bottom when messages change or AI starts responding
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAiResponding]);

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
            
            logger.log("👥 Active viewers:", viewers.length, viewers);
            logger.log("📍 My queue position:", myPosition + 1, "Active:", myPosition === 0);
          })
          .on("presence", { event: "join" }, ({ key, newPresences }) => {
            logger.log("👋 Viewer joined:", key, newPresences);
          })
          .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
            logger.log("👋 Viewer left:", key, leftPresences);
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
            logger.log("✅ Presence tracking started for session:", sessionId);
          }
        });

        presenceChannelRef.current = channel;
      } catch (error) {
        logger.error("❌ Error setting up presence:", error);
      }
    };

    setupPresence();

    // Cleanup: unsubscribe from presence when component unmounts
    return () => {
      if (presenceChannelRef.current) {
        presenceChannelRef.current.untrack();
        presenceChannelRef.current.unsubscribe();
        logger.log("🔌 Presence tracking stopped");
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
      logger.log("Loading chat history with token:", !!token, "shareToken:", !!shareToken);
      try {
        // Check session status - use direct query without RLS
        // The issue is that RLS policies are blocking anonymous access
        // We need to query without authentication context
        logger.log("Querying session with ID:", sessionId, "Type:", typeof sessionId);
        
        const { data: session, error: sessionError } = await supabase
          .from("assistant_sessions")
          .select("*")
          .eq("id", sessionId)
          .maybeSingle();
        
        logger.log("Session query result:", { 
          session, 
          sessionError, 
          hasToken: !!token,
          sessionId,
          sessionIdType: typeof sessionId 
        });
        
        if (sessionError) {
          logger.error("Session error details:", sessionError);
          throw sessionError;
        }
        if (!session) {
          logger.error("Session not found for ID:", sessionId);
          throw new Error("Session not found");
        }
        
        logger.log("Session retrieved:", session);
        if (isMounted) {
          setSessionActive(session.active);
          
          // Load existing response_id for this specific thread (not from session)
          // We need to query the chat_messages table for the response_id marker
          // These marker messages should NOT be displayed in the chat UI
          if (threadIdRef.current) {
            try {
              const { data: markerMessages } = await supabase
                .from("chat_messages")
                .select("assistant_payload")
                .eq("session_id", sessionId)
                .eq("thread_id", threadIdRef.current)
                .is("user_text", null)
                .not("assistant_payload", "is", null)
                .order("created_at", { ascending: false })
                .limit(1);
              
              if (markerMessages && markerMessages.length > 0) {
                const marker = markerMessages[0].assistant_payload;
                if (marker && typeof marker === 'object' && '_response_id_marker' in marker) {
                  const responseId = marker._response_id_marker;
                  setLastResponseId(responseId);
                  logger.log("📜 [Frontend] Loaded existing response_id for thread:", responseId);
                }
              }
            } catch (error) {
              logger.warn("⚠️ [Frontend] Failed to load response_id for thread:", error);
            }
          }
        }
        
        // Validate share token if using shared access
        if (shareToken && session.share_token !== shareToken) {
          throw new Error("Invalid share token");
        }
        
        // Load messages for this specific thread only
        const { data: { user } } = await supabase.auth.getUser();
        
        // Wait for thread ID to be initialized with a longer timeout and retry logic
        let retries = 0;
        const maxRetries = 20; // 2 seconds total
        while (!threadIdRef.current && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
        }
        
        if (!threadIdRef.current) {
          logger.error("❌ [Frontend] Thread ID not initialized after waiting");
          throw new Error("Thread ID initialization failed");
        }
        
        logger.log("🧵 [Frontend] Loading messages for thread_id:", threadIdRef.current);
        
        let query = supabase
          .from("chat_messages")
          .select("*")
          .eq("session_id", sessionId)
          .eq("thread_id", threadIdRef.current);
        
        const { data: records, error: messagesError } = await query.order("created_at", { ascending: true });
        
        logger.log("Messages query result:", { count: records?.length || 0, messagesError });
        
        if (messagesError) {
          logger.error("Messages error details:", messagesError);
          throw messagesError;
        }
        
        logger.log("Messages loaded:", records?.length || 0);
        if (isMounted && records) {
          // Filter out marker messages (messages with only assistant_payload containing _response_id_marker)
          // These are internal tracking messages and should not be displayed
          const displayableRecords = records.filter((record) => {
            // If there's a user_text or response_text, it's a real message
            if (record.user_text || record.response_text) {
              return true;
            }
            // If assistant_payload exists, check if it's just a marker
            if (record.assistant_payload && typeof record.assistant_payload === 'object') {
              // If it only contains _response_id_marker, it's a marker message - filter it out
              const keys = Object.keys(record.assistant_payload);
              if (keys.length === 1 && keys[0] === '_response_id_marker') {
                return false;
              }
            }
            // Otherwise, include it
            return true;
          });
          
          const mappedMessages = displayableRecords.flatMap((record) => mapMessageRecord(record));
          setMessages(mappedMessages);
        }
      } catch (err) {
        if (isMounted) {
          logger.error("Error loading chat history:", err);
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

  const handleResetConversation = () => {
    setShowResetModal(true);
  };

  const confirmResetConversation = async () => {
    logger.log("🔄 [Frontend] Resetting conversation - creating new thread");
    
    // Clear local messages state (does NOT delete from database)
    setMessages([]);
    
    // Reset the conversation flow by clearing the response_id
    setLastResponseId(null);
    
    // Generate a NEW thread_id to separate conversations
    const newThreadId = crypto.randomUUID();
    threadIdRef.current = newThreadId;
    
    // Store the new thread_id in localStorage
    if (sessionId && hydrated) {
      const { data: { user } } = await supabase.auth.getUser();
      const userIdentifier = user?.id || deviceIdRef.current;
      const THREAD_ID_KEY = `pr-thread-${sessionId}-${userIdentifier}`;
      window.localStorage.setItem(THREAD_ID_KEY, newThreadId);
      logger.log("🧵 [Frontend] Created new thread_id after reset:", newThreadId);
      
      // Remove the old reset timestamp key (no longer needed with proper thread separation)
      const resetKey = `chat-reset-${sessionId}`;
      window.localStorage.removeItem(resetKey);
    }
    
    logger.log("✅ [Frontend] Conversation reset complete - new thread started");
    setShowResetModal(false);
  };

  const cancelResetConversation = () => {
    setShowResetModal(false);
  };

  const handleReaction = async (messageId: string, dbMessageId: string | undefined, reaction: "like" | "dislike") => {
    if (!dbMessageId) return;

    // Find current reaction
    const currentMessage = messages.find(m => m.id === messageId);
    const currentReaction = currentMessage?.reaction;

    // Toggle: if clicking the same reaction, remove it; otherwise set the new one
    const newReaction = currentReaction === reaction ? null : reaction;

    // Optimistically update UI
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, reaction: newReaction } : msg
    ));

    try {
      await messageService.updateReaction(dbMessageId, newReaction);
      logger.log("✅ Reaction updated:", { messageId, reaction: newReaction });
    } catch (error) {
      // Revert on error
      logger.error("❌ Failed to update reaction:", error);
      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, reaction: currentReaction } : msg
      ));
    }
  };

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    logger.log("🚀 [Frontend] handleSend triggered");
    
    if (!sessionId || (!token && !shareToken)) {
      logger.log("❌ [Frontend] Missing sessionId or token");
      return;
    }
    
    const trimmed = input.trim();
    if (!trimmed) {
      logger.log("❌ [Frontend] Empty message");
      return;
    }
    
    logger.log("📝 [Frontend] User message:", trimmed);
    setInput("");
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    setIsAiResponding(true);
    
    try {
      // Get session info
      logger.log("🔍 [Frontend] Fetching session info for:", sessionId);
      const session = await sessionService.get(sessionId);
      logger.log("✅ [Frontend] Session retrieved:", { active: session.active, thread_id: session.current_thread_id });
      
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
      logger.log("🔍 [Frontend] Fetching assistant configuration...");
      const { data: assistantData, error: assistantError } = await supabase
        .from("assistants")
        .select("*")
        .eq("id", assistantId)
        .single();
      
      if (assistantError || !assistantData) {
        throw new Error("Failed to fetch assistant configuration");
      }
      
      logger.log("🤖 [Frontend] Calling backend AI API...");
      logger.log("📜 [Frontend] Using previous_response_id:", lastResponseId);
      logger.log("🧵 [Frontend] Using thread_id:", threadIdRef.current);
      
      // Use Responses API with previous_response_id for context
      const aiResponse = await backendApi.chat(
        {
          previous_response_id: lastResponseId,  // Pass context ID
          user_message: trimmed,
          assistant_id: assistantId,
          session_id: sessionId,  // For persisting response_id in backend
          thread_id: threadIdRef.current,  // Pass thread_id for per-thread context isolation
        },
        token || undefined
      );
      
      // Save response_id for next turn
      if (aiResponse.response_id) {
        setLastResponseId(aiResponse.response_id);
        logger.log("💾 [Frontend] Saved response_id for next turn:", aiResponse.response_id);
      }
      
      logger.log("✅ [Frontend] Backend response received:", aiResponse);
      
      // Publish to MQTT if we have a payload
      let mqttPublishSuccess = false;
      let mqttPublishAttempted = false;
      let mqttValueToSave = null;
      
      if (aiResponse.payload && assistantData.mqtt_host && assistantData.mqtt_topic) {
        logger.log("📡 [Frontend] Publishing to MQTT...");
        
        mqttPublishAttempted = true;
        
        // Extract the MQTT value to save to database
        // Check keys in order: MQTT_value, MQTT_values, values
        let mqttValue = null;
        if (aiResponse.payload.MQTT_value !== undefined && aiResponse.payload.MQTT_value !== null) {
          mqttValue = aiResponse.payload.MQTT_value;
          logger.log("📤 [Frontend] Extracted MQTT_value for MQTT:", mqttValue);
        } else if (aiResponse.payload.MQTT_values !== undefined && aiResponse.payload.MQTT_values !== null) {
          mqttValue = aiResponse.payload.MQTT_values;
          logger.log("📤 [Frontend] Extracted MQTT_values for MQTT:", mqttValue);
        } else if (aiResponse.payload.values !== undefined && aiResponse.payload.values !== null) {
          mqttValue = aiResponse.payload.values;
          logger.log("📤 [Frontend] Extracted values for MQTT:", mqttValue);
        } else {
          mqttValue = aiResponse.payload;
          logger.log("📤 [Frontend] Using full payload for MQTT:", mqttValue);
        }
        
        if (mqttValue !== undefined && mqttValue !== null) {
          mqttValueToSave = mqttValue;
        } else {
          logger.log("⚠️ [Frontend] No MQTT value found in payload");
        }
        
        try {
          // Send the values object to MQTT broker
          // Ensure mqttPayload is always an object, never null/undefined/empty string
          let mqttPayload = mqttValue;
          
          // If mqttPayload is not a valid object, wrap it in an object
          if (mqttPayload === null || mqttPayload === undefined || mqttPayload === "" || typeof mqttPayload !== "object") {
            logger.log("⚠️ [Frontend] Invalid MQTT payload, wrapping in object:", mqttPayload);
            mqttPayload = { value: mqttPayload };
          }
          
          const mqttResult = await backendApi.publishMqtt(
            {
              assistant_id: assistantId,
              payload: mqttPayload,
              session_id: sessionId,
            },
            token || undefined
          );
          
          if (mqttResult.success) {
            logger.log("✅ [Frontend] MQTT publish successful");
            mqttPublishSuccess = true;
          } else {
            logger.warn("⚠️ [Frontend] MQTT publish failed:", mqttResult.message);
            mqttPublishSuccess = false;
          }
        } catch (mqttError) {
          logger.error("❌ [Frontend] MQTT publish error:", mqttError);
          mqttPublishSuccess = false;
        }
      } else {
        logger.log("⏭️ [Frontend] Skipping MQTT publish - missing payload or MQTT config");
      }
      
      // Save complete conversation turn (user + assistant) in a single entry
      logger.log("💾 [Frontend] Saving conversation turn to database...");
      
      // Use the display_text extracted by the backend
      const responseText = aiResponse.display_text || null;
      logger.log("📝 [Frontend] Using display_text from backend:", responseText?.substring(0, 100));

      // Ensure thread_id is initialized before saving
      if (!threadIdRef.current) {
        logger.error("❌ [Frontend] Thread ID not initialized when trying to save message");
        throw new Error("Thread ID not initialized");
      }
      
      logger.log("🧵 [Frontend] Saving message with thread_id:", threadIdRef.current);
      
      // Only save mqtt_payload if MQTT publish was successful
      // mqtt_payload now stores only the MQTT_value field, not the entire payload
      // For anonymous users, save device_id; for authenticated users, leave it null
      // Always save thread_id to group messages by conversation thread
      const conversationMessage = await messageService.create({
        session_id: sessionId,
        assistant_id: assistantId,
        user_text: trimmed, // Store user's message
        assistant_payload: aiResponse.payload, // Store as actual JSON object
        response_text: responseText, // Store the extracted text from backend
        mqtt_payload: (mqttPublishAttempted && mqttPublishSuccess) ? mqttValueToSave : null, // Only store MQTT_value if MQTT publish succeeded
        device_id: user ? null : deviceIdRef.current, // Anonymous users get device_id, authenticated users get null
        thread_id: threadIdRef.current, // Always save thread_id for conversation isolation
        reaction: null, // No reaction initially
      });
      logger.log("✅ [Frontend] Conversation turn saved:", conversationMessage.id);
      
      // After saving, add the new messages to the existing state instead of reloading from DB
      // This prevents old messages from reappearing after a reset
      logger.log("✅ [Frontend] Conversation turn saved, updating local state");
      
      // Create the new message objects to add to state
      const newUserMessage: ChatMessage = {
        id: `${conversationMessage.id}-user`,
        role: "user",
        content: trimmed,
        timestamp: conversationMessage.created_at,
      };
      
      const newAssistantMessage: ChatMessage = {
        id: `${conversationMessage.id}-assistant`,
        dbMessageId: conversationMessage.id,
        role: "assistant",
        content: responseText || JSON.stringify(aiResponse.payload, null, 2),
        timestamp: conversationMessage.created_at,
        mqttFailed: mqttPublishAttempted && !mqttPublishSuccess,
        reaction: null,
      };
      
      // Update messages by replacing the temp message with the real ones
      setMessages((prev) => {
        const withoutTemp = prev.filter((msg) => msg.id !== tempId);
        return [...withoutTemp, newUserMessage, newAssistantMessage];
      });
      
      logger.log("✅ [Frontend] Messages updated in local state");
      setError(null);
    } catch (err) {
      logger.error("❌ [Frontend] Error in handleSend:", err);
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      const errorMessage = err instanceof Error ? err.message : "Unable to send message.";
      if (errorMessage.includes("Session is not running") || errorMessage.includes("not running") || errorMessage.includes("not active")) {
        setError("This session has stopped. The host needs to start a new run.");
      } else if (errorMessage.includes("Not authorized") || errorMessage.includes("Authentication required")) {
        setError("You need to log in to send messages. Viewing history works without login.");
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsAiResponding(false);
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
      {/* Reset Conversation Confirmation Modal */}
      <ConfirmationModal
        isOpen={showResetModal}
        title="Reset Conversation"
        message="Are you sure you want to reset this conversation? This will clear all messages from your view and start a fresh conversation."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        onConfirm={confirmResetConversation}
        onCancel={cancelResetConversation}
        variant="warning"
      />

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
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetConversation}
              className="flex items-center gap-2 rounded-full border-2 border-[var(--card-shell)] bg-transparent px-3 py-2 text-xs text-[var(--ink-dark)] transition-all hover:bg-[var(--card-shell)]/20 sm:px-4 sm:py-2 sm:text-sm"
              title="Reset Conversation"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              onClick={handleBackToDashboard}
              className="flex items-center gap-2 rounded-full border-2 border-[var(--card-shell)] bg-transparent px-3 py-2 text-xs text-[var(--ink-dark)] transition-all hover:bg-[var(--card-shell)]/20 sm:px-4 sm:py-2 sm:text-sm"
              title="Return to Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          </div>
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
                  {/* Like/Dislike buttons for assistant messages */}
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={() => handleReaction(message.id, message.dbMessageId, "like")}
                        className={`p-1.5 rounded-full transition-all ${
                          message.reaction === "like"
                            ? "bg-green-100 text-green-600"
                            : "bg-transparent text-[var(--ink-muted)] hover:bg-[var(--card-shell)]/30"
                        }`}
                        title="Like this response"
                      >
                        <ThumbsUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleReaction(message.id, message.dbMessageId, "dislike")}
                        className={`p-1.5 rounded-full transition-all ${
                          message.reaction === "dislike"
                            ? "bg-red-100 text-red-600"
                            : "bg-transparent text-[var(--ink-muted)] hover:bg-[var(--card-shell)]/30"
                        }`}
                        title="Dislike this response"
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator - shown when AI is responding */}
            {isActiveUser && isAiResponding && (
              <div className="flex justify-start">
                <div className="flex flex-col gap-1 max-w-[85%] sm:max-w-[75%]">
                  <div className="rounded-2xl px-3 py-2 sm:px-4 sm:py-3 bg-[var(--ink-muted)] text-[var(--card-fill)]">
                    <div className="flex items-center gap-1">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-[var(--card-fill)] rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.4s' }}></span>
                        <span className="w-2 h-2 bg-[var(--card-fill)] rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.4s' }}></span>
                        <span className="w-2 h-2 bg-[var(--card-fill)] rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.4s' }}></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
      dbMessageId: message.id, // Store the actual database ID for updating reactions
      role: "assistant",
      content: content,
      timestamp: message.created_at,
      mqttFailed: mqttFailed,
      reaction: message.reaction,
    });
  }

  return messages;
}
