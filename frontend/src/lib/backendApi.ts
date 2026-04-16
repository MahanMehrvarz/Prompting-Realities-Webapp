/**
 * Backend API client for AI operations (OpenAI, MQTT, transcription).
 * These operations cannot be performed in the browser and require server-side processing.
 */

import { logger } from "./logger";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:8000";

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
};

const authHeader = (token?: string): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {};

async function apiFetch<T>(
  path: string,
  token?: string,
  options: RequestOptions = {}
): Promise<T> {
  logger.log(`🌐 [BackendApi] Fetching ${API_BASE}${path}`);
  logger.log(`🔑 [BackendApi] Token present: ${!!token}`);
  logger.log(`📦 [BackendApi] Request options:`, options);
  
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      ...authHeader(token),
    },
  });

  logger.log(`📡 [BackendApi] Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const text = await response.text();
    logger.error(`❌ [BackendApi] Error response:`, text);
    throw new Error(text || response.statusText);
  }

  if (response.status === 204) {
    logger.log(`✅ [BackendApi] No content response (204)`);
    return undefined as T;
  }

  const data = await response.json();
  logger.log(`✅ [BackendApi] Response data:`, data);
  return data;
}

// Types
export type ChatRequest = {
  previous_response_id: string | null;
  user_message: string;
  assistant_id: string;  // Backend will fetch config from database
  session_id?: string | null;  // Session ID for persisting response_id
  thread_id?: string | null;  // Thread ID for isolating conversation context per user/device
};

export type ChatResponse = {
  payload: Record<string, any> | null;
  response_id: string | null;
  display_text: string | null;
};

export type MqttPublishRequest = {
  assistant_id: string;  // Backend will fetch MQTT config from database
  payload: Record<string, any>;
  session_id?: string | null;
};

export type MqttTestRequest = {
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
};

export type MqttResponse = {
  success: boolean;
  message?: string | null;
};

export type TranscriptionResponse = {
  text: string;
};

export type UpdateApiKeyRequest = {
  assistant_id: string;
  api_key: string;
};

export type GetApiKeyResponse = {
  has_api_key: boolean;
};

export type LogoutResponse = {
  success: boolean;
  message: string;
  sessions_stopped: number;
  mqtt_connections_closed: number;
};

export type TTSRequest = {
  text: string;
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  assistant_id: string;
  model?: "tts-1" | "tts-1-hd";
};

export type MqttCredentialsResponse = {
  mqtt_host: string | null;
  mqtt_port: number;
  mqtt_user: string | null;
  mqtt_pass: string | null;
  mqtt_topic: string | null;
};

export type VoiceMessageResult = {
  status: "pending" | "ready" | "error";
  transcript: string | null;
  response_text: string | null;
  response_payload: Record<string, any> | null;
  response_id: string | null;
  error: string | null;
};

// API methods
export const backendApi = {
  /**
   * Call OpenAI API with the provided configuration.
   * Frontend is responsible for storing the response in Supabase.
   */
  async chat(request: ChatRequest, token?: string): Promise<ChatResponse> {
    return apiFetch<ChatResponse>("/ai/chat", token, {
      method: "POST",
      body: JSON.stringify(request),
    });
  },

  /**
   * Publish a payload to an MQTT broker.
   * This is a server-side operation since browsers cannot connect to MQTT directly.
   */
  async publishMqtt(
    request: MqttPublishRequest,
    token?: string
  ): Promise<MqttResponse> {
    return apiFetch<MqttResponse>("/ai/mqtt/publish", token, {
      method: "POST",
      body: JSON.stringify(request),
    });
  },

  /**
   * Test connection to an MQTT broker without publishing.
   */
  async testMqtt(
    request: MqttTestRequest,
    token?: string
  ): Promise<MqttResponse> {
    return apiFetch<MqttResponse>("/ai/mqtt/test", token, {
      method: "POST",
      body: JSON.stringify(request),
    });
  },

  /**
   * Disconnect MQTT connections for a session.
   * Called when stopping an LLM thing to clean up broker connections.
   */
  async disconnectMqtt(
    sessionId: string,
    token?: string
  ): Promise<{ success: boolean; connections_closed: number }> {
    return apiFetch<{ success: boolean; connections_closed: number }>("/ai/mqtt/disconnect", token, {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    });
  },

  /**
   * Transcribe audio file using OpenAI Whisper API.
   * Backend fetches assistant config and API key from database.
   */
  async transcribe(
    file: File,
    assistantId: string,
    token?: string
  ): Promise<TranscriptionResponse> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("assistant_id", assistantId);

    const response = await fetch(`${API_BASE}/ai/transcribe`, {
      method: "POST",
      body: formData,
      headers: {
        ...authHeader(token),
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json() as Promise<TranscriptionResponse>;
  },

  /**
   * Update an assistant's OpenAI API key (encrypted in database).
   */
  async updateApiKey(
    request: UpdateApiKeyRequest,
    token: string
  ): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(
      "/assistants/update-api-key",
      token,
      {
        method: "POST",
        body: JSON.stringify(request),
      }
    );
  },

  /**
   * Retrieve and decrypt an assistant's OpenAI API key.
   */
  async getApiKey(
    assistantId: string,
    token: string
  ): Promise<GetApiKeyResponse> {
    return apiFetch<GetApiKeyResponse>(
      `/assistants/get-api-key/${assistantId}`,
      token,
      {
        method: "GET",
      }
    );
  },

  /**
   * Clean up all LLM resources when a user logs out.
   * Stops all active sessions and disconnects MQTT connections.
   */
  async logout(token: string): Promise<LogoutResponse> {
    return apiFetch<LogoutResponse>("/auth/logout", token, {
      method: "POST",
    });
  },

  /**
   * Convert text to speech using OpenAI TTS API.
   * Returns audio as Blob (mp3 format).
   */
  async tts(request: TTSRequest, token?: string): Promise<Blob> {
    logger.log(`🔊 [BackendApi] Calling TTS API`);
    logger.log(`📝 [BackendApi] Text length: ${request.text.length}, Voice: ${request.voice}`);

    const response = await fetch(`${API_BASE}/ai/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(token),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`❌ [BackendApi] TTS error:`, errorText);
      throw new Error(errorText || response.statusText);
    }

    logger.log(`✅ [BackendApi] TTS successful`);
    return response.blob();
  },

  /**
   * Get MQTT credentials for an assistant to use for WebSocket connection.
   */
  async getMqttCredentials(
    assistantId: string,
    token?: string
  ): Promise<MqttCredentialsResponse> {
    return apiFetch<MqttCredentialsResponse>(
      `/ai/mqtt/credentials/${assistantId}`,
      token,
      { method: "GET" }
    );
  },

  /**
   * Send a recorded audio blob to the voice-message endpoint.
   * Returns the acknowledgement text and the job message ID immediately.
   * The message ID should be polled via voiceMessageResult().
   */
  async voiceMessage(
    audioBlob: Blob,
    assistantId: string,
    options: {
      sessionId?: string | null;
      threadId?: string | null;
      previousResponseId?: string | null;
      voice?: string;
    } = {},
    token?: string
  ): Promise<{ ackText: string; messageId: string }> {
    logger.log("🎙️ [BackendApi] Sending voice message");

    const formData = new FormData();
    const mimeType = audioBlob.type || "audio/webm";
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    formData.append("file", new File([audioBlob], `voice-message.${ext}`, { type: mimeType }));
    formData.append("assistant_id", assistantId);
    if (options.sessionId) formData.append("session_id", options.sessionId);
    if (options.threadId) formData.append("thread_id", options.threadId);
    if (options.previousResponseId) formData.append("previous_response_id", options.previousResponseId);
    if (options.voice) formData.append("voice", options.voice);

    const response = await fetch(`${API_BASE}/ai/voice-message`, {
      method: "POST",
      body: formData,
      headers: {
        ...authHeader(token),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("❌ [BackendApi] voice-message error:", errorText);
      throw new Error(errorText || response.statusText);
    }

    const data = await response.json();
    logger.log(`✅ [BackendApi] Voice message sent, messageId=${data.message_id}`);
    return { ackText: data.ack_text, messageId: data.message_id };
  },

  /**
   * Poll for the result of a background voice message processing job.
   */
  async voiceMessageResult(
    messageId: string,
    token?: string
  ): Promise<VoiceMessageResult> {
    return apiFetch<VoiceMessageResult>(
      `/ai/voice-message/${messageId}/result`,
      token,
      { method: "GET" }
    );
  },
};

// ---------------------------------------------------------------------------
// Analysis API types
// ---------------------------------------------------------------------------

export type AnalysisList = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  item_count?: number;
  code_count?: number;
};

