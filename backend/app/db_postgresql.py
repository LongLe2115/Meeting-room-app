"""
Kết nối PostgreSQL (psycopg2).
Bật bằng cách đặt biến môi trường: APP_DB=postgresql

Ưu tiên:
  1. APP_DATABASE_URL — Neon / Supabase (postgresql://...?sslmode=require)
  2. APP_POSTGRES_HOST, PORT, DATABASE, USER, PASSWORD — PostgreSQL local
"""
from __future__ import annotations

import os
import re
from contextlib import contextmanager
from typing import Any

import psycopg2
import psycopg2.extras


def _normalize_database_url(url: str) -> str:
    """Neon URL đôi khi có channel_binding=require — gây lỗi trên Windows/psycopg2."""
    cleaned = url.strip()
    cleaned = re.sub(r"[&?]channel_binding=[^&]*", "", cleaned)
    cleaned = cleaned.replace("?&", "?").rstrip("?&")
    if "sslmode=" not in cleaned and "neon.tech" in cleaned:
        sep = "&" if "?" in cleaned else "?"
        cleaned = f"{cleaned}{sep}sslmode=require"
    return cleaned


def _database_url() -> str:
    raw = (os.getenv("APP_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip()
    return _normalize_database_url(raw) if raw else ""


def _conn_string() -> str:
    host = os.getenv("APP_POSTGRES_HOST", "localhost")
    port = os.getenv("APP_POSTGRES_PORT", "5432")
    database = os.getenv("APP_POSTGRES_DATABASE", "meeting_room_db")
    user = os.getenv("APP_POSTGRES_USER", "postgres")
    password = os.getenv("APP_POSTGRES_PASSWORD", "")

    connstr = f"host={host} port={port} dbname={database} user={user}"
    if password:
        connstr += f" password={password}"
    sslmode = (os.getenv("APP_POSTGRES_SSLMODE") or "").strip()
    if not sslmode and (
        "neon.tech" in host
        or os.getenv("APP_POSTGRES_SSL", "").lower() in ("1", "true", "yes")
    ):
        sslmode = "require"
    if sslmode:
        connstr += f" sslmode={sslmode}"
    return connstr


class _PostgresCursor:
    """Cursor wrapper: fetchone/fetchall trả về dict, lastrowid từ RETURNING hoặc LASTVAL()."""

    def __init__(self, cursor: psycopg2.extras.RealDictCursor, is_insert: bool = False) -> None:
        self._cursor = cursor
        self._is_insert = is_insert
        self._lastrowid: int | None = None
        self._has_fetched_returning = False

    def execute(self, sql: str, params: tuple = ()) -> None:
        self._cursor.execute(sql, params)
        if self._is_insert and "RETURNING" in sql.upper():
            try:
                row = self._cursor.fetchone()
                if row and "id" in row:
                    self._lastrowid = int(row["id"])
                self._has_fetched_returning = True
            except Exception:
                self._lastrowid = None

    def fetchone(self) -> dict[str, Any] | None:
        if self._has_fetched_returning:
            self._has_fetched_returning = False
            return None
        row = self._cursor.fetchone()
        return dict(row) if row else None

    def fetchall(self) -> list[dict[str, Any]]:
        rows = self._cursor.fetchall()
        return [dict(r) for r in rows] if rows else []

    @property
    def lastrowid(self) -> int | None:
        if self._lastrowid is not None:
            return self._lastrowid
        if not self._is_insert:
            return None
        try:
            self._cursor.execute("SELECT LASTVAL()")
            row = self._cursor.fetchone()
            if row:
                if isinstance(row, dict):
                    value = next(iter(row.values()), None)
                else:
                    value = row[0]
                if value is not None:
                    return int(value)
        except Exception:
            pass
        return None

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount


class _PostgresConn:
    """Connection wrapper: execute() trả về cursor có fetchone/fetchall dict."""

    def __init__(self, conn: psycopg2.extensions.connection) -> None:
        self._conn = conn

    def execute(self, sql: str, params: tuple = ()) -> _PostgresCursor:
        sql_pg = sql.replace("?", "%s")
        is_insert = sql_pg.strip().upper().startswith("INSERT")
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        pg_cursor = _PostgresCursor(cur, is_insert=is_insert)
        pg_cursor.execute(sql_pg, params)
        return pg_cursor

    def executescript(self, sql: str) -> None:
        for stmt in sql.split(";"):
            stmt = stmt.strip()
            if stmt:
                stmt_pg = stmt.replace("?", "%s")
                try:
                    cur = self._conn.cursor()
                    cur.execute(stmt_pg)
                    cur.close()
                except psycopg2.Error:
                    pass

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


def _connect() -> _PostgresConn:
    url = _database_url()
    if url:
        conn = psycopg2.connect(url)
    else:
        conn = psycopg2.connect(_conn_string())
    return _PostgresConn(conn)


@contextmanager
def db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_auth_db() -> None:
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                name VARCHAR(200) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL CHECK(role IN ('customer','admin')),
                phone VARCHAR(20) NOT NULL DEFAULT '',
                date_of_birth VARCHAR(10),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        """)
        try:
            conn.execute("UPDATE users SET role = 'customer' WHERE role IN ('employee','agent')")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
        except Exception:
            pass
        try:
            conn.execute(
                "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer','admin'))"
            )
        except Exception:
            pass
        try:
            conn.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(20) NOT NULL DEFAULT ''"
            )
        except Exception:
            pass
        try:
            conn.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider_id VARCHAR(255) NOT NULL DEFAULT ''"
            )
        except Exception:
            pass
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS password_resets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                used_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        """)


def init_booking_db() -> None:
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                location VARCHAR(200) NOT NULL,
                capacity INTEGER NOT NULL,
                image_url VARCHAR(2000) NOT NULL DEFAULT '',
                amenities_json TEXT NOT NULL DEFAULT '[]',
                status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                organizer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                start_at VARCHAR(50) NOT NULL,
                end_at VARCHAR(50) NOT NULL,
                title VARCHAR(300) NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                phone VARCHAR(20) NOT NULL DEFAULT '',
                contact_name VARCHAR(200) NOT NULL DEFAULT '',
                status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_bookings_room_time ON bookings(room_id, start_at, end_at);
        """)
        try:
            conn.execute(
                "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS price NUMERIC(14,2) NOT NULL DEFAULT 0"
            )
        except Exception:
            pass
        try:
            conn.execute(
                "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'cash'"
            )
        except Exception:
            pass
        try:
            conn.execute(
                "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(20) NOT NULL DEFAULT ''"
            )
        except Exception:
            pass
        try:
            conn.execute(
                "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_confirmed_at TIMESTAMP NULL"
            )
        except Exception:
            pass


def init_ticket_db() -> None:
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS tickets (
                id SERIAL PRIMARY KEY,
                requester_id INTEGER NOT NULL REFERENCES users(id),
                assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                subject VARCHAR(300) NOT NULL,
                description TEXT NOT NULL,
                priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
                status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed','reopened')),
                category VARCHAR(200) NOT NULL DEFAULT '',
                room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_tickets_status_priority ON tickets(status, priority, created_at);

            CREATE TABLE IF NOT EXISTS ticket_comments (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
                author_id INTEGER NOT NULL REFERENCES users(id),
                body TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        """)


def init_contact_db() -> None:
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS contact_requests (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(200) NOT NULL,
                email VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                status VARCHAR(10) NOT NULL DEFAULT 'new' CHECK(status IN ('new','read')),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_contact_requests_status_created
                ON contact_requests(status, created_at);
        """)
