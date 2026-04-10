# Feature Plan: WhatsApp-Style Voice Messages

## Overview

Replace the current hold-to-dictate mic flow (which places transcribed text in the input field) with a WhatsApp/Telegram-style voice message system. The user presses and holds to record, releases to send the audio directly as a message, and the system responds with an instant TTS acknowledgement while the full AI pipeline (transcription → chat → TTS) runs in the background.

**Business / research motivation:** Reduces perceived latency for voice-first interactions. The existing flow — hold → release → wait for Whisper → text appears in field → user hits Send → wait for GPT → wait for TTS — has three serial wait stages that make it feel slow. The new flow collapses the user's action to a single gesture and hides the AI pipeline latency behind an acknowledgement.

**Success criteria:**
- Hold-to-record works on both desktop (mouse) and mobile (touch) without page scroll interference.
- Slide-left cancel gesture discards the recording with no AI call made.
- Sent voice message appears as an audio bubble in the chat with duration and waveform visualization.
- Acknowledgement TTS plays within 1–2 seconds of release (before Whisper finishes).
- Full AI response (text + TTS) appears and plays automatically after processing completes.
- The transcribed user text appears in the chat alongside or replacing the audio bubble.
- The existing text-input flow and all other features are fully unaffected.

---

## Scope

### In scope
- New `POST /ai/voice-message` backend endpoint (replaces calling `/transcribe` + `/chat` + `/tts` separately for voice)
- Acknowledgement phrase selection and immediate TTS audio return
- Background processing: Whisper transcription → GPT chat → TTS full response
- Hold-to-record UX with visual recording indicator, elapsed timer, and slide-to-cancel
- `VoiceMessageBubble` component (audio player, waveform, duration)
- New `voice_message` message type in the `ChatMessage` local state type
- `backendApi.voiceMessage()` client method
- Removal of `backendApi.transcribe()` as the primary voice pathway (keep the endpoint itself in case other flows use it)
- Recording state machine extracted into a dedicated hook `useVoiceRecorder`

### Out of scope
- Streaming the full GPT response token-by-token (the existing non-streaming flow is preserved)
- Persisting audio blobs to Supabase storage (audio stays in-memory / object URL only)
- Waveform computed from actual audio samples (a decorative static or animated waveform is acceptable for v1)
- Push notifications or background sync when the AI response finishes (page must remain open)
- Changes to the MQTT flow, session management, presence, or dashboard

### Future considerations
- Real waveform visualization using the Web Audio API `AnalyserNode` during recording
- Audio message persistence (store blob URL or base64 in the database)
- Streaming TTS response as the GPT response streams in

---

## Current System Context

### Relevant existing components

| File | Role |
|---|---|
| `frontend/src/app/chat/[assistantId]/page.tsx` | Single-file chat page; owns all state, the `beginRecording` / `stopRecording` functions, the `recordingEvents` object, the `playTTS` helper, and the full `sendMessageToAI` pipeline |
| `frontend/src/lib/backendApi.ts` | Typed API client; `transcribe()` uses raw `fetch` with `FormData`; `tts()` returns a `Blob`; `chat()` uses `apiFetch` JSON |
| `backend/app/routes/ai.py` | FastAPI router; `/transcribe` and `/tts` are separate sequential endpoints today |
| `backend/app/conversation_service.py` | `transcribe_blob(audio_bytes, api_key)` and `run_model_turn(...)` — both are `async` and can be composed |

### Current recording behavior (to be replaced)
`beginRecording` → MediaRecorder starts → `stopRecording` → `recorder.onstop` → calls `backendApi.transcribe()` → sets `input` state → user manually presses Send.

The `recordingEvents` object is spread onto the mic button and handles `onMouseDown`, `onMouseUp`, `onMouseLeave`, `onTouchStart`, `onTouchEnd`.

