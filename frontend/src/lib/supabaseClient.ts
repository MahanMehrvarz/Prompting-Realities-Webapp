/**
 * Supabase client for direct database operations.
 * This client is used for CRUD operations on assistants, sessions, and messages.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase URL or anonymous key");
}

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export type Assistant = {
  id: string;
  supabase_user_id: string;
  name: string;
  prompt_instruction: string;
  json_schema: Record<string, any> | null;
  mqtt_host: string;
  mqtt_port: number;
  mqtt_user: string | null;
  mqtt_topic: string;
  created_at: string;
  updated_at: string;
};

export type AssistantSession = {
  id: string;
  assistant_id: string;
  status: string;
  mqtt_connected: boolean;
  active: boolean;
  last_response_id: string | null;
  current_thread_id: string;
  share_token: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  assistant_id: string;
  user_text: string | null;
  assistant_payload: Record<string, any> | null;
  response_text: string | null;
  mqtt_payload: Record<string, any> | null;
  device_id: string | null;
  created_at: string;
};

// Helper functions for database operations
export const assistantService = {
  async list(userId: string) {
    const { data, error } = await supabaseClient
      .from("assistants")
      .select("*")
      .eq("supabase_user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as Assistant[];
  },

  async create(assistant: Omit<Assistant, "id" | "created_at" | "updated_at">) {
    const { data, error } = await supabaseClient
      .from("assistants")
      .insert(assistant)
      .select()
      .single();

    if (error) throw error;
    return data as Assistant;
  },

  async update(id: string, updates: Partial<Assistant>) {
    const { data, error } = await supabaseClient
      .from("assistants")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Assistant;
  },

  async delete(id: string) {
    // Soft delete: mark assistant as deleted instead of removing data
    const { error } = await supabaseClient
      .from("assistants")
      .update({ 
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString() 
      })
      .eq("id", id);

    if (error) throw error;
  },
};

export const sessionService = {
  async create(assistantId: string, mqttConnected: boolean) {
    const shareToken = generateShareToken();
    const threadId = generateThreadId();

    const { data, error } = await supabaseClient
      .from("assistant_sessions")
      .insert({
        assistant_id: assistantId,
        status: "running",
        mqtt_connected: mqttConnected,
        active: true,
        share_token: shareToken,
      })
      .select()
      .single();

    if (error) throw error;
    return data as AssistantSession;
  },

  async update(id: string, updates: Partial<AssistantSession>) {
    const { data, error } = await supabaseClient
      .from("assistant_sessions")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as AssistantSession;
  },

  async get(id: string) {
    const { data, error } = await supabaseClient
      .from("assistant_sessions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as AssistantSession;
  },

  async getLatestForAssistant(assistantId: string) {
    const { data, error } = await supabaseClient
      .from("assistant_sessions")
      .select("*")
      .eq("assistant_id", assistantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as AssistantSession | null;
  },
};

export const messageService = {
  async create(message: Omit<ChatMessage, "id" | "created_at">) {
    const { data, error } = await supabaseClient
      .from("chat_messages")
      .insert(message)
      .select()
      .single();

    if (error) throw error;
    return data as ChatMessage;
  },

  async listBySession(sessionId: string, threadId?: string, deviceId?: string) {
    let query = supabaseClient
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId);
    
    // Only filter by thread_id if provided
    if (threadId) {
      query = query.eq("thread_id", threadId);
    }
    
    // Filter by device_id for anonymous users
    if (deviceId) {
      query = query.eq("device_id", deviceId);
    }
    
    const { data, error } = await query.order("created_at", { ascending: true });

    if (error) throw error;
    return data as ChatMessage[];
  },

  async listByAssistant(assistantId: string) {
    const { data, error } = await supabaseClient
      .from("chat_messages")
      .select("*")
      .eq("assistant_id", assistantId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data as ChatMessage[];
  },

  async getMqttLog(assistantId: string) {
    const { data, error } = await supabaseClient
      .from("chat_messages")
      .select("id, mqtt_payload, created_at")
      .eq("assistant_id", assistantId)
      .not("mqtt_payload", "is", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  },
};

// Utility functions
function generateShareToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateThreadId(): string {
  return crypto.randomUUID();
}
