# Analysis Feature: Qualitative Coding for Human-AI Interactions

## 1. Feature Overview & Goals

This feature introduces a qualitative analysis workspace into the admin interface, enabling researchers to systematically code and annotate human-AI conversations. The design is inspired by tools like Atlas.ti and NVivo, adapted for the specific context of reviewing and tagging chat data produced by AI assistants configured in the platform.

**Goals:**
- Allow one or more admins to organize assistants into named projects (called "Favorite Lists" in the UI, "lists" in the data model).
- Provide a read-only conversation viewer where arbitrary spans of text can be selected and annotated with codes.
- Maintain a per-project codebook with optional thematic grouping.
- Export coded data (codes + full quotations) in CSV or JSON for use in external analysis tools.
- Attribute all coding actions to the admin who performed them, without requiring complex permission management.

**Non-goals (in scope of this document):**
- Real-time collaborative editing or conflict resolution.
- Complex RBAC or per-code permissions.
- Quantitative analytics dashboards (deferred).

---

## 2. Core Concepts & Terminology

| Term | Definition |
|---|---|
| **List** | A named project container. Holds a set of assistants, a codebook, and all highlights produced within that project. Analogous to an Atlas.ti project. |
| **List Item** | A reference linking an assistant to a list. Adding an assistant to a list does not copy data; it scopes which conversations are accessible within that project. |
| **Code** | A named, colored label applied to a highlight. Belongs to exactly one list. Optionally assigned to a theme group. |
| **Code Group** (Theme) | A flat grouping of codes within a list. One level only. Analogous to a "theme" or "category" in NVivo. |
| **Highlight** | A saved text selection within a conversation thread. Captures the selected string, character offsets, source field(s), and references to the involved chat message(s). |
| **Highlight–Code Assignment** | The many-to-many link between a highlight and one or more codes. |
| **Thread** | A sequence of chat messages sharing a `thread_id`, tied to one assistant and one session. |
| **Conversation View** | The read-only page that renders a thread and supports highlighting and code assignment. |
| **Codebook** | The full set of codes (and their groups) defined within a list. |

---

## 3. User Stories

### Layout & Navigation
- As an admin, all analysis pages share a persistent sticky header showing a "Dashboard" link, the "Analysis" label, and a dynamic breadcrumb that updates based on current page depth (e.g. Analysis / My List / GPT-4o / …abc12345), so I can navigate back and forth without losing context.
- As an admin, analysis pages use full browser width (up to 1536px) so that cards and conversation views can make use of available screen space.

### List Management
- As an admin, I can create a new list with a name and optional description so that I can scope my analysis project.
- As an admin, I can rename or delete a list. Deleting a list cascades to all its items, codes, groups, and highlights.
- As an admin, I can see all lists I and other admins have created on the main analysis page, with item count and code count shown on each list card.

### Assistant & Thread Browsing
- As an admin, I can search all non-deleted assistants from the main analysis page to identify relevant ones to include in a project.
- As an admin, each assistant card on the browse page shows: assistant name, date created, total thread count, last used date, and which lists it belongs to — without showing the system prompt text.
- As an admin, I can click an assistant card (when it belongs to at least one list) to navigate directly to its thread list. If it belongs to multiple lists, a picker popover lets me choose which list context to open.
- As an admin, I can add an assistant to one or more lists from the assistant card via the "+ Lists" button.
- As an admin, I can open a list and see all assistants added to it as cards showing: thread count, last used date, date added, and added-by.
- As an admin, I can click an assistant card within a list to browse all its threads (sessions), seeing message count, start date, last activity date, and whether the thread has any codes.
- As an admin, I can filter the thread list by "coded only" (threads with at least one highlight), and sort/filter by date started or last activity with a date range picker.
- As an admin, I can click a thread to open the conversation view.
- As an admin, I can see at a glance which threads have codes (highlighted badge with count) without opening them.

### Coding (Message-Level)
- As an admin, I can click on any message bubble in the conversation view to select it; selected messages show a checkmark indicator.
- As an admin, I can select multiple messages at once (any combination of user and assistant turns) and code them all in one action.
- As an admin, a floating action bar appears at the bottom of the screen whenever I have one or more messages selected, showing a count and an "Assign code" button.
- As an admin, clicking "Assign code" opens a code tooltip (centered at the bottom of the viewport) where I can search existing codes or create a new one.
- As an admin, I can create a new code directly from the tooltip if no existing code fits, and it is immediately applied to the selected messages.
- As an admin, after assigning a code, the selection is cleared and the coded messages show color chips indicating which codes have been applied.
- As an admin, I can apply multiple codes to the same message by selecting it again and assigning another code.
- As an admin, I can remove a code assignment from a message directly from the code chip shown on the message bubble.

### Codebook Management
- As an admin, I can view all codes in the current list's codebook in a collapsible side panel within the conversation view.
- As an admin, each code in the codebook shows its name, color, and usage count (number of highlights it has been applied to).
- As an admin, I can click a code name in the codebook to navigate to the code's quotations page, where I can review all messages tagged with that code across all threads.
- As an admin, I can rename, recolor, or add a description to any code.
- As an admin, I can create and rename code groups (themes) and assign codes to them.
- As an admin, I can delete a code; this removes all its highlight assignments but does not delete the highlights themselves.