### Key constraints from the current architecture
- The chat page is a single large component (`~1300 lines`). The new recording hook must be self-contained to avoid growing the page further.
- `sendMessageToAI` is the canonical message-sending path and is referenced via `sendMessageToAIRef` to avoid stale closures. The new voice flow must integrate with or parallel this carefully.
- TTS playback is currently gated by `ttsEnabled` state. The acknowledgement TTS should play **regardless** of `ttsEnabled` (it is part of the voice-message interaction, not the text-to-speech toggle feature).
- The backend fetches and decrypts the OpenAI API key on every request using `assistant_id`. The new endpoint must follow the same pattern.
- Anonymous access (`maybe_current_user_id`) is required — the endpoint must not require authentication.
- The existing `/tts` endpoint already returns a `StreamingResponse` of mp3 bytes. The new endpoint can reuse the same pattern for the acknowledgement audio.

---

## Proposed Architecture

### High-level flow

```
User holds mic button
  → useVoiceRecorder: MediaRecorder starts, timer ticks
  → User slides left: cancel → discard blob, return to idle
  → User releases: blob captured → POST /ai/voice-message (multipart)
      Backend (immediate, ~500ms):
        1. Pick random acknowledgement phrase
        2. TTS the phrase → return audio/mpeg in response body
           + response header X-Voice-Message-ID: <uuid>
      Frontend:
        - Plays acknowledgement audio immediately
        - Adds optimistic "voice message" bubble to chat (with audio blob URL)
        - Adds "AI is thinking..." typing indicator
      Backend (background task, ~3–6s):
        3. Whisper transcribes the audio
        4. GPT chat generates response (using run_model_turn)
        5. TTS converts response to audio
        6. All results stored; returned via polling OR second request
      Frontend:
        - Polls GET /ai/voice-message/{id}/result until ready
        - On result: replaces optimistic bubble with transcript text,
          shows assistant text bubble, plays full TTS audio
```

### Why polling, not SSE/WebSocket?
The project has no streaming infrastructure today. Adding SSE requires ASGI event source setup and cross-origin header handling that is non-trivial. Simple polling every 1.5 seconds with a 30-second timeout fits the existing fetch-based API client and adds zero new infrastructure.

### Component interactions

```
page.tsx
  ├── useVoiceRecorder (new hook)
  │     manages: RecordingState, elapsed timer, slide-cancel detection
  │     returns: state, startRecording(), cancelRecording(), handlers
  ├── VoiceMessageBubble (new component)
  │     props: audioUrl, duration, transcript?, isProcessing?
  │     manages: local playback state (playing/paused)
  └── backendApi.voiceMessage() (new method)
        → POST /ai/voice-message  →  returns { ack_audio: Blob, message_id: string }
  └── backendApi.voiceMessageResult() (new method)
        → GET /ai/voice-message/{id}/result  →  returns VoiceMessageResult
```

### New components / modifications

| What | Where | Change type |
|---|---|---|
| `useVoiceRecorder` hook | `frontend/src/hooks/useVoiceRecorder.ts` | New |
| `VoiceMessageBubble` component | `frontend/src/components/VoiceMessageBubble.tsx` | New |
| `backendApi.voiceMessage()` | `frontend/src/lib/backendApi.ts` | New method |
| `backendApi.voiceMessageResult()` | `frontend/src/lib/backendApi.ts` | New method |
| `VoiceMessageRequest` / `VoiceMessageResult` types | `frontend/src/lib/backendApi.ts` | New types |
| `ChatMessage` type in `page.tsx` | `page.tsx` (line 24–32) | Add `audioUrl?`, `isVoiceMessage?`, `isProcessing?` fields |
| Mic button + recording UI in `page.tsx` | `page.tsx` (lines 1235–1254, 1187–1213) | Replace with `useVoiceRecorder` hook integration |
| `POST /ai/voice-message` | `backend/app/routes/ai.py` | New endpoint |
| `GET /ai/voice-message/{id}/result` | `backend/app/routes/ai.py` | New endpoint |
| In-memory result store | `backend/app/voice_message_store.py` | New module |
| Remove: `beginRecording`, `stopRecording`, `recordingEvents`, `isTranscribing`, `transcriptionError` state | `page.tsx` | Delete |

### API changes

#### `POST /ai/voice-message`

