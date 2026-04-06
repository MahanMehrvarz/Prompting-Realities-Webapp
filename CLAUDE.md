# Prompting Realities Webapp

## Project Overview

A full-stack web application for managing AI assistant interactions, built for research/experimental contexts. Supports multi-modal AI (chat, transcription, TTS), real-time MQTT messaging, and encrypted API key management.

## Architecture

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend:** FastAPI (Python), Uvicorn ASGI, SQLite + Supabase PostgreSQL
- **Auth:** Supabase JWT (supports anonymous access for shared sessions)
- **AI:** OpenAI API (GPT-4o-mini, Whisper, TTS)
- **Real-time:** MQTT (paho-mqtt backend, mqtt npm package frontend)

## Running the Project

```bash
# Both servers at once
./startboth.sh

# Or individually:
# Backend on 0.0.0.0:8000
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend on port 3000
cd frontend && npm run dev
```

API docs available at `http://localhost:8000/docs` when backend is running.

## Key Directories

```
backend/app/          # FastAPI app (routes, services, utils)
frontend/src/app/     # Next.js pages (App Router)
frontend/src/components/  # React components (mostly modals)
frontend/src/lib/     # API clients, Supabase init, utilities
```

## Backend Routes

- `POST /ai/chat` — Chat with OpenAI
- `POST /ai/transcribe` — Audio transcription (Whisper)
- `POST /ai/tts` — Text-to-speech
- `POST /ai/mqtt/*` — MQTT publish/test/disconnect
- `GET /ai/mqtt/credentials/{assistant_id}` — MQTT config
- `POST /assistants/update-api-key` — Store encrypted API key
- `GET /assistants/get-api-key/{assistant_id}` — Check key existence
- `/auth` — Supabase JWT validation
- `/health` — Health check

## Frontend Pages

- `/` — Home/dashboard
- `/chat/[assistantId]` — Chat interface
- `/hidden-login` — Auth page
- `/designsystem` — Component showcase

## Environment Variables

**Backend** (see `env` file):
- `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
- `PR_BACKEND_DB_URL` — Supabase PostgreSQL connection string
- `PR_SECRET_KEY` — App secret (change in production)
- `ENCRYPTION_SECRET` — Base64-encoded key for API key encryption

**Frontend** (`.env.local`):
- `NEXT_PUBLIC_API_URL` — Backend URL (default: `http://localhost:8000`)

## Features

### Assistant Management (Dashboard)
- Create, edit, duplicate, delete assistants
- Configure system prompts and structured output (JSON schema)
- Upload and store encrypted OpenAI API keys per assistant
- Set MQTT broker credentials (host, port, user, pass, topics) per assistant
- Run/stop assistants; test MQTT connection
- Generate shareable links with QR codes

### Chat Interface
- Multi-turn AI chat with conversation context (OpenAI Responses API)
- Speech-to-text input (Whisper)
- Text-to-speech output with 6 voice options (Alloy, Echo, Fable, Onyx, Nova, Shimmer)
- Like/dislike reactions on assistant responses
- Real-time active user count and queue position tracking
- Session management (create, reset, track status)

### MQTT Integration
- Receive external messages into chat via MQTT subscription (browser-side)
- Publish messages to MQTT broker from backend
- MQTT receiver modal for topic subscription
- Connection status display and test endpoint

### Data & Export
- Export conversation data as CSV or JSON with configurable fields
- View and refresh chat history from dashboard
- Messages isolated by session/thread/device

### UX / Onboarding
- First-use modal with data privacy notice
- TTS consent modal with voice selection
- Duplication info modal (explains what carries over when duplicating an assistant)
- Confirmation modals for destructive actions
- Skeleton loaders for async states

## Key Patterns

- API keys are **encrypted at rest** (`backend/app/encryption.py`)
- Chat messages are isolated by session/thread/device
- MQTT connections managed via `MqttManager` (async, session-based)
- OpenAI response context tracked via `response_id` for multi-turn continuity
- Frontend modals handle major UX flows (onboarding, export, MQTT, TTS consent)

## Testing

```bash
cd backend && pytest
```

Uses pytest-asyncio + httpx for async route testing.