### Code Quotations Page
- As an admin, I can navigate to a dedicated page for any code that shows all messages tagged with that code, grouped by thread.
- As an admin, consecutive highlights from the same thread created within 5 minutes of each other are merged into a single card showing the full continuous dialogue, with a badge indicating "N messages · continuous dialogue" and dashed dividers between exchanges.
- As an admin, each quotation card shows the user and assistant message bubbles tinted in the code's color, along with the creator's email and timestamp.
- As an admin, each thread group on the quotations page has a link to open the full thread in the conversation view.

### Export
- As an admin, I can export a list's codebook and all associated quotes in CSV or JSON format.
- Exported quotes include the full message text for context.

### Attribution
- As an admin, I can see who created a highlight or assigned a code, via a simple "created by [email]" label on every quotation card and highlight chip.

---

## 4. Database Schema

All tables live in the same Supabase PostgreSQL instance as existing tables. All `id` columns use `uuid` with `gen_random_uuid()` default. All timestamps are `timestamptz` defaulting to `now()`.

---

### 4.1 `analysis_lists`

```sql
CREATE TABLE analysis_lists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(name) > 0),
  description   text,
  created_by    text NOT NULL REFERENCES admin_emails(email) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX idx_analysis_lists_created_by ON analysis_lists(created_by);
CREATE INDEX idx_analysis_lists_deleted_at ON analysis_lists(deleted_at);
```

**Notes:**
- Soft-delete via `deleted_at`. All queries filter `WHERE deleted_at IS NULL` unless explicitly retrieving deleted lists.
- `created_by` is informational; any admin can modify any list (no ownership lock).
- RLS: Enable RLS on table. Policy: allow SELECT/INSERT/UPDATE/DELETE for any authenticated user whose email exists in `admin_emails`.

---

### 4.2 `analysis_list_items`

```sql
CREATE TABLE analysis_list_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id       uuid NOT NULL REFERENCES analysis_lists(id) ON DELETE CASCADE,
  assistant_id  uuid NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
  added_by      text NOT NULL REFERENCES admin_emails(email) ON DELETE RESTRICT,
  added_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, assistant_id)
);

CREATE INDEX idx_analysis_list_items_list_id ON analysis_list_items(list_id);
CREATE INDEX idx_analysis_list_items_assistant_id ON analysis_list_items(assistant_id);
```

**Notes:**
- `UNIQUE (list_id, assistant_id)` prevents duplicate entries.
- Cascade from `analysis_lists` means removing a list removes all its items.
- Cascade from `assistants` means if an assistant record is hard-deleted (not soft-deleted), items are cleaned up. For soft-deleted assistants, the item row remains but the frontend excludes them via a join on `assistants.deleted_at IS NULL`.

---

### 4.3 `analysis_code_groups`

```sql
CREATE TABLE analysis_code_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id       uuid NOT NULL REFERENCES analysis_lists(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) > 0),
  color         text NOT NULL DEFAULT '#94a3b8',
  created_by    text NOT NULL REFERENCES admin_emails(email) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_code_groups_list_id ON analysis_code_groups(list_id);
```

**Notes:**
- `color` is stored as a hex string (e.g. `#f59e0b`). Frontend enforces valid hex.
- Deleting a group does not delete its codes; codes become ungrouped (`group_id` set to NULL via ON DELETE SET NULL on the FK in `analysis_codes`).

---

### 4.4 `analysis_codes`

```sql
CREATE TABLE analysis_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id       uuid NOT NULL REFERENCES analysis_lists(id) ON DELETE CASCADE,
  group_id      uuid REFERENCES analysis_code_groups(id) ON DELETE SET NULL,
  name          text NOT NULL CHECK (char_length(name) > 0),
  color         text NOT NULL DEFAULT '#fbbf24',
  description   text,
  created_by    text NOT NULL REFERENCES admin_emails(email) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, name)
);

CREATE INDEX idx_analysis_codes_list_id ON analysis_codes(list_id);
CREATE INDEX idx_analysis_codes_group_id ON analysis_codes(group_id);
```

**Notes:**
- `UNIQUE (list_id, name)` enforces that code names are unique within a list's codebook.
- `group_id` is nullable; `ON DELETE SET NULL` means deleting a group ungrouped its codes rather than deleting them.
- Deleting a code cascades to `analysis_highlight_codes` (via FK defined there), not to the highlights themselves.

---

### 4.5 `analysis_highlights`

```sql
CREATE TYPE analysis_source_field AS ENUM ('user_text', 'response_text', 'both');

CREATE TABLE analysis_highlights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id         uuid NOT NULL REFERENCES analysis_lists(id) ON DELETE CASCADE,
  thread_id       text NOT NULL,
  session_id      text NOT NULL,
  assistant_id    uuid NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
  selected_text   text NOT NULL CHECK (char_length(selected_text) > 0),
  message_ids     uuid[] NOT NULL,
  char_start      int NOT NULL CHECK (char_start >= 0),
  char_end        int NOT NULL CHECK (char_end > char_start),
  source_field    analysis_source_field NOT NULL,
  created_by      text NOT NULL REFERENCES admin_emails(email) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_highlights_list_id ON analysis_highlights(list_id);
CREATE INDEX idx_analysis_highlights_thread_id ON analysis_highlights(thread_id);
CREATE INDEX idx_analysis_highlights_assistant_id ON analysis_highlights(assistant_id);
CREATE INDEX idx_analysis_highlights_session_id ON analysis_highlights(session_id);
```

