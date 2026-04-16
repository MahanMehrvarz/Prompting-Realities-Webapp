# Efficiency Plan — Prompting Realities Webapp

Audit performed across the FastAPI backend, Next.js 16 / React 19 frontend, and the cross-cutting architecture (Supabase, OpenAI, MQTT). Every item below was verified against the current source. User-facing functionality is preserved for all recommendations in sections 2–3; sections 4–5 are opt-in refactors that may require care.

**This revision prioritises perceived speed** — what the user waits for on page loads, navigation, chat send, and TTS playback — over backend throughput or code cleanliness.

---

## 1. Executive Summary — ranked by user-perceived speed

The three flows a user waits on most are: **dashboard first-paint**, **chat send → response**, and **analysis-page navigation**. Items are ranked by their effect on those wall-clock times, with effort as a tie-breaker.

| Rank | Title | Flow it speeds up | Typical win | Effort | Key file |
|------|-------|-------------------|-------------|--------|----------|
| 1 | **Cache Fernet cipher** | every chat turn | ~100 ms per message | S | `backend/app/encryption.py:18-37` |
| 2 | **Bulk session-status endpoint** | dashboard first paint | 1–3 s on dashboards with many assistants | M | `frontend/src/app/page.tsx:299-365` |
| 3 | **Parallelise chat send flow** | chat send → response | 50–100 ms per message | M | `frontend/src/app/chat/[assistantId]/page.tsx:624-658` |
| 4 | **Cache `PyJWKClient`** | every authenticated request | 10–50 ms per auth | S | `backend/app/security.py:52` |
| 5 | **Singleton Supabase client** | every backend request | 5–20 ms per request, better keep-alive | S | `backend/app/routes/ai.py` (×12 sites) |
| 6 | **Cache admin check on frontend** | analysis-page navigation | kills a blocking round-trip on every nav | S | `frontend/src/app/admin/analysis/page.tsx:280` |
| 7 | **Add DB indexes on highlight / code FKs** | every quotation & thread query | large at scale, free today | S | Supabase schema |
| 8 | **Exponential backoff on voice-message polling** | voice messages | first result delivered faster, fewer reqs | S | `frontend/src/app/chat/[assistantId]/page.tsx:915-1043` |
| 9 | **Fix N+1 in `get_thread_conversation`** | opening a coded thread | grows with #highlights; O(n) → O(1) queries | S | `backend/app/routes/analysis.py:491-504` |
| 10 | **Trim `select("*")` on assistants** | chat + MQTT requests | smaller payload on every AI call | S | `backend/app/routes/ai.py` |
| 11 | **HTTP cache headers on stable GETs** | repeat navigation | second visit skips the network | S | backend routes |
| 12 | **`useMemo` for derived lists / sorts** | analysis pages during interaction | removes jank on filter/select | S | `…/lists/[listId]/codes/page.tsx:279-280` |
| 13 | **Fix full-table scan in `export_list`** | list export | DB-size-bounded → list-size-bounded | S | `backend/app/routes/analysis.py:1065` |

**What moved where vs. the previous ranking**
- The earlier ranking put every small-effort backend item at the top. This one puts the items that the user actually *feels* first: Fernet (every chat), bulk-status (every dashboard open), parallel chat send (every message).
- The N+1 fix and export-scan fix dropped because they only fire for specific interactions and don't change the default experience.
- Indexes stay near the top because they raise the floor on every list / quotation query without touching any code.

---

## Speed-first rollout plan

Do them in this order. Each batch is independently shippable and measurable.

**Batch A — one afternoon, biggest felt improvement**
1. Item 1 — Fernet cache
2. Item 4 — PyJWKClient cache
3. Item 5 — Supabase singleton
4. Item 7 — DB indexes (run the SQL once)
5. Item 6 — Frontend admin-check cache

After this batch, every page load and every chat turn should feel noticeably snappier, with zero user-visible change.

**Batch B — next day**
6. Item 2 — Bulk session-status endpoint
7. Item 3 — Parallelise chat send flow
8. Item 8 — Voice-message polling backoff
9. Item 10 — Trim column selects

