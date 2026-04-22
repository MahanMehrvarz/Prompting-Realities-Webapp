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
- As an admin, all analysis pages share a persistent sticky header showing a "Dashboard" link, the "Analysis" label, and a dynamic breadcrumb that updates based on current page depth (e.g. Analysis / My List / LLM Thing / …abc12345), so I can navigate back and forth without losing context.
- As an admin, breadcrumbs are context-aware: standalone assistant views show `Analysis / [name]`, while list-scoped views show `Analysis / [list] / [name] / [thread]`.
- As an admin, analysis pages use full browser width (up to 1536px) so that cards and conversation views can make use of available screen space.

### List Management
- As an admin, I can create a new list with a name and optional description so that I can scope my analysis project.
- As an admin, I can create a new list inline from the "Add to list" modal on any assistant card, without leaving the current page.
- As an admin, I can rename or delete a list. Deleting a list cascades to all its items, codes, groups, and highlights.
- As an admin, I can see all lists I and other admins have created on the right side of the analysis landing page, with item count and code count shown on each list card.

### Assistant Browsing & Standalone View
- As an admin, I can search all non-deleted assistants (called "LLM Things") from the main analysis page to identify relevant ones to include in a project.
- As an admin, I can filter assistants by date created (date range picker), and sort by created date, last used, thread count, or message count. Active filters appear as removable chips.
- As an admin, the assistant browse grid is paginated (20 per page) with prev/next navigation.
- As an admin, each assistant card on the browse page shows: assistant name, date created, total thread count, total message count, last used date, instruction version count, and which lists it belongs to.
- As an admin, I can click any assistant card to navigate to a **standalone assistant detail page** showing Sessions and Instructions tabs in read-only mode.
- As an admin, I can add an assistant to one or more lists from the assistant card via the "+ Lists" button, or from the standalone detail page via the "+ Add to list to code" button.

### Standalone Assistant Detail (Read-Only)
- As an admin, clicking an assistant card from the browse page opens a standalone detail page (`/admin/analysis/assistant/[id]`) with two tabs: Sessions and Instructions.
- As an admin, the Sessions tab shows all threads with message count, timestamps, and code count badges. I can sort and filter by date and message count.
- As an admin, clicking a thread from the standalone view opens it in **read-only mode** — I can view the conversation but cannot assign codes.
- As an admin, the Instructions tab shows the instruction version timeline in read-only mode with a notice: "Read-only. Add to list to code instructions."
- As an admin, the standalone page shows a prominent "+ Add to list to code" button. Adding the assistant to a list unlocks the full coding interface.

### List-Scoped Assistant View (Read-Write)
- As an admin, I can open a list and see all assistants added to it as cards showing: thread count, last used date, date added, and added-by.
- As an admin, I can click an assistant card within a list to open a list-scoped detail page with Sessions and Instructions tabs, both with full coding capability.
- As an admin, I can filter the thread list by "coded only" (threads with at least one highlight), and sort/filter by date started or last activity with a date range picker.
- As an admin, I can click a thread to open the conversation view with full coding capability.
- As an admin, I can see at a glance which threads have codes (highlighted badge with count) without opening them.

### Coding (Message-Level)
- As an admin, I can click on any message bubble in the conversation view to select it; selected messages show a checkmark indicator and a colored border (green for user, dark for assistant).
- As an admin, I can select multiple messages at once (any combination of user and assistant turns) and code them all in one action.
- As an admin, a floating action bar appears at the bottom of the screen whenever I have one or more messages selected, showing a count, an "Assign code" button, and a clear selection button.
- As an admin, clicking "Assign code" opens a code picker tooltip (fixed at the bottom-center of the viewport) where I can search existing codes or create a new one.
- As an admin, I can create a new code directly from the picker if no existing code fits, and it is immediately applied to the selected messages.
- As an admin, after assigning a code, the selection is cleared and the coded messages show color chips indicating which codes have been applied.
- As an admin, I can apply multiple codes to the same message by selecting it again and assigning another code.
- As an admin, I can toggle off a code by clicking an already-assigned code in the picker, which removes that code from all selected messages.
- As an admin, I can remove a code assignment from a message directly from the code chip shown on the message bubble.
- As an admin, coding is only available on threads opened within a list context. Standalone thread views are read-only.

