"""Analysis feature routes: qualitative coding of human-AI conversations."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client

from ..config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from ..security import get_current_user_email

router = APIRouter(prefix="/analysis", tags=["analysis"])


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def require_admin(email: str = Depends(get_current_user_email)) -> str:
    """Verify the caller is in admin_emails; return their email."""
    sb = get_supabase()
    result = sb.table("admin_emails").select("email").eq("email", email).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=403, detail="Admin access required")
    return email


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CreateListBody(BaseModel):
    name: str
    description: str | None = None

class UpdateListBody(BaseModel):
    name: str | None = None
    description: str | None = None

class AddListItemBody(BaseModel):
    assistant_id: str

class CreateCodeGroupBody(BaseModel):
    name: str
    color: str = "#94a3b8"

class UpdateCodeGroupBody(BaseModel):
    name: str | None = None
    color: str | None = None

class CreateCodeBody(BaseModel):
    name: str
    color: str = "#fbbf24"
    description: str | None = None
    group_id: str | None = None

class UpdateCodeBody(BaseModel):
    name: str | None = None
    color: str | None = None
    description: str | None = None
    group_id: str | None = None

class CreateHighlightBody(BaseModel):
    list_id: str
    thread_id: str
    session_id: str
    assistant_id: str
    selected_text: str
    message_ids: list[str]
    char_start: int
    char_end: int
    source_field: str  # 'user_text' | 'response_text' | 'both'

class CreateInstructionHighlightBody(BaseModel):
    list_id: str
    assistant_id: str
    older_version_id: str
    newer_version_id: str
    selected_text: str
    char_start: int
    char_end: int
    code_id: str | None = None

class AssignCodeBody(BaseModel):
    code_id: str


# ---------------------------------------------------------------------------
# Helper: count aggregates
# ---------------------------------------------------------------------------

def _list_with_counts(sb, list_id: str) -> dict:
    """Fetch a single list row plus aggregate counts."""
    rows = sb.table("analysis_lists").select("*").eq("id", list_id).is_("deleted_at", None).limit(1).execute()
    if not rows.data:
        return None
    data = rows.data[0]
    item_count = sb.table("analysis_list_items").select("id", count="exact").eq("list_id", list_id).execute()
    code_count = sb.table("analysis_codes").select("id", count="exact").eq("list_id", list_id).execute()
    data["item_count"] = item_count.count or 0
    data["code_count"] = code_count.count or 0
    return data


# ---------------------------------------------------------------------------
# Lists CRUD
# ---------------------------------------------------------------------------

@router.get("/lists")
def get_lists(admin: str = Depends(require_admin)):
    sb = get_supabase()
    rows = sb.table("analysis_lists").select("*").is_("deleted_at", None).order("created_at", desc=True).execute()
    if not rows.data:
        return []

    list_ids = [r["id"] for r in rows.data]

    # Batch fetch item counts and code counts in 2 queries instead of 2N
    all_items = sb.table("analysis_list_items").select("list_id").in_("list_id", list_ids).execute()
    all_codes = sb.table("analysis_codes").select("list_id").in_("list_id", list_ids).execute()

    item_count_map: dict[str, int] = {}
    for r in (all_items.data or []):
        item_count_map[r["list_id"]] = item_count_map.get(r["list_id"], 0) + 1

    code_count_map: dict[str, int] = {}
    for r in (all_codes.data or []):
        code_count_map[r["list_id"]] = code_count_map.get(r["list_id"], 0) + 1

    result = []
    for row in rows.data:
        row["item_count"] = item_count_map.get(row["id"], 0)
        row["code_count"] = code_count_map.get(row["id"], 0)
        result.append(row)
    return result


@router.post("/lists", status_code=201)
def create_list(body: CreateListBody, admin: str = Depends(require_admin)):
    sb = get_supabase()
    res = sb.table("analysis_lists").insert({
        "name": body.name,
        "description": body.description,
        "created_by": admin,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Insert failed")
    return res.data[0]


@router.get("/lists/{list_id}")
def get_list(list_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    data = _list_with_counts(sb, list_id)
    if not data:
        raise HTTPException(status_code=404, detail="List not found")
    return data


@router.patch("/lists/{list_id}")
def update_list(list_id: str, body: UpdateListBody, admin: str = Depends(require_admin)):
    sb = get_supabase()
    updates: dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.description is not None:
        updates["description"] = body.description
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    sb.table("analysis_lists").update(updates).eq("id", list_id).is_("deleted_at", None).execute()
    data = _list_with_counts(sb, list_id)
    if not data:
        raise HTTPException(status_code=404, detail="List not found")
    return data


@router.delete("/lists/{list_id}", status_code=204)
def delete_list(list_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    sb.table("analysis_lists").update({"deleted_at": datetime.utcnow().isoformat()}).eq("id", list_id).execute()
    return None


# ---------------------------------------------------------------------------
# List items
# ---------------------------------------------------------------------------

@router.get("/lists/{list_id}/items")
def get_list_items(list_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    rows = sb.table("analysis_list_items").select("*, assistants(id, name, prompt_instruction, deleted_at)").eq("list_id", list_id).execute()
    result = []
    for row in (rows.data or []):
        asst = row.get("assistants") or {}
        if asst.get("deleted_at"):
            continue  # skip soft-deleted assistants
        result.append({
            "id": row["id"],
            "assistant_id": row["assistant_id"],
            "assistant_name": asst.get("name"),
            "assistant_system_prompt": asst.get("prompt_instruction"),
            "added_by": row["added_by"],
            "added_at": row["added_at"],
        })
    return result


@router.post("/lists/{list_id}/items", status_code=201)
def add_list_item(list_id: str, body: AddListItemBody, admin: str = Depends(require_admin)):
    sb = get_supabase()
    try:
        existing = sb.table("analysis_list_items").select("id").eq("list_id", list_id).eq("assistant_id", body.assistant_id).limit(1).execute()
        if existing.data:
            raise HTTPException(status_code=409, detail="Assistant already in list")
        res = sb.table("analysis_list_items").insert({
            "list_id": list_id,
            "assistant_id": body.assistant_id,
            "added_by": admin,
        }).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Insert failed")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/lists/{list_id}/items/{assistant_id}", status_code=204)
def remove_list_item(list_id: str, assistant_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    sb.table("analysis_list_items").delete().eq("list_id", list_id).eq("assistant_id", assistant_id).execute()
    return None


# ---------------------------------------------------------------------------
# Assistants browse
# ---------------------------------------------------------------------------

BROWSE_SORT_FIELDS = {"created_at", "last_used", "thread_count", "message_count"}

@router.get("/assistants")
def browse_assistants(
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
    date_from: str | None = Query(None),  # ISO date string YYYY-MM-DD, applied to sort_by field
    date_to: str | None = Query(None),
    admin: str = Depends(require_admin),
):
    if sort_by not in BROWSE_SORT_FIELDS:
        sort_by = "created_at"
    if sort_dir not in ("asc", "desc"):
        sort_dir = "desc"

    sb = get_supabase()

    # 1. Fetch all matching assistants (no pagination yet — needed for stats-based sorting)
    query = sb.table("assistants").select("id, name, created_at").is_("deleted_at", None)
    if search:
        query = query.ilike("name", f"%{search}%")
    rows = query.order("created_at", desc=True).execute()
    all_rows = rows.data or []

    if not all_rows:
        return {"total": 0, "page": page, "page_size": page_size, "items": []}

    all_ids = [r["id"] for r in all_rows]

    # 2. Fetch message stats — paginate to bypass Supabase's default 1000-row cap
    CHUNK = 1000
    all_msgs: list[dict] = []
    offset_m = 0
    while True:
        chunk = (
            sb.table("chat_messages")
            .select("assistant_id, thread_id, created_at")
            .in_("assistant_id", all_ids)
            .range(offset_m, offset_m + CHUNK - 1)
            .execute()
        )
        batch = chunk.data or []
        all_msgs.extend(batch)
        if len(batch) < CHUNK:
            break
        offset_m += CHUNK

    thread_sets: dict[str, set] = {}
    msg_count_map: dict[str, int] = {}
    last_used_map: dict[str, str] = {}

    for m in all_msgs:
        aid = m["assistant_id"]
        tid = m.get("thread_id") or m.get("session_id") or m.get("id")
        msg_count_map[aid] = msg_count_map.get(aid, 0) + 1
        if tid:
            thread_sets.setdefault(aid, set()).add(tid)
        ts = m.get("created_at")
        if ts and ts > last_used_map.get(aid, ""):
            last_used_map[aid] = ts

    thread_count_map = {aid: len(s) for aid, s in thread_sets.items()}

    # 3. Fetch list memberships (one query for all)
    all_items = sb.table("analysis_list_items").select("assistant_id, list_id").execute()
    membership_map: dict[str, list[str]] = {}
    for item in (all_items.data or []):
        membership_map.setdefault(item["assistant_id"], []).append(item["list_id"])

    # 3b. Fetch instruction version counts (one query for all)
    ih_res = sb.table("instruction_history").select("assistant_id").in_("assistant_id", all_ids).execute()
    instruction_count_map: dict[str, int] = {}
    for ih in (ih_res.data or []):
        aid = ih["assistant_id"]
        instruction_count_map[aid] = instruction_count_map.get(aid, 0) + 1

    # 4. Build enriched list
    items: list[dict] = []
    for row in all_rows:
        aid = row["id"]
        row["list_memberships"] = membership_map.get(aid, [])
        row["thread_count"] = thread_count_map.get(aid, 0)
        row["message_count"] = msg_count_map.get(aid, 0)
        row["last_used"] = last_used_map.get(aid)
        # If no saved history, count as 1 if the assistant has a prompt (the "current" fallback)
        hist_count = instruction_count_map.get(aid, 0)
        if hist_count == 0 and row.get("prompt_instruction"):
            hist_count = 1
        row["instruction_version_count"] = hist_count
        items.append(row)

    # 5. Apply date filter — always on created_at, independent of sort field
    if date_from:
        items = [i for i in items if (i["created_at"] or "") >= date_from]
    if date_to:
        items = [i for i in items if (i["created_at"] or "") <= date_to + "T23:59:59"]

    # 6. Sort
    reverse = sort_dir == "desc"
    if sort_by == "created_at":
        items.sort(key=lambda i: i["created_at"] or "", reverse=reverse)
    elif sort_by == "last_used":
        items.sort(key=lambda i: i["last_used"] or "", reverse=reverse)
    elif sort_by == "thread_count":
        items.sort(key=lambda i: i["thread_count"], reverse=reverse)
    elif sort_by == "message_count":
        items.sort(key=lambda i: i["message_count"], reverse=reverse)

    # 7. Paginate
    total = len(items)
    offset = (page - 1) * page_size
    page_items = items[offset: offset + page_size]

    return {"total": total, "page": page, "page_size": page_size, "items": page_items}


# ---------------------------------------------------------------------------
# Threads browser
# ---------------------------------------------------------------------------

@router.get("/lists/{list_id}/assistant/{assistant_id}/threads")
def get_threads(list_id: str, assistant_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    try:
        # Derive threads from chat_messages — each unique thread_id is a thread
        msgs = sb.table("chat_messages").select("id, session_id, thread_id, device_id, created_at").eq("assistant_id", assistant_id).order("created_at", desc=False).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"messages query: {e}")

    # Get highlight counts per thread for this list
    highlights = sb.table("analysis_highlights").select("thread_id").eq("list_id", list_id).eq("assistant_id", assistant_id).execute()
    highlight_count_map: dict[str, int] = {}
    for h in (highlights.data or []):
        key = h["thread_id"]
        highlight_count_map[key] = highlight_count_map.get(key, 0) + 1

    # Group messages by thread_id
    threads: dict[str, dict] = {}
    for m in (msgs.data or []):
        tid = m.get("thread_id") or m["session_id"] or m["id"]
        if tid not in threads:
            threads[tid] = {
                "thread_id": tid,
                "session_id": m.get("session_id") or tid,
                "device_id": m.get("device_id"),
                "message_count": 0,
                "first_message_at": m["created_at"],
                "last_message_at": m["created_at"],
            }
        threads[tid]["message_count"] += 1
        threads[tid]["last_message_at"] = m["created_at"]

    result = []
    for tid, t in threads.items():
        hcount = highlight_count_map.get(tid, 0)
        t["highlight_count"] = hcount
        t["has_codes"] = hcount > 0
        result.append(t)

    result.sort(key=lambda x: x["last_message_at"] or "", reverse=True)
    return result


# ---------------------------------------------------------------------------
# Standalone threads browser (no list context)
# ---------------------------------------------------------------------------

@router.get("/assistant/{assistant_id}/threads")
def get_threads_standalone(assistant_id: str, admin: str = Depends(require_admin)):
    """List threads for an assistant without requiring a list context."""
    sb = get_supabase()
    try:
        msgs = sb.table("chat_messages").select("id, session_id, thread_id, device_id, created_at").eq("assistant_id", assistant_id).order("created_at", desc=False).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"messages query: {e}")

    threads: dict[str, dict] = {}
    for m in (msgs.data or []):
        tid = m.get("thread_id") or m["session_id"] or m["id"]
        if tid not in threads:
            threads[tid] = {
                "thread_id": tid,
                "session_id": m.get("session_id") or tid,
                "device_id": m.get("device_id"),
                "message_count": 0,
                "first_message_at": m["created_at"],
                "last_message_at": m["created_at"],
                "highlight_count": 0,
                "has_codes": False,
            }
        threads[tid]["message_count"] += 1
        threads[tid]["last_message_at"] = m["created_at"]

    result = list(threads.values())
    result.sort(key=lambda x: x["last_message_at"] or "", reverse=True)
    return result


# ---------------------------------------------------------------------------
# Instruction history for an assistant
# ---------------------------------------------------------------------------

@router.get("/assistant/{assistant_id}/instruction-history")
def get_instruction_history(assistant_id: str, admin: str = Depends(require_admin)):
    """Return all saved instruction versions for an assistant, newest first.
    If no history exists, falls back to the assistant's current prompt_instruction."""
    sb = get_supabase()
    res = sb.table("instruction_history").select("*").eq("assistant_id", assistant_id).order("saved_at", desc=True).execute()
    history = res.data or []
    if not history:
        a_res = sb.table("assistants").select("name, prompt_instruction, created_at").eq("id", assistant_id).maybeSingle().execute()
        a = a_res.data
        if a and a.get("prompt_instruction"):
            history = [{
                "id": f"current-{assistant_id}",
                "assistant_id": assistant_id,
                "assistant_name": a.get("name", ""),
                "instruction_text": a["prompt_instruction"],
                "saved_at": a.get("created_at", ""),
            }]
    return history


