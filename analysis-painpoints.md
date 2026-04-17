# Analysis Feature — UX & Product Quality Audit

*Audited: 2026-04-16*
*Scope: all frontend analysis pages + `InstructionTimeline` + `backend/app/routes/analysis.py`*

Each item below is labelled with a category code + number (e.g. `A1`, `C2`). Severity: **high** blocks a user goal or threatens data, **medium** is friction, **low** is polish.

---

## A. Navigation & Breadcrumbs

### A1 — Standalone thread page uses a magic fake list ID that silently breaks shareable URLs
**Symptom.** From the standalone LLM Thing page, clicking a thread navigates to `/admin/analysis/lists/none/thread/[threadId]`. The literal string `"none"` is embedded as a URL segment. If the user copies that URL, shares it, or navigates directly, the breadcrumb context is lost and the back path resolves to `/admin/analysis` rather than the originating assistant page.
**Location.** `frontend/src/app/admin/analysis/assistant/[assistantId]/page.tsx` ~line 279
**Severity.** Medium
**Fix.** Introduce a dedicated standalone thread route (e.g. `/admin/analysis/assistant/[id]/thread/[threadId]`) or pass `?context=standalone` as a query param instead of overloading the `listId` segment.

### A2 — "Add more" link label is misleading
**Symptom.** Inside a list's LLM Things tab, the link next to the section heading reads "← Add more" but navigates to the top-level browse page. Users expect it to open an add-to-list modal, not dump them back on the dashboard.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/page.tsx` ~line 285
**Severity.** Low
**Fix.** Rename to "← Browse all LLM Things".