**Notes:**
- `message_ids` is a PostgreSQL native array of UUIDs. It contains one UUID when the highlight is within a single message; two or more when the selection spans multiple messages.
- `char_start` and `char_end` are character offsets into the **concatenated display text** rendered in the conversation view. The frontend is responsible for computing these offsets at selection time and using them consistently at render time. For multi-message spans, the frontend concatenates all involved message fields (in display order) to a single string and records offsets into that string.
- `source_field = 'both'` indicates the selection starts in `user_text` of one message and ends in `response_text` of another (or the same) message.
- `session_id` and `thread_id` are plain `text` to match the existing schema of `assistant_sessions`.
- RLS: same admin-email policy as other analysis tables.

---

### 4.6 `analysis_highlight_codes`

```sql
CREATE TABLE analysis_highlight_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id   uuid NOT NULL REFERENCES analysis_highlights(id) ON DELETE CASCADE,
  code_id        uuid NOT NULL REFERENCES analysis_codes(id) ON DELETE CASCADE,
  assigned_by    text NOT NULL REFERENCES admin_emails(email) ON DELETE RESTRICT,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (highlight_id, code_id)
);

CREATE INDEX idx_analysis_highlight_codes_highlight_id ON analysis_highlight_codes(highlight_id);
CREATE INDEX idx_analysis_highlight_codes_code_id ON analysis_highlight_codes(code_id);
```

**Notes:**
- `UNIQUE (highlight_id, code_id)` prevents assigning the same code to the same highlight twice.
- Cascades from both sides: deleting a highlight removes its code assignments; deleting a code removes its assignments but not the highlights.

---

## 5. API Routes

All routes are prefixed under `/analysis`. All routes require admin authentication (email must exist in `admin_emails`). Authentication uses the same Supabase JWT mechanism as other admin routes.

### 5.1 Lists

| Method | Path | Description |
|---|---|---|
| GET | `/analysis/lists` | Get all non-deleted lists |
| POST | `/analysis/lists` | Create a new list |
| GET | `/analysis/lists/{list_id}` | Get a single list by ID |
| PATCH | `/analysis/lists/{list_id}` | Update name or description |
| DELETE | `/analysis/lists/{list_id}` | Soft-delete a list |

**GET `/analysis/lists`**
Response:
```json
[
  {
    "id": "uuid",
    "name": "string",
    "description": "string | null",
    "created_by": "email",
    "created_at": "ISO8601",
    "item_count": 3,
    "code_count": 12
  }
]
```

**POST `/analysis/lists`**
Request body:
```json
{ "name": "string", "description": "string | null" }
```
Response: full list object (same shape as GET single, without aggregate counts).

**PATCH `/analysis/lists/{list_id}`**
Request body (all fields optional):
```json
{ "name": "string", "description": "string | null" }
```

**DELETE `/analysis/lists/{list_id}`**
Sets `deleted_at = now()`. Returns `204 No Content`.

---

### 5.2 List Items (Assistants in a List)

| Method | Path | Description |
|---|---|---|
| GET | `/analysis/lists/{list_id}/items` | Get all non-deleted assistants in a list |
| POST | `/analysis/lists/{list_id}/items` | Add an assistant to a list |
| DELETE | `/analysis/lists/{list_id}/items/{assistant_id}` | Remove an assistant from a list |

**GET `/analysis/lists/{list_id}/items`**
Joins with `assistants` and filters `assistants.deleted_at IS NULL`.
Response:
```json
[
  {
    "id": "uuid",
    "assistant_id": "uuid",
    "assistant_name": "string",
    "assistant_system_prompt": "string",
    "added_by": "email",
    "added_at": "ISO8601"
  }
]
```

**POST `/analysis/lists/{list_id}/items`**
Request body:
```json
{ "assistant_id": "uuid" }
```
Returns `201 Created` with the created item object. Returns `409 Conflict` if already added.

**DELETE `/analysis/lists/{list_id}/items/{assistant_id}`**
Returns `204 No Content`.

---

### 5.3 Assistants Browse (for adding to lists)

| Method | Path | Description |
|---|---|---|
| GET | `/analysis/assistants` | List all non-deleted assistants with list membership info |

**GET `/analysis/assistants`**
Query params: `search` (string, optional), `page` (int, default 1), `page_size` (int, default 20).
Response:
```json
{
  "total": 42,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": "uuid",
      "name": "string",
      "created_at": "ISO8601",
      "list_memberships": ["list_uuid_1", "list_uuid_2"],
      "thread_count": 12,
      "last_used": "ISO8601 | null"
    }
  ]
}
```
`list_memberships` is the array of list IDs the assistant already belongs to — used to show "added" badge on cards.

---

### 5.4 Threads Browser

| Method | Path | Description |
|---|---|---|
| GET | `/analysis/lists/{list_id}/assistant/{assistant_id}/threads` | List threads for an assistant within a list context |

**GET `/analysis/lists/{list_id}/assistant/{assistant_id}/threads`**
Queries `assistant_sessions` for the given `assistant_id`. Returns sessions with message counts and highlight counts scoped to `list_id`.
Response:
```json
[
  {
    "thread_id": "string",
    "session_id": "string",
    "device_id": "string",
    "message_count": 14,
    "highlight_count": 3,
    "first_message_at": "ISO8601",
    "last_message_at": "ISO8601"
  }
]
```

