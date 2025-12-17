const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:8000";

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
};

const authHeader = (token?: string) =>
  token ? { Authorization: `Bearer ${token}` } : {};

async function apiFetch<T>(path: string, token?: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      ...authHeader(token),
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      try {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        window.localStorage.removeItem("pr-auth-email");
        // Only reload if we're on the main dashboard page (not on chat pages)
        // Chat pages can work with share tokens and should handle 401 errors themselves
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/chat/')) {
          window.location.reload();
        }
      } catch {
        /* ignore */
      }
    }
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export type AssistantRecord = {
  id: number;
  name: string;
  prompt_instruction: string;
  json_schema: string;
  mqtt_host: string;
  mqtt_port: number;
  mqtt_user?: string | null;
  mqtt_pass?: string | null;
  mqtt_topic: string;
  api_key?: string | null;
  created_at: string;
  updated_at: string;
  latest_session_id?: number | null;
  latest_share_token?: string | null;
};

export type SessionRecord = {
  id: number;
  assistant_id: number;
  status: string;
  mqtt_connected: boolean;
  active: boolean;
  share_token: string;
  created_at: string;
};

export type MessageRecord = {
  id: number;
  role: "user" | "assistant";
  user_text?: string | null;
  response_text?: string | null;
  assistant_payload?: string | null;
  value_json?: string | null;
  created_at: string;
};

export type MqttLogRecord = {
  id: number;
  payload: Record<string, unknown>;
  created_at: string;
};


export const assistantApi = {
  list(token: string) {
    return apiFetch<AssistantRecord[]>("/assistants/", token);
  },
  create(payload: Partial<AssistantRecord>, token: string) {
    return apiFetch<AssistantRecord>("/assistants/", token, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  update(id: number, payload: Partial<AssistantRecord>, token: string) {
    return apiFetch<AssistantRecord>(`/assistants/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  remove(id: number, token: string) {
    return apiFetch<void>(`/assistants/${id}`, token, {
      method: "DELETE",
    });
  },
  messages(id: number, token: string) {
    return apiFetch<MessageRecord[]>(`/assistants/${id}/messages`, token);
  },
  mqttLog(id: number, token: string) {
    return apiFetch<MqttLogRecord[]>(`/assistants/${id}/mqtt-log`, token);
  },
};

export const sessionApi = {
  start(assistantId: number, token: string) {
    return apiFetch<SessionRecord>(`/sessions/start/${assistantId}`, token, {
      method: "POST",
    });
  },
  stop(sessionId: number, token: string) {
    return apiFetch<SessionRecord>(`/sessions/${sessionId}/stop`, token, {
      method: "POST",
    });
  },
  reset(sessionId: number, token?: string, sessionToken?: string) {
    const query = sessionToken ? `?session_token=${sessionToken}` : "";
    return apiFetch<SessionRecord>(`/sessions/${sessionId}/reset${query}`, token, {
      method: "POST",
    });
  },
  messages(sessionId: number, token?: string, sessionToken?: string) {
    const query = sessionToken ? `?session_token=${sessionToken}` : "";
    return apiFetch<MessageRecord[]>(`/sessions/${sessionId}/messages${query}`, token);
  },
  sendMessage(sessionId: number, text: string, token?: string, sessionToken?: string) {
    const query = sessionToken ? `?session_token=${sessionToken}` : "";
    return apiFetch<MessageRecord>(`/sessions/${sessionId}/messages${query}`, token, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },
  mqttLog(sessionId: number, token?: string, sessionToken?: string) {
    const query = sessionToken ? `?session_token=${sessionToken}` : "";
    return apiFetch<MqttLogRecord[]>(`/sessions/${sessionId}/mqtt-log${query}`, token);
  },
  async transcribe(sessionId: number, file: File, token?: string, sessionToken?: string) {
    const query = sessionToken ? `?session_token=${sessionToken}` : "";
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(
      `${API_BASE}/sessions/${sessionId}/transcribe${query}`,
      {
        method: "POST",
        body: formData,
        headers: {
          ...authHeader(token),
        },
      }
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json() as Promise<{ text: string }>;
  },
};

export const TOKEN_STORAGE_KEY = "pr-auth-token";
