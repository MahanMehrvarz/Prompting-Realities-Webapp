"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import { logger } from "@/lib/logger";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Link as LinkIcon,
  PauseCircle,
  PlayCircle,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  assistantService,
  sessionService,
  messageService,
  type Assistant as DbAssistant,
  type AssistantSession,
  type ChatMessage as DbChatMessage,
} from "@/lib/supabaseClient";
import { backendApi } from "@/lib/backendApi";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { ExportDataModal, type ExportOptions } from "@/components/ExportDataModal";
import JSZip from "jszip";

const TOKEN_STORAGE_KEY = "pr-auth-token";
const MQTT_PASS_STORAGE_PREFIX = "pr-mqtt-pass-";

type ConfigSection = "prompt" | "schema" | "mqtt" | "apiKey";
type AssistantStatus = "idle" | "running";
type EditableField =
  | "name"
  | "promptInstruction"
  | "jsonSchema"
  | "jsonSchemaText"
  | "mqttHost"
  | "mqttPort"
  | "mqttUser"
  | "mqttPass"
  | "mqttTopic"
  | "apiKey";

type ChatMessage = {
  id: string;
  content: string;
  timestamp: string;
};

type Assistant = {
  id: string;
  name: string;
  promptInstruction: string;
  jsonSchema: Record<string, any> | null;
  jsonSchemaText: string; // Raw text for editing
  mqttHost: string;
  mqttPort: string;
  mqttUser?: string;
  mqttPass?: string;
  mqttTopic: string;
  apiKey?: string;
  status: AssistantStatus;
  mqttConnected: boolean;
  lastUpdated?: string;
  mqttLog: MqttLogEntry[];
  chatHistory: ChatMessage[];
  activeSessionId?: string;
  shareToken?: string;
  lastSessionId?: string;
  lastShareToken?: string;
};

type MqttLogEntry = {
  id: string;
  direction: "incoming" | "outgoing";
  payload: string;
  timestamp: string;
};

const normalizeAssistantText = (text?: string | null) => {
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
    } else if (depth === 0 && buffer) {
      buffer += char;
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
};

const configSections: {
  id: ConfigSection;
  label: string;
  helper: string;
  isComplete: (assistant: Assistant) => boolean;
}[] = [
  {
    id: "prompt",
    label: "Prompt Instruction",
    helper: "Define how the LLM thing behaves and speaks.",
    isComplete: (assistant) => assistant.promptInstruction.trim().length > 0,
  },
  {
    id: "schema",
    label: "JSON Schema",
    helper: "Response contract for structured output.",
    isComplete: (assistant) => assistant.jsonSchema !== null && Object.keys(assistant.jsonSchema).length > 0,
  },
  {
    id: "mqtt",
    label: "MQTT",
    helper: "Broker credentials and routing.",
    isComplete: (assistant) =>
      assistant.mqttHost.trim().length > 0 &&
      assistant.mqttPort.trim().length > 0 &&
      assistant.mqttTopic.trim().length > 0,
  },
  {
    id: "apiKey",
    label: "OpenAI API Key",
    helper: "Bring your own API key.",
    isComplete: (assistant) => (assistant.apiKey ?? "").trim().length > 0,
  },
];