---

### 5.5 Conversation Messages

| Method | Path | Description |
|---|---|---|
| GET | `/analysis/lists/{list_id}/thread/{thread_id}` | Get all messages in a thread with highlights |

**GET `/analysis/lists/{list_id}/thread/{thread_id}`**
Response:
```json
{
  "thread_id": "string",
  "assistant_id": "uuid",
  "messages": [
    {
      "id": "uuid",
      "session_id": "string",
      "user_text": "string",
      "response_text": "string",
      "created_at": "ISO8601",
      "reaction": "string | null"
    }
  ],
  "highlights": [
    {
      "id": "uuid",
      "selected_text": "string",
      "message_ids": ["uuid"],
      "char_start": 0,
      "char_end": 42,
      "source_field": "response_text",
      "created_by": "email",
      "created_at": "ISO8601",
      "codes": [
        {
          "id": "uuid",
          "name": "string",
          "color": "#hex",
          "assigned_by": "email",
          "assigned_at": "ISO8601"
        }
      ]
    }
  ]
}
```

---

### 5.6 Code Groups

| Method | Path | Description |
|---|---|---|
| GET | `/analysis/lists/{list_id}/code-groups` | Get all code groups in a list |
| POST | `/analysis/lists/{list_id}/code-groups` | Create a code group |
| PATCH | `/analysis/lists/{list_id}/code-groups/{group_id}` | Update name or color |
| DELETE | `/analysis/lists/{list_id}/code-groups/{group_id}` | Delete group (ungrouped codes, not deleted) |

Group object:
```json
{
  "id": "uuid",
  "list_id": "uuid",
  "name": "string",
  "color": "#hex",
  "created_by": "email",
  "created_at": "ISO8601",
  "code_count": 4
}
```

---

### 5.7 Codes

| Method | Path | Description |
|---|---|---|
| GET | `/analysis/lists/{list_id}/codes` | Get all codes in a list (with group info and usage count) |
| POST | `/analysis/lists/{list_id}/codes` | Create a code |
| PATCH | `/analysis/lists/{list_id}/codes/{code_id}` | Update name, color, description, group_id |
| DELETE | `/analysis/lists/{list_id}/codes/{code_id}` | Delete a code and its assignments |

Code object:
```json
{
  "id": "uuid",
  "list_id": "uuid",
  "group_id": "uuid | null",
  "group_name": "string | null",
  "name": "string",
  "color": "#hex",
  "description": "string | null",
  "created_by": "email",
  "created_at": "ISO8601",
  "usage_count": 7
}
```

**POST `/analysis/lists/{list_id}/codes`** request body:
```json
{
  "name": "string",
  "color": "#hex",
  "description": "string | null",
  "group_id": "uuid | null"
}
```

---

### 5.8 Highlights

| Method | Path | Description |
|---|---|---|
| POST | `/analysis/highlights` | Create a new highlight |
| DELETE | `/analysis/highlights/{highlight_id}` | Delete a highlight and all its code assignments |

**POST `/analysis/highlights`** request body:
```json
{
  "list_id": "uuid",
  "thread_id": "string",
  "session_id": "string",
  "assistant_id": "uuid",
  "selected_text": "string",
  "message_ids": ["uuid"],
  "char_start": 0,
  "char_end": 42,
  "source_field": "user_text | response_text | both"
}
```
Returns `201 Created` with the created highlight object (without codes, since codes are assigned separately).

---

### 5.9 Highlight–Code Assignments

| Method | Path | Description |
|---|---|---|
| POST | `/analysis/highlights/{highlight_id}/codes` | Assign a code to a highlight |
| DELETE | `/analysis/highlights/{highlight_id}/codes/{code_id}` | Remove a code assignment |

**POST `/analysis/highlights/{highlight_id}/codes`** request body:
```json
{ "code_id": "uuid" }
```
Returns `201 Created` with the assignment object. Returns `409 Conflict` if already assigned.

---

### 5.10 Export

| Method | Path | Description |
|---|---|---|
| GET | `/analysis/lists/{list_id}/export` | Export codebook and quotes |

**GET `/analysis/lists/{list_id}/export`**
Query params: `format` = `csv` or `json` (default `json`).

**JSON response shape:**
```json
{
  "list_name": "string",
  "exported_at": "ISO8601",
  "codes": [
    {
      "code_id": "uuid",
      "code_name": "string",
      "code_color": "#hex",
      "group_name": "string | null",
      "description": "string | null",
      "usage_count": 3,
      "quotes": [
        {
          "highlight_id": "uuid",
          "selected_text": "string",
          "full_user_text": "string | null",
          "full_response_text": "string | null",
          "assistant_name": "string",
          "thread_id": "string",
          "session_id": "string",
          "created_by": "email",
          "created_at": "ISO8601",
          "assigned_by": "email"
        }
      ]
    }
  ]
}
```

**CSV format:** One row per highlight–code pair. Columns: `code_name`, `group_name`, `selected_text`, `full_user_text`, `full_response_text`, `assistant_name`, `thread_id`, `session_id`, `highlight_created_by`, `highlight_created_at`, `assigned_by`. File name: `{list_name}-export-{date}.csv`.

