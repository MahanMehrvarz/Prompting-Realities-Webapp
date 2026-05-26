# Deployment Guide

This document describes how the Prompting Realities Webapp is deployed.

## Architecture

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend (Next.js) | Vercel | https://promptingrealities.com |
| Backend (FastAPI) | Render | https://prompting-realities-bk.onrender.com |
| Database | Supabase | https://vqdayblvvxahdgxmooao.supabase.co |

## Frontend Deployment (Vercel)

### Setup

1. Connect GitHub repo to Vercel
2. Set **Root Directory** to `frontend`
3. Vercel auto-detects Next.js and configures build settings

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_API_BASE` | Backend URL (https://prompting-realities-bk.onrender.com) |

### Notes

- Next.js version must be 16.0.7+ (CVE-2025-66478 fix)
- `NEXT_PUBLIC_` prefix required for client-side env vars

## Backend Deployment (Render)

### Why Render (not Vercel)?

The backend requires:
- Persistent MQTT connections
- Long-running processes
- Stateful connections

These don't work with Vercel's serverless model.

### Setup

1. Create a new **Web Service** on Render
2. Connect GitHub repo
3. Configure:

| Setting | Value |
|---------|-------|
| Root Directory | `backend` |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (keep secret!) |
| `ENCRYPTION_SECRET` | Key for encrypting API keys in database |

### Health Check

Test the backend is running:
```
GET https://prompting-realities-bk.onrender.com/health
```

Expected response: `{"status": "ok"}`

## Required Dependencies

### Backend (requirements.txt)

Key dependencies that must be present:
- `fastapi` - Web framework
- `uvicorn[standard]` - ASGI server
- `python-multipart` - Required for file uploads (transcription)
- `supabase` - Supabase Python client
- `paho_mqtt` - MQTT client
- `openai` - OpenAI API client
- `cryptography` - For encrypting stored API keys

## Deployment Workflow

1. Push changes to `main` branch on GitHub
2. Vercel auto-deploys frontend
3. Render auto-deploys backend (if auto-deploy enabled)
4. For manual backend deploy: Render Dashboard → Manual Deploy → Deploy latest commit

## Troubleshooting

### Frontend build fails with "Missing Supabase URL"
- Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` are set in Vercel
- Variable names must match exactly (case-sensitive)

### Frontend build fails with CVE vulnerability
- Update Next.js to 16.0.7+ in `frontend/package.json`

### Backend fails with "No module named X"
- Add missing dependency to `backend/requirements.txt`
- Trigger manual redeploy on Render

### Backend returns 404 for all routes
- Check Root Directory is set to `backend`
- Verify Start Command is correct

### CORS errors in browser
- Backend CORS is configured to allow all origins
- 404 errors don't include CORS headers - fix the route issue first
