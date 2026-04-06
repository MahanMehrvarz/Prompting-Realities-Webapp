# Backend Migration: Chat Completions API → Responses API

## Overview

This document outlines the changes required to migrate from OpenAI's Chat Completions API to the Responses API. The Responses API provides built-in conversation context management via `previous_response_id`, eliminating the need to send full conversation history with each request.

---

## Current Database Schema (Verified)

### `assistant_sessions` table
```
Columns: id, assistant_id, status, mqtt_connected, active, last_response_id,
         current_thread_id, share_token, created_at, updated_at
```
**Good news:** `last_response_id` column already exists! Currently `NULL` for all sessions.

### `assistants` table
```
Columns: id, supabase_user_id, name, prompt_instruction, json_schema, mqtt_host,
         mqtt_port, mqtt_user, mqtt_topic, created_at, updated_at, deleted_at,
         openai_key, mqtt_pass
```
**Note:** No `model` column exists. Model is hardcoded to `gpt-4o-mini`.

### `chat_messages` table
```
Columns: id, session_id, assistant_id, user_text, assistant_payload, response_text,
         mqtt_payload, created_at, device_id
```

---

## Current Architecture vs Target Architecture

| Aspect | Current (Chat Completions) | Target (Responses API) |
|--------|---------------------------|------------------------|
| API Endpoint | `client.chat.completions.create()` | `client.responses.create()` |
| Context Management | Full `conversation_history` sent each request | Just `previous_response_id` |
| System Prompt | First message in messages array | `instructions` parameter |
| Input Format | `messages=[{role, content}]` | `input=[{role, content: [{type, text}]}]` |
| Response Location | `response.choices[0].message.content` | `response.output[].content[].text` |
| Model | Hardcoded `gpt-4o-mini` | Hardcoded `gpt-4o-mini` (can make configurable later) |

---

## Files to Modify (6 files total)

### File 1: `backend/requirements.txt`

**Location:** Line 7

```diff
- openai==1.54.0
+ openai>=1.60.0
```

**Why:** The Responses API (`client.responses.create`) requires a newer SDK version.

---

### File 2: `backend/app/conversation_service.py`

This is the main file that needs changes. Replace the entire `run_model_turn` function.

#### Step 2.1: Update imports (top of file)

**Add these imports if not present:**
```python
import asyncio
from openai import OpenAI  # Sync client for responses.create
```

#### Step 2.2: Add helper function (after line 61, before `run_model_turn`)

```python
def _extract_assistant_text(response: Any) -> str:
    """Flatten the Responses API output into a raw text/JSON string.

    The Responses API returns a different structure than Chat Completions.
    This extracts the text content from the nested output structure.
    """
    chunks: list[str] = []
    for item in getattr(response, "output", []):
        if getattr(item, "type", None) != "message":
            continue
        for content in getattr(item, "content", []):
            if getattr(content, "type", None) == "output_text":
                text = getattr(content, "text", "")
                if text:
                    chunks.append(text)
    return "".join(chunks).strip()
```

#### Step 2.3: Update function signature (line 64-71)

**BEFORE:**
```python
async def run_model_turn(
    previous_response_id: Optional[str],
    user_message: str,
    api_key: str,
    prompt_instruction: str = "You are a helpful assistant.",
    json_schema: Optional[Dict[str, Any]] = None,
    conversation_history: Optional[list[dict[str, str]]] = None  # REMOVE THIS
) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
```

**AFTER:**
```python
async def run_model_turn(
    previous_response_id: Optional[str],
    user_message: str,
    api_key: str,
    prompt_instruction: str = "You are a helpful assistant.",
    json_schema: Optional[Dict[str, Any]] = None,
    model: str = "gpt-4o-mini",  # ADD: configurable model
) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
```

#### Step 2.4: Replace the API call logic (lines 100-188)

**REMOVE the entire block from line 100-154 and REPLACE with:**

