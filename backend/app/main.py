from __future__ import annotations
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401 ensures models register with Base metadata
from .database import Base, engine
from .routes import assistants, sessions


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    Base.metadata.create_all(bind=engine)
    yield
    # shutdown logic

app = FastAPI(
    title="Prompting Realities Backend",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assistants.router)
app.include_router(sessions.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
