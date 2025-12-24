from __future__ import annotations
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import ai
from .mqtt_manager import mqtt_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    yield
    # Shutdown: disconnect all persistent MQTT connections
    await mqtt_manager.disconnect_all()

app = FastAPI(
    title="Prompting Realities Backend - AI Services",
    description="Backend for MQTT, OpenAI, and transcription services. Data storage handled by Supabase.",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