This batch targets the two heaviest flows (dashboard load, chat send).

**Batch C — cleanup**
10. Item 9 — `get_thread_conversation` N+1
11. Item 11 — Cache headers
12. Item 12 — `useMemo`
13. Item 13 — Export scope

These are quality-of-life fixes; user may not notice individually, but they prevent future regressions.

---

## 2. Quick Wins (<1 hour each)

### 1. Cache the Fernet cipher in `encryption.py`

`_get_fernet()` currently runs `PBKDF2HMAC` with 100,000 SHA-256 iterations on **every** encrypt and decrypt call. Because `ENCRYPTION_SECRET` never changes within a process, the derived key can be computed once at import.

**Fix:** introduce a module-level cache.

```python
# backend/app/encryption.py
_FERNET: Fernet | None = None

def _get_fernet() -> Fernet:
    global _FERNET
    if _FERNET is not None:
        return _FERNET
    salt = b"prompting_realities_salt_v1"
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_SECRET.encode()))
    _FERNET = Fernet(key)
    return _FERNET
```

**Impact:** Every `/ai/chat` turn that decrypts an API key pays PBKDF2 today. On typical CPUs that is ~60–120 ms. Elimination is near-total.

### 2. Singleton Supabase client

`backend/app/routes/ai.py` constructs a new Supabase client in 12 handlers (lines 103, 114, 257, 268, 412, 423, 551, 562, 654, 663, 720, 730). The same pattern is in `assistants.py` and behind `get_supabase()` in `backend/app/routes/analysis.py:22`.

**Fix:** put one lazy-init singleton in `config.py` and import it everywhere.

```python
# backend/app/config.py
from supabase import create_client
_supabase = None

def get_supabase_client():
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase
```

**Impact:** each handler saves the HTTP client setup (~5–20 ms). Also enables keep-alive reuse across calls.

### 3. Cache `PyJWKClient`

`backend/app/security.py:52` instantiates a fresh `PyJWKClient` per RS256 request. The `cache_keys=True` flag only helps *within* the client instance, so a brand new instance still has to re-evaluate.

**Fix:**

```python
_jwks_clients: dict[str, PyJWKClient] = {}

def _get_jwks_client(supabase_url: str) -> PyJWKClient:
    client = _jwks_clients.get(supabase_url)
    if client is None:
        client = PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True)
        _jwks_clients[supabase_url] = client
    return client
```

**Impact:** 10–50 ms off every authenticated RS256 call.

### 4. Cache admin status on the frontend

Every analysis page checks membership in `admin_emails` from its mount effect — for example `frontend/src/app/admin/analysis/page.tsx:280` and `…/lists/[listId]/page.tsx:177`. During a single session the answer cannot change.

**Fix:** on first successful check, store `{ userId, isAdmin }` in `sessionStorage` and short-circuit subsequent mounts. Clear on sign-out (where the auth listener already fires).

**Impact:** removes 5–10 Supabase reads per navigation session; feels snappier on page transitions.

### 5. Add database indexes

Recommended in Supabase SQL editor (run once):

```sql
CREATE INDEX IF NOT EXISTS idx_ahc_highlight_id ON analysis_highlight_codes(highlight_id);
CREATE INDEX IF NOT EXISTS idx_ahc_code_id ON analysis_highlight_codes(code_id);
CREATE INDEX IF NOT EXISTS idx_ah_list_thread ON analysis_highlights(list_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_aih_assistant_list ON analysis_instruction_highlights(assistant_id, list_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_emails_email ON admin_emails(email);
```

**Impact:** Every thread-conversation load and list-quotation query currently relies on scans. With these indexes the hot joins become point lookups.

---

## 3. Medium Wins (~2–4 hours each)

### 6. Eliminate the N+1 in `get_thread_conversation`

`backend/app/routes/analysis.py:491-504` issues one `analysis_highlight_codes` query per highlight. Replace with a single batch fetch and group in Python.

