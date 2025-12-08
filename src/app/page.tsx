"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Download,
  Link as LinkIcon,
  PauseCircle,
  PlayCircle,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  TOKEN_STORAGE_KEY,
  AssistantRecord,
  MessageRecord,
  MqttLogRecord,
  assistantApi,
  authApi,
  sessionApi,
} from "@/lib/api";

type ConfigSection = "prompt" | "schema" | "mqtt" | "apiKey";
type AssistantStatus = "idle" | "running";
type EditableField =
  | "name"
  | "promptInstruction"
  | "jsonSchema"
  | "mqttHost"
  | "mqttPort"
  | "mqttUser"
  | "mqttPass"
  | "mqttTopic"
  | "apiKey";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type Assistant = {
  id: number;
  name: string;
  promptInstruction: string;
  jsonSchema: string;
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
  activeSessionId?: number;
  shareToken?: string;
  lastSessionId?: number;
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
    isComplete: (assistant) => assistant.jsonSchema.trim().length > 0,
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

const fieldToPayload: Record<EditableField, string> = {
  name: "name",
  promptInstruction: "prompt_instruction",
  jsonSchema: "json_schema",
  mqttHost: "mqtt_host",
  mqttPort: "mqtt_port",
  mqttUser: "mqtt_user",
  mqttPass: "mqtt_pass",
  mqttTopic: "mqtt_topic",
  apiKey: "api_key",
};

const formatAssistant = (record: AssistantRecord): Assistant => ({
  id: record.id,
  name: record.name,
  promptInstruction: record.prompt_instruction ?? "",
  jsonSchema: record.json_schema ?? "",
  mqttHost: record.mqtt_host ?? "",
  mqttPort: String(record.mqtt_port ?? 1883),
  mqttUser: record.mqtt_user ?? undefined,
  mqttPass: record.mqtt_pass ?? undefined,
  mqttTopic: record.mqtt_topic ?? "",
  apiKey: record.api_key ?? undefined,
  status: "idle",
  mqttConnected: false,
  lastUpdated: record.updated_at,
  mqttLog: [],
  chatHistory: [],
  shareToken: undefined,
  lastSessionId: record.latest_session_id ?? undefined,
  lastShareToken: record.latest_share_token ?? undefined,
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
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState<number | null>(null);
  const [activeConfigSection, setActiveConfigSection] = useState<ConfigSection>("prompt");
  const [copiedAssistantId, setCopiedAssistantId] = useState<number | null>(null);
  const [loadingAssistants, setLoadingAssistants] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    const storedEmail = window.localStorage.getItem("pr-auth-email");
    if (stored) {
      setAuthToken(stored);
      if (storedEmail) setUserEmail(storedEmail);
      fetchAssistants(stored);
    }
  }, []);

  const fetchAssistants = async (token = authToken) => {
    if (!token) return;
    setLoadingAssistants(true);
    try {
      const records = await assistantApi.list(token);
      const formatted = records.map(formatAssistant);
      setAssistants(formatted);
      setSelectedAssistantId((prev) => {
        if (prev && formatted.some((assistant) => assistant.id === prev)) {
          return prev;
        }
        return formatted[0]?.id ?? null;
      });
    } catch (error) {
      console.error("Unable to fetch assistants", error);
    } finally {
      setLoadingAssistants(false);
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

  const visibleSessionId =
    selectedAssistant?.activeSessionId && selectedAssistant.status === "running"
      ? selectedAssistant.activeSessionId
      : selectedAssistant?.lastSessionId;
  const visibleShareToken =
    selectedAssistant?.activeSessionId && selectedAssistant.status === "running"
      ? selectedAssistant.shareToken
      : selectedAssistant?.lastShareToken;

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

  const handleAuthSubmit = async (mode: "login" | "signup") => {
    setAuthError(null);
    try {
      const action = mode === "login" ? authApi.login : authApi.signup;
      const result = await action(authEmail, authPassword);
      setAuthToken(result.access_token);
      setUserEmail(authEmail);
      window.localStorage.setItem(TOKEN_STORAGE_KEY, result.access_token);
      window.localStorage.setItem("pr-auth-email", authEmail);
      fetchAssistants(result.access_token);
    } catch (error) {
      setAuthError("Unable to authenticate. Check your credentials.");
    }
  };

  const updateAssistantState = (assistantId: number, updater: (assistant: Assistant) => Assistant) => {
    setAssistants((prev) =>
      prev.map((assistant) =>
        assistant.id === assistantId ? updater(assistant) : assistant
      )
    );
  };

  const handleFieldChange = (assistantId: number, field: EditableField, value: string) => {
    updateAssistantState(assistantId, (assistant) => ({
      ...assistant,
      [field]: value,
      lastUpdated: new Date().toISOString(),
    }));
    if (!authToken) return;
    const payloadKey = fieldToPayload[field];
    assistantApi
      .update(assistantId, { [payloadKey]: field === "mqttPort" ? Number(value) : value }, authToken)
      .catch((error) => console.error("Failed to update assistant", error));
  };

  const handleAddAssistant = async () => {
    if (!authToken) return;
    try {
      const record = await assistantApi.create(
        {
                    name: `LLM Thing ${assistants.length + 1}`,
          prompt_instruction: "",
          json_schema: "",
          mqtt_host: "localhost",
          mqtt_topic: "topic/default",
          mqtt_port: 1883,
        },
        authToken
      );
      const formatted = formatAssistant(record);
      setAssistants((prev) => [...prev, formatted]);
      setSelectedAssistantId(record.id);
    } catch (error) {
      console.error("Failed to create assistant", error);
    }
  };

  const handleRunAssistant = async () => {
    if (!selectedAssistant || !authToken || !readyToRun) return;
    try {
      const session = await sessionApi.start(selectedAssistant.id, authToken);
      updateAssistantState(selectedAssistant.id, (assistant) => ({
        ...assistant,
        status: "running",
        mqttConnected: session.mqtt_connected ?? assistant.mqttConnected,
        activeSessionId: session.id,
        shareToken: session.share_token,
        lastSessionId: session.id,
        lastShareToken: session.share_token,
        lastUpdated: session.created_at,
      }));
      await refreshChatHistory(selectedAssistant.id, session.id);
    } catch (error) {
      console.error("Unable to start assistant", error);
    }
  };

  const handleStopAssistant = async () => {
    if (!selectedAssistant || !authToken || !selectedAssistant.activeSessionId) return;
    try {
      await sessionApi.stop(selectedAssistant.activeSessionId, authToken);
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
      console.error("Unable to stop assistant", error);
    }
  };

  const refreshChatHistory = async (assistantId: number, sessionId?: number) => {
    if (!authToken) return;
    const assistant = assistants.find((item) => item.id === assistantId);
    const targetSession = sessionId ?? assistant?.activeSessionId ?? assistant?.lastSessionId;
    if (!assistant || !targetSession) return;
    try {
      const [messages, mqttRecords] = await Promise.all([
        sessionApi.messages(targetSession, authToken),
        sessionApi.mqttLog(targetSession, authToken),
      ]);
      const mapped: ChatMessage[] = messages.map((message: MessageRecord) => ({
        id: `${message.id}`,
        role: message.role,
        content:
          message.role === "assistant"
            ? normalizeAssistantText(message.response_text)
            : message.user_text ?? "",
        timestamp: message.created_at,
      }));
      const mqttEntries: MqttLogEntry[] = mqttRecords.map((record: MqttLogRecord) => ({
        id: `${record.id}`,
        direction: "outgoing",
        payload: JSON.stringify(record.payload, null, 2),
        timestamp: record.created_at,
      }));
      updateAssistantState(assistantId, (item) => ({
        ...item,
        chatHistory: mapped,
        mqttLog: mqttEntries.reverse(),
        lastUpdated: new Date().toISOString(),
        lastSessionId: targetSession,
        lastShareToken: item.shareToken ?? item.lastShareToken,
      }));
    } catch (error) {
      console.error("Unable to load chat history", error);
    }
  };

  useEffect(() => {
    if (selectedAssistant?.activeSessionId && authToken) {
      refreshChatHistory(selectedAssistant.id);
    }
  }, [selectedAssistant?.activeSessionId, authToken]);

  useEffect(() => {
    if (selectedAssistant && authToken && selectedAssistant.lastSessionId) {
      refreshChatHistory(selectedAssistant.id, selectedAssistant.lastSessionId);
    }
  }, [selectedAssistant?.id, selectedAssistant?.lastSessionId, authToken]);

  const handleDownloadCsv = () => {
    if (!selectedAssistant || selectedAssistant.chatHistory.length === 0) return;
    const rows = selectedAssistant.chatHistory.map((message) => {
      const sanitized = message.content.replace(/"/g, '""');
      const mqttPayload = selectedAssistant.mqttLog.find((log) => log.timestamp === message.timestamp)?.payload ?? "";
      const sanitizedPayload = mqttPayload.replace(/"/g, '""');
      return `${message.timestamp},${message.role},"${sanitized}","${sanitizedPayload}"`;
    });
    const csvContent = ["timestamp,role,content,mqtt_payload", ...rows].join("\n");
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
        console.error("Unable to copy session link", fallbackError);
      }
    }
  };

  const handleRefreshMqttFeed = () => {
    if (!selectedAssistant) return;
    const sessionToUse =
      selectedAssistant.activeSessionId && selectedAssistant.status === "running"
        ? selectedAssistant.activeSessionId
        : selectedAssistant.lastSessionId;
    if (!sessionToUse) {
      console.warn("No session available to refresh MQTT feed.");
      return;
    }
    refreshChatHistory(selectedAssistant.id, sessionToUse);
  };

  const handleLogout = () => {
    setAuthToken(null);
    setUserEmail(null);
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem("pr-auth-email");
  };

  const handleDeleteAssistant = async () => {
    if (!selectedAssistant || !authToken) return;
    try {
      await assistantApi.remove(selectedAssistant.id, authToken);
      setAssistants((prev) => prev.filter((assistant) => assistant.id !== selectedAssistant.id));
      setSelectedAssistantId((prev) => {
        if (prev === selectedAssistant.id) {
          const remaining = assistants.filter((assistant) => assistant.id !== selectedAssistant.id);
          return remaining[0]?.id ?? null;
        }
        return prev;
      });
    } catch (error) {
      console.error("Failed to remove assistant", error);
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
            {authMode === "login" ? "Sign in" : "Create account"}
          </h1>
          {authError && <p className="text-sm text-red-600">{authError}</p>}
          <div className="space-y-3">
            <input
              type="email"
              placeholder="email@example.com"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              className="w-full rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white px-4 py-3 text-sm text-[var(--foreground)]"
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              className="w-full rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white px-4 py-3 text-sm text-[var(--foreground)]"
            />
            <button
              type="button"
              onClick={() => handleAuthSubmit(authMode)}
              className="w-full rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-4 py-3 text-sm font-semibold text-[var(--card-fill)]"
            >
              {authMode === "login" ? "Sign in" : "Create account"}
            </button>
            <button
              type="button"
              className="text-sm text-[var(--ink-muted)] underline"
              onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
            >
              {authMode === "login" ? "Need an account?" : "Already registered?"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasAssistants = assistants.length > 0;

  return (
    <div className="flex min-h-screen flex-col text-[var(--foreground)]">
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
      <div className="grid flex-1 grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[320px_1fr] lg:px-10">
        <aside className="card-panel flex flex-col gap-6 bg-[var(--card-fill)]/95 p-6">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">LLM things</p>
            <p className="text-xs text-[var(--ink-muted)]">Select an LLM thing to configure or run.</p>
          </div>
          <div className="flex flex-col gap-3">
          {assistants.map((assistant) => {
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
          })}
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
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">LLM thing overview</p>
              <p className="text-xs text-[var(--ink-muted)]">
                Rename the LLM thing, manage sessions, and check MQTT connection info.
              </p>
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
                <p className="text-xs text-[var(--ink-muted)]">Connection telemetry coming soon</p>
              </div>
              <div className="rounded-[20px] border-[2px] border-[var(--card-shell)] bg-white px-4 py-3 shadow-[5px_5px_0_var(--card-shell)]">
                <p className="text-xs uppercase tracking-[0.4em] text-[#0b321e]">Assistant replies</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--ink-dark)]">
                  {selectedAssistant.chatHistory.filter((msg) => msg.role === "assistant").length}
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
                    <label className="text-sm font-semibold text-[var(--foreground)]">
                      Response JSON schema
                    </label>
                    <textarea
                      value={selectedAssistant.jsonSchema}
                      onChange={(event) =>
                        handleFieldChange(selectedAssistant.id, "jsonSchema", event.target.value)
                      }
                      rows={12}
                      placeholder="Paste the schema that downstream systems expect."
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
            <button
              type="button"
              onClick={() => selectedAssistant && refreshChatHistory(selectedAssistant.id)}
              className="text-xs font-semibold text-[var(--ink-muted)] underline"
            >
              Refresh history
            </button>
            <button
              type="button"
              onClick={() => selectedAssistant && handleDownloadCsv()}
              disabled={!selectedAssistant || selectedAssistant.chatHistory.length === 0}
              className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-dark)] transition disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Download CSV
            </button>
            <button
              type="button"
              onClick={handleDeleteAssistant}
              className="flex items-center gap-2 text-xs font-semibold text-[#8b1400] underline decoration-dotted underline-offset-4 transition hover:text-[#c51c00]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove LLM thing
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
                  <span className="text-xs text-[var(--ink-muted)]">most recent first</span>
                </div>
                <div className="mt-3 max-h-72 overflow-y-auto rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white/70 p-4">
                  {selectedAssistant.mqttLog.length === 0 ? (
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
                      <Link
                        href={sessionPath}
                        className="inline-flex items-center gap-2 rounded-full border-[3px] border-[var(--card-shell)] bg-[var(--ink-dark)] px-3 py-1 text-xs font-semibold text-[var(--card-fill)]"
                      >
                        Open chat
                      </Link>
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
