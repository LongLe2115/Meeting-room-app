from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path


DB_PATH = Path(os.getenv("APP_DB_PATH", "data/app.db"))
_db_choice = os.getenv("APP_DB", "").lower()
_use_postgresql = (
    _db_choice == "postgresql"
    or bool(os.getenv("APP_POSTGRES_DATABASE"))
    or bool(os.getenv("APP_DATABASE_URL") or os.getenv("DATABASE_URL"))
)


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def db() -> sqlite3.Connection:
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    init_auth_db()
    init_booking_db()
    init_ticket_db()
    init_contact_db()


def init_contact_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS contact_requests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              full_name TEXT NOT NULL,
              email TEXT NOT NULL,
              message TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','read')),
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_contact_requests_status_created
              ON contact_requests(status, created_at);
            """
        )


def init_auth_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL CHECK(role IN ('customer','admin')),
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )
        # Migrate roles cũ (nếu DB đã có dữ liệu).
        try:
            conn.execute("UPDATE users SET role = 'customer' WHERE role IN ('employee','agent')")
        except Exception:
            pass
        _ensure_column(conn, table="users", column="oauth_provider", col_def="TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, table="users", column="oauth_provider_id", col_def="TEXT NOT NULL DEFAULT ''")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS password_resets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              token_hash TEXT NOT NULL UNIQUE,
              expires_at TEXT NOT NULL,
              used_at TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )


def init_booking_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS rooms (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              location TEXT NOT NULL,
              capacity INTEGER NOT NULL,
              image_url TEXT NOT NULL DEFAULT '',
              amenities_json TEXT NOT NULL DEFAULT '[]',
              status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS bookings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
              organizer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              start_at TEXT NOT NULL,
              end_at TEXT NOT NULL,
              title TEXT NOT NULL,
              notes TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_bookings_room_time
              ON bookings(room_id, start_at, end_at);
            """
        )
        _ensure_column(conn, table="rooms", column="image_url", col_def="TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, table="rooms", column="price", col_def="REAL NOT NULL DEFAULT 0")
        _ensure_column(conn, table="bookings", column="payment_method", col_def="TEXT NOT NULL DEFAULT 'cash'")
        _ensure_column(conn, table="bookings", column="payment_channel", col_def="TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, table="bookings", column="refund_confirmed_at", col_def="TEXT")


def init_ticket_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS tickets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              assignee_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
              subject TEXT NOT NULL,
              description TEXT NOT NULL,
              priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
              status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed','reopened')),
              category TEXT NOT NULL DEFAULT '',
              room_id INTEGER NULL REFERENCES rooms(id) ON DELETE SET NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_tickets_status_priority
              ON tickets(status, priority, created_at);

            CREATE TABLE IF NOT EXISTS ticket_comments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
              author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              body TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            """
        )


def _ensure_column(conn: sqlite3.Connection, *, table: str, column: str, col_def: str) -> None:
    cols = conn.execute(f"PRAGMA table_info({table})").fetchall()
    if any(r["name"] == column for r in cols):
        return
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")


if _use_postgresql:
    from .db_postgresql import (  # type: ignore[assignment]
        db,
        init_auth_db,
        init_booking_db,
        init_contact_db,
        init_ticket_db,
    )