export type AnalysisListItem = {
  id: string;
  assistant_id: string;
  assistant_name: string;
  assistant_system_prompt: string;
  added_by: string;
  added_at: string;
};

export type AnalysisCodeGroup = {
  id: string;
  list_id: string;
  name: string;
  color: string;
  created_by: string;
  created_at: string;
  code_count?: number;
};

export type AnalysisCode = {
  id: string;
  list_id: string;
  group_id: string | null;
  group_name: string | null;
  name: string;
  color: string;
  description: string | null;
  created_by: string;
  created_at: string;
  usage_count?: number;
};

export type AnalysisHighlight = {
  id: string;
  list_id: string;
  thread_id: string;
  session_id: string;
  assistant_id: string;
  selected_text: string;
  message_ids: string[];
  char_start: number;
  char_end: number;
  source_field: "user_text" | "response_text" | "both";
  created_by: string;
  created_at: string;
  codes: {
    id: string;
    name: string;
    color: string;
    assigned_by: string;
    assigned_at: string;
  }[];
};

export type ThreadSummary = {
  thread_id: string;
  session_id: string;
  device_id: string | null;
  message_count: number;
  highlight_count: number;
  has_codes: boolean;
  first_message_at: string | null;
  last_message_at: string | null;
};

export type CodeHighlight = {
  kind?: "message" | "instruction";
  highlight_id: string;
  // Message highlight fields (kind === "message")
  thread_id?: string;
  session_id?: string;
  source_field?: "user_text" | "response_text" | "both";
  message_texts?: {
    message_id: string;
    user_text: string | null;
    response_text: string | null;
  }[];
  // Instruction highlight fields (kind === "instruction")
  older_version_id?: string;
  newer_version_id?: string;
  char_start?: number;
  char_end?: number;
  // Common
  assistant_id: string;
  assistant_name: string;
  selected_text: string;
  created_by: string;
  created_at: string;
  codes: { id: string; name: string; color: string }[];
};

