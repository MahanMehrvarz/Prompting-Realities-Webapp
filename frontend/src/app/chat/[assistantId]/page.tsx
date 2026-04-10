"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Mic, Send, ArrowLeft, Loader2, Users, RotateCcw, ThumbsUp, ThumbsDown, Volume2, Radio, X, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { TTSWarningModal } from "@/components/TTSWarningModal";
import { MqttReceiverModal } from "@/components/MqttReceiverModal";
import { VoiceMessageBubble } from "@/components/VoiceMessageBubble";
import { useMqttSubscriber, type MqttConnectionStatus } from "@/hooks/useMqttSubscriber";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import {
  sessionService,
  messageService,
  type ChatMessage as DbChatMessage,
} from "@/lib/supabaseClient";
import { backendApi } from "@/lib/backendApi";
import { getAssistantColors } from "@/lib/assistantColors";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useVisualViewport } from "@/hooks/useVisualViewport";

const TOKEN_STORAGE_KEY = "pr-auth-token";

type ChatMessage = {
  id: string;
  dbMessageId?: string; // The actual database ID for updating reactions
  role: "assistant" | "user";
  content: string;
  timestamp: string;
  mqttFailed?: boolean; // Flag to indicate MQTT publish failure
  reaction?: "like" | "dislike" | null; // User reaction to assistant message
  // Voice message fields
  isVoiceMessage?: boolean;
  audioUrl?: string;          // Object URL of the recorded audio blob
  durationSeconds?: number;   // Recording duration in seconds
  isProcessing?: boolean;     // true while polling for voice message result
  voiceMessageId?: string;    // job ID for polling
  transcript?: string | null; // Whisper transcript (populated after polling)
};