### Coding (Instruction-Level)
- As an admin, I can view the instruction version timeline for any assistant within a list context, showing all saved prompt instruction versions chronologically.
- As an admin, I can compare any two instruction versions side-by-side in a DiffView that highlights word-level changes (green for additions, red strikethrough for removals).
- As an admin, I can select text spans within the DiffView to highlight and assign codes to instruction changes.
- As an admin, the instruction code picker works the same way as the message picker — search, select, or create codes inline.
- As an admin, instruction highlights are stored with character offsets and associated with specific version pairs (older_version_id, newer_version_id).

### Codebook Management
- As an admin, I can view all codes in the current list's codebook in a collapsible side panel within the conversation view.
- As an admin, each code in the codebook shows its name, color, and usage count (number of highlights it has been applied to).
- As an admin, I can click a code name in the codebook to navigate to the code's quotations page, where I can review all messages tagged with that code across all threads.
- As an admin, I can rename, recolor, or add a description to any code.
- As an admin, I can create and rename code groups (themes) and assign codes to them.
- As an admin, I can delete a code; this removes all its highlight assignments but does not delete the highlights themselves.

### Codes & Quotations
- As an admin, each list has a "Codes & Quotations" tab accessible from the list detail page, showing all codes with their usage counts.
- As an admin, I can navigate to a dedicated page for any code that shows all messages tagged with that code, grouped by thread.
- As an admin, consecutive highlights from the same thread created within 5 minutes of each other are merged into a single card showing the full continuous dialogue, with a badge indicating "N messages · continuous dialogue" and dashed dividers between exchanges.
- As an admin, each quotation card shows the user and assistant message bubbles tinted in the code's color, along with the creator's email and timestamp.
- As an admin, each thread group on the quotations page has a link to open the full thread in the conversation view.

### Export
- As an admin, I can export a list's codebook and all associated quotes in CSV or JSON format from the list detail page.
- As an admin, I click the "Export" button which reveals a dropdown to choose format. The file is downloaded directly.
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

**Purpose:** Entry point. Two-panel layout:
1. **Left (main):** Browse all non-deleted assistants ("LLM Things"). Search bar + filter/sort panel + paginated grid of assistant cards (3 per row). 20 items per page.
2. **Right (sidebar):** "My Lists" panel with list cards and "+ New List" button.

**State:**
- `assistants: AssistantBrowseItem[]` — fetched from `GET /analysis/assistants` with pagination
- `lists: AnalysisList[]` — fetched from `GET /analysis/lists`
- `search: string` — debounced 300ms search input
- Filter/sort: sort field (created_at, last_used, thread_count, message_count), order (asc/desc), date range
- `addToListModal` — controls "pick a list" modal with inline list creation

**Key interactions:**
- Clicking an assistant card navigates to standalone detail: `/admin/analysis/assistant/[id]`.
- Clicking "+ Lists" on a card opens a modal with all lists + inline create. Submitting calls `POST /analysis/lists/{list_id}/items`.
- Clicking a list card navigates to `/admin/analysis/lists/[listId]`.
- Active filters shown as removable chips with "Clear all" option.

---

### 6.2 Page: `/admin/analysis/assistant/[assistantId]` (Standalone)

**Purpose:** Read-only assistant detail, accessible from the browse grid without requiring list membership.

**Layout:** Two tabs:
1. **Sessions** — shows all threads with message count, timestamps, code count badges. Client-side sort/filter by date and message count.
2. **Instructions** — instruction version timeline in read-only mode with notice: "Read-only. Add to list to code."

**State:**
- `threads: ThreadSummary[]`, `instructions: InstructionVersion[]`, `lists: AnalysisList[]`
- `memberships: string[]` — which lists this assistant belongs to

**Key interactions:**
- Clicking a thread opens it in read-only mode: `/admin/analysis/lists/none/thread/[threadId]?session=...&assistant=...`
- Prominent "+ Add to list to code" button (or "+ Add to another list" if already in lists) opens the add-to-list modal.
- After adding to a list, coding becomes available through the list-scoped views.

---

### 6.3 Page: `/admin/analysis/lists/[listId]`

**Purpose:** List/project detail view with two tabs:
1. **LLM Things** — grid of assistant cards for assistants in this list. Shows thread count, last used, date added, added-by.
2. **Codes & Quotations** — browse all codes with usage counts; click to see quotations.

Also shows: list metadata (name, description, edit inline), export button.

