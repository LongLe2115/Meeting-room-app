from __future__ import annotations

from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if load_dotenv:
    load_dotenv(ROOT_DIR / ".env", override=True)

from .db import init_db
from .modules.auth import router as auth_router
from .modules.booking import bookings_router, rooms_router
from .routers import contact_requests, payment_info, public_stats, tickets


FRONTEND_DIR = ROOT_DIR / "frontend"


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="Meeting Room Booking + Ticket API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router.router)
    app.include_router(rooms_router.router)
    app.include_router(bookings_router.router)
    app.include_router(tickets.router)
    app.include_router(public_stats.router)
    app.include_router(contact_requests.public_router)
    app.include_router(contact_requests.admin_router)
    app.include_router(payment_info.router)

    @app.get("/health")
    def health():
        return {"ok": True}

    if FRONTEND_DIR.is_dir():
        app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

    return app


app = create_app()