export type AssistantBrowseItem = {
  id: string;
  name: string;
  created_at: string;
  list_memberships: string[];
  thread_count: number;
  message_count: number;
  last_used: string | null;
  instruction_version_count: number;
};

export type InstructionVersion = {
  id: string;
  assistant_id: string;
  assistant_name: string;
  instruction_text: string;
  saved_at: string;
};

export type InstructionHighlight = {
  id: string;
  list_id: string;
  assistant_id: string;
  older_version_id: string;
  newer_version_id: string;
  selected_text: string;
  char_start: number;
  char_end: number;
  created_by: string;
  created_at: string;
  codes: {
    id: string;
    name: string;
    color: string;
    assigned_by: string;
    assigned_at: string;
  }[];
};

export type ThreadConversation = {
  thread_id: string;
  assistant_id: string;
  messages: {
    id: string;
    session_id: string;
    assistant_id: string;
    user_text: string | null;
    response_text: string | null;
    created_at: string;
    reaction: string | null;
  }[];
  highlights: AnalysisHighlight[];
};

// ---------------------------------------------------------------------------
// Analysis API client
// ---------------------------------------------------------------------------

export const analysisApi = {
  // Lists
  getLists: (token: string) =>
    apiFetch<AnalysisList[]>("/analysis/lists", token, { method: "GET" }),

  createList: (body: { name: string; description?: string }, token: string) =>
    apiFetch<AnalysisList>("/analysis/lists", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getList: (listId: string, token: string) =>
    apiFetch<AnalysisList>(`/analysis/lists/${listId}`, token, { method: "GET" }),

  updateList: (listId: string, body: { name?: string; description?: string }, token: string) =>
    apiFetch<AnalysisList>(`/analysis/lists/${listId}`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteList: (listId: string, token: string) =>
    apiFetch<void>(`/analysis/lists/${listId}`, token, { method: "DELETE" }),

  // List items
  getListItems: (listId: string, token: string) =>
    apiFetch<AnalysisListItem[]>(`/analysis/lists/${listId}/items`, token, { method: "GET" }),

  addListItem: (listId: string, assistantId: string, token: string) =>
    apiFetch<AnalysisListItem>(`/analysis/lists/${listId}/items`, token, {
      method: "POST",
      body: JSON.stringify({ assistant_id: assistantId }),
    }),

  removeListItem: (listId: string, assistantId: string, token: string, opts?: { cascade?: boolean }) =>
    apiFetch<void>(
      `/analysis/lists/${listId}/items/${assistantId}${opts?.cascade ? "?cascade=true" : ""}`,
      token,
      { method: "DELETE" },
    ),

  getListItemHighlightCounts: (listId: string, assistantId: string, token: string) =>
    apiFetch<{ message_highlights: number; instruction_highlights: number; total: number }>(
      `/analysis/lists/${listId}/items/${assistantId}/highlight-counts`, token, { method: "GET" }
    ),

  // Assistants browse
  browseAssistants: (params: { search?: string; page?: number; page_size?: number; sort_by?: string; sort_dir?: string; date_from?: string; date_to?: string }, token: string) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    if (params.sort_by) qs.set("sort_by", params.sort_by);
    if (params.sort_dir) qs.set("sort_dir", params.sort_dir);
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to) qs.set("date_to", params.date_to);
    return apiFetch<{ total: number; page: number; page_size: number; items: AssistantBrowseItem[] }>(
      `/analysis/assistants?${qs}`, token, { method: "GET" }
    );
  },

  // Threads
  getThreads: (listId: string, assistantId: string, token: string) =>
    apiFetch<ThreadSummary[]>(`/analysis/lists/${listId}/assistant/${assistantId}/threads`, token, { method: "GET" }),

  getThreadsStandalone: (assistantId: string, token: string) =>
    apiFetch<ThreadSummary[]>(`/analysis/assistant/${assistantId}/threads`, token, { method: "GET" }),

  getInstructionHistory: (assistantId: string, token: string) =>
    apiFetch<InstructionVersion[]>(`/analysis/assistant/${assistantId}/instruction-history`, token, { method: "GET" }),

  // Conversation
  getThreadConversation: (listId: string, threadId: string, token: string) =>
    apiFetch<ThreadConversation>(`/analysis/lists/${listId}/thread/${threadId}`, token, { method: "GET" }),

  // Code groups
  getCodeGroups: (listId: string, token: string) =>
    apiFetch<AnalysisCodeGroup[]>(`/analysis/lists/${listId}/code-groups`, token, { method: "GET" }),

  createCodeGroup: (listId: string, body: { name: string; color?: string }, token: string) =>
    apiFetch<AnalysisCodeGroup>(`/analysis/lists/${listId}/code-groups`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateCodeGroup: (listId: string, groupId: string, body: { name?: string; color?: string }, token: string) =>
    apiFetch<AnalysisCodeGroup>(`/analysis/lists/${listId}/code-groups/${groupId}`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteCodeGroup: (listId: string, groupId: string, token: string) =>
    apiFetch<void>(`/analysis/lists/${listId}/code-groups/${groupId}`, token, { method: "DELETE" }),

  // Codes
  getCodes: (listId: string, token: string) =>
    apiFetch<AnalysisCode[]>(`/analysis/lists/${listId}/codes`, token, { method: "GET" }),

  createCode: (listId: string, body: { name: string; color?: string; description?: string; group_id?: string }, token: string) =>
    apiFetch<AnalysisCode>(`/analysis/lists/${listId}/codes`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateCode: (listId: string, codeId: string, body: { name?: string; color?: string; description?: string; group_id?: string | null }, token: string) =>
    apiFetch<AnalysisCode>(`/analysis/lists/${listId}/codes/${codeId}`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteCode: (listId: string, codeId: string, token: string) =>
    apiFetch<void>(`/analysis/lists/${listId}/codes/${codeId}`, token, { method: "DELETE" }),

  // Highlights
  createHighlight: (body: {
    list_id: string; thread_id: string; session_id: string; assistant_id: string;
    selected_text: string; message_ids: string[]; char_start: number; char_end: number;
    source_field: "user_text" | "response_text" | "both";
  }, token: string) =>
    apiFetch<AnalysisHighlight>("/analysis/highlights", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteHighlight: (highlightId: string, token: string) =>
    apiFetch<void>(`/analysis/highlights/${highlightId}`, token, { method: "DELETE" }),

  // Highlight-code assignments
  assignCode: (highlightId: string, codeId: string, token: string) =>
    apiFetch<{ id: string; highlight_id: string; code_id: string; assigned_by: string; assigned_at: string }>(
      `/analysis/highlights/${highlightId}/codes`, token, {
        method: "POST",
        body: JSON.stringify({ code_id: codeId }),
      }
    ),

  unassignCode: (highlightId: string, codeId: string, token: string) =>
    apiFetch<void>(`/analysis/highlights/${highlightId}/codes/${codeId}`, token, { method: "DELETE" }),

  getCodeHighlights: (listId: string, codeId: string, token: string) =>
    apiFetch<CodeHighlight[]>(`/analysis/lists/${listId}/codes/${codeId}/highlights`, token, { method: "GET" }),

  getListHighlights: (listId: string, codeIds: string[], token: string) =>
    apiFetch<CodeHighlight[]>(
      `/analysis/lists/${listId}/highlights${codeIds.length ? `?code_ids=${codeIds.join(",")}` : ""}`,
      token,
      { method: "GET" }
    ),

  // Instruction highlights
  createInstructionHighlight: (body: {
    list_id: string; assistant_id: string;
    older_version_id: string; newer_version_id: string;
    selected_text: string; char_start: number; char_end: number;
    code_id?: string;
  }, token: string) =>
    apiFetch<InstructionHighlight>("/analysis/instruction-highlights", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteInstructionHighlight: (highlightId: string, token: string) =>
    apiFetch<void>(`/analysis/instruction-highlights/${highlightId}`, token, { method: "DELETE" }),

  getInstructionHighlights: (assistantId: string, listId: string | null, token: string) =>
    apiFetch<InstructionHighlight[]>(
      `/analysis/assistant/${assistantId}/instruction-highlights${listId ? `?list_id=${listId}` : ""}`,
      token,
      { method: "GET" }
    ),

  // Export (returns a download URL — call via window.location or fetch+blob)
  getExportUrl: (listId: string, format: "json" | "csv") =>
    `${process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:8000"}/analysis/lists/${listId}/export?format=${format}`,
};
