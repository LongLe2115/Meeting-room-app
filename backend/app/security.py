from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from .db import db


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

JWT_SECRET = os.getenv("APP_JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("APP_JWT_EXPIRE_MINUTES", "240"))
JWT_REMEMBER_EXPIRE_MINUTES = int(os.getenv("APP_JWT_REMEMBER_EXPIRE_MINUTES", str(30 * 24 * 60)))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(
    *,
    sub: str,
    role: str,
    name: str = "",
    email: str = "",
    expire_minutes: int | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    mins = JWT_EXPIRE_MINUTES if expire_minutes is None else max(1, int(expire_minutes))
    payload: dict[str, Any] = {
        "sub": sub,
        "role": role,
        "name": name,
        "sub_email": email,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=mins)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _get_user_by_id(user_id: int) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute(
            "SELECT id, email, name, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user_id = int(sub)
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = _get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_role(*allowed: Literal["customer", "admin"]):
    def _dep(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        if user["role"] not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return _dep