```python
if list_id != "none":
    highlights_res = sb.table("analysis_highlights").select("*") \
        .eq("list_id", list_id).eq("thread_id", thread_id).execute()
    raw_highlights = highlights_res.data or []
    hl_ids = [h["id"] for h in raw_highlights]
    codes_by_hl: dict[str, list] = {}
    if hl_ids:
        res = sb.table("analysis_highlight_codes") \
            .select("highlight_id, assigned_by, assigned_at, analysis_codes(id, name, color)") \
            .in_("highlight_id", hl_ids).execute()
        for c in (res.data or []):
            code = c.get("analysis_codes") or {}
            codes_by_hl.setdefault(c["highlight_id"], []).append({
                "id": code.get("id"),
                "name": code.get("name"),
                "color": code.get("color"),
                "assigned_by": c["assigned_by"],
                "assigned_at": c["assigned_at"],
            })
    for h in raw_highlights:
        h["codes"] = codes_by_hl.get(h["id"], [])
        highlights.append(h)
```

**Impact:** constant database round-trips regardless of how many highlights a thread has.

### 7. Scope the `analysis_highlight_codes` scan in `export_list`

`backend/app/routes/analysis.py:1065` reads every row in the entire table, regardless of the list being exported. Filter to the highlight IDs that belong to this list:

```python
hl_ids = [h["id"] for h in (highlights_res.data or [])]
if hl_ids:
    hc_res = sb.table("analysis_highlight_codes").select("*") \
        .in_("highlight_id", hl_ids).execute()
else:
    hc_res = type("Empty", (), {"data": []})()
```

**Impact:** export time becomes proportional to list size; currently it grows with the entire database.

### 8. Parallelise the chat-send flow

In `frontend/src/app/chat/[assistantId]/page.tsx:624-658` the sequence is:

1. `supabase.auth.getUser()`
2. `supabase.from("assistants").select("*")`
3. `await backendApi.chat()`
4. `await backendApi.publishMqtt()`
5. `await messageService.create()`

Steps 1 and 2 are independent; run them together. Steps 4 and 5 both depend on the AI response but are independent of each other; run them together too.

```typescript
const [{ data: { user } }, { data: assistant }] = await Promise.all([
  supabase.auth.getUser(),
  supabase.from("assistants").select("id, mqtt_host, mqtt_port, mqtt_topic, mqtt_user, mqtt_pass, name").eq("id", assistantId).single(),
]);
const aiResponse = await backendApi.chat({ /* … */ }, token);
await Promise.all([
  (assistant?.mqtt_host && assistant?.mqtt_topic)
    ? backendApi.publishMqtt({ /* … */ }, token)
    : Promise.resolve(null),
  messageService.create({ /* … */ }),
]);
```

**Impact:** 50–100 ms per chat message on typical networks. Also trims the assistants `select("*")` to only the MQTT-relevant columns (see item 11 below).

### 9. Bulk session-status endpoint

`frontend/src/app/page.tsx:299-365` calls `sessionService.getLatestForAssistant()` in a loop. With ten assistants that is ten sequential Supabase calls just to paint the dashboard.

**Fix:** add one backend endpoint returning all statuses in a single query:

```
GET /sessions/status?assistant_ids=a,b,c
→ { [assistantId]: { status, active_session_id, last_heartbeat_at } }
```

**Impact:** 1–3 s shaved off initial dashboard load when the user owns many assistants.

### 10. Trim column lists where `select("*")` is used

Multiple handlers in `backend/app/routes/ai.py` and `assistants.py` select the entire assistants row. Request only what you use:

* `/ai/chat` needs `openai_key, prompt_instruction, json_schema, name`
* `/ai/mqtt/publish` needs `mqtt_host, mqtt_port, mqtt_topic, mqtt_user, mqtt_pass, name`
* `/ai/tts` needs `openai_key, tts_voice`
* `/assistants/get-api-key/{id}` needs `openai_key`

**Impact:** lower bandwidth and memory; smaller Pydantic parsing cost on every request.

### 11. `useMemo` for expensive derived state

