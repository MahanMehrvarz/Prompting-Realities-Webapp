from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401 ensures models register with Base metadata
from .database import Base, engine
from .routes import auth, assistants, sessions

app = FastAPI(title="Prompting Realities Backend")


@app.on_event("startup")
def startup_event():
    """Create database tables on startup."""
    print('Test')
    Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(assistants.router)
app.include_router(sessions.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