```
Content-Type: multipart/form-data
Fields:
  file: audio blob (webm/ogg/mp4)
  assistant_id: str
  session_id: str | None
  thread_id: str | None
  previous_response_id: str | None
  voice: str (tts voice, default "alloy")

Response:
  Content-Type: audio/mpeg   (the acknowledgement TTS audio)
  Header: X-Voice-Message-ID: <uuid>
  Body: mp3 bytes
```

The acknowledgement audio IS the immediate response body. The `message_id` is returned in a response header so the frontend knows what to poll for.

**Rationale for returning audio as body:** The frontend needs to play audio immediately. Returning a JSON body with a base64-encoded audio blob adds unnecessary encoding overhead. The `message_id` in a header is a well-established pattern (similar to `Location` in 202 responses).

#### `GET /ai/voice-message/{message_id}/result`

```
Query params:
  assistant_id: str

Response (JSON):
{
  "status": "pending" | "ready" | "error",
  "transcript": str | null,        // Whisper output
  "response_text": str | null,     // GPT display_text
  "response_audio_url": null,      // Not used — audio returned inline
  "response_payload": dict | null, // Full GPT payload
  "response_id": str | null,       // OpenAI response_id for conversation continuity
  "error": str | null
}
```

When `status == "ready"`, the frontend makes one additional call to `/ai/tts` with `response_text` and the assistant's voice to get the full response audio. This avoids storing large audio blobs in the in-memory store.

**Alternative considered:** Return the full response audio as base64 in the result JSON. Rejected because mp3 blobs can be several hundred KB; polling a large JSON payload every 1.5s is wasteful.

#### In-memory voice message store (`voice_message_store.py`)

```python
# Simple dict, keyed by message_id (UUID)
# Entries expire after 5 minutes (TTL cleanup on access)
{
  message_id: {
    "status": "pending" | "ready" | "error",
    "transcript": str | None,
    "response_text": str | None,
    "response_payload": dict | None,
    "response_id": str | None,
    "error": str | None,
    "created_at": float,  # time.time()
  }
}
```

No database persistence — voice message results are ephemeral. If the server restarts mid-processing, the frontend will time out polling and show an error.

### Frontend state machine (`useVoiceRecorder`)

```
States:
  idle
  requesting_permission
  recording        (timer running, slide detection active)
  cancelling       (slide-cancel threshold crossed while still holding)
  cancelled        (recording discarded, brief visual flash)
  sending          (blob uploaded, waiting for ack audio)
  ack_playing      (acknowledgement TTS is playing)
  polling          (waiting for /result)
  done             (result received, cleaning up)
  error

Transitions:
  idle → requesting_permission:  onPointerDown on mic button
  requesting_permission → recording:  getUserMedia resolves
  requesting_permission → error:  getUserMedia rejects (permission denied)
  recording → cancelling:  pointer X delta < -80px (slide left)
  cancelling → idle:  onPointerUp (discard, no send)
  recording → sending:  onPointerUp with no cancel
  cancelling → recording:  pointer moves back right of threshold (optional — can omit for simplicity)
  sending → ack_playing:  ack audio received and starts playing
  ack_playing → polling:  ack audio ends
  polling → done:  result status === "ready"
  polling → error:  result status === "error" OR timeout (>30s)
  done → idle:  cleanup complete
  error → idle:  after showing error message (3s)
```

**Pointer events vs. touch/mouse events:** Use `onPointerDown` / `onPointerUp` / `onPointerMove` with `setPointerCapture` on the mic button element. This handles both mouse and touch with a single event system and avoids the dual `onTouchStart`/`onMouseDown` spread currently on the button. Call `event.preventDefault()` in `onPointerDown` to block scroll.

### Acknowledgement phrase pool

Stored as a constant in `backend/app/routes/ai.py` (or a new `voice_ack.py` module). Selected randomly per request.

```python
ACK_PHRASES = [
    "Got it, give me a second.",
    "Sure, let me think about that.",
    "On it!",
    "Let me check that for you.",
    "Got your message, just a moment.",
    "Roger that, processing now.",
    "One second!",
    "Understood, working on it.",
]
```

These are short (2–5 words), fast to synthesize with `tts-1` (the faster model). At ~20 characters average, synthesis takes approximately 300–500ms. The backend generates the ack TTS before spawning the background task, so the response body is ready before the task starts.