---

## 6. Frontend Pages & Components

### 6.1 Page: `/admin/analysis`

**Purpose:** Entry point for the analysis feature. Two main panels:
1. Left/top: Browse all non-deleted assistants. Search bar + grid of `AssistantCard` components (4 per row).
2. Right/bottom (or tab): Manage lists. Show all lists as cards; create new list button.

**State:**
- `assistants: AssistantSummary[]` — fetched from `GET /analysis/assistants`
- `lists: AnalysisList[]` — fetched from `GET /analysis/lists`
- `search: string` — debounced search input
- `addToListModal: { open: boolean, assistantId: string | null }` — controls "pick a list" modal

**Key interactions:**
- Clicking an assistant card's "Add to List" button opens a modal listing all lists with checkboxes. Submitting calls `POST /analysis/lists/{list_id}/items` for newly checked lists.
- Clicking a list card navigates to `/admin/analysis/lists/[listId]`.
- "New List" button opens an inline form or modal with name + description fields.

---

### 6.2 Page: `/admin/analysis/lists/[listId]`

**Purpose:** List/project view. Shows:
- List metadata (name, description, created by, created at). Edit button.
- Grid of assistant cards for assistants added to this list.
- `CodebookPanel` as a collapsible right sidebar (or bottom drawer on narrow screens).
- Export button (triggers format selection then download).

**State:**
- `list: AnalysisList`
- `items: ListItem[]`
- `codes: AnalysisCode[]`
- `codeGroups: AnalysisCodeGroup[]`
- `codebookOpen: boolean`

**Key interactions:**
- Clicking an assistant card navigates to `/admin/analysis/lists/[listId]/assistant/[assistantId]`.
- Remove assistant button on each card calls `DELETE /analysis/lists/{list_id}/items/{assistant_id}`.
- Export button opens a small dropdown: "Export as JSON" / "Export as CSV". Triggers file download.

---

### 6.3 Page: `/admin/analysis/lists/[listId]/assistant/[assistantId]`

**Purpose:** Thread browser. Shows all threads (sessions) for the given assistant, scoped to the list context.

**Layout:** List of `ThreadCard` components. Each card shows: session ID (truncated), device ID, message count, highlight count (from this list), first/last message timestamps.

**State:**
- `threads: ThreadSummary[]` — fetched from `GET /analysis/lists/{list_id}/assistant/{assistant_id}/threads`
- `assistantName: string` — from the list items already loaded or a lightweight fetch

**Key interactions:**
- Clicking a thread card navigates to `/admin/analysis/lists/[listId]/thread/[threadId]`.
- Back button returns to the list view.

---

### 6.4 Page: `/admin/analysis/lists/[listId]/thread/[threadId]`

**Purpose:** Conversation view with highlighting and coding.

**Layout:**
- Left column (narrow, collapsible): `CodebookPanel` — shows codes for this list.
- Main column: `HighlightableText` renders the full conversation thread, message by message.
- Floating: `CodeTooltip` appears at the selection position when text is selected.

**State:**
- `messages: ChatMessage[]`
- `highlights: HighlightWithCodes[]`
- `codes: AnalysisCode[]`
- `codeGroups: AnalysisCodeGroup[]`
- `activeSelection: SelectionState | null` — tracks current text selection for tooltip
- `activeHighlight: string | null` — highlight ID currently hovered/clicked (for popover detail)

**Data flow:**
1. On mount: fetch `GET /analysis/lists/{list_id}/thread/{thread_id}`. Populate messages and highlights.
2. User selects text → browser `selection` event captured → compute offsets → set `activeSelection` → show `CodeTooltip`.
3. User picks or creates code in tooltip → `POST /analysis/highlights` → `POST /analysis/highlights/{id}/codes` → refetch highlights → re-render.

---

### 6.5 Component: `AssistantCard`

**Props:**
```typescript
interface AssistantCardProps {
  assistant: {
    id: string;
    name: string;
    system_prompt: string;
    created_at: string;
    list_memberships: string[];
  };
  allLists: AnalysisList[];
  onAddToList: (assistantId: string, listId: string) => void;
  onRemoveFromList?: (assistantId: string, listId: string) => void;
  variant: 'browse' | 'list-item';
}
```

**Appearance:** Rounded card with assistant name, a truncated system prompt preview (2 lines max), created date. "In [N] lists" badge if `list_memberships.length > 0`. "Add to List" button (browse variant) or "Remove" button (list-item variant).

---

### 6.6 Component: `ThreadCard`

**Props:**
```typescript
interface ThreadCardProps {
  thread: {
    thread_id: string;
    session_id: string;
    device_id: string;
    message_count: number;
    highlight_count: number;
    first_message_at: string;
    last_message_at: string;
  };
  onClick: () => void;
}
```

**Appearance:** Card with thread ID (last 8 chars), device ID, message count, highlight count (with a tag icon), and relative timestamps. Highlight count shown as a colored badge if > 0.

---

### 6.7 Component: `HighlightableText`

**Purpose:** Renders a full conversation thread. Wraps each message's `user_text` and `response_text` in a container that supports text selection and renders overlaid highlight spans.