```python
    try:
        # Initialize sync OpenAI client (responses.create uses sync API)
        sync_client = OpenAI(api_key=api_key)

        # Build input for Responses API
        request_input = [
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_message}],
            }
        ]

        # Build optional kwargs
        kwargs: Dict[str, Any] = {}

        # Pass previous_response_id if we have conversation context
        if previous_response_id:
            kwargs["previous_response_id"] = previous_response_id
            logger.info(f"📜 [ConversationService] Using previous_response_id: {previous_response_id}")

        # Pass system instructions
        if prompt_instruction:
            kwargs["instructions"] = prompt_instruction

        # Configure JSON schema output format if provided
        if json_schema and isinstance(json_schema, dict) and json_schema.get("type") == "object":
            logger.info("📊 [ConversationService] Using structured output with JSON schema")
            kwargs["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": "assistant_response",
                    "schema": json_schema,
                    "strict": False,
                }
            }

        logger.info("🤖 [ConversationService] Calling OpenAI Responses API...")

        # Make the API call (wrap sync call in asyncio.to_thread)
        response = await asyncio.to_thread(
            sync_client.responses.create,
            model=model,
            input=request_input,
            **kwargs,
        )

        # Extract response text using helper
        assistant_text = _extract_assistant_text(response)
        response_id = getattr(response, "id", None)

        logger.info(f"✅ [ConversationService] Response received, ID: {response_id}")
        if assistant_text:
            logger.info(f"📝 [ConversationService] Response preview: {assistant_text[:100]}...")

        # Parse JSON if schema was provided
        if json_schema and assistant_text:
            try:
                payload = json.loads(assistant_text)
                logger.info("✅ [ConversationService] Successfully parsed JSON response")
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ [ConversationService] Failed to parse JSON: {e}")
                payload = {"response": assistant_text}
        else:
            payload = {"response": assistant_text}

        # Extract display text
        display_text = extract_display_text_from_payload(payload)

        return payload, response_id, display_text

    except Exception as e:
        logger.error(f"❌ [ConversationService] Error calling OpenAI API: {e}", exc_info=True)
        # On error, return the same previous_response_id so frontend can retry
        return (
            {"response": "An error occurred while processing your request"},
            previous_response_id,  # Return same ID on error for retry
            "An error occurred while processing your request",
        )
```

---

### File 3: `backend/app/routes/ai.py`

#### Step 3.1: Update ChatRequest model (lines 19-24)

**BEFORE:**
```python
class ChatRequest(BaseModel):
    """Request to chat with OpenAI."""
    previous_response_id: str | None = None
    user_message: str
    assistant_id: str  # ID of the assistant to get config from database
    conversation_history: list[dict[str, str]] | None = None  # List of previous messages
```

**AFTER:**
```python
class ChatRequest(BaseModel):
    """Request to chat with OpenAI."""
    previous_response_id: str | None = None  # OpenAI Responses API context ID
    user_message: str
    assistant_id: str  # ID of the assistant to get config from database
    session_id: str | None = None  # Session ID for persisting response_id
```

#### Step 3.2: Update run_model_turn call (around line 156)

**BEFORE:**
```python
payload, response_id, display_text = await run_model_turn(
    request.previous_response_id,
    request.user_message,
    api_key,
    prompt_instruction,
    json_schema,
    request.conversation_history
)
```

**AFTER:**
```python
payload, response_id, display_text = await run_model_turn(
    request.previous_response_id,
    request.user_message,
    api_key,
    prompt_instruction,
    json_schema,
    model="gpt-4o-mini",  # Or fetch from assistant config if you add model column
)

# Persist the response_id in the session for conversation continuity
if request.session_id and response_id:
    try:
        supabase.table("assistant_sessions").update({
            "last_response_id": response_id
        }).eq("id", request.session_id).execute()
        logger.info(f"💾 [Backend] Saved response_id {response_id} to session {request.session_id}")
    except Exception as e:
        logger.warning(f"⚠️ [Backend] Failed to save response_id: {e}")
```

---

### File 4: `frontend/src/lib/backendApi.ts`

#### Step 4.1: Update ChatRequest type (lines 55-60)

**BEFORE:**
```typescript
export type ChatRequest = {
  previous_response_id: string | null;
  user_message: string;
  assistant_id: string;  // Backend will fetch config from database
  conversation_history?: Array<{ role: string; content: string }>;  // Optional conversation history
};
```

**AFTER:**
```typescript
export type ChatRequest = {
  previous_response_id: string | null;
  user_message: string;
  assistant_id: string;  // Backend will fetch config from database
  session_id?: string | null;  // Session ID for persisting response_id
};
```