### Data model changes

No database schema changes required. Voice message turns are saved to `chat_messages` in the same format as text messages, using `transcript` as `user_text`. The `audio_url` lives only in the frontend's React state (a `URL.createObjectURL(blob)` — ephemeral, cleaned up on component unmount).

The `ChatMessage` local type in `page.tsx` gains three optional fields:

```typescript
type ChatMessage = {
  // ... existing fields ...
  audioUrl?: string;       // object URL of the recorded audio blob
  isVoiceMessage?: boolean;
  isProcessing?: boolean;  // true while polling for result
};
```

---

## Implementation Plan

### Step 1 — Backend: in-memory voice message store
**File:** `backend/app/voice_message_store.py` (new)
**Complexity:** Low

Create a module-level `dict` with a `VoiceMessageEntry` TypedDict. Add a `cleanup_expired()` function (TTL = 300s). Expose `create_entry(message_id)`, `update_entry(message_id, **kwargs)`, `get_entry(message_id)`. No external dependencies.

---

### Step 2 — Backend: `POST /ai/voice-message` endpoint
**File:** `backend/app/routes/ai.py`
**Complexity:** High
**Depends on:** Step 1

1. Accept multipart: `file: UploadFile`, `assistant_id: str`, `session_id: str | None`, `thread_id: str | None`, `previous_response_id: str | None`, `voice: str = "alloy"`.
2. Fetch and decrypt API key (same pattern as existing `/transcribe` and `/tts` — copy the Supabase + decrypt block into a shared helper `_get_api_key(assistant_id)` to reduce duplication).
3. Generate a `message_id = str(uuid.uuid4())`.
4. Read audio bytes from `file`.
5. Select a random ack phrase from `ACK_PHRASES`.
6. Call OpenAI TTS synchronously (same `client.audio.speech.create` pattern as existing `/tts`) with `model="tts-1"`.
7. Create entry in store: `voice_message_store.create_entry(message_id)`.
8. Spawn background task: `asyncio.create_task(_process_voice_message(message_id, audio_bytes, api_key, ...))`.
9. Return `StreamingResponse(io.BytesIO(ack_audio_content), media_type="audio/mpeg", headers={"X-Voice-Message-ID": message_id})`.

Background task `_process_voice_message`:
1. `transcript = await transcribe_blob(audio_bytes, api_key)`
2. `payload, response_id, display_text = await run_model_turn(previous_response_id, transcript, api_key, prompt_instruction, json_schema)`
3. `voice_message_store.update_entry(message_id, status="ready", transcript=transcript, response_text=display_text, response_payload=payload, response_id=response_id)`
4. On any exception: `voice_message_store.update_entry(message_id, status="error", error=str(e))`

**Note on `prompt_instruction` and `json_schema`:** The background task needs the assistant's prompt and schema. These must be fetched (or passed from the endpoint) before starting the task, since the Supabase client should not be used inside a background task without a proper client reference. Fetch assistant data once at the top of the endpoint, pass the relevant fields as arguments to the background function.

---

### Step 3 — Backend: `GET /ai/voice-message/{message_id}/result`
**File:** `backend/app/routes/ai.py`
**Complexity:** Low
**Depends on:** Step 1

```python
@router.get("/voice-message/{message_id}/result")
async def get_voice_message_result(message_id: str, ...):
    voice_message_store.cleanup_expired()
    entry = voice_message_store.get_entry(message_id)
    if not entry:
        raise HTTPException(404, "Voice message not found or expired")
    return entry  # status, transcript, response_text, etc.
```

---

### Step 4 — Backend: shared `_get_api_key` helper
**File:** `backend/app/routes/ai.py`
**Complexity:** Low
**Depends on:** nothing (refactor only)

Extract the repeated Supabase init + assistant fetch + decrypt block from `/chat`, `/transcribe`, `/tts` into a private async helper `_get_assistant_and_key(assistant_id)` that returns `(assistant: dict, api_key: str)`. Use it in all four endpoints. This reduces ~50 lines of duplication per endpoint and makes the new endpoint cleaner.

---