**Props:**
```typescript
interface HighlightableTextProps {
  messages: ChatMessage[];
  highlights: HighlightWithCodes[];
  onSelectionChange: (selection: SelectionState | null) => void;
  activeHighlightId: string | null;
  onHighlightClick: (highlightId: string) => void;
}
```

**Internal logic:**
- Each message is rendered in two blocks: user bubble (right-aligned) and assistant bubble (left-aligned), matching the existing chat UI conventions.
- Each text block has a `data-message-id` and `data-field` (`user_text` or `response_text`) attribute on its wrapper.
- On `mouseup` / `pointerup`, the component reads `window.getSelection()`, walks the DOM to find the enclosing message wrapper(s), computes character offsets, and calls `onSelectionChange` with a `SelectionState` object.
- Highlights are rendered as `<mark>` elements with inline `background-color` from the first assigned code's color. When multiple codes are applied, a small stacked-pill indicator is shown at the right edge of the highlight span.
- Highlights are sorted by `char_start` within each message block to avoid DOM conflicts. Overlapping highlights are rendered in layers (later highlight on top, semi-transparent).

**SelectionState type:**
```typescript
interface SelectionState {
  selectedText: string;
  messageIds: string[];
  charStart: number;
  charEnd: number;
  sourceField: 'user_text' | 'response_text' | 'both';
  anchorRect: DOMRect;
}
```

---

### 6.8 Component: `CodeTooltip`

**Purpose:** Floating popup that appears at the text selection position. Allows picking an existing code or creating a new one.

**Props:**
```typescript
interface CodeTooltipProps {
  selection: SelectionState;
  listId: string;
  codes: AnalysisCode[];
  onCodeSelect: (codeId: string) => void;
  onCodeCreate: (name: string, color: string) => Promise<string>; // returns new code id
  onDismiss: () => void;
}
```

**Layout:**
- Positioned absolutely using `selection.anchorRect` (appears above the selection end, or below if near the top of the viewport).
- Search input at the top (auto-focused). Placeholder: "Search or create code…".
- Scrollable list below the input: codes filtered by fuzzy match against the search string. Each item shows a color dot, code name, and usage count. Highlighted on hover. Click to apply.
- If no exact match exists and the search field is non-empty, a "Create '[search term]'" option appears at the bottom of the list with a "+" icon. Clicking it picks a random color from a preset palette, calls `onCodeCreate`, then immediately calls `onCodeSelect` with the returned ID.
- "Cancel" / click-away dismisses the tooltip.

**Fuzzy matching:** Uses a simple trigram or prefix/contains match. No external library required. Case-insensitive.

---

### 6.9 Component: `CodebookPanel`

**Purpose:** Right sidebar (or collapsible drawer) showing all codes and groups for the current list.

**Props:**
```typescript
interface CodebookPanelProps {
  listId: string;
  codes: AnalysisCode[];
  codeGroups: AnalysisCodeGroup[];
  onCodeUpdate: (codeId: string, updates: Partial<AnalysisCode>) => void;
  onCodeDelete: (codeId: string) => void;
  onGroupCreate: (name: string) => void;
  onGroupUpdate: (groupId: string, updates: Partial<AnalysisCodeGroup>) => void;
  onGroupDelete: (groupId: string) => void;
  readOnly?: boolean;
}
```

**Layout:**
- Header: "Codebook" title + "New Code" button + "New Group" button.
- Codes grouped by their `group_name`, with an "Ungrouped" section at the bottom for codes with no group.
- Each code row: color swatch (clickable to open color picker) | code name (inline-editable on click) | usage count badge | kebab menu (Rename, Change color, Edit description, Move to group, Delete).
- Each group row: group name (inline-editable) | code count | collapse/expand toggle | kebab menu (Rename, Recolor, Delete group).
- Deleting a group shows a confirmation: "Codes will be moved to Ungrouped." Deleting a code shows: "This will remove [N] code assignments. The highlights will remain."

---

## 7. UX Flows

### Flow 1: Create a List and Add an Assistant

1. Admin navigates to `/admin/analysis`.
2. Clicks "New List" button (top right of the lists panel).
3. A modal opens with fields: Name (required), Description (optional). Clicks "Create".
4. The new list card appears in the lists grid.
5. Admin finds an assistant in the browse grid (can type in the search bar to filter).
6. Clicks "Add to List" on the assistant card.
7. A modal appears listing all lists with checkboxes. The new list is visible.
8. Admin checks the list. Clicks "Save".
9. The assistant card now shows "In 1 list" badge. The list card shows "1 assistant".

### Flow 2: Browse Threads and Open a Conversation

1. Admin clicks a list card → navigates to `/admin/analysis/lists/[listId]`.
2. Sees the assistant added in Flow 1 as a card.
3. Clicks the assistant card → navigates to `/admin/analysis/lists/[listId]/assistant/[assistantId]`.
4. Sees a list of `ThreadCard` components with session info and timestamps.
5. Clicks a thread with several messages → navigates to `/admin/analysis/lists/[listId]/thread/[threadId]`.
6. The full conversation renders. Any prior highlights (from this list) are already shown with color backgrounds.

### Flow 3: Highlight Text and Assign a Code