### A3 — No way back from Code Detail page to Codes & Quotations
**Symptom.** The code detail page (`/lists/[listId]/codes/[codeId]`) sets only two breadcrumbs: list name → code name. The list-name crumb links to the LLM Things tab, not back to Codes & Quotations where the user likely came from. There is no `ListTabStrip` on this page either.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/codes/[codeId]/page.tsx` ~line 61 — `setCrumbs` only sets two entries; no tab strip rendered
**Severity.** Medium
**Fix.** Add a third crumb `{ label: "Codes & Quotations", href: \`/admin/analysis/lists/${listId}/codes\` }` and render `<ListTabStrip listId={listId} />` below the code header.

### A4 — "Back to Codes" button uses `router.back()` — breaks on new tab or in-thread navigation
**Symptom.** When navigating from Codes & Quotations to a thread with `?back=codes`, the header shows "← Back to Codes" calling `router.back()`. If the user opened the thread in a new tab or navigated within the thread first, the browser history position is wrong.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/thread/[threadId]/page.tsx` lines 533–539
**Severity.** Medium
**Fix.** Replace `router.back()` with `router.push(\`/admin/analysis/lists/${listId}/codes\`)`.

### A5 — Deleting a list has no confirmation dialog
**Symptom.** On the dashboard, clicking the trash icon on a list immediately fires the delete request with no "Are you sure?" step. A list may contain dozens of codes and hundreds of highlights. There is no recovery.
**Location.** `frontend/src/app/admin/analysis/page.tsx` lines 315–321 — `handleDeleteList` fires directly
**Severity.** High
**Fix.** Prompt with a `confirm(…)` or a proper modal before calling `analysisApi.deleteList`.

---

## B. Empty States & Loading States

### B1 — Dashboard swallows API errors and shows a blank empty state
**Symptom.** Both `fetchLists` and `fetchAssistants` have bare `catch { /* ignore */ }` blocks. On a network error or expired token the user sees an empty grid with the text "No LLM things found." — identical to a legitimately empty database. They cannot tell whether something is broken.
**Location.** `frontend/src/app/admin/analysis/page.tsx` lines 287–295 — both fetch callbacks
**Severity.** High
**Fix.** Track an `error` state in each callback and render a visible "Could not load data — try refreshing" message in the empty state panel.

### B2 — List page silently redirects on any error — including transient 500s
**Symptom.** `lists/[listId]/page.tsx` `fetchData` wraps all errors in a catch that calls `router.push("/admin/analysis")`. A transient server error during heavy load ejects the user from their list with no explanation.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/page.tsx` lines 214–216
**Severity.** Medium
**Fix.** Show an inline error banner with a retry button; only redirect on a confirmed 404.

### B3 — Codes & Quotations sidebar shows "No codes yet" before data has loaded
**Symptom.** On first paint, `codes.length === 0` causes the sidebar to immediately render the empty-state copy "No codes yet. Start coding conversations…" while the fetch is still in flight.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/codes/page.tsx` lines 361–364
**Severity.** Low
**Fix.** Add a `loadingCodes` boolean flag and render a skeleton/spinner in the sidebar while it resolves.

---

## C. Feature Gaps

### C1 — `usage_count` on code chips does NOT count instruction highlights
**Symptom.** The count shown on every code chip (e.g. "×3") comes exclusively from `analysis_highlight_codes` (message highlights). Instruction highlights are stored in `analysis_instruction_highlights` with a direct `code_id` column and are never included in the `usage_map`. Any code used primarily on instructions will show zero or an understated count everywhere in the UI.
**Location.** `backend/app/routes/analysis.py` lines 587–601 — `get_codes` queries only `analysis_highlight_codes`
**Severity.** High
**Fix.** Add a second batch query against `analysis_instruction_highlights` grouped by `code_id` and add those counts into `usage_map` before computing `usage_count`.

### C2 — Export does NOT include instruction-coded data at all
**Symptom.** `export_list` only exports rows from `analysis_highlights` (message highlights). The entire `analysis_instruction_highlights` table is ignored. A researcher who primarily coded instruction diffs will receive a blank export or a drastically incomplete one.
**Location.** `backend/app/routes/analysis.py` lines 1020–1155 — zero references to `analysis_instruction_highlights`
**Severity.** High
**Fix.** After building `code_export`, iterate `analysis_instruction_highlights` for the list and append each highlight as a quote entry with `"kind": "instruction"`, including `older_version_id`, `newer_version_id`, and `selected_text`.

### C3 — Cannot re-assign a highlight to a different code
**Symptom.** There is no "reassign" action on highlight cards anywhere in the UI. The only path to correction is: delete the highlight → re-select the same text → assign the correct code — losing the original creation timestamp and metadata.
**Location.** Thread view highlight summary (lines 636–662) and Codes & Quotations `QuotationCard` — no edit action exists
**Severity.** Medium
**Fix.** Add a small "reassign" button on highlight cards that opens the code picker, then calls `unassign_code` + `assign_code`.

### C4 — Cannot rename a code group
**Symptom.** `PATCH /lists/{list_id}/code-groups/{group_id}` exists and supports `name` and `color`. The Codebook sidebar renders group headings as plain text with a collapse-only button — no edit affordance.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/thread/[threadId]/page.tsx` — `CodebookPanel` group header button, lines 203–210
**Severity.** Medium
**Fix.** Add inline rename on the group row (same pattern as the already-implemented code rename).

### C5 — Cannot change a code's color after creation
**Symptom.** `PATCH /lists/{list_id}/codes/{code_id}` supports `color`. The inline rename in `CodebookPanel` only updates `name`. No color picker exists anywhere.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/thread/[threadId]/page.tsx` — `CodebookPanel` `saveEdit` line 146
**Severity.** Medium
**Fix.** Add a color swatch button on the code row that opens a picker using the 8 preset colors already defined at line 34.

### C6 — Codes cannot be sorted — always creation-order
**Symptom.** The backend hardcodes `order("created_at", desc=False)` with no sort parameter. With 20+ codes, finding a rarely used code requires visual scanning. No alphabetical or usage-count sort is available.
**Location.** `backend/app/routes/analysis.py` line 583
**Severity.** Medium
**Fix.** Accept an optional `sort` query param on `GET /lists/{list_id}/codes` and expose a sort toggle in both the Codebook sidebar and the Codes & Quotations sidebar.

### C7 — Cannot filter thread list by specific code
**Symptom.** The Sessions tab has date-range and sort filters. There is no way to show "only threads where I applied code X." The `has_codes` boolean toggle is coarse.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/assistant/[assistantId]/page.tsx` filter panel
**Severity.** Medium
**Fix.** Add a code multi-select filter; the backend `get_threads` endpoint would need a `code_ids` param filtering thread IDs through `analysis_highlights`.

### C8 — No duplicate-highlight prevention
**Symptom.** Nothing prevents selecting message M, assigning code C, then selecting M again and assigning C again. `assign_code` prevents double-assigning the same code to the same highlight, but two separate highlight rows can both point to the same message with the same code — both appear in Codes & Quotations.
**Location.** `backend/app/routes/analysis.py` lines 652–673 — `create_highlight` has no uniqueness check
**Severity.** Medium
**Fix.** Before inserting, query for existing highlights with the same `(list_id, thread_id, message_ids)`. If found, offer to add the code to the existing highlight rather than creating a new row.

### C9 — No undo for destructive actions
**Symptom.** Deleting a highlight, unassigning a code, deleting a code, deleting a list — all are permanent with no recovery path.
**Location.** Global — no undo stack
**Severity.** Medium
**Fix.** At minimum, add a timed "Undo" toast for highlight deletion (the most frequent accidental action).

---

## D. Bugs & Inconsistencies

### D1 — Deleting a code leaves orphaned highlights permanently showing "No codes"
**Symptom.** The confirmation message says "highlights stay." The result: the thread view highlight summary renders a card with an empty code badge and the text "No codes" (line 649). The highlight is unreachable in Codes & Quotations (no code to filter by) but permanently clutters the thread view.
**Location.** `backend/app/routes/analysis.py` line 641 — `delete_code` only deletes the code row; the cascade removes `analysis_highlight_codes` but leaves `analysis_highlights` intact. Thread view `lists/[listId]/thread/[threadId]/page.tsx` line 649 renders the orphaned card.
**Severity.** High
**Fix.** When deleting a code, also delete (or warn about) all highlights that would be left with zero code assignments.

### D2 — Single-version instruction coding appears as a self-comparison ("v3 → v3") in the timeline
**Symptom.** Coding a single version stores `older_version_id === newer_version_id`. The timeline's "Coded comparisons" section uses `"${older}:${newer}"` as a key and renders the pair label as "v3 → v3", which looks broken.
**Location.** `frontend/src/components/analysis/InstructionTimeline.tsx` lines 742–745 — `codedPairCounts` includes self-pairs
**Severity.** Medium
**Fix.** Filter out `olderId === newerId` pairs from the "Coded comparisons" list and display them in a separate "Coded single versions" section.

### D3 — Thread date filter always uses `last_message_at`, ignoring the active sort field
**Symptom.** When the user sorts by "Date started" and sets a "From" date, they expect to filter by start date. The actual code compares against `t.last_message_at` on both the list-context and standalone pages. The footer note ("Filtering by date started / last activity") only updates the label; it does not change what field is compared.
**Location.** `lists/[listId]/assistant/[assistantId]/page.tsx` lines 86–87; `assistant/[assistantId]/page.tsx` lines 105–106
**Severity.** Medium
**Fix.** Use `t[sortField]` in the filter comparison or expose an explicit "Filter by" field selector.

### D4 — Standalone LLM Thing page fires N+1 API calls to compute list memberships
**Symptom.** On load, one `getListItems` call is made per list to determine whether the assistant belongs to it (lines 71–79). With 10 lists this is 10 sequential-ish round-trips before the "In N lists" label renders.
**Location.** `frontend/src/app/admin/analysis/assistant/[assistantId]/page.tsx` lines 71–79
**Severity.** Medium
**Fix.** Add a `GET /assistant/{id}/memberships` endpoint (or include `list_memberships` on a per-assistant endpoint) returning the list IDs in one call — the same data that `browse_assistants` already computes.

### D5 — Export fetches the entire `analysis_highlight_codes` table with no filter
**Symptom.** Line 1064 of `analysis.py`: `hc_res = sb.table("analysis_highlight_codes").select("*").execute()` has no WHERE clause. Every export call reads every assignment row in the entire database. At scale (or with Supabase's default 1000-row cap) this will silently return incomplete or slow data.
**Location.** `backend/app/routes/analysis.py` line 1064
**Severity.** High
**Fix.** Filter by the already-collected highlight IDs: `.in_("highlight_id", [h["id"] for h in highlights_res.data])`.

### D6 — Instruction diff tooltip can remain open after switching to the Sessions tab
**Symptom.** `DiffView` attaches a `document`-level `mouseup` listener. If the user selects text in the diff and then clicks the Sessions tab before dismissing the tooltip, the tooltip stays rendered with no way to close it (the backdrop's click target is behind the tab bar).
**Location.** `frontend/src/components/analysis/InstructionTimeline.tsx` lines 179–182; parent `lists/[listId]/assistant/[assistantId]/page.tsx` tab buttons
**Severity.** Low
**Fix.** On the tab buttons' `onMouseDown`, call `window.getSelection()?.removeAllRanges()` to clear any pending selection before the tab swap.

### D7 — `colorIdx` for new codes is a module-level mutable counter
**Symptom.** `let colorIdx = 0` at line 35 of the thread page is module-level state. Colors assigned to new codes are unpredictable across page navigations and reset on hot-module-reload during development.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/thread/[threadId]/page.tsx` lines 35–36
**Severity.** Low
**Fix.** Derive the next color from `codes.length % PRESET_COLORS.length` inside `handleCodeCreate`.

### D8 — Floating action bar overlaps the codebook sidebar on narrow viewports
**Symptom.** The "N messages selected" bar is `fixed bottom-6 left-1/2 -translate-x-1/2`, centered on the full viewport. When the 288 px codebook sidebar is open on a ~900 px screen, the bar sits over the sidebar's bottom content.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/thread/[threadId]/page.tsx` lines 685–705
**Severity.** Medium
**Fix.** Position the bar relative to the conversation column rather than the viewport, or account for the sidebar width in the `left` offset.

### D9 — `get_code_highlights` endpoint on the single-code detail page has no pagination
**Symptom.** A heavily used code could have thousands of highlights. The endpoint returns all of them in one response with no `limit`/`offset` support.
**Location.** `backend/app/routes/analysis.py` line 710 — `get_code_highlights`
**Severity.** Low
**Fix.** Add `limit` and `offset` query params to this endpoint before the dataset grows large.

---

## E. Data Integrity & Workflow

### E1 — Deleting a list leaves orphaned codes, highlights, and code groups in the database
**Symptom.** `delete_list` only soft-deletes the `analysis_lists` row. All codes, code groups, message highlights, and instruction highlights remain in the database without a `deleted_at` flag. They are permanently stranded.
**Location.** `backend/app/routes/analysis.py` lines 183–186
**Severity.** Medium
**Fix.** Cascade the deletion (or soft-deletion) to all child tables when a list is deleted.

### E2 — No indication that an LLM Thing already has highlights in another list
**Symptom.** When a user adds an already-coded LLM Thing to a new list, all threads appear uncoded. There is no message like "47 highlights exist in List A — they are not visible here." Users may re-code work they already did.
**Location.** `lists/[listId]/assistant/[assistantId]/page.tsx` — no cross-list highlight count
**Severity.** Medium
**Fix.** In the LLM Thing header, show "N quotations in other lists" with a link to those lists.

### E3 — No concurrency protection for simultaneous coding by two admins
**Symptom.** Two admins coding the same thread simultaneously will create duplicate highlight rows for the same message and code. There is no optimistic lock or uniqueness constraint on `(list_id, thread_id, message_ids)`.
**Location.** `backend/app/routes/analysis.py` lines 652–673
**Severity.** Medium
**Fix.** Add a database unique constraint or a pre-insert existence check, returning a `409 Conflict` that the frontend surfaces as a warning rather than silently duplicating.

---

## F. Accessibility

### F1 — Code picker tooltip has no ARIA role, no label, and no keyboard navigation
**Symptom.** The code picker `div` has no `role="dialog"`, no `aria-label`, and no focus trap. The input auto-focuses, but arrow-key navigation through the list is not implemented. Screen readers cannot identify the component.
**Location.** `InstructionTimeline.tsx` lines 57–110; `thread/[threadId]/page.tsx` lines 48–127
**Severity.** Medium
**Fix.** Add `role="dialog"` and `aria-label="Assign code"` to the container. Implement `ArrowDown`/`ArrowUp` keyboard navigation through the filtered button list.

### F2 — Codes & Quotations sidebar has no collapse on mobile — takes 68% of screen width on 375 px
**Symptom.** The sidebar is `w-64 flex-shrink-0` with no collapse toggle. On a phone-width screen the quotation stream is unreadably narrow.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/codes/page.tsx` line 322
**Severity.** Medium
**Fix.** Add a collapse toggle button; on narrow viewports render the sidebar as a full-width sheet or drawer.

---

## G. Instruction Timeline — Specific Issues

### G1 — "View instruction" link in Codes & Quotations lands on Sessions tab, not the coded version
**Symptom.** `InstructionQuotationCard` links to `/admin/analysis/lists/${listId}/assistant/${assistantId}` (line 96), which opens the LLM Thing page on the Sessions tab. The user must manually switch to Instructions and find the right version.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/codes/page.tsx` lines 95–100
**Severity.** Medium
**Fix.** Link to `…/assistant/${assistantId}?tab=instructions&version=${highlight.older_version_id}` and consume the `?tab` and `?version` params in the assistant page to auto-open the Instructions tab and pre-select the version.

### G2 — Very long instructions will block the main thread during diff computation
**Symptom.** `computeWordDiff` is called synchronously in the render body of `DiffView`. For prompts exceeding several thousand words (LCS is O(n²) in the worst case), this blocks the UI for seconds with no loading indicator.
**Location.** `frontend/src/components/analysis/InstructionTimeline.tsx` line 141
**Severity.** Medium
**Fix.** Wrap the call in `useMemo`, move the computation to a Web Worker, or add a word-count guard that falls back to a line-level diff for texts over ~5,000 words.

### G3 — Instruction diff `<pre>` does not break long tokens — URLs overflow card boundaries
**Symptom.** A system prompt containing an unbroken URL or long token renders beyond the card boundary in both the reader and diff view.
**Location.** `frontend/src/components/analysis/InstructionTimeline.tsx` lines 337 and 583 — `className="whitespace-pre-wrap"`
**Severity.** Low
**Fix.** Add Tailwind `break-words` (which sets `overflow-wrap: break-word`) to the `<pre>` element.

---

## H. Form Validation & Input Constraints

### H1 — Whitespace-only names are accepted
**Symptom.** Frontend disables submit on `!name.trim()` but still POSTs strings like `"   "` (space+newline). Backend does not strip or validate, so the DB stores a name that renders blank in the sidebar.
**Location.** `frontend/src/app/admin/analysis/page.tsx` ~line 118 (list create); `frontend/src/components/analysis/InstructionTimeline.tsx` ~line 92 (code create); `backend/app/routes/analysis.py` lines 148, 607–617
**Severity.** Low
**Fix.** Backend: reject if `body.name.strip() == ""`; persist the stripped value.

### H2 — No max-length on code, list, or group names
**Symptom.** A 10 000-character name is accepted end-to-end. Sidebar layout breaks; chip rendering overflows.
**Location.** `backend/app/routes/analysis.py` lines 147–151, 541–549, 607–617 — no length guard; frontend inputs have no `maxLength`.
**Severity.** Low
**Fix.** Cap at 200 chars server-side; add matching `maxLength={200}` on the inputs.

### H3 — Code color field accepts any string
**Symptom.** `color` is stored verbatim. A malformed value (`"not-a-color"`) renders as `background-color: not-a-color` — CSS silently drops it and the chip appears transparent/white.
**Location.** `backend/app/routes/analysis.py` `CreateCodeBody` / `UpdateCodeBody`; no regex validation
**Severity.** Medium
**Fix.** Validate against `/^#[0-9a-fA-F]{6}$/` before insert; reject with 400 otherwise.

### H4 — Duplicate code or group names allowed in same list
**Symptom.** Two codes named "Theme" can coexist in one list. The codebook renders both with identical chips, indistinguishable at a glance.
**Location.** `backend/app/routes/analysis.py` — `create_code` / `create_code_group` have no uniqueness check
**Severity.** Medium
**Fix.** Pre-insert existence query on `(list_id, lower(name))`; return `409 Conflict` with a message the UI can surface.

---

## I. Authorization

### I1 — Any admin can edit or delete any other admin's list
**Symptom.** `PATCH /lists/{list_id}` and `DELETE /lists/{list_id}` gate only on `require_admin` — no `created_by` check. One researcher can silently wipe a peer's list.
**Location.** `backend/app/routes/analysis.py` lines 166–187
**Severity.** High
**Fix.** Compare `list["created_by"]` to the requesting admin; reject with 403 unless the caller is the owner (or explicitly a super-admin).

### I2 — Highlight can be assigned a code from a different list
**Symptom.** `POST /highlights/{highlight_id}/codes` does not verify that the supplied `code_id` belongs to the same list as the highlight. A crafted request cross-links codes across lists; the resulting assignment pollutes both lists' Codes & Quotations.
**Location.** `backend/app/routes/analysis.py` `assign_code` (~lines 687–700)
**Severity.** Medium
**Fix.** Fetch the code's `list_id` and reject with 400 if it differs from the highlight's.

### I3 — Initial `get_list` query doesn't filter `deleted_at`
**Symptom.** The raw `select("*")` fetch for a list by ID does not include `.is_("deleted_at", None)`. Subsequent helpers may filter, but the primary fetch still returns soft-deleted rows in some code paths, which can leak a deleted list's name into the breadcrumb.
**Location.** `backend/app/routes/analysis.py` ~line 100
**Severity.** Low
**Fix.** Add `.is_("deleted_at", None)` to the initial SELECT.

---

## J. Additional Bugs

### J1 — Instruction highlight accepts `older_version_id === newer_version_id` with no warning
**Symptom.** Backend silently stores a self-pair. This is the root cause of D2 (the "v3 → v3" display artefact) — fixing it at the display layer alone leaves a zero-semantics row in the DB.
**Location.** `backend/app/routes/analysis.py` `create_instruction_highlight` (~lines 951–971)
**Severity.** Low
**Fix.** Either (a) store `newer_version_id = null` for single-version coding so the data model is explicit, or (b) block self-pair creation if single-version coding should be disallowed. Pair with D2 display fix.

---

## K. Feedback & Optimistic Updates

### K1 — Usage count on code chips does not increment after assignment until full refetch
**Symptom.** User applies a code from the floating action bar. Highlight appears in the message, but the chip in the codebook sidebar still shows the old `×N`. Count updates only after a `fetchData` round-trip — several hundred ms of wrong data.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/thread/[threadId]/page.tsx` — `handleCodeSelect` / `handleCreateHighlight`
**Severity.** Low
**Fix.** Optimistically bump `usage_count` in local `codes` state immediately after assignment; reconcile on the refetch.

### K2 — Silent `.catch(() => {})` blocks hide highlight-assignment failures
**Symptom.** Beyond the dashboard (B1), the thread page and codes page have multiple `.catch(() => { /* ignore */ })` on POSTs. If a highlight assignment fails (network blip, auth expiry), the action bar closes as if it succeeded and no highlight is created.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/thread/[threadId]/page.tsx` ~line 497; `frontend/src/app/admin/analysis/lists/[listId]/codes/page.tsx` ~line 245
**Severity.** Medium
**Fix.** Surface a toast/banner on failure; for idempotent reads, keep the catch but log. Never swallow errors on writes.

### K3 — Code Detail page has no "Back to code" when opening a thread
**Symptom.** From `/lists/[listId]/codes/[codeId]`, clicking a quotation navigates to the thread view with `?back=codes` — which resolves to Codes & Quotations, not the single-code detail page the user came from.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/codes/[codeId]/page.tsx` (link construction); `thread/[threadId]/page.tsx` (`?back` handler)
**Severity.** Medium
**Fix.** Add a new `?back=code&codeId=X` mode; in the thread page, render "← Back to code {name}" and navigate to `/lists/${listId}/codes/${codeId}`.

### K4 — Floating code-picker tooltip can render below the viewport on mobile
**Symptom.** `setTooltipPos({ x: Math.min(...), y: rect.bottom })` clamps X but not Y. Selecting near the bottom of the screen positions the picker partially or fully off-screen with no way to scroll to it.
**Location.** `frontend/src/components/analysis/InstructionTimeline.tsx` ~line 176
**Severity.** Low
**Fix.** Also clamp Y: `y: Math.min(rect.bottom, window.innerHeight - PICKER_HEIGHT - 16)`, and flip above the selection when the clamp triggers.

---

## L. Performance at Scale

### L1 — List page fans out one `getThreads` call per assistant on load
**Symptom.** Opening a list with 20 assistants fires ~20 parallel `getThreads` requests just to show thread/message counts on each card. Similar shape to D4 but on a different surface — the list's LLM Things tab.
**Location.** `frontend/src/app/admin/analysis/lists/[listId]/page.tsx` ~lines 195–209
**Severity.** Medium
**Fix.** Add `GET /lists/{list_id}/items/stats` returning `{ assistant_id, thread_count, message_count }[]` in one call.

### L2 — `get_list_highlights` relies on code filter rather than also filtering by `list_id` at the row level
**Symptom.** The final highlights fetch narrows by `code_ids` but does not re-apply `.eq("list_id", list_id)` on the highlights themselves. If a code were ever associated with rows in another list (e.g. after a bad migration or the I2 bug above), those rows would leak into the current list's quotations view.
**Location.** `backend/app/routes/analysis.py` `get_list_highlights` (~lines 795–870)
**Severity.** Medium
**Fix.** Defence-in-depth: add `.eq("list_id", list_id)` to the highlights query regardless of the code filter.

---

## M. Data Integrity (continued)

### M1 — Instruction highlight `code_id` is optional — orphaned rows possible
**Symptom.** `CreateInstructionHighlightBody.code_id` is `str | None`. A caller can create a highlight with no code. It renders in the diff view with no chip and is unreachable from Codes & Quotations.
**Location.** `backend/app/routes/analysis.py` ~line 88 (body model), 951–971 (insert)
**Severity.** Medium
**Fix.** Make `code_id` required, or enforce assignment in the same transaction before commit.

### M2 — Deleting a code orphans `analysis_instruction_highlights` rows
**Symptom.** D1 covers message highlights. Instruction highlights store `code_id` directly in the row (since commit 93bddb3). `delete_code` does not clean them up; they linger with a dangling FK value.
**Location.** `backend/app/routes/analysis.py` `delete_code` (~line 641)
**Severity.** Medium
**Fix.** In `delete_code`, also delete or null out `analysis_instruction_highlights.code_id` for the affected code (same policy chosen for D1).

---

## N. Accessibility (continued)

### N1 — Code picker does not return focus to the trigger on dismiss
**Symptom.** Pressing Escape closes the picker but focus is dropped to `<body>`. Keyboard users have to tab from the top of the page to resume. F1 covers ARIA structure; this is the focus-management side.
**Location.** `frontend/src/components/analysis/InstructionTimeline.tsx` lines 57–110; `frontend/src/app/admin/analysis/lists/[listId]/thread/[threadId]/page.tsx` lines 48–127
**Severity.** Medium
**Fix.** Store the triggering element in a ref before opening; on close, call `trigger.focus()`.

### N2 — `ListTabStrip` is not marked as a tablist
**Symptom.** Tabs are plain `<Link>`s with no `role="tablist"` / `role="tab"` / `aria-current="page"`. Screen readers announce generic links; assistive tech cannot tell which tab is active.
**Location.** `frontend/src/components/analysis/ListTabStrip.tsx`
**Severity.** Low
**Fix.** Wrap in `<nav aria-label="List sections">`, add `aria-current="page"` to the active link. (Full `role="tablist"` requires keyboard arrow nav; `aria-current` alone already fixes the worst of it.)

---

## O. Microcopy

### O1 — "In N lists" badge is ambiguous
**Symptom.** On the dashboard's assistant card, "In 2 lists" could read as "assigned to 2 projects" or "appears in 2 filters" — meaning is not obvious to a new user.
**Location.** `frontend/src/app/admin/analysis/page.tsx` ~lines 228–231
**Severity.** Low
**Fix.** Change to "In 2 analysis list(s)" or link the badge to a tooltip showing the list names.

### O2 — "Coded comparisons" heading is ambiguous
**Symptom.** The heading in the Instruction Timeline reads as either "comparisons which have been coded" or "comparing codes against each other". Users squint.
**Location.** `frontend/src/components/analysis/InstructionTimeline.tsx` ~line 742
**Severity.** Low
**Fix.** Rename to "Coded version pairs" (paired with D2's single-version fix, which adds a "Coded single versions" sibling section).

---

## Prioritised top-10 action list

| # | ID | Issue | Severity |
|---|----|-------|----------|
| 1 | **C1** | `usage_count` excludes instruction highlights — every code chip shows a wrong number | High |
| 2 | **C2** | Export omits all instruction-coded data — researcher exports are incomplete | High |
| 3 | **D1** | Deleting a code leaves orphaned "No codes" highlights permanently visible | High |
| 4 | **D5** | Export fetches entire `analysis_highlight_codes` table with no filter — silently breaks at scale | High |
| 5 | **A5** | No confirmation before deleting a list — one click destroys an entire research project | High |
| 6 | **B1** | API errors swallowed on dashboard — user sees empty state with no way to distinguish empty vs broken | High |
| 7 | **I1** | Any admin can edit/delete any other admin's list — no ownership check | High |
| 8 | **G1** | "View instruction" link in Codes & Quotations lands on Sessions tab, not the coded version | Medium |
| 9 | **D3** | Thread date filter always uses `last_message_at` regardless of active sort field | Medium |
| 10 | **C3** | No way to re-assign a highlight to a different code without deleting and re-creating it | Medium |