### Step 5 — Frontend: `useVoiceRecorder` hook
**File:** `frontend/src/hooks/useVoiceRecorder.ts` (new)
**Complexity:** High

Manages the full state machine described in the Architecture section. Exposes:

```typescript
type UseVoiceRecorderReturn = {
  recordingState: RecordingState;
  elapsedSeconds: number;
  isCancelling: boolean;
  micButtonProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
};
```

The hook accepts a callback `onRecordingComplete: (blob: Blob) => void` called when recording finishes without cancel. Internal refs: `MediaRecorder`, `recordedChunks`, `timerIntervalRef`, `pointerStartX`, `containerRef` (for `setPointerCapture`).

**Slide-cancel logic:** Track `pointerStartX` on `onPointerDown`. On each `onPointerMove`, if `event.clientX - pointerStartX < -80`, set `isCancelling = true`. On `onPointerUp`, if `isCancelling`, discard blob and reset to idle. Threshold of 80px is based on WhatsApp's documented behavior and works at mobile scale.

**Timer:** `setInterval` increments `elapsedSeconds` every second while in `recording` state.

---

### Step 6 — Frontend: `VoiceMessageBubble` component
**File:** `frontend/src/components/VoiceMessageBubble.tsx` (new)
**Complexity:** Medium

```typescript
type Props = {
  audioUrl: string;
  durationSeconds: number;
  transcript?: string;
  isProcessing?: boolean;
  role: "user" | "assistant";
};
```

Shows:
- Play/pause button (uses a local `<audio>` element via `useRef`)
- Static waveform bars (decorative SVG, 20–30 bars at varying heights — not computed from actual samples)
- Duration display (`0:03` format), counting down while playing
- If `isProcessing`: a subtle "Processing..." label beneath the bubble
- If `transcript`: displays the text below the waveform (replaces the processing label)

Styled consistently with existing message bubbles (user: `bg-[var(--ink-dark)]`, assistant: `assistantColors.accent`).

---

### Step 7 — Frontend: `backendApi` additions
**File:** `frontend/src/lib/backendApi.ts`
**Complexity:** Low
**Depends on:** Step 2, Step 3

Add types:
```typescript
export type VoiceMessageResult = {
  status: "pending" | "ready" | "error";
  transcript: string | null;
  response_text: string | null;
  response_payload: Record<string, any> | null;
  response_id: string | null;
  error: string | null;
};
```

Add methods:
```typescript
async voiceMessage(
  file: File,
  assistantId: string,
  options: { sessionId?: string; threadId?: string; previousResponseId?: string | null; voice?: string },
  token?: string
): Promise<{ ackAudioBlob: Blob; messageId: string }>

async voiceMessageResult(
  messageId: string,
  assistantId: string,
  token?: string
): Promise<VoiceMessageResult>
```

`voiceMessage` uses raw `fetch` (like the existing `transcribe`), reads the `X-Voice-Message-ID` response header, and returns both the response blob and the header value.

---

### Step 8 — Frontend: integrate into `page.tsx`
**File:** `frontend/src/app/chat/[assistantId]/page.tsx`
**Complexity:** High
**Depends on:** Steps 5, 6, 7

**Remove:**
- State variables: `isRecording`, `isTranscribing`, `transcriptionError`
- Functions: `beginRecording`, `stopRecording`
- Object: `recordingEvents`
- UI: the recording/transcribing status banners (lines 1187–1213)

**Add:**
- Import `useVoiceRecorder`
- Import `VoiceMessageBubble`
- State: `voiceMessageId: string | null`, `pollingIntervalRef: useRef`

**Wire `useVoiceRecorder`:**
```typescript
const { recordingState, elapsedSeconds, isCancelling, micButtonProps } = useVoiceRecorder({
  onRecordingComplete: handleVoiceRecordingComplete,
});
```