---

### File 5: `frontend/src/app/chat/[assistantId]/page.tsx`

#### Step 5.1: Add state for response ID (around line 45, with other useState hooks)

```typescript
const [lastResponseId, setLastResponseId] = useState<string | null>(null);
```

#### Step 5.2: Load last_response_id when loading session (in the useEffect around line 188)

Find this existing code:
```typescript
const { data: session, error: sessionError } = await supabase
  .from("assistant_sessions")
  .select("*")
  .eq("id", sessionId)
  .maybeSingle();
```

**ADD after `setSessionActive(session.active);` (around line 214):**
```typescript
// Load existing response_id for conversation continuity
if (session.last_response_id) {
  setLastResponseId(session.last_response_id);
  console.log("📜 [Frontend] Loaded existing response_id:", session.last_response_id);
}
```

#### Step 5.3: Update handleSend function (lines 343-361)

**REMOVE this block:**
```typescript
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
```

**REPLACE with:**
```typescript
console.log("🤖 [Frontend] Calling backend AI API...");
console.log("📜 [Frontend] Using previous_response_id:", lastResponseId);

// Use Responses API with previous_response_id for context
const aiResponse = await backendApi.chat(
  {
    previous_response_id: lastResponseId,  // Pass context ID
    user_message: trimmed,
    assistant_id: assistantId,
    session_id: sessionId,  // For persisting response_id in backend
  },
  token || undefined
);

// Save response_id for next turn
if (aiResponse.response_id) {
  setLastResponseId(aiResponse.response_id);
  console.log("💾 [Frontend] Saved response_id for next turn:", aiResponse.response_id);
}
```

#### Step 5.4: Clear response_id on session reset

Find any session reset logic and add:
```typescript
setLastResponseId(null);
```

Also add to the session loading useEffect cleanup or when session changes:
```typescript
// When session ID changes, reset the response_id
useEffect(() => {
  setLastResponseId(null);
}, [sessionId]);
```

---

### File 6: `frontend/src/lib/supabaseClient.ts` (if session reset exists there)

If there's a `sessionService.reset()` function, ensure it also clears `last_response_id`:

```typescript
// In reset function, add:
await supabase
  .from("assistant_sessions")
  .update({ last_response_id: null })
  .eq("id", sessionId);
```

---

## Database: No Migration Needed!

The `assistant_sessions` table already has the `last_response_id` column. It's currently `NULL` for all sessions, which is the correct initial state.

**Optional Enhancement - Add model column to assistants:**
```sql
ALTER TABLE assistants ADD COLUMN model TEXT DEFAULT 'gpt-4o-mini';
```

---

## Potential Bottlenecks & Risks

### 1. Response ID Expiration
**Problem:** OpenAI may expire old response IDs after some time (undocumented).
**Solution:** The backend already handles this - on error, it returns the same `previous_response_id` so the frontend can retry. If the error persists, the frontend should clear the ID and start fresh:
```typescript
// In error handling
if (error.message.includes("invalid") && error.message.includes("response")) {
  setLastResponseId(null);  // Start fresh
}
```

### 2. Multi-Tab Sync Issue
**Problem:** Two tabs could have stale `response_id` values.
**Solution:**
- The existing queue system enforces single-active-user
- Backend persists `response_id` to database, so the source of truth is always in Supabase
- Frontend loads `last_response_id` from session on mount

### 3. Session Reset
**Problem:** Reset should clear OpenAI context.
**Solution:** Clear `last_response_id` both in frontend state AND database:
```typescript
setLastResponseId(null);
await supabase.table("assistant_sessions").update({ last_response_id: null }).eq("id", sessionId);
```

### 4. Error Recovery
**Problem:** If API call fails, what `response_id` to use next?
**Solution:** Backend returns the same `previous_response_id` on error. Frontend can retry with same ID. After multiple failures, clear and start fresh.

### 5. Page Refresh
**Problem:** User refreshes page mid-conversation.
**Solution:** Frontend loads `last_response_id` from `assistant_sessions` table on mount. Conversation context is preserved.

---

## Bandwidth Savings Analysis