**Key interactions:**
- Clicking an assistant card navigates to `/admin/analysis/lists/[listId]/assistant/[assistantId]`.
- Export button opens dropdown: "Export as JSON" / "Export as CSV". Downloads via blob URL with auth header.
- Tab switching via `ListTabStrip` component.

---

### 6.4 Page: `/admin/analysis/lists/[listId]/assistant/[assistantId]` (List-Scoped)

**Purpose:** Assistant detail with full coding capability, scoped to a list context.

**Layout:** Same two tabs as standalone, but with coding enabled:
1. **Sessions** — threads with sort/filter + "coded only" toggle. Click to open coding view.
2. **Instructions** — full `InstructionTimeline` with DiffView and code assignment on instruction text spans.

**Key interactions:**
- Clicking a thread navigates to the coding view: `/admin/analysis/lists/[listId]/thread/[threadId]`.
- Instruction tab: select text in DiffView → code picker → assign codes to instruction changes.

---

### 6.5 Page: `/admin/analysis/lists/[listId]/thread/[threadId]`

**Purpose:** Main coding interface — conversation view with message-level coding.

**Layout:**
- **Right sidebar** (collapsible): `CodebookPanel` — all codes for this list, grouped by theme.
- **Main column:** Message bubbles (user right-aligned dark, assistant left-aligned light). Each bubble is clickable for selection.
- **Floating action bar:** Appears at bottom-center when messages are selected. Shows count + "Assign code" button.
- **Code picker tooltip:** Fixed at bottom-center, appears when "Assign code" is clicked.

**Data flow:**
1. On mount: fetch `GET /analysis/lists/{list_id}/thread/{thread_id}`. Populate messages and highlights.
2. User clicks message bubbles to select → floating action bar appears.
3. User clicks "Assign code" → code picker tooltip appears with search + create.
4. User picks or creates code → highlights saved → selection cleared → code chips appear on coded messages.

**Read-only fallback:** When `listId` is `"none"` (standalone access), coding UI is hidden. A header prompt encourages adding to a list.

---

### 6.6 Page: `/admin/analysis/lists/[listId]/codes` and `.../codes/[codeId]`

**Purpose:** Browse codes and their quotations for a list.
- **Codes list** (`/codes`): All codes with usage counts, grouped by theme.
- **Code detail** (`/codes/[codeId]`): All message highlights tagged with this code, grouped by thread. Consecutive highlights merged into cards with "N messages · continuous dialogue" badge.

**Key interactions:**
- Click a quotation card link to jump to the full thread in the coding view.

---

### 6.7 Component: `InstructionTimeline`

**Purpose:** Displays instruction version history with optional DiffView for comparing versions and coding instruction changes.

**Modes:**
- **Read-only** (`listId={null}`): Shows timeline, DiffView for visual comparison, but no coding UI.
- **Full** (`listId` provided): Adds text selection → code picker → assign codes to instruction text spans.

**DiffView:** Side-by-side word-level diff. Green for additions, red strikethrough for removals. User can select text spans in the diff and assign codes. Highlights stored with `char_start`/`char_end` and version pair references.

---

### 6.8 Component: `CodeTooltip`

**Purpose:** Floating code picker used in both message coding and instruction coding.

**Two variants:**
1. **Message picker** (thread page): Fixed at bottom-center of viewport, 300px wide, triggered by "Assign code" button.
2. **Instruction picker** (InstructionTimeline): Positioned at mouse selection point.

**Shared behavior:**
- Auto-focused search input filters codes by name (case-insensitive contains match).
- Click code to toggle assignment (assigns if not on all selected items, unassigns if already on all).
- "Create '[query]'" button appears when no exact match found. Requires explicit click (Enter only works on single exact match).
- Created codes auto-assigned to current selection and appear in CodebookPanel under Ungrouped.

---

### 6.9 Component: `CodebookPanel`

**Purpose:** Right sidebar showing all codes and groups for the current list. Visible in thread coding view.

**Layout:**
- Header: "Codebook" title.
- Codes grouped by theme, with "Ungrouped" section for codes without a group.
- Each code row: color swatch | code name (inline-editable) | usage count badge | kebab menu (Rename, Change color, Edit description, Move to group, Delete).
- Each group: collapsible, with rename/delete options.
- Deleting a group moves codes to Ungrouped. Deleting a code removes assignments but not highlights.
- Click code name to navigate to quotations page.