const DEFAULT_JSON_SCHEMA = {
  "type": "object",
  "required": [
    "answer",
    "MQTT_value"
  ],
  "properties": {
    "answer": {
      "type": "string"
    },
    "MQTT_value": {
      "type": "object",
      "required": [
        "answer"
      ],
      "properties": {
        "answer": {
          "type": "string"
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
};

const formatAssistant = (record: DbAssistant): Assistant => ({
  id: record.id,
  name: record.name,
  promptInstruction: record.prompt_instruction ?? "",
  jsonSchema: record.json_schema ?? null,
  jsonSchemaText: record.json_schema ? JSON.stringify(record.json_schema, null, 2) : JSON.stringify(DEFAULT_JSON_SCHEMA, null, 2),
  mqttHost: record.mqtt_host ?? "",
  mqttPort: String(record.mqtt_port ?? 1883),
  mqttUser: record.mqtt_user ?? undefined,
  mqttTopic: record.mqtt_topic ?? "",
  status: "idle",
  mqttConnected: false,
  lastUpdated: record.updated_at,
  mqttLog: [],
  chatHistory: [],
  shareToken: undefined,
  lastSessionId: undefined,
  lastShareToken: undefined,
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

const formatTime = (timestamp?: string) => {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return timeFormatter.format(date);
};

const formatRelativeTime = (timestamp: string) => {
  const target = new Date(timestamp).getTime();
  if (Number.isNaN(target)) return "";
  const diffMs = Date.now() - target;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes === 1) return "1 min ago";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return diffHours === 1 ? "1 hr ago" : `${diffHours} hrs ago`;
};

const assistantStatusBadge = (assistant: Assistant) => {
  if (assistant.status === "running") {
    return { label: "Running", tone: "bg-[#00d692] text-[#013022]" };
  }
  if (configSections.every((section) => section.isComplete(assistant))) {
    return { label: "Ready", tone: "bg-[#ffe260] text-[#1a1300]" };
  }
  return { label: "Draft", tone: "bg-[#ff9d4d] text-[#2b1400]" };
};

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null);
  const [activeConfigSection, setActiveConfigSection] = useState<ConfigSection>("prompt");
  const [copiedAssistantId, setCopiedAssistantId] = useState<string | null>(null);
  const [loadingAssistants, setLoadingAssistants] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [loadingMqttLog, setLoadingMqttLog] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdminStatus, setCheckingAdminStatus] = useState(true);
  const [testingMqtt, setTestingMqtt] = useState(false);
  const [mqttTestResult, setMqttTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setHydrated(true);
    
    // Check for redirect parameter in URL
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");
      if (redirect) {
        setRedirectPath(redirect);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    // Check for existing Supabase session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && isMounted) {
        setAuthToken(session.access_token);
        setUserEmail(session.user.email ?? null);
        window.localStorage.setItem(TOKEN_STORAGE_KEY, session.access_token);
        if (session.user.email) {
          window.localStorage.setItem("pr-auth-email", session.user.email);
          
          // Check admin status
          try {
            const { data: adminData } = await supabase
              .from("admin_emails")
              .select("email")
              .eq("email", session.user.email)
              .maybeSingle();
            
            setIsAdmin(!!adminData);
          } catch (error) {
            logger.error("Error checking admin status:", error);
          }
        }
        setCheckingAdminStatus(false);
        
        // Only fetch assistants on initial mount, not on every tab switch
        if (assistants.length === 0 && !initialLoadComplete) {
          fetchAssistants();
        }
      } else {
        setCheckingAdminStatus(false);
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      
      if (session) {
        setAuthToken(session.access_token);
        setUserEmail(session.user.email ?? null);
        window.localStorage.setItem(TOKEN_STORAGE_KEY, session.access_token);
        if (session.user.email) {
          window.localStorage.setItem("pr-auth-email", session.user.email);
        }
        // Only fetch assistants if we don't have any yet AND haven't loaded before
        if (assistants.length === 0 && !initialLoadComplete) {
          fetchAssistants();
        }
      } else {
        setAuthToken(null);
        setUserEmail(null);
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        window.localStorage.removeItem("pr-auth-email");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [assistants.length, initialLoadComplete]);

  const fetchAssistants = async () => {
    // Only show loading skeleton on initial load
    if (!initialLoadComplete) {
      setLoadingAssistants(true);
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const records = await assistantService.list(user.id);
      const formatted = await Promise.all(records.map(async (record) => {
        const assistant = formatAssistant(record);
        
        // Check if API key exists in database (encrypted) - use current authToken from state
        const currentToken = authToken || window.localStorage.getItem(TOKEN_STORAGE_KEY);
        if (currentToken) {
          try {
            const apiKeyResponse = await backendApi.getApiKey(assistant.id, currentToken);
            if (apiKeyResponse.has_api_key) {
              // Set a placeholder to indicate API key exists
              assistant.apiKey = "••••••••••••••••••••••••••••••••••••••••••••••••••";
            }
          } catch (error) {
            logger.error(`Failed to check API key for assistant ${assistant.id}`, error);
          }
        }
        
        // Load MQTT password from localStorage (still stored locally)
        const storedMqttPass = window.localStorage.getItem(`${MQTT_PASS_STORAGE_PREFIX}${assistant.id}`);
        if (storedMqttPass) {
          assistant.mqttPass = storedMqttPass;
        }
        
        // Check for active or latest session
        try {
          const latestSession = await sessionService.getLatestForAssistant(assistant.id);
          if (latestSession) {
            assistant.lastSessionId = latestSession.id;
            assistant.lastShareToken = latestSession.share_token;
            
            // If session is active, set it as running
            if (latestSession.active && latestSession.status === "running") {
              assistant.status = "running";
              assistant.activeSessionId = latestSession.id;
              assistant.shareToken = latestSession.share_token;
              assistant.mqttConnected = latestSession.mqtt_connected;
            }
          }
        } catch (error) {
          logger.error(`Failed to fetch session for assistant ${assistant.id}`, error);
        }
        
        return assistant;
      }));
      
      // Update assistants state, preserving chat history, MQTT log, and unsaved edits for existing assistants
      setAssistants((prevAssistants) => {
        return formatted.map((newAssistant) => {
          const existingAssistant = prevAssistants.find((a) => a.id === newAssistant.id);
          if (existingAssistant) {
            // Preserve chat history, MQTT log, and any unsaved configuration changes
            return {
              ...newAssistant,
              // Preserve in-memory data
              chatHistory: existingAssistant.chatHistory,
              mqttLog: existingAssistant.mqttLog,
              // Preserve unsaved edits (use existing values if they differ from DB)
              name: existingAssistant.name,
              promptInstruction: existingAssistant.promptInstruction,
              jsonSchemaText: existingAssistant.jsonSchemaText,
              mqttHost: existingAssistant.mqttHost,
              mqttPort: existingAssistant.mqttPort,
              mqttUser: existingAssistant.mqttUser,
              mqttTopic: existingAssistant.mqttTopic,
              // Keep localStorage values (MQTT password) and preserve API key from backend
              mqttPass: existingAssistant.mqttPass,
              // Use the newly fetched API key from backend (newAssistant already has it)
              apiKey: newAssistant.apiKey,
            };
          }
          return newAssistant;
        });
      });
      
      setSelectedAssistantId((prev) => {
        if (prev && formatted.some((assistant) => assistant.id === prev)) {
          return prev;
        }
        return formatted[0]?.id ?? null;
      });
    } catch (error) {
      logger.error("Unable to fetch assistants", error);
    } finally {
      setLoadingAssistants(false);
      setInitialLoadComplete(true);
    }
  };

  const selectedAssistant = useMemo(
    () => assistants.find((assistant) => assistant.id === selectedAssistantId) ?? null,
    [assistants, selectedAssistantId]
  );

  const missingRequirements = useMemo(() => {
    if (!selectedAssistant) return configSections.map((section) => section.label);
    return configSections
      .filter((section) => !section.isComplete(selectedAssistant))
      .map((section) => section.label);
  }, [selectedAssistant]);

  const readyToRun =
    !!selectedAssistant && missingRequirements.length === 0 && !!selectedAssistant.apiKey;

  // Only show session link when assistant is running
  const visibleSessionId =
    selectedAssistant?.status === "running" && selectedAssistant.activeSessionId
      ? selectedAssistant.activeSessionId
      : null;
  const visibleShareToken =
    selectedAssistant?.status === "running" && selectedAssistant.shareToken
      ? selectedAssistant.shareToken
      : null;

  const sessionPath =
    selectedAssistant && visibleSessionId && visibleShareToken
      ? `/chat/${selectedAssistant.id}?session=${visibleSessionId}&name=${encodeURIComponent(
          selectedAssistant.name
        )}&share=${visibleShareToken}`
      : "";
  const runtimeOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const sessionUrl = sessionPath ? `${runtimeOrigin}${sessionPath}` : "";
  const readyBadge = selectedAssistant ? assistantStatusBadge(selectedAssistant) : null;

  const handleAuthSubmit = async () => {
    setAuthError(null);
    setAuthSuccess(false);
    
    if (!authEmail || !authEmail.includes('@')) {
      setAuthError("Please enter a valid email address.");
      return;
    }
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: {
          emailRedirectTo: redirectPath 
            ? `${window.location.origin}${redirectPath}`
            : window.location.origin,
        },
      });
      
      if (error) throw error;
      
      setAuthSuccess(true);
      setAuthError(null);
    } catch (error) {
      logger.error("Magic link error:", error);
      setAuthError("Unable to send magic link. Please check your email address and try again.");
    }
  };

  const updateAssistantState = (assistantId: string, updater: (assistant: Assistant) => Assistant) => {
    setAssistants((prev) =>
      prev.map((assistant) =>
        assistant.id === assistantId ? updater(assistant) : assistant
      )
    );
  };

  const handleFieldChange = async (assistantId: string, field: EditableField, value: string) => {
    // Store raw value in local state - no auto-save
    updateAssistantState(assistantId, (assistant) => ({
      ...assistant,
      [field]: value,
      lastUpdated: new Date().toISOString(),
    }));
    
    // Save API key to database (encrypted) when it changes
    if (field === "apiKey" && value.trim() && authToken) {
      try {
        await backendApi.updateApiKey({
          assistant_id: assistantId,
          api_key: value,
        }, authToken);
      } catch (error) {
        logger.error("Failed to save API key", error);
      }
    }
    
    // Save MQTT password to localStorage when it changes (per assistant)
    if (field === "mqttPass" && value.trim()) {
      window.localStorage.setItem(`${MQTT_PASS_STORAGE_PREFIX}${assistantId}`, value);
    }
  };

  const saveAssistantNow = async (assistantId: string, validateSchema = false) => {
    setSaveError(null);
    setSaveSuccess(false);
    
    const assistant = assistants.find((a) => a.id === assistantId);
    if (!assistant) return false;
    
    // Parse and validate JSON schema
    let parsedSchema: Record<string, any> | null = null;
    if (assistant.jsonSchemaText.trim()) {
      try {
        parsedSchema = JSON.parse(assistant.jsonSchemaText);
      } catch (error) {
        if (validateSchema) {
          setSaveError("Invalid JSON schema. Please fix the syntax before saving.");
          return false;
        }
      }
    }
    
    try {
      await assistantService.update(assistantId, {
        name: assistant.name,
        prompt_instruction: assistant.promptInstruction,
        json_schema: parsedSchema,
        mqtt_host: assistant.mqttHost,
        mqtt_port: Number(assistant.mqttPort),
        mqtt_user: assistant.mqttUser || null,
        mqtt_pass: assistant.mqttPass || null,
        mqtt_topic: assistant.mqttTopic,
      });
      
      // Update local state with parsed schema
      updateAssistantState(assistantId, (a) => ({
        ...a,
        jsonSchema: parsedSchema,
      }));
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return true;
    } catch (error) {
      logger.error("Failed to save assistant", error);
      setSaveError("Failed to save configuration. Please try again.");
      return false;
    }
  };

  const handleAddAssistant = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const record = await assistantService.create({
        supabase_user_id: user.id,
        name: `LLM Thing ${assistants.length + 1}`,
        prompt_instruction: "",
        json_schema: null,
        mqtt_host: "localhost",
        mqtt_topic: "topic/default",
        mqtt_port: 1883,
        mqtt_user: null,
        mqtt_pass: null,
      });
      const formatted = formatAssistant(record);
      setAssistants((prev) => [...prev, formatted]);
      setSelectedAssistantId(record.id);
    } catch (error) {
      logger.error("Failed to create assistant", error);
    }
  };

  const handleRunAssistant = async () => {
    if (!selectedAssistant || !authToken || !readyToRun) return;
    
    // Save and validate before running
    const saved = await saveAssistantNow(selectedAssistant.id, true);
    if (!saved) return;
    
    try {
      // Test MQTT connection first
      const mqttTestResult = await backendApi.testMqtt({
        host: selectedAssistant.mqttHost,
        port: Number(selectedAssistant.mqttPort),
        username: selectedAssistant.mqttUser || null,
        password: selectedAssistant.mqttPass || null,
      }, authToken);
      
      // Check if there's an existing session for this assistant
      let session;
      const existingSession = await sessionService.getLatestForAssistant(selectedAssistant.id);
      
      if (existingSession) {
        // Reuse existing session - just reactivate it
        session = await sessionService.update(existingSession.id, {
          status: "running",
          active: true,
          mqtt_connected: mqttTestResult.success,
        });
      } else {
        // Create new session only if none exists
        session = await sessionService.create(
          selectedAssistant.id,
          mqttTestResult.success
        );
      }
      
      updateAssistantState(selectedAssistant.id, (assistant) => ({
        ...assistant,
        status: "running",
        mqttConnected: mqttTestResult.success,
        activeSessionId: session.id,
        shareToken: session.share_token,
        lastSessionId: session.id,
        lastShareToken: session.share_token,
        lastUpdated: session.updated_at || session.created_at,
      }));
      await refreshChatHistory(selectedAssistant.id);
    } catch (error) {
      logger.error("Unable to start assistant", error);
    }
  };

  const handleStopAssistant = async () => {
    if (!selectedAssistant || !selectedAssistant.activeSessionId) return;
    try {
      await sessionService.update(selectedAssistant.activeSessionId, {
        status: "stopped",
        active: false,
      });
      updateAssistantState(selectedAssistant.id, (assistant) => ({
        ...assistant,
        status: "idle",
        mqttConnected: false,
        activeSessionId: undefined,
        shareToken: undefined,
        lastSessionId: assistant.activeSessionId ?? assistant.lastSessionId,
        lastShareToken: assistant.shareToken ?? assistant.lastShareToken,
      }));
    } catch (error) {
      logger.error("Unable to stop assistant", error);
    }
  };

  const refreshChatHistory = async (assistantId: string) => {
    const assistant = assistants.find((item) => item.id === assistantId);
    if (!assistant) return;
    setLoadingMqttLog(true);
    try {
      const [messages, mqttRecords] = await Promise.all([
        messageService.listByAssistant(assistantId),
        messageService.getMqttLog(assistantId),
      ]);
      const mapped: ChatMessage[] = messages.map((message: DbChatMessage) => ({
        id: `${message.id}`,
        content: message.user_text ?? "",
        timestamp: message.created_at,
      }));
      const mqttEntries: MqttLogEntry[] = mqttRecords.map((record: any) => ({
        id: `${record.id}`,
        direction: "outgoing",
        payload: typeof record.mqtt_payload === 'string' 
          ? record.mqtt_payload 
          : JSON.stringify(record.mqtt_payload, null, 2),
        timestamp: record.created_at,
      }));
      
      // Don't reverse - keep chronological order (oldest first, newest last)
      updateAssistantState(assistantId, (item) => ({
        ...item,
        chatHistory: mapped,
        mqttLog: mqttEntries,
        lastUpdated: new Date().toISOString(),
        lastSessionId: item.lastSessionId,
        lastShareToken: item.shareToken ?? item.lastShareToken,
      }));
    } catch (error) {
      logger.error("Unable to load chat history", error);
    } finally {
      setLoadingMqttLog(false);
    }
  };

  // Load chat history when assistant is selected or session changes
  useEffect(() => {
    if (!selectedAssistant || !authToken) return;
    
    // Only refresh if there's an active session or a last session to load from
    if (selectedAssistant.activeSessionId || selectedAssistant.lastSessionId) {
      refreshChatHistory(selectedAssistant.id);
    }
  }, [selectedAssistant?.id, authToken]);

  const handleExportData = async (options: ExportOptions, format: "csv" | "json") => {
    try {
      // Fetch all data from database
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email) {
        alert("Authentication required. Please log in again.");
        return;
      }

      // Verify admin status before exporting
      try {
        const { data: adminData, error: adminError } = await supabase
          .from("admin_emails")
          .select("email")
          .eq("email", user.email)
          .maybeSingle();
        
        if (adminError) throw adminError;
        
        if (!adminData) {
          alert("Access denied. You do not have permission to export data.");
          return;
        }
      } catch (error) {
        logger.error("Error verifying admin status:", error);
        alert("Failed to verify admin permissions. Please try again.");
        return;
      }

      // Fetch ALL assistants including deleted ones
      const { data: allAssistants, error: assistantsError } = await supabase
        .from("assistants")
        .select("*")
        .order("created_at", { ascending: false });

      if (assistantsError) throw assistantsError;
      
      // Fetch all sessions and messages for each assistant
      const sessionsWithMessages = await Promise.all(
        (allAssistants || []).map(async (assistant) => {
          const sessions = await supabase
            .from("assistant_sessions")
            .select("*")
            .eq("assistant_id", assistant.id)
            .order("created_at", { ascending: false });

          const messages = await supabase
            .from("chat_messages")
            .select("*")
            .eq("assistant_id", assistant.id)
            .order("created_at", { ascending: true });

          return {
            assistant,
            sessions: sessions.data || [],
            messages: messages.data || [],
            userId: assistant.supabase_user_id,
          };
        })
      );

      if (format === "csv") {
        await exportAsCSV(sessionsWithMessages, options);
      } else {
        await exportAsJSON(sessionsWithMessages, options);
      }
    } catch (error) {
      logger.error("Export failed:", error);
      alert("Failed to export data. Please try again.");
    }
  };

  const exportAsCSV = async (
    data: any[],
    options: ExportOptions
  ) => {
    const zip = new JSZip();

    // Build messages CSV - grouped by thread_id
    const messageHeaders: string[] = ["thread_id"];
    if (options.messages.timestamp) messageHeaders.push("timestamp");
    if (options.messages.assistantId) messageHeaders.push("assistant_id");
    if (options.messages.userMessage) messageHeaders.push("user_message");
    if (options.messages.assistantResponse) messageHeaders.push("assistant_response");
    if (options.messages.jsonPayload) messageHeaders.push("json_payload");
    if (options.messages.mqttPayload) messageHeaders.push("mqtt_payload");

    const messageRows: string[] = [messageHeaders.join(",")];

    data.forEach(({ messages }) => {
      messages.forEach((msg: any) => {
        const row: string[] = [msg.thread_id || "no-thread"];
        if (options.messages.timestamp) row.push(msg.created_at || "");
        if (options.messages.assistantId) row.push(msg.assistant_id || "");
        if (options.messages.userMessage) {
          const sanitized = (msg.user_text || "").replace(/"/g, '""').replace(/\n/g, " ");
          row.push(`"${sanitized}"`);
        }
        if (options.messages.assistantResponse) {
          const sanitized = (msg.response_text || "").replace(/"/g, '""').replace(/\n/g, " ");
          row.push(`"${sanitized}"`);
        }
        if (options.messages.jsonPayload) {
          const sanitized = JSON.stringify(msg.assistant_payload || {}).replace(/"/g, '""');
          row.push(`"${sanitized}"`);
        }
        if (options.messages.mqttPayload) {
          const sanitized = JSON.stringify(msg.mqtt_payload || {}).replace(/"/g, '""');
          row.push(`"${sanitized}"`);
        }
        messageRows.push(row.join(","));
      });
    });

    zip.file("messages.csv", messageRows.join("\n"));

    // Build sessions CSV
    const sessionHeaders: string[] = ["session_id"];
    if (options.session.userEmail) sessionHeaders.push("user_email");
    if (options.session.assistantName) sessionHeaders.push("assistant_name");
    if (options.session.numberOfMessages) sessionHeaders.push("number_of_messages");
    if (options.session.jsonSchema) sessionHeaders.push("json_schema");
    if (options.session.mqttTopic) sessionHeaders.push("mqtt_topic");

    const sessionRows: string[] = [sessionHeaders.join(",")];

    data.forEach(({ assistant, sessions, messages, userId }) => {
      sessions.forEach((session: any) => {
        const sessionMessages = messages.filter((m: any) => m.session_id === session.id);
        const row: string[] = [session.id];
        if (options.session.userEmail) row.push(userId || "unknown");
        if (options.session.assistantName) row.push(`"${assistant.name.replace(/"/g, '""')}"`);
        if (options.session.numberOfMessages) row.push(String(sessionMessages.length));
        if (options.session.jsonSchema) {
          const sanitized = JSON.stringify(assistant.json_schema || {}).replace(/"/g, '""');
          row.push(`"${sanitized}"`);
        }
        if (options.session.mqttTopic) row.push(assistant.mqtt_topic || "");
        sessionRows.push(row.join(","));
      });
    });

    zip.file("sessions.csv", sessionRows.join("\n"));

    // Generate and download ZIP
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prompting-realities-export-${new Date().toISOString().split("T")[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportAsJSON = async (
    data: any[],
    options: ExportOptions
  ) => {
    // Group data by user_id first
    const userGroups = data.reduce((acc: any, { assistant, sessions, messages, userId }) => {
      if (!acc[userId]) {
        acc[userId] = {
          user_id: userId,
          llm_things: []
        };
      }
      
      // Find or create LLM thing entry for this user
      let llmThing = acc[userId].llm_things.find((thing: any) => thing.assistant_id === assistant.id);
      if (!llmThing) {
        llmThing = {
          assistant_id: assistant.id,
          assistant_name: assistant.name,
          json_schema: assistant.json_schema,
          mqtt_topic: assistant.mqtt_topic,
          sessions: []
        };
        acc[userId].llm_things.push(llmThing);
      }
      
      // Add sessions to this LLM thing
      sessions.forEach((session: any) => {
        const sessionMessages = messages.filter((m: any) => m.session_id === session.id);
        
        // Group messages by thread_id
        const messagesByThread = sessionMessages.reduce((threadAcc: any, msg: any) => {
          const threadId = msg.thread_id || "no-thread";
          if (!threadAcc[threadId]) {
            threadAcc[threadId] = [];
          }
          threadAcc[threadId].push(msg);
          return threadAcc;
        }, {});
        
        const sessionData: any = {
          session_id: session.id,
        };

        if (options.session.numberOfMessages) sessionData.number_of_messages = sessionMessages.length;

        // Add threads array to session, each thread contains its messages
        sessionData.threads = Object.entries(messagesByThread).map(([threadId, threadMessages]: [string, any]) => ({
          thread_id: threadId,
          message_count: threadMessages.length,
          messages: threadMessages.map((msg: any) => {
            const messageData: any = {};
            if (options.messages.timestamp) messageData.timestamp = msg.created_at;
            if (options.messages.assistantId) messageData.assistant_id = msg.assistant_id;
            if (options.messages.userMessage) messageData.user_message = msg.user_text;
            if (options.messages.assistantResponse) messageData.assistant_response = msg.response_text;
            if (options.messages.jsonPayload) messageData.json_payload = msg.assistant_payload;
            if (options.messages.mqttPayload) messageData.mqtt_payload = msg.mqtt_payload;
            return messageData;
          })
        }));

        llmThing.sessions.push(sessionData);
      });
      
      return acc;
    }, {});

    // Convert to array format: Users -> LLM Things -> Sessions -> Threads -> Messages
    const exportData = Object.values(userGroups);

    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prompting-realities-export-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    if (!selectedAssistant || selectedAssistant.chatHistory.length === 0) return;
    const rows = selectedAssistant.chatHistory.map((message) => {
      const sanitized = message.content.replace(/"/g, '""');
      const mqttPayload = selectedAssistant.mqttLog.find((log) => log.timestamp === message.timestamp)?.payload ?? "";
      const sanitizedPayload = mqttPayload.replace(/"/g, '""');
      return `${message.timestamp},"${sanitized}","${sanitizedPayload}"`;
    });
    const csvContent = ["timestamp,content,mqtt_payload", ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedAssistant.name.replace(/\s+/g, "-")}-history.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyLink = async () => {
    if (!sessionUrl) return;
    try {
      await navigator.clipboard.writeText(sessionUrl);
      if (selectedAssistant) {
        setCopiedAssistantId(selectedAssistant.id);
        setTimeout(() => setCopiedAssistantId(null), 2000);
      }
    } catch (error) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = sessionUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        if (selectedAssistant) {
          setCopiedAssistantId(selectedAssistant.id);
          setTimeout(() => setCopiedAssistantId(null), 2000);
        }
      } catch (fallbackError) {
        logger.error("Unable to copy session link", fallbackError);
      }
    }
  };

  const handleRefreshMqttFeed = () => {
    if (!selectedAssistant) return;
    refreshChatHistory(selectedAssistant.id);
  };

  const handleTestMqttConnection = async () => {
    if (!selectedAssistant || !authToken) return;
    
    setTestingMqtt(true);
    setMqttTestResult(null);
    
    try {
      const result = await backendApi.testMqtt({
        host: selectedAssistant.mqttHost,
        port: Number(selectedAssistant.mqttPort),
        username: selectedAssistant.mqttUser || null,
        password: selectedAssistant.mqttPass || null,
      }, authToken);
      
      setMqttTestResult({
        success: result.success,
        message: result.success 
          ? `Successfully connected to ${selectedAssistant.mqttHost}:${selectedAssistant.mqttPort}` 
          : result.message || "Connection failed"
      });
    } catch (error) {
      logger.error("MQTT test failed", error);
      setMqttTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed"
      });
    } finally {
      setTestingMqtt(false);
      // Clear the result after 5 seconds
      setTimeout(() => setMqttTestResult(null), 5000);
    }
  };

  const handleLogout = async () => {
    try {
      // Call backend to cleanup LLM resources before logging out
      if (authToken) {
        try {
          const logoutResponse = await backendApi.logout(authToken);
          logger.log(`🧹 Cleaned up ${logoutResponse.sessions_stopped} sessions and ${logoutResponse.mqtt_connections_closed} MQTT connections`);
        } catch (error) {
          logger.error("Failed to cleanup LLM resources on logout:", error);
          // Continue with logout even if cleanup fails
        }
      }
    } finally {
      // Always sign out from Supabase and clear local state
      await supabase.auth.signOut();
      setAuthToken(null);
      setUserEmail(null);
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.localStorage.removeItem("pr-auth-email");
    }
  };

  const handleDeleteAssistant = async () => {
    if (!selectedAssistant) return;
    try {
      // Stop the session if it's running before deleting
      if (selectedAssistant.status === "running" && selectedAssistant.activeSessionId) {
        await sessionService.update(selectedAssistant.activeSessionId, {
          status: "stopped",
          active: false,
        });
      }
      
      // Soft delete the assistant
      await assistantService.delete(selectedAssistant.id);
      
      // Remove from UI
      setAssistants((prev) => prev.filter((assistant) => assistant.id !== selectedAssistant.id));
      setSelectedAssistantId((prev) => {
        if (prev === selectedAssistant.id) {
          const remaining = assistants.filter((assistant) => assistant.id !== selectedAssistant.id);
          return remaining[0]?.id ?? null;
        }
        return prev;
      });
    } catch (error) {
      logger.error("Failed to remove assistant", error);
    }
  };

  const readyBadgeTone = readyBadge?.tone ?? "";

  if (!hydrated) {
    return null;
  }

  if (!authToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05c46b] p-6 text-[var(--foreground)]">
        <div className="card-panel max-w-md w-full space-y-4 p-6">
          <p className="panel-strip inline-block px-4 py-1 text-[10px] uppercase tracking-[0.4em] text-[var(--card-fill)]">
            Prompting Realities
          </p>
          <h1 className="text-2xl font-semibold text-[var(--ink-dark)]">
            Sign in
          </h1>
          {redirectPath && (
            <p className="text-sm text-[var(--ink-muted)]">
              Sign in to access the chat session
            </p>
          )}
          {authError && (
            <div className="flex items-center gap-2 rounded-[20px] border-[3px] border-[#ff6b6b] bg-[#ffe6e6] px-4 py-3 text-sm text-[#4a0000]">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{authError}</span>
            </div>
          )}
          {authSuccess && (
            <div className="flex items-center gap-2 rounded-[20px] border-[3px] border-[#00d692] bg-[#e6fff5] px-4 py-3 text-sm text-[#013022]">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>Magic link sent! Check your email to sign in.</span>
            </div>
          )}
          <div className="space-y-3">
            <input
              type="email"
              placeholder="email@example.com"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleAuthSubmit();
                }
              }}
              disabled={authSuccess}
              className="w-full rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white px-4 py-3 text-sm text-[var(--foreground)] disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={handleAuthSubmit}
              disabled={authSuccess || !authEmail}
              className="w-full rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-3 text-sm font-semibold text-[var(--card-fill)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authSuccess ? "Magic link sent" : "Send magic link"}
            </button>
            <p className="text-xs text-[var(--ink-muted)] text-center">
              We'll send you a magic link to sign in without a password.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasAssistants = assistants.length > 0;

  return (
    <div className="flex min-h-screen flex-col text-[var(--foreground)]">
      <ConfirmationModal
        isOpen={showDeleteModal}
        title="Delete LLM thing?"
        message={`Are you sure you want to delete "${selectedAssistant?.name}"? This action cannot be undone. All configuration, chat history, and MQTT logs will be permanently removed.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={async () => {
          await handleDeleteAssistant();
          setShowDeleteModal(false);
        }}
        onCancel={() => setShowDeleteModal(false)}
      />
      <ExportDataModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={async (options, format) => {
          await handleExportData(options, format);
        }}
      />
      <header className="flex items-center justify-between border-b-4 border-[var(--card-shell)] bg-[var(--card-fill)] px-6 py-4 shadow-[0_6px_0_var(--card-shell)]">
        <h1 className="text-5xl font-black text-[var(--ink-dark)] uppercase tracking-[0.1em]">
          Prompting Realities
        </h1>
        <div className="flex items-center gap-3 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)] px-4 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ink-dark)] text-sm font-semibold text-[var(--card-fill)]">
            {userEmail ? userEmail.charAt(0).toUpperCase() : "?"}
          </div>
          <div className="text-sm">
            <p className="font-semibold">{userEmail ?? "Anonymous"}</p>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-[var(--ink-muted)] underline"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      {isAdmin && !checkingAdminStatus && (
        <section className="border-b-4 border-[var(--card-shell)] bg-[#fff9e6] px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--ink-dark)]">Data Export</p>
              <p className="text-xs text-[var(--ink-muted)]">
                Export all system data for analysis and backup.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-2 text-sm font-semibold text-[var(--card-fill)] shadow-[5px_5px_0_var(--shadow-deep)] transition hover:-translate-y-1"
            >
              <Download className="h-4 w-4" />
              Export Data
            </button>
          </div>
        </section>
      )}
      <div className="grid flex-1 grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[320px_1fr] lg:px-10">
        <aside className="card-panel flex flex-col gap-6 bg-[var(--card-fill)]/95 p-6">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">LLM things</p>
            <p className="text-xs text-[var(--ink-muted)]">Select an LLM thing to configure or run.</p>
          </div>
          <div className="flex flex-col gap-3">
          {loadingAssistants ? (
            <>
              <SkeletonLoader variant="assistant" />
              <SkeletonLoader variant="assistant" />
            </>
          ) : (
            assistants.map((assistant) => {
              const badge = assistantStatusBadge(assistant);
              const isSelected = assistant.id === selectedAssistant?.id;
              return (
                <button
                  key={assistant.id}
                  onClick={() => setSelectedAssistantId(assistant.id)}
                  className={`rounded-[20px] border-[3px] px-4 py-4 text-left transition-all ${
                    isSelected
                      ? "border-[var(--card-shell)] bg-white"
                      : "border-transparent bg-white/70 hover:border-[var(--card-shell)]/60"
                  }`}
                >
                  <div className="flex items-center justify-between rounded-[20px] bg-[var(--ink-dark)] px-4 py-2 text-[var(--card-fill)]">
                    <div>
                      <p className="font-semibold">{assistant.name}</p>
                      <p className="text-xs opacity-80">
                        Topic: {assistant.mqttTopic || "not set"}
                      </p>
                    </div>
                    <span
                      className={`pill-chip ${badge.tone} border-0 px-3 py-1 text-[10px] tracking-[0.2em]`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--foreground)]/70">
                    <span className="rounded-full border border-[var(--card-shell)] bg-white/80 px-3 py-1 font-semibold">
                      {assistant.chatHistory.length} msgs
                    </span>
                    <span className="rounded-full border border-[var(--card-shell)] bg-white/80 px-3 py-1 font-semibold">
                      MQTT {assistant.mqttHost ? "wired" : "pending"}
                    </span>
                  </div>
                </button>
              );
            })
          )}
          <button
            type="button"
            onClick={handleAddAssistant}
            className="mt-2 flex items-center justify-center gap-2 rounded-[20px] border-[3px] border-dashed border-[var(--card-shell)]/50 bg-transparent py-3 text-sm font-semibold text-[var(--ink-dark)] transition hover:border-[var(--card-shell)]"
          >
            <Plus className="h-4 w-4" />
            Add a new LLM thing ({assistants.length + 1})
          </button>
        </div>
      </aside>

      <main className="flex flex-col gap-6">
        {!selectedAssistant && (
          <section className="card-panel p-6 text-center">
            <h2 className="text-xl font-semibold text-[var(--ink-dark)]">No LLM things yet</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Create your first LLM thing to unlock configuration tabs and the chat interface.
            </p>
            <button
              type="button"
              onClick={handleAddAssistant}
              className="mt-6 inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-5 py-3 text-sm font-semibold text-[var(--card-fill)]"
            >
              <Plus className="h-4 w-4" />
              Create LLM thing
            </button>
          </section>
        )}
        {selectedAssistant && (
          <>
          <section className="card-panel space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">LLM thing overview</p>
                <p className="text-xs text-[var(--ink-muted)]">
                  Rename the LLM thing, manage sessions, and check MQTT connection info.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                disabled={selectedAssistant.status === "running"}
                title={selectedAssistant.status === "running" ? "Stop your LLM before deleting it" : ""}
                className="flex items-center gap-2 text-xs font-semibold text-[#8b1400] underline decoration-dotted underline-offset-4 transition hover:text-[#c51c00] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[#8b1400]"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove LLM thing
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="panel-strip mt-1 inline-flex flex-1 min-w-[240px] flex-wrap items-center gap-3 px-5 py-2 text-sm uppercase">
                <input
                  value={selectedAssistant.name}
                  disabled={selectedAssistant.status === "running"}
                  onChange={(event) =>
                    handleFieldChange(selectedAssistant.id, "name", event.target.value)
                  }
                  aria-label="Assistant name"
                  maxLength={32}
                  className="w-full max-w-[320px] min-w-[180px] flex-none border-b border-dashed border-[var(--card-fill)]/60 bg-transparent text-lg font-semibold normal-case leading-none text-[var(--card-fill)] outline-none placeholder:text-[var(--card-fill)]/60 focus:border-solid focus:border-[var(--card-fill)] disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Name your LLM thing"
                />
                <span className={`pill-chip ${readyBadgeTone}`}>
                  {selectedAssistant.status === "running"
                    ? "Live"
                    : readyToRun
                    ? "Ready"
                    : "Incomplete"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleRunAssistant}
                  disabled={!readyToRun || selectedAssistant.status === "running"}
                  className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-green)] px-5 py-2 text-sm font-semibold text-[var(--ink-dark)] shadow-[5px_5px_0_var(--shadow-deep)] transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:border-[rgba(27,27,27,0.4)] disabled:bg-[#9fb9aa] disabled:text-[#364b3e]"
                >
                  <PlayCircle className="h-4 w-4" />
                  Run LLM thing
                </button>
                {selectedAssistant.status === "running" && (
                  <button
                    type="button"
                    onClick={handleStopAssistant}
                    className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-[var(--card-fill)] shadow-[5px_5px_0_var(--shadow-deep)] transition hover:-translate-y-1"
                  >
                    <PauseCircle className="h-4 w-4" />
                    Stop run
                  </button>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--ink-muted)]">
              Last updated {formatTime(selectedAssistant.lastUpdated)}
            </p>
            <div className="grid gap-4 text-sm text-[var(--ink-muted)] sm:grid-cols-2">
              <div className="rounded-[20px] border-[2px] border-[var(--card-shell)] bg-white px-4 py-3 shadow-[5px_5px_0_var(--card-shell)]">
                <p className="text-xs uppercase tracking-[0.4em] text-[#0b321e]">MQTT routing</p>
                <p className="mt-2 text-sm text-[var(--foreground)]">
                  {selectedAssistant.mqttHost
                    ? `${selectedAssistant.mqttHost}:${selectedAssistant.mqttPort}`
                    : "Host pending"}
                </p>
                <p className="text-xs text-[var(--ink-muted)]">
                  {selectedAssistant.mqttTopic || "Topic not set"}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestMqttConnection}
                    disabled={testingMqtt || !selectedAssistant.mqttHost || !selectedAssistant.mqttPort}
                    className="flex items-center gap-2 rounded-full border-[2px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-3 py-1.5 text-xs font-semibold text-[var(--card-fill)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Activity className="h-3.5 w-3.5" />
                    {testingMqtt ? "Testing..." : "Test MQTT connection"}
                  </button>
                  {mqttTestResult && (
                    <div className={`flex items-center gap-1.5 rounded-lg border-[2px] px-2.5 py-1 text-xs ${
                      mqttTestResult.success 
                        ? "border-[#00d692] bg-[#e6fff5] text-[#013022]" 
                        : "border-[#ff6b6b] bg-[#ffe6e6] text-[#4a0000]"
                    }`}>
                      {mqttTestResult.success ? (
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      <span className="font-medium">{mqttTestResult.success ? "Connected" : "Failed"}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-[20px] border-[2px] border-[var(--card-shell)] bg-white px-4 py-3 shadow-[5px_5px_0_var(--card-shell)]">
                <p className="text-xs uppercase tracking-[0.4em] text-[#0b321e]">Assistant replies</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--ink-dark)]">
                  {selectedAssistant.chatHistory.length}
                </p>
                <p className="text-xs text-[var(--ink-muted)]">LLM responses stored in server DB</p>
              </div>
            </div>
            {!readyToRun && (
              <div className="mt-2 flex items-center gap-3 rounded-[20px] border-[3px] border-[#ffb347] bg-[#fff0dc] px-4 py-3 text-sm text-[#4a2100]">
                <AlertCircle className="h-4 w-4" />
                <span>
                  Complete {missingRequirements.join(", ")} before running this LLM thing.
                </span>
              </div>
            )}
          </section>

          <section className="card-panel space-y-6 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">Configuration studio</p>
                <p className="text-xs text-[var(--ink-muted)]">
                  Toggle between prompt, schema, MQTT, and API key inputs.
                </p>
              </div>
              <SlidersHorizontal className="h-5 w-5 text-[var(--ink-dark)]" />
            </div>
            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
              <div className="space-y-4">
                {configSections.map((section) => {
                  const complete = selectedAssistant ? section.isComplete(selectedAssistant) : false;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveConfigSection(section.id)}
                      className={`flex w-full items-center justify-between rounded-[20px] border-[3px] px-4 py-3 text-left transition ${
                        activeConfigSection === section.id
                          ? "border-[var(--card-shell)] bg-[var(--ink-dark)] text-[var(--card-fill)]"
                          : "border-[var(--card-shell)]/30 bg-white/70 text-[var(--foreground)] hover:border-[var(--card-shell)]/60"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold">{section.label}</p>
                        <p className="text-xs opacity-70">{section.helper}</p>
                      </div>
                      {complete ? (
                        <CheckCircle2
                          className={`h-4 w-4 ${
                            activeConfigSection === section.id
                              ? "text-[#8bffca]"
                              : "text-[var(--ink-muted)]"
                          }`}
                        />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-[#ff8f1c]" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white/90 p-6">
                {activeConfigSection === "prompt" && (
                  <div className="flex flex-col gap-3">
                    <label className="text-sm font-semibold text-[var(--foreground)]">
                      Prompt instructions
                    </label>
                    <textarea
                      value={selectedAssistant.promptInstruction}
                      onChange={(event) =>
                        handleFieldChange(selectedAssistant.id, "promptInstruction", event.target.value)
                      }
                      rows={10}
                      placeholder="Describe how this LLM thing should behave."
                      className="min-h-[240px] w-full rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)]/80 p-4 text-sm text-[var(--foreground)] outline-none ring-0 transition focus:border-[var(--card-shell)]"
                    />
                    <p className="text-xs text-[var(--ink-muted)]">
                      This text becomes the system instruction for the LLM thing.
                    </p>
                  </div>
                )}
                {activeConfigSection === "schema" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-semibold text-[var(--foreground)]">
                        Response JSON schema
                      </label>
                      <div className="flex items-center gap-2 rounded-full border-[2px] border-[#ffb347] bg-[#fff0dc] px-3 py-1 text-xs text-[#4a2100]">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Make sure to always include at least `answer` and `MQTT_value` in your JSON schema</span>
                      </div>
                    </div>
                    <textarea
                      value={selectedAssistant.jsonSchemaText}
                      onChange={(event) =>
                        handleFieldChange(selectedAssistant.id, "jsonSchemaText", event.target.value)
                      }
                      rows={12}
                      placeholder={`{
  "type": "object",
  "required": [
    "answer",
    "MQTT_value"
  ],
  "properties": {
    "answer": {
      "type": "string"
    },
    "MQTT_value": {
      "type": "string"
    }
  }
}`}
                      className="min-h-[260px] w-full rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)]/80 p-4 font-mono text-sm text-[var(--foreground)] outline-none focus:border-[var(--card-shell)]"
                    />
                    <p className="text-xs text-[var(--ink-muted)]">
                      Used to validate LLM thing output before publishing over MQTT.
                    </p>
                  </div>
                )}
                {activeConfigSection === "mqtt" && (
                  <div className="flex flex-col gap-4">
                    <label className="text-sm font-semibold text-[var(--foreground)]">
                      MQTT credentials
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <span className="text-xs text-[var(--ink-muted)]">Broker host</span>
                        <input
                          value={selectedAssistant.mqttHost}
                          onChange={(event) =>
                            handleFieldChange(selectedAssistant.id, "mqttHost", event.target.value)
                          }
                          placeholder="mqtt.your-broker.com"
                          className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)]/80 px-4 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--card-shell)]"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-xs text-[var(--ink-muted)]">Port</span>
                        <input
                          type="number"
                          value={selectedAssistant.mqttPort}
                          onChange={(event) =>
                            handleFieldChange(selectedAssistant.id, "mqttPort", event.target.value)
                          }
                          className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)]/80 px-4 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--card-shell)]"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-xs text-[var(--ink-muted)]">Username</span>
                        <input
                          value={selectedAssistant.mqttUser ?? ""}
                          onChange={(event) =>
                            handleFieldChange(selectedAssistant.id, "mqttUser", event.target.value)
                          }
                          placeholder="station-admin"
                          className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)]/80 px-4 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--card-shell)]"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-xs text-[var(--ink-muted)]">Password</span>
                        <input
                          type="password"
                          value={selectedAssistant.mqttPass ?? ""}
                          onChange={(event) =>
                            handleFieldChange(selectedAssistant.id, "mqttPass", event.target.value)
                          }
                          placeholder="••••••"
                          className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)]/80 px-4 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--card-shell)]"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-[var(--ink-muted)]">Topic</span>
                      <input
                        value={selectedAssistant.mqttTopic}
                        onChange={(event) =>
                          handleFieldChange(selectedAssistant.id, "mqttTopic", event.target.value)
                        }
                        placeholder="campus/bot/commands"
                        className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)]/80 px-4 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--card-shell)]"
                      />
                    </div>
                    <p className="text-xs text-[var(--ink-muted)]">
                      Credentials never leave the server. TLS is enforced automatically when port 8883 is used.
                    </p>
                  </div>
                )}
                {activeConfigSection === "apiKey" && (
                  <div className="flex flex-col gap-3">
                    <label className="text-sm font-semibold text-[var(--foreground)]">
                      OpenAI API key
                    </label>
                    <input
                      type="password"
                      value={selectedAssistant.apiKey ?? ""}
                      onChange={(event) =>
                        handleFieldChange(selectedAssistant.id, "apiKey", event.target.value)
                      }
                      placeholder="sk-..."
                      className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-[var(--card-fill)]/80 px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--card-shell)]"
                    />
                    <p className="text-xs text-[var(--ink-muted)]">
                      Each user brings their own key. We store it encrypted and only decrypt while calling OpenAI.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {saveError && (
              <p className="text-xs text-red-600">{saveError}</p>
            )}
            {saveSuccess && (
              <p className="text-xs text-green-600">Configuration saved!</p>
            )}
            <button
              type="button"
              onClick={() => selectedAssistant && saveAssistantNow(selectedAssistant.id, false)}
              className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-2 text-xs font-semibold text-[var(--card-fill)] transition hover:-translate-y-0.5"
            >
              Save
            </button>
            {/*
             <button
              type="button"
              onClick={() => selectedAssistant && refreshChatHistory(selectedAssistant.id)}
              className="text-xs font-semibold text-[var(--ink-muted)] underline"
            >
              Refresh history
            </button> 
            */}
            <button
              type="button"
              onClick={() => selectedAssistant && handleDownloadCsv()}
              disabled={!selectedAssistant || selectedAssistant.chatHistory.length === 0}
              className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-dark)] transition disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Download CSV
            </button>
          </div>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="card-panel lg:col-span-2 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">LLM thing control panel</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Monitor run health, MQTT connectivity, and download transcripts.
                  </p>
                </div>
                <Activity className="h-5 w-5 text-[var(--ink-dark)]" />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleRefreshMqttFeed}
                  className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-2 text-sm font-semibold text-[var(--card-fill)] transition hover:-translate-y-0.5"
                >
                  Refresh MQTT feed
                </button>
                <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Status updates stream over the backend APIs.
                </div>
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--foreground)]">MQTT message feed</p>
                </div>
                <div className="mt-3 max-h-120 overflow-y-auto rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white/70 p-4">
                  {loadingMqttLog ? (
                    <ul className="space-y-3">
                      <SkeletonLoader variant="mqtt-log" />
                      <SkeletonLoader variant="mqtt-log" />
                      <SkeletonLoader variant="mqtt-log" />
                    </ul>
                  ) : selectedAssistant.mqttLog.length === 0 ? (
                    <p className="text-sm text-[var(--ink-muted)]">
                      Start the LLM thing to populate MQTT activity.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {selectedAssistant.mqttLog.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-start gap-3 rounded-[20px] border-[2px] border-[var(--card-shell)] bg-white p-3"
                        >
                          <div
                            className="rounded-[20px] border-[2px] border-[var(--card-shell)] bg-[var(--ink-dark)] p-2 text-sm text-[var(--card-fill)]"
                          >
                            {entry.direction === "incoming" ? (
                              <ArrowDownRight className="h-4 w-4" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-[var(--foreground)]">{entry.payload}</p>
                            <p className="text-xs text-[var(--ink-muted)]">{formatRelativeTime(entry.timestamp)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="card-panel p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">Client access</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Session link unlocks a single live chat.
                  </p>
                </div>
                <LinkIcon className="h-4 w-4 text-[var(--ink-dark)]" />
              </div>
              {sessionPath ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white p-4 text-sm shadow-[5px_5px_0_var(--card-shell)]">
                    <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">
                      Session link
                    </p>
                    <p className="mt-2 break-all text-[var(--foreground)]">{sessionUrl}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] px-3 py-1 text-xs font-semibold text-[var(--foreground)] transition hover:bg-white"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedAssistantId === selectedAssistant.id ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (selectedAssistant) {
                            const saved = await saveAssistantNow(selectedAssistant.id, true);
                            if (saved) {
                              window.open(sessionPath, '_blank');
                            }
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-3 py-1 text-xs font-semibold text-[var(--card-fill)]"
                      >
                        Open chat
                      </button>
                    </div>
                    <p className="mt-3 flex items-center gap-2 text-xs text-[#8b3b00]">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {selectedAssistant.status === "running"
                        ? "Link locked until you stop this run to prevent multiple live sessions."
                        : "This link shows the most recent session history."}
                  </p>
                </div>
                  <div className="flex justify-center rounded-[20px] border-[3px] border-dashed border-[var(--card-shell)] bg-white/70 p-6">
                    <QRCode value={sessionUrl} bgColor="transparent" fgColor="#1d1d1d" size={180} />
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-[20px] border-[3px] border-dashed border-[var(--card-shell)]/60 bg-white/70 p-6 text-sm text-[var(--ink-muted)]">
                  Run the LLM thing to mint a live session link and QR code.
                </div>
              )}
            </div>
          </section>
          </>
        )}
        </main>
      </div>
    </div>
  );
}
