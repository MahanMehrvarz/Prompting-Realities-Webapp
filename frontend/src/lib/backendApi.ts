/**
 * Backend API client for AI operations (OpenAI, MQTT, transcription).
 * These operations cannot be performed in the browser and require server-side processing.
 */

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
  console.log(`🌐 [BackendApi] Fetching ${API_BASE}${path}`);
  console.log(`🔑 [BackendApi] Token present: ${!!token}`);
  console.log(`📦 [BackendApi] Request options:`, options);
  
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      ...authHeader(token),
    },
  });

  console.log(`📡 [BackendApi] Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ [BackendApi] Error response:`, text);
    throw new Error(text || response.statusText);
  }

  if (response.status === 204) {
    console.log(`✅ [BackendApi] No content response (204)`);
    return undefined as T;
  }

  const data = await response.json();
  console.log(`✅ [BackendApi] Response data:`, data);
  return data;
}

// Types
export type ChatRequest = {
  previous_response_id: string | null;
  user_message: string;
  assistant_id: string;  // Backend will fetch config from database
  conversation_history?: Array<{ role: string; content: string }>;  // Optional conversation history
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
};