---

## 7. UX Flows

### Flow 1: Create a List and Add an Assistant

1. Admin navigates to `/admin/analysis`.
2. Clicks "+ New List" button (top right of the "My Lists" sidebar).
3. A modal opens with Name field. Clicks "Create".
4. The new list card appears in the sidebar.
5. Admin finds an assistant in the browse grid (can type in search bar, apply sort/filter).
6. Clicks "+ Lists" on the assistant card.
7. A modal appears listing all lists. Can also create a new list inline from this modal.
8. Admin selects the list. Clicks OK.
9. The assistant card now shows "In 1 list" badge. The list card updates its count.

### Flow 2: Explore an Assistant (Standalone / Read-Only)

1. Admin clicks an assistant card from the browse grid → navigates to `/admin/analysis/assistant/[id]`.
2. Sees the Sessions tab with all threads listed, sortable/filterable by date and message count.
3. Clicks a thread → opens in read-only mode. Can view the full conversation but cannot assign codes.
4. Switches to the Instructions tab → sees instruction version timeline with DiffView, but no coding controls.
5. If the admin wants to code, they click "+ Add to list to code" → selects a list → can now open the list-scoped views.

### Flow 3: Browse Threads and Open a Conversation (List Context)

1. Admin clicks a list card → navigates to `/admin/analysis/lists/[listId]`.
2. Sees assistants added to this list as cards. Switches to "Codes & Quotations" tab if needed.
3. Clicks an assistant card → navigates to `/admin/analysis/lists/[listId]/assistant/[assistantId]`.
4. Sees threads with code count badges. Can toggle "coded only" filter or sort by date/message count.
5. Clicks a thread → navigates to the coding view.
6. The full conversation renders. Prior highlights show as color chips on coded messages.

### Flow 4: Code Messages

1. In the conversation view, admin clicks message bubbles to select them (checkmark + colored border appears).
2. Can select multiple messages (any combination of user and assistant turns).
3. A floating action bar appears at the bottom with count and "Assign code" button.
4. Admin clicks "Assign code" → code picker tooltip opens at bottom-center.
5. Types "Conf" → list filters to matching codes (e.g. "Confusion", "Confirmation").
6. Clicks "Confusion" → code assigned to all selected messages → selection clears → color chips appear on messages.
7. Admin selects the same message again and assigns another code → message now shows multiple code chips.

### Flow 5: Create a New Code from the Picker

1. Admin selects messages. Clicks "Assign code". Picker opens.
2. Types "Hedging" — no match found.
3. A "Create 'Hedging'" option appears with dashed border and + icon.
4. Admin clicks it → new code created with random color from preset palette.
5. Code immediately applied to selected messages.
6. New code appears in the `CodebookPanel` sidebar under Ungrouped.

### Flow 6: Code Instruction Changes

1. Admin opens an assistant within a list → switches to Instructions tab.
2. Sees the instruction version timeline. Selects two versions to compare.
3. DiffView shows word-level diff (green additions, red strikethrough removals).
4. Admin selects a text span within the diff by clicking and dragging.
5. Code picker appears at the selection point. Admin assigns or creates a code.
6. The selected text span is highlighted with the code's color in the DiffView.

### Flow 7: Organize Codes in the Codebook Panel

1. From the thread coding view, admin opens the `CodebookPanel` sidebar (if collapsed).
2. Clicks "New Group". Types "Epistemic Markers". Presses Enter.
3. Uses the kebab menu on the "Hedging" code → "Move to Group" → selects "Epistemic Markers".
4. Admin clicks the color swatch on "Hedging" → color picker opens → picks a muted yellow.
5. All existing highlights coded as "Hedging" immediately re-render with the new color.

### Flow 8: Review Quotations

1. From a list view, admin switches to "Codes & Quotations" tab.
2. Sees all codes with usage counts. Clicks a code to open its quotations page.
3. Quotations are grouped by thread. Consecutive highlights are merged into cards with dialogue context.
4. Admin clicks a thread link on a quotation card → jumps to the full thread coding view.

### Flow 9: Export a List

1. From `/admin/analysis/lists/[listId]`, admin clicks the "Export" button.
2. A dropdown appears: "Export as JSON" / "Export as CSV".
3. Admin selects CSV.
4. Browser downloads the export file.
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
