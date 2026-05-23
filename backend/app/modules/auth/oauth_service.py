"""Xác thực OAuth Google / Facebook và tạo hoặc đăng nhập user."""
from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request

from fastapi import HTTPException, status

from ...db import db
from ...security import create_access_token, hash_password


def oauth_config() -> dict[str, str | bool]:
    google_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    facebook_id = (os.getenv("FACEBOOK_APP_ID") or "").strip()
    return {
        "google_client_id": google_id,
        "facebook_app_id": facebook_id,
        "google_enabled": bool(google_id),
        "facebook_enabled": bool(facebook_id),
    }


def _http_get_json(url: str, timeout: float = 10.0) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"OAuth verification failed: {body[:200]}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Không thể xác thực với nhà cung cấp OAuth",
        ) from e


def verify_google_id_token(id_token: str) -> dict[str, str]:
    client_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth chưa được cấu hình (GOOGLE_CLIENT_ID)",
        )
    data = _http_get_json(
        "https://oauth2.googleapis.com/tokeninfo?"
        + urllib.parse.urlencode({"id_token": id_token})
    )
    if data.get("aud") != client_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google token không hợp lệ")
    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tài khoản Google không có email")
    name = (data.get("name") or email.split("@")[0]).strip()
    sub = str(data.get("sub") or "")
    return {
        "email": email,
        "name": name,
        "provider": "google",
        "provider_id": sub,
    }


def verify_facebook_access_token(access_token: str) -> dict[str, str]:
    app_id = (os.getenv("FACEBOOK_APP_ID") or "").strip()
    app_secret = (os.getenv("FACEBOOK_APP_SECRET") or "").strip()
    if not app_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Facebook OAuth chưa được cấu hình (FACEBOOK_APP_ID)",
        )

    if app_secret:
        debug = _http_get_json(
            "https://graph.facebook.com/debug_token?"
            + urllib.parse.urlencode(
                {
                    "input_token": access_token,
                    "access_token": f"{app_id}|{app_secret}",
                }
            )
        )
        info = debug.get("data") or {}
        if not info.get("is_valid"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Facebook token không hợp lệ")
        if str(info.get("app_id") or "") != app_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Facebook app_id không khớp")

    profile = _http_get_json(
        "https://graph.facebook.com/me?"
        + urllib.parse.urlencode(
            {
                "fields": "id,name,email",
                "access_token": access_token,
            }
        )
    )
    email = (profile.get("email") or "").strip().lower()

    facebook_id = str(profile.get("id") or "")
    
    if not email:
        email = f"{facebook_id}@facebook.com"
    
    name = (profile.get("name") or email.split("@")[0]).strip()
    
    return {
        "email": email,
        "name": name,
        "provider": "facebook",
        "provider_id": facebook_id,
    }


def issue_token_for_user(user_row: dict) -> dict[str, str]:
    token = create_access_token(
        sub=str(user_row["id"]),
        role=user_row["role"],
        name=user_row["name"] or str(user_row["email"]).split("@")[0],
        email=user_row["email"] or "",
    )
    return {"access_token": token, "token_type": "bearer"}


def login_or_register_oauth(profile: dict[str, str]) -> dict[str, str]:
    email = profile["email"].lower()
    name = profile["name"]
    provider = profile["provider"]
    provider_id = profile.get("provider_id") or ""

    with db() as conn:
        row = conn.execute(
            "SELECT id, email, name, role FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if row:
            user = dict(row)
            if user["role"] == "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Email này thuộc tài khoản quản trị. Hãy đăng nhập tại trang quản trị.",
                )
            try:
                conn.execute(
                    "UPDATE users SET oauth_provider = ?, oauth_provider_id = ? WHERE id = ?",
                    (provider, provider_id, user["id"]),
                )
            except Exception:
                pass
            return issue_token_for_user(user)

        password_hash = hash_password(secrets.token_urlsafe(32))
        try:
            cur = conn.execute(
                "INSERT INTO users(email, name, password_hash, role, oauth_provider, oauth_provider_id) "
                "VALUES(?,?,?,?,?,?)",
                (email, name, password_hash, "customer", provider, provider_id),
            )
        except Exception:
            cur = conn.execute(
                "INSERT INTO users(email, name, password_hash, role) VALUES(?,?,?,?)",
                (email, name, password_hash, "customer"),
            )
        user_id = int(cur.lastrowid)
        new_row = conn.execute(
            "SELECT id, email, name, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return issue_token_for_user(dict(new_row))