`frontend/src/app/admin/analysis/lists/[listId]/codes/page.tsx:279-280` rebuilds `grouped` / `ungrouped` on every render. The thread pages recompute `visible` from filter + sort state on every keystroke.

Wrap in `useMemo` keyed on the actual dependencies. No behavioural change.

### 12. Exponential backoff for voice-message polling

`frontend/src/app/chat/[assistantId]/page.tsx:915-1043` polls every 1.5 s for up to 60 s (about 40 requests per voice turn). Start at 500 ms, multiply by 1.3 each poll, cap at 3 s.

**Impact:** roughly one-quarter the requests for the same latency profile; faster first-response in the common-case where the result is ready inside 1 s.

### 13. HTTP cache headers on cacheable GETs

Several endpoints are safe to cache in the browser:

* `GET /ai/mqtt/credentials/{assistant_id}` — stable for minutes
* `GET /assistants/get-api-key/{assistant_id}` — boolean "does a key exist" check
* `GET /analysis/lists/{list_id}/codes` — changes infrequently
* `POST /ai/tts` — audio can be cached by hash

Set `Cache-Control: private, max-age=60` plus an ETag derived from the payload. For TTS, `Cache-Control: public, max-age=31536000` is fine because the audio is identified by content hash.

**Impact:** repeated navigations inside the app skip the network entirely.

---

## 4. Larger Refactors (opt-in)

### 14. Async-safe Supabase calls

All `supabase.table(...).execute()` calls are synchronous but sit inside `async def` handlers, blocking the event loop. After #2 lands, wrap hot paths with `await asyncio.to_thread(lambda: …execute())`. Do this file by file and test; the risk is small but non-zero.

### 15. Stream the JSON export

`backend/app/routes/analysis.py:1113-1149` builds the full payload in memory. For very large lists this is an OOM hazard. Adopt the same generator pattern already used for CSV so JSON streams row-by-row.

### 16. Virtualise the quotations list

`frontend/src/app/admin/analysis/lists/[listId]/codes/page.tsx` renders every highlight in one DOM tree. Once a list crosses ~300 quotes, scroll paint jank is noticeable. Introduce `react-window` or cursor pagination (`?cursor=…&limit=50`). Keep the current rendering when count is small.

### 17. Split the 1,973-line `frontend/src/app/page.tsx`

Monolithic dashboard with 11+ modals and 30+ handlers. Extract:

* `AssistantCard`
* `AssistantConfigPanel`
* `MqttFeedPanel`
* `SessionLinkPanel`
* Modal components to their own files

This unlocks targeted `React.memo` / `useCallback` work in the children.

### 18. Conversation summarisation for long chats

`backend/app/conversation_service.py:83-182` always chains through `previous_response_id`. After ~10 turns the prompt can grow large. Summarise older turns into a short system note and reset context. Gate behind an assistant-level flag so existing flows are untouched.

---

## 5. Non-performance items worth noting

* **CORS** — `backend/app/main.py:24-31` uses `allow_origins=["*"]`. It is safe today because `allow_credentials=False`, but narrow it to the deployed frontend origin before any credentialed flow is added.
* **MQTT cleanup** — `backend/app/mqtt_manager.py:131-148` has a narrow window where `loop_start()` has been called but registration in `self._connections` fails. Add a `finally` block that calls `client.loop_stop()` if `success` is never set to `True`, to prevent the background thread lingering.

---

## 6. Suggested rollout order

1. **PR #1 — Quick wins:** items 1, 2, 3, 6, 8. Small diff, measurable latency drop.
2. **PR #2 — Query tightening:** items 4, 5, 7, 10. All backend; each is a small, localised change.
3. **PR #3 — Frontend UX:** items 11, 12, 13. Feel-good improvements in the chat and analysis screens.
4. **Opt-in track:** items 14–18, one at a time, with explicit test coverage.

After each PR, confirm the user-facing behaviour is unchanged by walking through the key flows:

* Sign in → dashboard loads assistants
* Open chat → send a message → hear TTS
* Open analysis → pick a list → code a message → code an instruction → see it in the Codes & Quotations tab

If every step still works, the change qualifies.