| Conversation Turn | Current (Chat Completions) | After (Responses API) |
|-------------------|---------------------------|----------------------|
| Turn 1 | ~100 tokens | ~100 tokens |
| Turn 5 | ~500 tokens (full history) | ~100 tokens |
| Turn 10 | ~1000 tokens | ~100 tokens |
| Turn 20 | ~2000 tokens | ~100 tokens |

**Savings:** After 10 turns, ~90% reduction in request payload size.

---

## Migration Checklist

### Backend Changes
- [ ] `backend/requirements.txt` - Update `openai>=1.60.0`
- [ ] `backend/app/conversation_service.py`:
  - [ ] Add `_extract_assistant_text()` helper function
  - [ ] Update `run_model_turn()` signature (remove `conversation_history`, add `model`)
  - [ ] Replace `chat.completions.create` with `responses.create`
  - [ ] Update response extraction logic
- [ ] `backend/app/routes/ai.py`:
  - [ ] Update `ChatRequest` model (remove `conversation_history`, add `session_id`)
  - [ ] Add code to persist `response_id` to database after each turn

### Frontend Changes
- [ ] `frontend/src/lib/backendApi.ts`:
  - [ ] Update `ChatRequest` type (remove `conversation_history`, add `session_id`)
- [ ] `frontend/src/app/chat/[assistantId]/page.tsx`:
  - [ ] Add `lastResponseId` state
  - [ ] Load `last_response_id` from session on mount
  - [ ] Update `handleSend` to pass `previous_response_id` and `session_id`
  - [ ] Save `response_id` after each successful turn
  - [ ] Clear `lastResponseId` on session reset

### Database
- [ ] No migration needed (`last_response_id` column already exists)
- [ ] Optional: Add `model` column to `assistants` table

### Testing
- [ ] Test new conversation (first message, `previous_response_id` = null)
- [ ] Test multi-turn conversation (subsequent messages use `previous_response_id`)
- [ ] Test page refresh (loads `last_response_id` from database)
- [ ] Test session reset (clears `last_response_id`)
- [ ] Test error recovery
- [ ] Verify MQTT still works correctly
- [ ] Verify JSON schema output still works

---

## Reference: Working Responses API Example

From the working `conversation_client.py`:

```python
async def conversation_response(
    previous_response_id: Optional[str],
    user_message: str,
) -> Tuple[Dict[str, Any], Optional[str]]:
    """Submit a user turn and receive the assistant payload."""

    request_payload = [
        {
            "role": "user",
            "content": [{"type": "input_text", "text": user_message}],
        }
    ]

    kwargs: Dict[str, Any] = {}
    if previous_response_id:
        kwargs["previous_response_id"] = previous_response_id
    if _prompt_instructions:
        kwargs["instructions"] = _prompt_instructions
    if _json_schema_format:
        kwargs["text"] = {"format": _json_schema_format}

    try:
        response = await asyncio.to_thread(
            _client.responses.create,
            model=_model,
            input=request_payload,
            **kwargs,
        )
    except Exception as exc:
        logging.error("Error in conversation response: %s", exc)
        return (
            {"response": "An error occurred", "values": {}},
            previous_response_id,  # Return same ID on error for retry
        )

    assistant_text = _extract_assistant_text(response)
    response_id = getattr(response, "id", None)

    return _parse_structured_payload(assistant_text), response_id


def _extract_assistant_text(response: Any) -> str:
    """Flatten the structured API response into a raw JSON string."""
    chunks: list[str] = []
    for item in getattr(response, "output", []):
        if getattr(item, "type", None) != "message":
            continue
        for content in getattr(item, "content", []):
            if getattr(content, "type", None) == "output_text":
                text = getattr(content, "text", "")
                if text:
                    chunks.append(text)
    return "".join(chunks).strip()
```

---

## Summary of Key Changes

1. **Backend `conversation_service.py`:** Replace `chat.completions.create()` with `responses.create()`, using `previous_response_id` for context instead of full message history.

2. **Backend `routes/ai.py`:** Remove `conversation_history` from request, add `session_id`, persist `response_id` to database after each turn.

3. **Frontend `backendApi.ts`:** Update types to remove `conversation_history`, add `session_id`.

4. **Frontend chat page:** Track `lastResponseId` in state, load from database on mount, pass to API calls, save after each turn.

5. **No database migration needed** - `last_response_id` column already exists!