export default function AssistantChatPage() {
  const viewportHeight = useVisualViewport();
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
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);
  const [activeViewers, setActiveViewers] = useState<number>(0);
  const [viewersList, setViewersList] = useState<any[]>([]);
  const [isActiveUser, setIsActiveUser] = useState<boolean>(false);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isAiResponding, setIsAiResponding] = useState(false);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsVoice, setTtsVoice] = useState<string>("alloy");
  const [showTTSModal, setShowTTSModal] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // MQTT Receiver state
  const [showMqttReceiverModal, setShowMqttReceiverModal] = useState(false);
  const [mqttCredentials, setMqttCredentials] = useState<{
    mqtt_host: string | null;
    mqtt_port: number;
    mqtt_user: string | null;
    mqtt_pass: string | null;
    mqtt_topic: string | null;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const deviceIdRef = useRef<string>("");
  const threadIdRef = useRef<string>("");
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceAudioUrlsRef = useRef<string[]>([]); // track object URLs for cleanup
  
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

  // Scroll to bottom when visual viewport height changes (e.g. keyboard open/close on mobile)
  useEffect(() => {
    if (viewportHeight > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [viewportHeight]);

  // Suppress body overscroll on chat route
  useEffect(() => {
    const prev = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overscrollBehavior = prev;
    };
  }, []);

  // Cleanup TTS audio, polling, and voice message object URLs on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
        audioRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      voiceAudioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      voiceAudioUrlsRef.current = [];
    };
  }, []);

  // Fetch MQTT credentials for the receiver modal
  useEffect(() => {
    if (!assistantId || !hydrated) return;

    const fetchMqttCredentials = async () => {
      try {
        const credentials = await backendApi.getMqttCredentials(assistantId, token || undefined);
        setMqttCredentials(credentials);
        logger.log("📡 [MQTT] Loaded credentials for receiver:", credentials.mqtt_host ? "configured" : "not configured");
      } catch (err) {
        logger.warn("⚠️ [MQTT] Failed to fetch credentials:", err);
      }
    };

    fetchMqttCredentials();
  }, [assistantId, token, hydrated]);

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

  // TTS handlers
  const handleTTSToggle = () => {
    if (!ttsEnabled) {
      // Opening: show warning modal with voice selection
      setShowTTSModal(true);
    } else {
      // Closing: disable TTS immediately
      setTtsEnabled(false);
      // Stop any playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsTTSLoading(false);
    }
  };

  const confirmTTSEnable = () => {
    setTtsEnabled(true);
    setShowTTSModal(false);
  };

  const cancelTTSEnable = () => {
    setShowTTSModal(false);
  };

  const playTTS = async (text: string) => {
    if (!ttsEnabled || !text) return;

    // Stop any previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }

    setIsTTSLoading(true);

    try {
      const audioBlob = await backendApi.tts(
        {
          text,
          voice: ttsVoice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
          assistant_id: assistantId,
          model: "tts-1",
        },
        token || undefined
      );

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setIsTTSLoading(false);
      };

      audio.onerror = () => {
        logger.error("❌ TTS audio playback error");
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setIsTTSLoading(false);
      };

      await audio.play();
    } catch (err) {
      logger.error("❌ TTS failed:", err);
      setIsTTSLoading(false);
    }
  };

  // Core function to send a message to AI - reused by form submit and MQTT receiver
  const sendMessageToAI = async (messageText: string): Promise<void> => {
    const trimmed = messageText.trim();
    if (!trimmed) {
      logger.log("❌ [Frontend] Empty message");
      return;
    }

    if (!sessionId || (!token && !shareToken)) {
      logger.log("❌ [Frontend] Missing sessionId or token");
      return;
    }

    logger.log("📝 [Frontend] Sending message to AI:", trimmed);
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

      const assistantDisplayName = assistantData?.name || title;
      logger.log("📛 [Frontend] Assistant name to save:", assistantDisplayName);

      logger.log("🤖 [Frontend] Calling backend AI API...");
      logger.log("📜 [Frontend] Using previous_response_id:", lastResponseId);
      logger.log("🧵 [Frontend] Using thread_id:", threadIdRef.current);

      // Use Responses API with previous_response_id for context
      const aiResponse = await backendApi.chat(
        {
          previous_response_id: lastResponseId,
          user_message: trimmed,
          assistant_id: assistantId,
          session_id: sessionId,
          thread_id: threadIdRef.current,
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
          let mqttPayload = mqttValue;
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

      // Save complete conversation turn
      logger.log("💾 [Frontend] Saving conversation turn to database...");

      const responseText = aiResponse.display_text || null;
      logger.log("📝 [Frontend] Using display_text from backend:", responseText?.substring(0, 100));

      if (!threadIdRef.current) {
        logger.error("❌ [Frontend] Thread ID not initialized when trying to save message");
        throw new Error("Thread ID not initialized");
      }

      logger.log("🧵 [Frontend] Saving message with thread_id:", threadIdRef.current);

      const conversationMessage = await messageService.create({
        session_id: sessionId,
        assistant_id: assistantId,
        assistant_name: assistantDisplayName,
        user_text: trimmed,
        assistant_payload: aiResponse.payload,
        response_text: responseText,
        mqtt_payload: (mqttPublishAttempted && mqttPublishSuccess) ? mqttValueToSave : null,
        device_id: user ? null : deviceIdRef.current,
        thread_id: threadIdRef.current,
        reaction: null,
      });
      logger.log("✅ [Frontend] Conversation turn saved:", conversationMessage.id);

      // Update local state
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

      setMessages((prev) => {
        const withoutTemp = prev.filter((msg) => msg.id !== tempId);
        return [...withoutTemp, newUserMessage, newAssistantMessage];
      });

      logger.log("✅ [Frontend] Messages updated in local state");

      // Play TTS if enabled
      if (ttsEnabled && responseText) {
        playTTS(responseText).catch((err) => {
          logger.error("❌ TTS playback failed:", err);
        });
      }

      setError(null);
    } catch (err) {
      logger.error("❌ [Frontend] Error in sendMessageToAI:", err);
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

  // Keep a stable ref to sendMessageToAI so MQTT callbacks don't go stale
  const sendMessageToAIRef = useRef(sendMessageToAI);
  useEffect(() => {
    sendMessageToAIRef.current = sendMessageToAI;
  });

  // MQTT Receiver: Handle incoming MQTT messages and auto-send to AI
  const handleMqttMessage = useCallback(async (topic: string, message: string) => {
    logger.log(`📨 [MQTT Receiver] Message received on ${topic}: ${message}`);
    await sendMessageToAIRef.current(message);
  }, []);

  const handleMqttError = useCallback((error: Error) => {
    logger.error("❌ [MQTT Receiver] Error:", error);
  }, []);

  // Initialize MQTT subscriber hook
  const {
    status: mqttStatus,
    currentTopic: mqttCurrentTopic,
    errorMessage: mqttErrorMessage,
    connect: mqttConnect,
    disconnect: mqttDisconnect,
  } = useMqttSubscriber({
    onMessage: handleMqttMessage,
    onError: handleMqttError,
  });

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    logger.log("🚀 [Frontend] handleSend triggered");

    const trimmed = input.trim();
    if (!trimmed) {
      logger.log("❌ [Frontend] Empty message");
      return;
    }

    setInput("");
    await sendMessageToAI(trimmed);
  };

  /**
   * Called by useVoiceRecorder when the user releases the mic button
   * without sliding to cancel. Sends the audio blob to the backend,
   * plays the ack audio, and starts polling for the full result.
   */
  const handleVoiceRecordingComplete = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      if (!sessionId || (!token && !shareToken)) return;

      const audioUrl = URL.createObjectURL(blob);
      voiceAudioUrlsRef.current.push(audioUrl);

      const tempUserMsgId = `voice-user-${Date.now()}`;
      const tempAckMsgId = `voice-ack-${Date.now()}`;

      // 1. Add user voice bubble immediately (no loading dot — the bubble is the visual)
      const optimisticUserMsg: ChatMessage = {
        id: tempUserMsgId,
        role: "user",
        content: "",
        timestamp: new Date().toISOString(),
        isVoiceMessage: true,
        audioUrl,
        durationSeconds,
        isProcessing: false,
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);
      setIsAiResponding(true);

      try {
        // 2. Stop any playing TTS audio
        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
          audioRef.current = null;
        }

        // 3. Send voice message to backend — returns ack text + job ID instantly (no TTS)
        const { ackText, messageId } = await backendApi.voiceMessage(
          blob,
          assistantId,
          {
            sessionId,
            threadId: threadIdRef.current,
            previousResponseId: lastResponseId,
            voice: ttsVoice,
          },
          token || undefined
        );

        // 4. Show ack as a status message (not a loading dot — shows the ack phrase + "Transcribing…")
        const ackMsg: ChatMessage = {
          id: tempAckMsgId,
          role: "assistant",
          content: ackText,
          timestamp: new Date().toISOString(),
          isProcessing: true,
        };
        setMessages((prev) => [...prev, ackMsg]);

        // 5. Start polling — update status text as we progress
        let pollCount = 0;
        const MAX_POLLS = 40; // 60 seconds at 1.5s interval

        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

        pollingIntervalRef.current = setInterval(async () => {
          pollCount++;

          // Update status label: first ~10s = transcribing, after = responding
          const statusLabel = pollCount <= 7 ? "Transcribing…" : "Responding…";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAckMsgId ? { ...m, content: statusLabel } : m
            )
          );

          try {
            const result = await backendApi.voiceMessageResult(messageId, token || undefined);

            if (result.status === "ready") {
              clearInterval(pollingIntervalRef.current!);
              pollingIntervalRef.current = null;
              setIsAiResponding(false);

              if (result.response_id) {
                setLastResponseId(result.response_id);
              }

              // Save to database
              let conversationMessage = null;
              try {
                const { data: { user } } = await supabase.auth.getUser();
                const { data: assistantData } = await supabase
                  .from("assistants")
                  .select("name")
                  .eq("id", assistantId)
                  .single();
                const assistantDisplayName = assistantData?.name || assistantId;

                conversationMessage = await messageService.create({
                  session_id: sessionId,
                  assistant_id: assistantId,
                  assistant_name: assistantDisplayName,
                  user_text: result.transcript || "(voice message)",
                  assistant_payload: result.response_payload,
                  response_text: result.response_text,
                  mqtt_payload: null,
                  device_id: user ? null : deviceIdRef.current,
                  thread_id: threadIdRef.current,
                  reaction: null,
                });
              } catch (dbErr) {
                logger.error("❌ [VoiceMsg] Failed to save to database:", dbErr);
              }

              // Replace optimistic messages with final messages
              setMessages((prev) => {
                const withoutOptimistic = prev.filter(
                  (m) => m.id !== tempUserMsgId && m.id !== tempAckMsgId
                );
                const finalUserMsg: ChatMessage = {
                  id: conversationMessage ? `${conversationMessage.id}-user` : tempUserMsgId,
                  role: "user",
                  content: result.transcript || "(voice message)",
                  timestamp: conversationMessage?.created_at || new Date().toISOString(),
                  isVoiceMessage: true,
                  audioUrl,
                  durationSeconds,
                  transcript: result.transcript,
                  isProcessing: false,
                };
                const finalAssistantMsg: ChatMessage = {
                  id: conversationMessage ? `${conversationMessage.id}-assistant` : tempAckMsgId,
                  dbMessageId: conversationMessage?.id,
                  role: "assistant",
                  content: result.response_text || "",
                  timestamp: conversationMessage?.created_at || new Date().toISOString(),
                  isProcessing: false,
                  reaction: null,
                };
                return [...withoutOptimistic, finalUserMsg, finalAssistantMsg];
              });

              // Play full TTS response
              if (result.response_text) {
                try {
                  const ttsBlob = await backendApi.tts(
                    {
                      text: result.response_text,
                      voice: ttsVoice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
                      assistant_id: assistantId,
                      model: "tts-1",
                    },
                    token || undefined
                  );
                  const ttsUrl = URL.createObjectURL(ttsBlob);
                  const ttsAudio = new Audio(ttsUrl);
                  audioRef.current = ttsAudio;
                  ttsAudio.onended = () => {
                    URL.revokeObjectURL(ttsUrl);
                    audioRef.current = null;
                  };
                  ttsAudio.onerror = () => {
                    URL.revokeObjectURL(ttsUrl);
                    audioRef.current = null;
                  };
                  await ttsAudio.play();
                } catch (ttsErr) {
                  logger.error("❌ [VoiceMsg] Full TTS playback failed:", ttsErr);
                }
              }
            } else if (result.status === "error") {
              clearInterval(pollingIntervalRef.current!);
              pollingIntervalRef.current = null;
              setIsAiResponding(false);
              setMessages((prev) =>
                prev.filter((m) => m.id !== tempUserMsgId && m.id !== tempAckMsgId)
              );
              setError("Voice message processing failed. Please try again.");
              setTimeout(() => setError(null), 4000);
            } else if (pollCount >= MAX_POLLS) {
              clearInterval(pollingIntervalRef.current!);
              pollingIntervalRef.current = null;
              setIsAiResponding(false);
              setMessages((prev) =>
                prev.filter((m) => m.id !== tempUserMsgId && m.id !== tempAckMsgId)
              );
              setError("Voice message timed out. Please try again.");
              setTimeout(() => setError(null), 4000);
            }
          } catch (pollErr) {
            logger.error("❌ [VoiceMsg] Polling error:", pollErr);
          }
        }, 1500);
      } catch (err) {
        logger.error("❌ [VoiceMsg] Failed to send voice message:", err);
        setIsAiResponding(false);
        setMessages((prev) =>
          prev.filter((m) => m.id !== tempUserMsgId && m.id !== tempAckMsgId)
        );
        setError("Failed to send voice message. Please try again.");
        setTimeout(() => setError(null), 4000);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, token, shareToken, assistantId, lastResponseId, ttsVoice]
  );

  // Wire up the voice recorder hook
  const { recordingState, elapsedSeconds, isCancelling, micButtonProps, cancelRecording } = useVoiceRecorder({
    onRecordingComplete: handleVoiceRecordingComplete,
  });

  if (!hydrated) {
    return null;
  }

  // Get assistant-specific colors for the chat interface
  const assistantColors = getAssistantColors(assistantId);

  if (!sessionId) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4 py-6 text-[var(--foreground)]"
        style={{ background: assistantColors.chatBg }}
      >
        <p className="card-panel px-5 py-4 text-center">
          Session ID missing. Launch a session from the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex chat-full-height flex-col text-[var(--foreground)]"
      style={{ background: assistantColors.chatBg, height: 'var(--vvp-height, 100dvh)' }}
    >
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

      {/* TTS Warning Modal */}
      <TTSWarningModal
        isOpen={showTTSModal}
        selectedVoice={ttsVoice}
        onVoiceChange={setTtsVoice}
        onConfirm={confirmTTSEnable}
        onCancel={cancelTTSEnable}
      />

      {/* MQTT Receiver Modal */}
      <MqttReceiverModal
        isOpen={showMqttReceiverModal}
        onClose={() => setShowMqttReceiverModal(false)}
        onConnect={mqttConnect}
        onDisconnect={mqttDisconnect}
        connectionStatus={mqttStatus}
        currentTopic={mqttCurrentTopic}
        errorMessage={mqttErrorMessage}
        defaultHost={mqttCredentials?.mqtt_host}
        defaultTopic={mqttCredentials?.mqtt_topic}
        defaultUsername={mqttCredentials?.mqtt_user}
        defaultPassword={mqttCredentials?.mqtt_pass}
      />

      {/* Fixed Header */}
      <header className="flex-shrink-0 border-b-2 border-[var(--card-shell)] bg-[var(--card-fill)] px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between gap-4">
          {/* Left: Title and metadata */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-[var(--ink-dark)] sm:text-xl truncate">{title}</h1>
              {activeViewers > 0 && (
                <div
                  className="flex-shrink-0 flex items-center gap-1 text-xs text-[var(--ink-muted)] bg-[var(--card-shell)]/20 px-2 py-1 rounded-full"
                  title={viewersList.map((v: any) => v.user_email || "Anonymous").join(", ")}
                >
                  <Users className="h-3 w-3" />
                  <span>{activeViewers}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--ink-muted)] truncate mt-0.5">
              Session {sessionId?.slice(0, 8)}...
            </p>
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* TTS Toggle */}
            <button
              onClick={handleTTSToggle}
              className={`flex items-center justify-center rounded-full border-2 border-[var(--card-shell)] p-2 transition-all ${
                ttsEnabled
                  ? "bg-[var(--ink-dark)] text-[var(--card-fill)] border-[var(--ink-dark)]"
                  : "bg-transparent text-[var(--ink-dark)] hover:bg-[var(--card-shell)]/20"
              }`}
              title={ttsEnabled ? "Text-to-Speech On (click to disable)" : "Enable Text-to-Speech"}
              aria-label={ttsEnabled ? "Disable Text-to-Speech" : "Enable Text-to-Speech"}
            >
              {isTTSLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>

            {/* MQTT Receiver */}
            <button
              onClick={() => setShowMqttReceiverModal(true)}
              className={`flex items-center justify-center rounded-full border-2 p-2 transition-all ${
                mqttStatus === "connected"
                  ? "bg-green-500 text-white border-green-500"
                  : mqttStatus === "connecting"
                  ? "bg-yellow-500 text-white border-yellow-500 animate-pulse"
                  : mqttStatus === "error"
                  ? "bg-red-500 text-white border-red-500"
                  : "bg-transparent text-[var(--ink-dark)] border-[var(--card-shell)] hover:bg-[var(--card-shell)]/20"
              }`}
              title={
                mqttStatus === "connected"
                  ? `MQTT Connected: ${mqttCurrentTopic}`
                  : mqttStatus === "connecting"
                  ? "MQTT Connecting..."
                  : mqttStatus === "error"
                  ? "MQTT Error"
                  : "MQTT Receiver"
              }
              aria-label="MQTT Receiver"
            >
              <Radio className="h-4 w-4" />
            </button>

            {/* Reset */}
            <button
              onClick={handleResetConversation}
              className="flex items-center justify-center rounded-full border-2 border-[var(--card-shell)] bg-transparent p-2 text-[var(--ink-dark)] transition-all hover:bg-[var(--card-shell)]/20"
              title="Reset Conversation"
              aria-label="Reset Conversation"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            {/* Dashboard */}
            <button
              onClick={handleBackToDashboard}
              className="flex items-center gap-2 rounded-full border-2 border-[var(--card-shell)] bg-transparent px-3 py-2 text-xs text-[var(--ink-dark)] transition-all hover:bg-[var(--card-shell)]/20 sm:px-4 sm:text-sm"
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
                  {message.isVoiceMessage && message.audioUrl ? (
                    /* Voice message bubble */
                    <div>
                      <VoiceMessageBubble
                        audioUrl={message.audioUrl}
                        durationSeconds={message.durationSeconds ?? 0}
                        transcript={message.transcript}
                        isProcessing={message.isProcessing}
                        role={message.role}
                        accentColor={message.role === "assistant" ? assistantColors.accent : undefined}
                      />
                      <p className="mt-1 text-right text-[9px] opacity-70 sm:text-[10px]">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ) : message.isProcessing && message.role === "assistant" && !message.content ? (
                    /* Ack assistant message while processing — show typing dots */
                    <div
                      className="rounded-2xl px-3 py-2 sm:px-4 sm:py-3"
                      style={{ backgroundColor: assistantColors.accent }}
                    >
                      <div className="flex items-center gap-1">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-[var(--ink-dark)] rounded-full animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1.4s" }} />
                          <span className="w-2 h-2 bg-[var(--ink-dark)] rounded-full animate-bounce" style={{ animationDelay: "200ms", animationDuration: "1.4s" }} />
                          <span className="w-2 h-2 bg-[var(--ink-dark)] rounded-full animate-bounce" style={{ animationDelay: "400ms", animationDuration: "1.4s" }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Regular text bubble */
                    <div
                      className={`rounded-2xl px-3 py-2 sm:px-4 sm:py-3 ${
                        message.role === "user"
                          ? "bg-[var(--ink-dark)] text-[var(--card-fill)]"
                          : "text-[var(--ink-dark)]"
                      }`}
                      style={message.role === "assistant" ? { backgroundColor: assistantColors.accent } : undefined}
                    >
                      <p className="text-sm leading-relaxed sm:text-base flex items-center gap-2">
                        {message.content}
                        {message.isProcessing && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-70 animate-pulse" />
                        )}
                      </p>
                      <p className="mt-1 text-right text-[9px] opacity-70 sm:text-[10px]">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                    </div>
                  )}
                  {message.mqttFailed && (
                    <div className="flex items-center gap-1 px-2 py-1 text-xs text-[#8b3b00] bg-[#fff0dc] rounded-lg border border-[#ffb347]">
                      <span className="text-[10px]">⚠️</span>
                      <span>MQTT publish failed</span>
                    </div>
                  )}
                  {/* Like/Dislike buttons for assistant messages (not processing) */}
                  {message.role === "assistant" && !message.isProcessing && (
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
                  <div
                    className="rounded-2xl px-3 py-2 sm:px-4 sm:py-3"
                    style={{ backgroundColor: assistantColors.accent }}
                  >
                    <div className="flex items-center gap-1">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-[var(--ink-dark)] rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.4s' }}></span>
                        <span className="w-2 h-2 bg-[var(--ink-dark)] rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.4s' }}></span>
                        <span className="w-2 h-2 bg-[var(--ink-dark)] rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.4s' }}></span>
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
        <div className="flex-shrink-0 border-t-2 border-[var(--card-shell)] bg-[var(--card-fill)] chat-input-safe">
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
            ) : (recordingState === "recording" || recordingState === "cancelling" || recordingState === "requesting") ? (
              /* ── Recording mode: full-bar takeover, WhatsApp-style ── */
              <div className="mx-auto max-w-3xl flex items-center gap-3">
                {/* Trash / cancel button on the left — tap to discard */}
                <button
                  type="button"
                  onClick={cancelRecording}
                  className={`flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200 ${isCancelling ? "bg-red-500 text-white scale-110" : "bg-[var(--card-shell)] text-[var(--ink-muted)] hover:bg-red-100 hover:text-red-500"}`}
                  aria-label="Discard recording"
                >
                  <Trash2 className="h-5 w-5" />
                </button>

                {/* Center: slide-to-cancel hint + waveform + timer */}
                <div className="flex-1 flex flex-col items-center gap-1">
                  {isCancelling ? (
                    <span className="text-sm font-medium text-red-500">Release to discard</span>
                  ) : (
                    <>
                      {/* Decorative animated waveform */}
                      <div className="flex items-center gap-[3px] h-7">
                        {[3,5,8,5,9,6,4,7,10,6,8,4,6,9,5,7,4,6,8,5].map((h, i) => (
                          <span
                            key={i}
                            className="w-[3px] rounded-full bg-red-500 animate-pulse"
                            style={{
                              height: `${h * 2}px`,
                              animationDelay: `${(i * 80) % 600}ms`,
                              animationDuration: `${600 + (i * 50) % 400}ms`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-red-500 font-semibold">
                          {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")}
                        </span>
                        <span className="text-xs text-[var(--ink-muted)]">← slide to cancel</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Mic button — tap to send, slide left to cancel */}
                <button
                  type="button"
                  title="Tap to send"
                  className={`flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-full transition-all duration-200 select-none touch-none shadow-lg ${
                    isCancelling
                      ? "bg-red-200 text-red-500 scale-95"
                      : "bg-red-500 text-white scale-110 animate-pulse"
                  }`}
                  {...micButtonProps}
                >
                  <Mic className="h-6 w-6" />
                </button>
              </div>
            ) : (
              /* ── Normal mode: text input + mic + send ── */
              <form onSubmit={handleSend} className="mx-auto max-w-3xl">
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Input field */}
                  <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Message..."
                    className="min-w-0 flex-1 rounded-full border-2 border-[var(--card-shell)] bg-white px-4 py-2.5 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--ink-dark)] sm:px-5 sm:py-3"
                    autoComplete="off"
                  />

                  {/* Mic button (idle) — shown when input is empty, replaces send */}
                  {!input.trim() ? (
                    <button
                      type="button"
                      disabled={isAiResponding}
                      className="flex-shrink-0 flex flex-col items-center justify-center w-11 h-11 rounded-full bg-[var(--ink-dark)] text-[var(--card-fill)] transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed select-none touch-none"
                      title="Tap to record voice message"
                      {...micButtonProps}
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="flex-shrink-0 rounded-full bg-[var(--ink-dark)] p-2.5 text-[var(--card-fill)] transition-all hover:scale-105 sm:px-4 sm:py-3"
                      aria-label="Send message"
                    >
                      <Send className="h-5 w-5 sm:h-5 sm:w-5" />
                    </button>
                  )}
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