1. In the conversation view, admin selects a span of text in the assistant's response by clicking and dragging.
2. Mouse up → `CodeTooltip` appears just above the selected text, positioned at the end of the selection.
3. Tooltip auto-focuses on the search input.
4. Admin sees a list of existing codes. Types "Conf" → list filters to codes containing "Conf" (e.g. "Confusion", "Confirmation").
5. Clicks "Confusion" → tooltip closes.
6. The selected text now has a colored background (Confusion code's color).
7. Admin selects another span overlapping partially with the first. Picks a different code. Both highlights are visible with their respective colors.

### Flow 4: Create a New Code from the Tooltip

1. Admin selects text. `CodeTooltip` opens.
2. Types "Hedging" — no match found in the list.
3. A "+ Create 'Hedging'" option appears at the bottom.
4. Admin clicks it → a new code "Hedging" is created with a randomly assigned color from the preset palette.
5. The code is immediately applied to the highlight.
6. The new code appears in the `CodebookPanel` in the Ungrouped section.

### Flow 5: Organize Codes in the Codebook Panel

1. From the list view or thread view, admin opens the `CodebookPanel` sidebar.
2. Clicks "New Group". Types "Epistemic Markers". Presses Enter.
3. Uses the kebab menu "Move to Group" option on the "Hedging" code to assign it to the group.
4. Admin clicks the color swatch on "Hedging" to open an inline color picker. Picks a muted yellow.
5. All existing highlights coded as "Hedging" immediately re-render with the new color.

### Flow 6: Export a List

1. From `/admin/analysis/lists/[listId]`, admin clicks the "Export" button.
2. A small dropdown appears: "Export as JSON" / "Export as CSV".
3. Admin selects CSV.
4. Browser downloads `My List Name-export-2026-04-13.csv`.
5. CSV contains one row per highlight–code pair, including selected text, full message text for context, assistant name, and attribution.

---

## 8. Visual & Interaction Design Notes

### Highlight Colors

- Each code has a user-assignable hex color.
- Default color palette for new codes (cycling through these when auto-assigning): `#fde68a` (amber), `#a7f3d0` (green), `#bfdbfe` (blue), `#fecaca` (red), `#ddd6fe` (violet), `#fed7aa` (orange), `#e9d5ff` (purple), `#99f6e4` (teal).
- Highlight background uses the code color at **50% opacity** so the underlying text remains legible.
- When multiple codes are applied to the same highlight, the background uses the color of the **first assigned code**. A row of small colored circles (max 3 visible, "+N" if more) appears at the right edge of the highlight span as a stacked pill indicator.
- Hovering a highlight increases opacity to 75% and shows a popover with: all applied codes (name + color dot), `created_by`, and a "Remove highlight" button.

### Tooltip Design

- Container: white background, `rounded-xl`, `shadow-xl`, `border border-gray-200`, min-width 240px, max-width 320px, max-height 320px.
- Positioned using manual calculation: horizontally centered on the selection, appearing **above** the selection by default. If within 200px of the top of the viewport, appear **below** instead.
- Search input: borderless within a bordered container, `text-sm`, left-aligned magnifying glass icon.
- Code list items: `py-1.5 px-3`, color dot (12px circle, `inline-block`, `rounded-full`), code name, and gray usage count in parentheses. Hover: `bg-gray-100`. Selected (keyboard): `bg-blue-50`.
- "Create" option: separated by a thin divider from the list. Icon: `+` in a dashed circle. Text: `Create "..."` in blue.
- Keyboard: Arrow keys navigate the list. Enter selects. Escape dismisses.

### Thread View Layout

- Full-width main column (matches existing `/chat/[assistantId]` aesthetic).
- User messages: right-aligned bubble, `bg-gray-100`.
- Assistant messages: left-aligned bubble, `bg-white border border-gray-200`.
- Message metadata (timestamp, reaction) shown below each bubble in `text-xs text-gray-400`.
- Highlights appear as inline `<mark>` spans inside the bubble text, not as overlays, to preserve text flow.
- The `CodebookPanel` is a fixed right sidebar at `w-72` that can be toggled with a button in the page header. On screens narrower than `lg`, it becomes a bottom sheet / drawer.

### Codebook Panel Design

- Background: `bg-gray-50`, right border `border-l border-gray-200`.
- Group headers: `text-xs font-semibold text-gray-500 uppercase tracking-wide`, with a collapse chevron.
- Code rows: left color swatch (`w-3 h-3 rounded-full`), code name `text-sm`, usage badge `text-xs bg-gray-200 rounded-full px-1.5`.
- Inline editing triggered by single-click on the name. `<input>` replaces the text node, onBlur or Enter confirms, Escape cancels.

---

## 9. Implementation Phases

### Phase 1: Lists Management + Assistant Browsing + Thread Browsing

**Backend:**
- Create all 6 database tables with full schema as defined in Section 4.
- Implement routes: `GET/POST /analysis/lists`, `GET/PATCH/DELETE /analysis/lists/{list_id}`, `GET/POST/DELETE /analysis/lists/{list_id}/items`, `GET /analysis/assistants`, `GET /analysis/lists/{list_id}/assistant/{assistant_id}/threads`.
- Add admin authentication dependency to all `/analysis` routes using the existing `admin_emails` table lookup.
- Write unit tests for all Phase 1 routes.

**Frontend:**
- Create `/admin/analysis/page.tsx`: assistant browse grid + lists panel.
- Create `AssistantCard` component with "Add to List" modal.
- Create `ThreadCard` component.
- Create `/admin/analysis/lists/[listId]/page.tsx`: list view with items grid.
- Create `/admin/analysis/lists/[listId]/assistant/[assistantId]/page.tsx`: thread list view.
- Add "Analysis" link to admin navigation.
- Implement API client functions in `frontend/src/lib/` for all Phase 1 endpoints.

**Deliverable:** Admins can create lists, add assistants, and browse threads. No coding yet.

---

### Phase 2: Highlighting + Code Creation + Code Assignment Tooltip

**Backend:**
- Implement routes: `GET /analysis/lists/{list_id}/thread/{thread_id}`, `POST /analysis/highlights`, `DELETE /analysis/highlights/{highlight_id}`, `POST /analysis/highlights/{highlight_id}/codes`, `DELETE /analysis/highlights/{highlight_id}/codes/{code_id}`.
- Implement `GET/POST/PATCH/DELETE /analysis/lists/{list_id}/codes` (basic CRUD, no groups yet).
- Write unit tests.

**Frontend:**
- Create `/admin/analysis/lists/[listId]/thread/[threadId]/page.tsx`.
- Implement `HighlightableText` component: render messages, handle `mouseup` selection detection, compute character offsets, call `onSelectionChange`.
- Implement `CodeTooltip` component: search, fuzzy filter, apply code, create new code.
- Wire up highlight rendering: parse `highlights` array, inject `<mark>` spans into message text using character offsets.
- Handle multi-message spanning selections (`source_field = 'both'`). This requires a dedicated implementation spike — see Open Questions.

**Deliverable:** Full highlighting and code assignment workflow. Highlights persist across page loads.

---

### Phase 3: Codebook Panel + Export

**Backend:**
- Implement routes: `GET/POST/PATCH/DELETE /analysis/lists/{list_id}/code-groups`.
- Add `group_id` support to code CRUD routes.
- Implement `GET /analysis/lists/{list_id}/export?format=csv|json`.
- For CSV export, use Python's `csv` module. For JSON, serialize with `jsonable_encoder`. Stream large exports as `StreamingResponse`.

**Frontend:**
- Implement `CodebookPanel` component: groups, codes, inline editing, color picker, kebab menus.
- Integrate `CodebookPanel` into the thread view (right sidebar with toggle) and list view.
- Implement export flow: dropdown button → format selection → trigger download via `fetch` with auth header + `createObjectURL` blob download pattern.
- Recolor: when a code's color is updated, re-render all visible highlights for that code without a full page reload (update local state).

**Deliverable:** Complete codebook management and data export.

---

### Phase 4: Search/Filter Improvements + Multi-Coder Attribution Views

**Backend:**
- Extend `GET /analysis/assistants` with additional filter params: `list_id` (show only assistants in / not in a given list).
- Add `GET /analysis/lists/{list_id}/activity` endpoint: recent highlights across all threads in this list, sorted by `created_at` desc, with coder attribution.
- Add optional `created_by` filter to highlights endpoints.

**Frontend:**
- Add filter bar to `/admin/analysis`: filter by list membership, sort by name/created_at.
- Add "Activity" tab or section to the list view showing recent coding actions with coder email and timestamp.
- In the thread view, add a "Coders" legend showing which emails have made highlights in this thread, with their highlight counts.
- Add highlight filtering in thread view: checkbox per coder to show/hide their highlights.
- Add code-based filtering: click a code in the codebook panel to highlight only that code's spans in the thread view.

**Deliverable:** Multi-coder visibility, activity feed, and filtering improvements.

---

## 10. Open Questions & Deferred Decisions

### Deferred
1. **Overlapping highlight rendering:** The current plan renders overlapping highlights with the first-assigned code's color on top. A more sophisticated approach (e.g., split-span rendering or CSS background gradients showing multiple colors) is deferred to a future iteration.
2. **Cross-message selection implementation:** Selecting text that spans from a user message bubble into an assistant message bubble requires careful DOM offset calculation. A robust implementation may need a virtual document model that concatenates message text with known offsets. This is high complexity and should be addressed in Phase 2 with a dedicated spike.
3. **Auth for file downloads:** Export endpoints return file downloads requiring the auth token. `fetch` with `Authorization` header + `createObjectURL` is the planned approach. Decision confirmed at Phase 3.
4. **Real-time sync:** If two admins are coding the same thread simultaneously, neither will see the other's highlights until they reload. Real-time sync (via Supabase Realtime) is deferred.
5. **Code color picker UI:** Whether to use a third-party component (e.g. `react-colorful`) or a simple preset palette is deferred to implementation. Preset palette is sufficient for Phase 2.
6. **Highlight conflict/merge policy:** Two admins applying the same code to slightly different spans are stored independently. A future "merge highlights" feature is deferred.

### Open Questions
1. Should admins be able to **re-order codes** within a group (drag-and-drop), or is alphabetical order sufficient?
2. Should the **list name** be unique across all admins, or can two admins have lists with the same name?
3. Should there be a **maximum message span** for a single highlight (e.g., no more than N consecutive messages)?
4. Should the **export include only coded highlights**, or also the full list of uncoded messages for reference?
5. Is there a need for a **"memo" / annotation** feature — a free-text note attached to a highlight, separate from code assignment? (Common in Atlas.ti/NVivo, not in current scope.)