# ---------------------------------------------------------------------------
# Thread conversation (messages + highlights)
# ---------------------------------------------------------------------------

@router.get("/lists/{list_id}/thread/{thread_id}")
def get_thread_conversation(list_id: str, thread_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()

    messages = sb.table("chat_messages").select("id, session_id, assistant_id, user_text, response_text, created_at, reaction").eq("thread_id", thread_id).order("created_at", desc=False).execute()

    assistant_id = None
    if messages.data:
        assistant_id = messages.data[0].get("assistant_id")

    # Fetch highlights for this thread + list (skip when no list context)
    highlights = []
    if list_id != "none":
        highlights_res = sb.table("analysis_highlights").select("*").eq("list_id", list_id).eq("thread_id", thread_id).execute()
        for h in (highlights_res.data or []):
            codes_res = sb.table("analysis_highlight_codes").select("*, analysis_codes(id, name, color)").eq("highlight_id", h["id"]).execute()
            codes = []
            for c in (codes_res.data or []):
                code_data = c.get("analysis_codes") or {}
                codes.append({
                    "id": code_data.get("id"),
                    "name": code_data.get("name"),
                    "color": code_data.get("color"),
                    "assigned_by": c["assigned_by"],
                    "assigned_at": c["assigned_at"],
                })
            h["codes"] = codes
            highlights.append(h)

    return {
        "thread_id": thread_id,
        "assistant_id": assistant_id,
        "messages": messages.data or [],
        "highlights": highlights,
    }


# ---------------------------------------------------------------------------
# Code groups
# ---------------------------------------------------------------------------

@router.get("/lists/{list_id}/code-groups")
def get_code_groups(list_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    rows = sb.table("analysis_code_groups").select("*").eq("list_id", list_id).order("created_at", desc=False).execute()
    if not rows.data:
        return []

    group_ids = [r["id"] for r in rows.data]
    all_codes = sb.table("analysis_codes").select("group_id").in_("group_id", group_ids).execute()
    count_map: dict[str, int] = {}
    for c in (all_codes.data or []):
        gid = c["group_id"]
        count_map[gid] = count_map.get(gid, 0) + 1

    result = []
    for row in rows.data:
        row["code_count"] = count_map.get(row["id"], 0)
        result.append(row)
    return result


@router.post("/lists/{list_id}/code-groups", status_code=201)
def create_code_group(list_id: str, body: CreateCodeGroupBody, admin: str = Depends(require_admin)):
    sb = get_supabase()
    res = sb.table("analysis_code_groups").insert({
        "list_id": list_id,
        "name": body.name,
        "color": body.color,
        "created_by": admin,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Insert failed")
    return res.data[0]


@router.patch("/lists/{list_id}/code-groups/{group_id}")
def update_code_group(list_id: str, group_id: str, body: UpdateCodeGroupBody, admin: str = Depends(require_admin)):
    sb = get_supabase()
    updates: dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.color is not None:
        updates["color"] = body.color
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    sb.table("analysis_code_groups").update(updates).eq("id", group_id).eq("list_id", list_id).execute()
    rows = sb.table("analysis_code_groups").select("*").eq("id", group_id).limit(1).execute()
    if not rows.data:
        raise HTTPException(status_code=404, detail="Code group not found")
    return rows.data[0]


@router.delete("/lists/{list_id}/code-groups/{group_id}", status_code=204)
def delete_code_group(list_id: str, group_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    sb.table("analysis_code_groups").delete().eq("id", group_id).eq("list_id", list_id).execute()
    return None


# ---------------------------------------------------------------------------
# Codes
# ---------------------------------------------------------------------------

@router.get("/lists/{list_id}/codes")
def get_codes(list_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    rows = sb.table("analysis_codes").select("*, analysis_code_groups(id, name)").eq("list_id", list_id).order("created_at", desc=False).execute()
    if not rows.data:
        return []

    code_ids = [r["id"] for r in rows.data]

    # Batch fetch usage counts in 1 query instead of N
    usages = sb.table("analysis_highlight_codes").select("code_id").in_("code_id", code_ids).execute()
    usage_map: dict[str, int] = {}
    for u in (usages.data or []):
        usage_map[u["code_id"]] = usage_map.get(u["code_id"], 0) + 1

    result = []
    for row in rows.data:
        group = row.pop("analysis_code_groups", None) or {}
        row["group_name"] = group.get("name")
        row["usage_count"] = usage_map.get(row["id"], 0)
        result.append(row)
    return result


@router.post("/lists/{list_id}/codes", status_code=201)
def create_code(list_id: str, body: CreateCodeBody, admin: str = Depends(require_admin)):
    sb = get_supabase()
    res = sb.table("analysis_codes").insert({
        "list_id": list_id,
        "group_id": body.group_id,
        "name": body.name,
        "color": body.color,
        "description": body.description,
        "created_by": admin,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Insert failed")
    return res.data[0]


@router.patch("/lists/{list_id}/codes/{code_id}")
def update_code(list_id: str, code_id: str, body: UpdateCodeBody, admin: str = Depends(require_admin)):
    sb = get_supabase()
    updates: dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.color is not None:
        updates["color"] = body.color
    if body.description is not None:
        updates["description"] = body.description
    if body.group_id is not None:
        updates["group_id"] = body.group_id if body.group_id != "" else None
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    sb.table("analysis_codes").update(updates).eq("id", code_id).eq("list_id", list_id).execute()
    rows = sb.table("analysis_codes").select("*").eq("id", code_id).limit(1).execute()
    if not rows.data:
        raise HTTPException(status_code=404, detail="Code not found")
    return rows.data[0]


@router.delete("/lists/{list_id}/codes/{code_id}", status_code=204)
def delete_code(list_id: str, code_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    sb.table("analysis_codes").delete().eq("id", code_id).eq("list_id", list_id).execute()
    return None


# ---------------------------------------------------------------------------
# Highlights
# ---------------------------------------------------------------------------

@router.post("/highlights", status_code=201)
def create_highlight(body: CreateHighlightBody, admin: str = Depends(require_admin)):
    if body.source_field not in ("user_text", "response_text", "both"):
        raise HTTPException(status_code=400, detail="source_field must be user_text, response_text, or both")
    if body.char_end <= body.char_start:
        raise HTTPException(status_code=400, detail="char_end must be greater than char_start")
    sb = get_supabase()
    res = sb.table("analysis_highlights").insert({
        "list_id": body.list_id,
        "thread_id": body.thread_id,
        "session_id": body.session_id,
        "assistant_id": body.assistant_id,
        "selected_text": body.selected_text,
        "message_ids": body.message_ids,
        "char_start": body.char_start,
        "char_end": body.char_end,
        "source_field": body.source_field,
        "created_by": admin,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Insert failed")
    return res.data[0]


@router.delete("/highlights/{highlight_id}", status_code=204)
def delete_highlight(highlight_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    sb.table("analysis_highlights").delete().eq("id", highlight_id).execute()
    return None


# ---------------------------------------------------------------------------
# Highlight–code assignments
# ---------------------------------------------------------------------------

@router.post("/highlights/{highlight_id}/codes", status_code=201)
def assign_code(highlight_id: str, body: AssignCodeBody, admin: str = Depends(require_admin)):
    sb = get_supabase()
    existing = sb.table("analysis_highlight_codes").select("id").eq("highlight_id", highlight_id).eq("code_id", body.code_id).limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Code already assigned to this highlight")
    res = sb.table("analysis_highlight_codes").insert({
        "highlight_id": highlight_id,
        "code_id": body.code_id,
        "assigned_by": admin,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Insert failed")
    return res.data[0]


@router.delete("/highlights/{highlight_id}/codes/{code_id}", status_code=204)
def unassign_code(highlight_id: str, code_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    sb.table("analysis_highlight_codes").delete().eq("highlight_id", highlight_id).eq("code_id", code_id).execute()
    return None


@router.get("/lists/{list_id}/codes/{code_id}/highlights")
def get_code_highlights(list_id: str, code_id: str, admin: str = Depends(require_admin)):
    """Return all highlights assigned to a specific code, with message context."""
    sb = get_supabase()
    # Get all highlight-code assignments for this code
    assignments = sb.table("analysis_highlight_codes").select("highlight_id").eq("code_id", code_id).execute()
    highlight_ids = [row["highlight_id"] for row in (assignments.data or [])]

    # Fetch message highlights filtered by list_id (may be empty if code only has instruction highlights)
    if highlight_ids:
        hl_res = sb.table("analysis_highlights").select("*").in_("id", highlight_ids).eq("list_id", list_id).order("created_at", desc=True).execute()
        highlights = hl_res.data or []
    else:
        highlights = []

    # Fetch assistant names for context
    assistant_ids = list({h["assistant_id"] for h in highlights})
    asst_map: dict[str, str] = {}
    if assistant_ids:
        asst_res = sb.table("assistants").select("id, name").in_("id", assistant_ids).execute()
        for a in (asst_res.data or []):
            asst_map[a["id"]] = a.get("name", "")

    # Fetch message texts
    all_msg_ids: list[str] = []
    for h in highlights:
        all_msg_ids.extend(h.get("message_ids") or [])
    msg_map: dict[str, dict] = {}
    if all_msg_ids:
        msg_res = sb.table("chat_messages").select("id, user_text, response_text").in_("id", all_msg_ids).execute()
        for m in (msg_res.data or []):
            msg_map[m["id"]] = m

    # Fetch all codes for each highlight
    all_hl_ids = [h["id"] for h in highlights]
    codes_by_highlight: dict[str, list] = {}
    if all_hl_ids:
        all_hc = sb.table("analysis_highlight_codes").select(
            "highlight_id, code_id, analysis_codes(id, name, color)"
        ).in_("highlight_id", all_hl_ids).execute()
        for hc in (all_hc.data or []):
            hid = hc["highlight_id"]
            code_data = hc.get("analysis_codes") or {}
            codes_by_highlight.setdefault(hid, []).append({
                "id": code_data.get("id"),
                "name": code_data.get("name"),
                "color": code_data.get("color"),
            })

    result = []
    for h in highlights:
        result.append({
            "kind": "message",
            "highlight_id": h["id"],
            "thread_id": h["thread_id"],
            "session_id": h["session_id"],
            "assistant_id": h["assistant_id"],
            "assistant_name": asst_map.get(h["assistant_id"], ""),
            "selected_text": h["selected_text"],
            "source_field": h["source_field"],
            "created_by": h["created_by"],
            "created_at": h["created_at"],
            "message_texts": [
                {
                    "message_id": mid,
                    "user_text": msg_map.get(mid, {}).get("user_text"),
                    "response_text": msg_map.get(mid, {}).get("response_text"),
                }
                for mid in (h.get("message_ids") or [])
            ],
            "codes": codes_by_highlight.get(h["id"], []),
        })

    # Include instruction highlights for this code
    ih_res = sb.table("analysis_instruction_highlights").select("*").eq("list_id", list_id).eq("code_id", code_id).order("created_at", desc=True).execute()
    instruction_highlights = ih_res.data or []
    if instruction_highlights:
        # Reuse asst_map, add missing assistants
        missing = list({h["assistant_id"] for h in instruction_highlights} - set(asst_map.keys()))
        if missing:
            a_res = sb.table("assistants").select("id, name").in_("id", missing).execute()
            for a in (a_res.data or []):
                asst_map[a["id"]] = a.get("name", "")
        # Fetch the one code
        c_res = sb.table("analysis_codes").select("id, name, color").eq("id", code_id).limit(1).execute()
        c_data = (c_res.data or [{}])[0]
        code_info = {"id": c_data.get("id"), "name": c_data.get("name"), "color": c_data.get("color")} if c_data.get("id") else None
        for h in instruction_highlights:
            result.append({
                "kind": "instruction",
                "highlight_id": h["id"],
                "assistant_id": h["assistant_id"],
                "assistant_name": asst_map.get(h["assistant_id"], ""),
                "selected_text": h["selected_text"],
                "older_version_id": h["older_version_id"],
                "newer_version_id": h["newer_version_id"],
                "char_start": h["char_start"],
                "char_end": h["char_end"],
                "created_by": h["created_by"],
                "created_at": h["created_at"],
                "codes": [code_info] if code_info else [],
            })
    result.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return result


@router.get("/lists/{list_id}/highlights")
def get_list_highlights(
    list_id: str,
    code_ids: str | None = Query(None),
    admin: str = Depends(require_admin),
):
    """Return highlights for a list filtered by code_ids (OR logic). Each highlight includes all its codes."""
    if not code_ids:
        return []

    sb = get_supabase()
    code_id_list = [c.strip() for c in code_ids.split(",") if c.strip()]
    if not code_id_list:
        return []

    # Find highlight_ids matching any of the code_ids (OR logic) for message highlights
    hc_res = sb.table("analysis_highlight_codes").select("highlight_id").in_("code_id", code_id_list).execute()
    highlight_ids = list({row["highlight_id"] for row in (hc_res.data or [])})  # deduplicate

    # Fetch those highlights scoped to this list
    if highlight_ids:
        hl_res = sb.table("analysis_highlights").select("*").eq("list_id", list_id).in_("id", highlight_ids).order("created_at", desc=True).execute()
        message_highlights = hl_res.data or []
    else:
        message_highlights = []

    # For each highlight, fetch ALL its codes (not just the matched ones)
    codes_by_highlight: dict[str, list] = {}
    if message_highlights:
        all_hl_ids = [h["id"] for h in message_highlights]
        all_hc = sb.table("analysis_highlight_codes").select("highlight_id, code_id, assigned_by, assigned_at, analysis_codes(id, name, color)").in_("highlight_id", all_hl_ids).execute()
        for hc in (all_hc.data or []):
            hid = hc["highlight_id"]
            code_data = hc.get("analysis_codes") or {}
            codes_by_highlight.setdefault(hid, []).append({
                "id": code_data.get("id"),
                "name": code_data.get("name"),
                "color": code_data.get("color"),
            })

    # Fetch assistant names
    assistant_ids = list({h["assistant_id"] for h in message_highlights if h.get("assistant_id")})
    assistant_names: dict[str, str] = {}
    if assistant_ids:
        a_res = sb.table("assistants").select("id, name").in_("id", assistant_ids).execute()
        for a in (a_res.data or []):
            assistant_names[a["id"]] = a["name"]

    # Hydrate message texts — batch fetch all relevant message IDs
    all_message_ids: list[str] = []
    for h in message_highlights:
        all_message_ids.extend(h.get("message_ids") or [])
    all_message_ids = list(set(all_message_ids))

    msg_map: dict[str, dict] = {}
    if all_message_ids:
        msgs = sb.table("chat_messages").select("id, user_text, response_text").in_("id", all_message_ids).execute()
        for m in (msgs.data or []):
            msg_map[m["id"]] = m

    results = []
    for h in message_highlights:
        message_texts = []
        for mid in (h.get("message_ids") or []):
            m = msg_map.get(mid, {})
            message_texts.append({
                "message_id": mid,
                "user_text": m.get("user_text"),
                "response_text": m.get("response_text"),
            })
        results.append({
            "kind": "message",
            "highlight_id": h["id"],
            "thread_id": h["thread_id"],
            "session_id": h["session_id"],
            "assistant_id": h["assistant_id"],
            "assistant_name": assistant_names.get(h["assistant_id"], "LLM Thing"),
            "selected_text": h["selected_text"],
            "source_field": h["source_field"],
            "created_by": h["created_by"],
            "created_at": h["created_at"],
            "message_texts": message_texts,
            "codes": codes_by_highlight.get(h["id"], []),
        })

    # --- Also include instruction highlights matching selected codes ---
    ih_res = sb.table("analysis_instruction_highlights").select("*").eq("list_id", list_id).in_("code_id", code_id_list).order("created_at", desc=True).execute()
    instruction_highlights = ih_res.data or []

    if instruction_highlights:
        # Fetch code details
        ih_code_ids = list({h["code_id"] for h in instruction_highlights if h.get("code_id")})
        ih_code_map: dict[str, dict] = {}
        if ih_code_ids:
            codes_res = sb.table("analysis_codes").select("id, name, color").in_("id", ih_code_ids).execute()
            for c in (codes_res.data or []):
                ih_code_map[c["id"]] = c

        # Fetch assistant names for any not already cached
        ih_asst_ids = list({h["assistant_id"] for h in instruction_highlights} - set(assistant_names.keys()))
        if ih_asst_ids:
            a_res = sb.table("assistants").select("id, name").in_("id", ih_asst_ids).execute()
            for a in (a_res.data or []):
                assistant_names[a["id"]] = a["name"]

        for h in instruction_highlights:
            cid = h.get("code_id")
            codes_list = []
            if cid and cid in ih_code_map:
                c = ih_code_map[cid]
                codes_list = [{"id": c["id"], "name": c["name"], "color": c["color"]}]
            results.append({
                "kind": "instruction",
                "highlight_id": h["id"],
                "assistant_id": h["assistant_id"],
                "assistant_name": assistant_names.get(h["assistant_id"], "LLM Thing"),
                "selected_text": h["selected_text"],
                "older_version_id": h["older_version_id"],
                "newer_version_id": h["newer_version_id"],
                "char_start": h["char_start"],
                "char_end": h["char_end"],
                "created_by": h["created_by"],
                "created_at": h["created_at"],
                "codes": codes_list,
            })

    # Sort by created_at desc
    results.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return results


# ---------------------------------------------------------------------------
# Instruction highlights (coding diffs between instruction versions)
# ---------------------------------------------------------------------------

@router.post("/instruction-highlights", status_code=201)
def create_instruction_highlight(body: CreateInstructionHighlightBody, admin: str = Depends(require_admin)):
    if body.char_end <= body.char_start:
        raise HTTPException(status_code=400, detail="char_end must be greater than char_start")
    sb = get_supabase()
    row = {
        "list_id": body.list_id,
        "assistant_id": body.assistant_id,
        "older_version_id": body.older_version_id,
        "newer_version_id": body.newer_version_id,
        "selected_text": body.selected_text,
        "char_start": body.char_start,
        "char_end": body.char_end,
        "created_by": admin,
    }
    if body.code_id:
        row["code_id"] = body.code_id
    res = sb.table("analysis_instruction_highlights").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Insert failed")
    return res.data[0]


@router.delete("/instruction-highlights/{highlight_id}", status_code=204)
def delete_instruction_highlight(highlight_id: str, admin: str = Depends(require_admin)):
    sb = get_supabase()
    sb.table("analysis_instruction_highlights").delete().eq("id", highlight_id).execute()
    return None


@router.get("/assistant/{assistant_id}/instruction-highlights")
def get_instruction_highlights(
    assistant_id: str,
    list_id: str | None = Query(None),
    admin: str = Depends(require_admin),
):
    """Return all instruction highlights for an assistant. If list_id is provided, filter to that list."""
    sb = get_supabase()
    q = sb.table("analysis_instruction_highlights").select("*").eq("assistant_id", assistant_id)
    if list_id:
        q = q.eq("list_id", list_id)
    res = q.order("created_at", desc=True).execute()
    highlights = res.data or []
    if not highlights:
        return []

    # Fetch code details for highlights that have a code_id
    code_ids = list({h["code_id"] for h in highlights if h.get("code_id")})
    code_map: dict[str, dict] = {}
    if code_ids:
        codes_res = sb.table("analysis_codes").select("id, name, color").in_("id", code_ids).execute()
        for c in (codes_res.data or []):
            code_map[c["id"]] = c

    for h in highlights:
        cid = h.get("code_id")
        if cid and cid in code_map:
            c = code_map[cid]
            h["codes"] = [{"id": c["id"], "name": c["name"], "color": c["color"], "assigned_by": h["created_by"], "assigned_at": h["created_at"]}]
        else:
            h["codes"] = []

    return highlights


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@router.get("/lists/{list_id}/export")
def export_list(
    list_id: str,
    format: str = Query("json", pattern="^(json|csv)$"),
    admin: str = Depends(require_admin),
):
    sb = get_supabase()

    # Fetch list meta
    list_rows = sb.table("analysis_lists").select("name").eq("id", list_id).limit(1).execute()
    if not list_rows.data:
        raise HTTPException(status_code=404, detail="List not found")
    list_name = list_rows.data[0]["name"]

    # Fetch all codes in this list
    codes_res = sb.table("analysis_codes").select("*, analysis_code_groups(name)").eq("list_id", list_id).execute()
    codes_map: dict[str, dict] = {}
    for c in (codes_res.data or []):
        group = c.pop("analysis_code_groups", None) or {}
        c["group_name"] = group.get("name")
        codes_map[c["id"]] = c

    # Fetch all highlights for this list
    highlights_res = sb.table("analysis_highlights").select("*").eq("list_id", list_id).execute()
    # Fetch assistant names
    asst_ids = list({h["assistant_id"] for h in (highlights_res.data or [])})
    asst_map: dict[str, str] = {}
    if asst_ids:
        asstants = sb.table("assistants").select("id, name").in_("id", asst_ids).execute()
        for a in (asstants.data or []):
            asst_map[a["id"]] = a["name"]

    # Fetch messages for context (full text per message_id)
    msg_ids: list[str] = []
    for h in (highlights_res.data or []):
        msg_ids.extend(h.get("message_ids") or [])
    msg_ids = list(set(msg_ids))
    msg_map: dict[str, dict] = {}
    if msg_ids:
        msgs = sb.table("chat_messages").select("id, user_text, response_text").in_("id", msg_ids).execute()
        for m in (msgs.data or []):
            msg_map[m["id"]] = m

    # Fetch highlight-code assignments
    hc_res = sb.table("analysis_highlight_codes").select("*").execute()
    hc_map: dict[str, list[dict]] = {}
    for hc in (hc_res.data or []):
        hc_map.setdefault(hc["highlight_id"], []).append(hc)

    # Build export structure
    code_export: dict[str, dict] = {}
    for code_id, code in codes_map.items():
        code_export[code_id] = {
            "code_id": code_id,
            "code_name": code["name"],
            "code_color": code["color"],
            "group_name": code.get("group_name"),
            "description": code.get("description"),
            "usage_count": 0,
            "quotes": [],
        }

    for h in (highlights_res.data or []):
        msg_ids_h = h.get("message_ids") or []
        # Collect full message text for context
        full_user = " | ".join(msg_map[mid]["user_text"] or "" for mid in msg_ids_h if mid in msg_map and msg_map[mid].get("user_text")) or None
        full_resp = " | ".join(msg_map[mid]["response_text"] or "" for mid in msg_ids_h if mid in msg_map and msg_map[mid].get("response_text")) or None

        quote_base = {
            "highlight_id": h["id"],
            "selected_text": h["selected_text"],
            "full_user_text": full_user,
            "full_response_text": full_resp,
            "assistant_name": asst_map.get(h["assistant_id"], "Unknown"),
            "thread_id": h["thread_id"],
            "session_id": h["session_id"],
            "source_field": h["source_field"],
            "created_by": h["created_by"],
            "created_at": h["created_at"],
        }

        for hc in hc_map.get(h["id"], []):
            code_id = hc["code_id"]
            if code_id in code_export:
                code_export[code_id]["usage_count"] += 1
                code_export[code_id]["quotes"].append({
                    **quote_base,
                    "assigned_by": hc["assigned_by"],
                })

    exported_at = datetime.utcnow().isoformat()

    if format == "json":
        payload = {
            "list_name": list_name,
            "exported_at": exported_at,
            "codes": list(code_export.values()),
        }
        return StreamingResponse(
            io.BytesIO(json.dumps(payload, indent=2, ensure_ascii=False).encode()),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{list_name}-export.json"'},
        )

    # CSV export
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "code_name", "group_name", "selected_text",
        "full_user_text", "full_response_text", "assistant_name",
        "thread_id", "session_id", "source_field",
        "highlight_created_by", "highlight_created_at", "assigned_by",
    ])
    for code in code_export.values():
        for q in code["quotes"]:
            writer.writerow([
                code["code_name"],
                code.get("group_name") or "",
                q["selected_text"],
                q.get("full_user_text") or "",
                q.get("full_response_text") or "",
                q["assistant_name"],
                q["thread_id"],
                q["session_id"],
                q.get("source_field") or "",
                q["created_by"],
                q["created_at"],
                q["assigned_by"],
            ])
    csv_bytes = output.getvalue().encode()
    safe_name = list_name.replace(" ", "_")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}-export.csv"'},
    )