**`handleVoiceRecordingComplete(blob: Blob)`:**
1. Create object URL for the blob: `const audioUrl = URL.createObjectURL(blob)`.
2. Compute duration from `elapsedSeconds`.
3. Add optimistic `ChatMessage` to state: `{ isVoiceMessage: true, audioUrl, isProcessing: true, role: "user", content: "" }`.
4. Call `backendApi.voiceMessage(...)` → get `{ ackAudioBlob, messageId }`.
5. Play `ackAudioBlob` immediately via `new Audio(URL.createObjectURL(ackAudioBlob)).play()` — **bypass** the `ttsEnabled` gate (this is part of the voice-message interaction, not the optional TTS feature).
6. Set `voiceMessageId = messageId`, start polling.

**Polling logic (inside `handleVoiceRecordingComplete` or a `useEffect`):**
```typescript
const poll = async () => {
  const result = await backendApi.voiceMessageResult(messageId, assistantId, token);
  if (result.status === "ready") {
    clearInterval(pollingIntervalRef.current);
    // Update user bubble: replace isProcessing with transcript
    // Add assistant message bubble
    // Save to Supabase via messageService.create (using result.transcript as user_text)
    // Update lastResponseId with result.response_id
    // Play full TTS: backendApi.tts({ text: result.response_text, ... }) → playTTS
  } else if (result.status === "error") {
    clearInterval(pollingIntervalRef.current);
    // Show error, remove optimistic bubbles
  }
};
pollingIntervalRef.current = setInterval(poll, 1500);
// Timeout: clearInterval after 30s if still pending
```

**Mic button UI changes:**
- Replace the current button's `{...(!isTranscribing ? recordingEvents : {})}` spread with `{...micButtonProps}`.
- Show a red pulsing ring when `recordingState === "recording"`.
- Show slide-cancel arrow icon (or red X overlay) when `isCancelling`.
- Show elapsed timer (`0:{elapsedSeconds.toString().padStart(2, "0")}`) as a small label above the button when recording.

**Message rendering:** In the `messages.map()` block, detect `message.isVoiceMessage` and render `<VoiceMessageBubble>` instead of the plain `<p>` text bubble.

---

### Step 9 — Cleanup and regression check
**Complexity:** Low
**Depends on:** Steps 1–8

- Verify existing text-input flow still works end-to-end.
- Verify TTS toggle still works for text messages.
- Verify MQTT receiver flow still works.
- Revoke `audioUrl` object URLs on component unmount (add to the existing cleanup `useEffect`).
- Clear `pollingIntervalRef` on unmount.
- Test slide-cancel on mobile (real device, not simulator).

---

## Risk Register

### Risk 1 — Background task in FastAPI
**Severity:** High
**Description:** `asyncio.create_task()` in FastAPI runs the background task in the same event loop as the request handler. Whisper transcription + GPT + TTS can take 5–8 seconds. Multiple concurrent voice messages could exhaust the event loop if `asyncio.to_thread` is not used for the synchronous OpenAI SDK calls.
**Mitigation:** All three operations (`transcribe_blob`, `run_model_turn`, TTS) must use `asyncio.to_thread` internally (they already do for `transcribe_blob` and `run_model_turn`; the TTS call in the new endpoint must also use `asyncio.to_thread`). Alternatively, use FastAPI's `BackgroundTasks` — but this ties the task lifetime to the response, which is fine here. Using `asyncio.create_task` is slightly riskier; prefer `BackgroundTasks` to let FastAPI manage the lifecycle.

### Risk 2 — Server restart loses pending results
**Severity:** Medium
**Description:** The in-memory store is lost on restart. A user whose polling is in-flight will time out.
**Mitigation:** The frontend timeout (30s) will display a user-friendly error. For a research prototype this is acceptable. Document as a known limitation.

### Risk 3 — `X-Voice-Message-ID` header blocked by CORS
**Severity:** Medium
**Description:** Custom response headers are blocked by browsers unless explicitly exposed via `Access-Control-Expose-Headers`.
**Mitigation:** Add `"X-Voice-Message-ID"` to the CORS middleware's `expose_headers` list in `backend/app/main.py`. Verify this in the browser before considering the feature complete.

### Risk 4 — `setPointerCapture` on mobile Safari
**Severity:** Medium
**Description:** Pointer capture behavior differs across iOS Safari versions. A finger that starts on the mic button may not receive `onPointerMove` events reliably on older iOS.
**Mitigation:** Implement a fallback: also listen to `onTouchMove` on the document level while recording, detect the X-delta there. Keep this as an enhancement only if primary testing on iOS fails.

