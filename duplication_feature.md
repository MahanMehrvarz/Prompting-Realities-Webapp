# Assistant Duplication Feature - Implementation Guide

## Overview

This document outlines a safe implementation strategy for adding a "Duplicate" button to assistant (LLM Thing) cards. The goal is to allow users to create a copy of an existing assistant with all configuration pre-filled, without breaking existing functionality.

---

## Current Data Model

### Assistant Table Fields
| Field | Type | Duplicate? | Reason |
|-------|------|------------|--------|
| `id` | UUID | NO | New unique ID |
| `supabase_user_id` | string | YES | Same user owns the copy |
| `name` | string | YES (modified) | Add " (Copy)" suffix |
| `prompt_instruction` | string | YES | Core configuration |
| `json_schema` | JSON | YES | Core configuration |
| `mqtt_host` | string | YES | Core configuration |
| `mqtt_port` | number | YES | Core configuration |
| `mqtt_user` | string | YES | Core configuration |
| `mqtt_pass` | string | NO | Security - re-enter |
| `mqtt_topic` | string | YES (modified) | Avoid topic collision |
| `openai_key` | string | NO | Security - re-enter |
| `created_at` | timestamp | NO | New timestamp |
| `updated_at` | timestamp | NO | New timestamp |
| `deleted_at` | timestamp | NO | Not applicable |

### Related Tables - NOT Duplicated
- `assistant_sessions` - User starts fresh
- `chat_messages` - No history copied

---

## Security Considerations

### 1. API Key (Critical)
- **Decision**: DO NOT duplicate
- **Reason**: API keys are encrypted and stored securely. Duplicating would:
  - Require decryption/re-encryption
  - Create security audit concerns
  - Go against principle of explicit key entry
- **User Experience**: Show "API Key Required" status on duplicated assistant

### 2. MQTT Password
- **Decision**: duplicate is okay

### 3. Topic Collision
- **Decision**: Modify topic to avoid conflicts
- **Strategy**: Append `-copy` 
- **Example**: `home/lights` → `home/lights-copy`

---

## Database Impact

### Schema Changes Required: NONE

The duplication feature only performs an INSERT operation with modified data. No new columns, tables, or relationships are needed.

### Database Operation
```sql
-- Conceptual (actual operation via Supabase client)
INSERT INTO assistants (
  supabase_user_id,
  name,
  prompt_instruction,
  json_schema,
  mqtt_host,
  mqtt_port,
  mqtt_user,
  mqtt_topic
  -- openai_key intentionally omitted
)
SELECT
  supabase_user_id,
  name || ' (Copy)',
  prompt_instruction,
  json_schema,
  mqtt_host,
  mqtt_port,
  mqtt_user,
  mqtt_topic || '-copy'
FROM assistants WHERE id = :source_id;
```

---

## Backend Impact

### Changes Required: NONE

- No new API endpoints needed
- Existing `assistantService.create()` handles the insert
- API key update uses existing `/assistants/update-api-key` endpoint (user calls after duplication)

---

## Frontend Implementation

### Location
File: `frontend/src/app/page.tsx`

### New Function: `handleDuplicateAssistant`

```typescript
const handleDuplicateAssistant = async (sourceId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Find source assistant
    const source = assistants.find(a => a.id === sourceId);
    if (!source) return;

    // Create duplicate with safe modifications
    const record = await assistantService.create({
      supabase_user_id: user.id,
      name: `${source.name} (Copy)`,
      prompt_instruction: source.promptInstruction,
      json_schema: source.schema,
      mqtt_host: source.mqttHost,
      mqtt_port: source.mqttPort,
      mqtt_user: source.mqttUser,
      mqtt_topic: `${source.mqttTopic}-copy`,
      mqtt_pass: null,  // Security: don't copy
      // openai_key not included - uses existing flow
    });

    const formatted = formatAssistant(record);
    setAssistants((prev) => [...prev, formatted]);
    setSelectedAssistantId(record.id);

    // Show notification that API key needs to be set
    // (implementation depends on notification system)

  } catch (error) {
    logger.error("Failed to duplicate assistant", error);
  }
};
```

### UI Button Placement

Add duplicate button to assistant card actions (near delete button):

```tsx
// In the assistant card section (~line 1259)
<button
  onClick={(e) => {
    e.stopPropagation();
    handleDuplicateAssistant(assistant.id);
  }}
  className="... duplicate button styles ..."
  title="Duplicate this assistant"
>
  {/* Duplicate icon */}
</button>
```

---

## User Experience Flow

1. User clicks duplicate button on assistant card
2. New assistant created immediately with "(Copy)" suffix
3. New assistant selected and shown
4. Status shows "Draft" (missing API key)
5. User enters API key to complete setup
6. Optional: User enters MQTT password if using auth

---

## Risk Assessment

### Low Risk
- Database: Only INSERT, no schema changes
- Backend: Uses existing create endpoint
- Sessions/Messages: Completely isolated (not copied)

### Potential Issues & Mitigations

| Risk | Mitigation |
|------|------------|
| Name collision | Add unique suffix or counter |
| Topic collision | Append `-copy` to topic |
| User expects API key copied | Clear UI indication that key needs re-entry |
| Rapid duplicate clicks | Disable button during operation |

---

## Testing Checklist

### Before Implementation
- [ ] Backup database or test on staging

### After Implementation
- [ ] Duplicate creates new assistant
- [ ] Original assistant unchanged
- [ ] Name has "(Copy)" suffix
- [ ] Topic has "-copy" suffix
- [ ] Prompt instruction copied correctly
- [ ] JSON schema copied correctly
- [ ] MQTT host/port/user copied correctly
- [ ] API key is NOT copied (shows as unset)
- [ ] MQTT password is NOT copied
- [ ] No sessions copied
- [ ] No messages copied
- [ ] Original can still run
- [ ] Duplicate can run after API key added
- [ ] Delete original doesn't affect duplicate
- [ ] Delete duplicate doesn't affect original

---

## Implementation Order (Safe Rollout)

1. **Add duplicate function** - No UI yet, just the handler
2. **Test function manually** - Call from console to verify
3. **Add UI button** - Simple icon button
4. **Test full flow** - End-to-end with real usage
5. **Add user feedback** - Toast/notification for key needed

---

## Rollback Plan

If issues discovered:
1. Remove UI button (1 line change)
2. Duplicated assistants can be deleted manually
3. No database cleanup needed (soft delete exists)

---

## Summary

This feature is **low risk** because:
- No database schema changes
- No backend changes
- Uses existing CRUD operations
- Sensitive data explicitly not copied
- Complete isolation from sessions/messages
- Easy rollback by removing UI button
