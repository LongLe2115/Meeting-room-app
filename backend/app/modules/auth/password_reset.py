from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from ...db import db
from ...security import hash_password


RESET_EXPIRE_MINUTES = int(os.getenv("APP_RESET_TOKEN_EXPIRE_MINUTES", "60"))
PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "http://127.0.0.1:8000").rstrip("/")
SHOW_RESET_LINK = os.getenv("APP_SHOW_RESET_LINK", "true").lower() in ("1", "true", "yes")

MSG_NOT_FOUND = (
    "Không tìm thấy tài khoản với email này. "
    "Hãy kiểm tra lại email hoặc đăng ký tài khoản mới."
)
MSG_SUCCESS = (
    "Yêu cầu đã được xử lý. "
    "Ở chế độ demo, hệ thống không gửi email vào Gmail — hãy bấm liên kết đặt lại mật khẩu hiển thị bên dưới."
)


def _ensure_password_reset_table() -> None:
    try:
        with db() as conn:
            conn.execute("SELECT 1 FROM password_resets LIMIT 1")
    except Exception:
        from ...db import init_auth_db

        init_auth_db()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _parse_expires(expires_at: str) -> datetime:
    raw = str(expires_at or "").strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def request_password_reset(email: str) -> dict[str, str | None | bool]:
    email_l = email.lower().strip()
    _ensure_password_reset_table()
    with db() as conn:
        row = conn.execute(
            """
            SELECT id, email, oauth_provider, password_hash
            FROM users WHERE email = ?
            """,
            (email_l,),
        ).fetchone()
        if not row:
            return {"message": MSG_NOT_FOUND, "reset_url": None, "email_found": False}

        user = dict(row)
        provider = str(user.get("oauth_provider") or "").strip().lower()
        oauth_note = ""
        if provider in ("google", "facebook"):
            oauth_note = (
                " (Tài khoản từng đăng nhập "
                + ("Google" if provider == "google" else "Facebook")
                + " — bạn vẫn có thể đặt mật khẩu mới để đăng nhập bằng email.)"
            )

        plain = secrets.token_urlsafe(32)
        token_hash = _hash_token(plain)
        expires = datetime.now(timezone.utc) + timedelta(minutes=RESET_EXPIRE_MINUTES)
        expires_iso = expires.replace(microsecond=0).isoformat()

        conn.execute(
            "UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
            (_utc_now_iso(), int(user["id"])),
        )
        conn.execute(
            """
            INSERT INTO password_resets(user_id, token_hash, expires_at)
            VALUES(?, ?, ?)
            """,
            (int(user["id"]), token_hash, expires_iso),
        )

    reset_url = None
    if SHOW_RESET_LINK:
        reset_url = f"{PUBLIC_URL}/reset-password.html?token={plain}"

    return {
        "message": MSG_SUCCESS + oauth_note,
        "reset_url": reset_url,
        "email_found": True,
    }


def reset_password_with_token(token: str, new_password: str) -> None:
    token = str(token or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token không hợp lệ")

    token_hash = _hash_token(token)
    now = datetime.now(timezone.utc)

    with db() as conn:
        row = conn.execute(
            """
            SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at
            FROM password_resets pr
            WHERE pr.token_hash = ?
            """,
            (token_hash,),
        ).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
            )

        rec = dict(row)
        if rec.get("used_at"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Liên kết đã được sử dụng. Vui lòng yêu cầu đặt lại mật khẩu mới.",
            )

        expires = _parse_expires(str(rec["expires_at"]))
        if now > expires:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Liên kết đã hết hạn. Vui lòng yêu cầu đặt lại mật khẩu mới.",
            )

        new_hash = hash_password(new_password)
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (new_hash, int(rec["user_id"])),
        )
        conn.execute(
            "UPDATE password_resets SET used_at = ? WHERE id = ?",
            (_utc_now_iso(), int(rec["id"])),
        )