### Risk 5 — Audio codec compatibility
**Severity:** Low–Medium
**Description:** `MediaRecorder` uses different codecs per browser: Chrome produces `webm/opus`, Safari produces `mp4/aac`, Firefox `ogg/opus`. Whisper accepts all three but the MIME type passed to `new File(...)` must match actual content.
**Mitigation:** Use `recorder.mimeType` (the actual negotiated type) when constructing the `File` object, which is already done in the current `recorder.onstop`. No change needed, but worth a note in the hook's comments.

### Risk 6 — Ack TTS plays over existing TTS audio
**Severity:** Low
**Description:** If a text-based TTS response is playing when the user sends a voice message, the ack audio will try to play simultaneously.
**Mitigation:** In `handleVoiceRecordingComplete`, call the existing cleanup (pause `audioRef.current`, revoke URL) before playing the ack audio, mirroring the behavior of `playTTS`.

### Risk 7 — `previous_response_id` race condition
**Severity:** Low
**Description:** If a user sends a text message and then immediately sends a voice message, both may send the same `lastResponseId` as context. The voice message's background task stores its `response_id` only after completing, so the next message could fork the conversation.
**Mitigation:** Disable the text input and the mic button while `recordingState !== "idle"` (i.e., while processing). This already aligns with the `isAiResponding` gate that exists in `sendMessageToAI`.

---

## Open Questions

1. **Acknowledgement voice vs. assistant voice:** Should the ack phrase always use the default `"alloy"` voice, or should it use the same voice the user has selected in the TTS modal (`ttsVoice` state)? Using the same voice is more coherent but requires passing the current voice setting into the voice message endpoint. Recommendation: use the same voice for consistency — pass it as a form field.

2. **Waveform for v1:** Is a purely decorative static waveform acceptable for the initial release, or is a real computed waveform (from `AnalyserNode` during recording) a requirement? A real waveform adds ~1–2 days of implementation. Recommendation: ship decorative for v1.

3. **Saving audio to the database:** Currently, audio blobs exist only as in-memory object URLs and are lost on page refresh. Should voice messages in the history (loaded on page reload) show as a text-only bubble (the transcript), or should they be invisible? Recommendation: show the transcript text only when loading from history; the audio bubble only exists for the current session. The `mapMessageRecord` function can detect a voice-message turn by checking if `user_text` is short and `response_text` exists (no schema change needed), or we add an optional `message_type` column to `chat_messages`.

4. **What happens if TTS is disabled?** The ack audio and full response audio are core to the voice-message UX. Should they bypass the `ttsEnabled` flag entirely, or should a disabled TTS flag also suppress voice-message audio? Recommendation: bypass — the voice flow is its own modality, separate from the TTS toggle.

---

## Definition of Done

- [ ] `POST /ai/voice-message` returns acknowledgement mp3 within 2 seconds on a stable connection.
- [ ] `GET /ai/voice-message/{id}/result` returns `status: "ready"` with transcript, response_text, and response_id after processing completes.
- [ ] Hold-to-record works on Chrome desktop, Firefox desktop, and mobile Safari (iOS).
- [ ] Slide-left cancel (> 80px) discards the recording without making any AI call.
- [ ] Acknowledgement audio plays immediately after release, regardless of `ttsEnabled` state.
- [ ] Full TTS response plays automatically when polling resolves.
- [ ] `VoiceMessageBubble` renders correctly for both user and assistant roles.
- [ ] Transcribed text appears in the user bubble after polling completes.
- [ ] Message is saved to `chat_messages` with `user_text = transcript`.
- [ ] `lastResponseId` is updated correctly for conversation continuity.
- [ ] `X-Voice-Message-ID` header is accessible from the browser (CORS expose header confirmed).
- [ ] Object URLs are revoked on component unmount (no memory leaks).
- [ ] Polling interval is cleared on component unmount.
- [ ] Existing text-input + text TTS + MQTT receiver flows pass manual regression.
- [ ] Backend `pytest` suite passes (add at minimum one test for the new endpoint's happy path and one for the result poll).
