from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ...db import db
from ...schemas import (
    AdminCreateUser,
    AuthMeUpdateResponse,
    FacebookOAuthRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GoogleOAuthRequest,
    LoginRequest,
    OAuthConfigResponse,
    RegisterRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    TokenResponse,
    UserPublic,
    UserSelfUpdate,
)
from ...security import (
    JWT_REMEMBER_EXPIRE_MINUTES,
    create_access_token,
    get_current_user,
    hash_password,
    require_role,
    verify_password,
)
from .oauth_service import login_or_register_oauth, oauth_config, verify_facebook_access_token, verify_google_id_token
from .password_reset import request_password_reset, reset_password_with_token


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserPublic)
def register(body: RegisterRequest):
    with db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (body.email.lower(),)).fetchone()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

        password_hash = hash_password(body.password)
        cur = conn.execute(
            "INSERT INTO users(email, name, password_hash, role) VALUES(?,?,?,?)",
            (body.email.lower(), body.name, password_hash, body.role),
        )
        user_id = int(cur.lastrowid)
        row = conn.execute(
            "SELECT id, email, name, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    with db() as conn:
        row = conn.execute(
            "SELECT id, email, name, password_hash, role FROM users WHERE email = ?",
            (body.email.lower(),),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not verify_password(body.password, row["password_hash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        expire_mins = JWT_REMEMBER_EXPIRE_MINUTES if body.remember_me else None
        token = create_access_token(
            sub=str(row["id"]),
            role=row["role"],
            name=row["name"] or str(row["email"]).split("@")[0],
            email=row["email"] or "",
            expire_minutes=expire_mins,
        )
        return {"access_token": token, "token_type": "bearer"}


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(body: ForgotPasswordRequest):
    result = request_password_reset(body.email)
    return ForgotPasswordResponse(
        message=result["message"],
        reset_url=result.get("reset_url"),
        email_found=bool(result.get("email_found")),
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(body: ResetPasswordRequest):
    reset_password_with_token(body.token, body.password)
    return ResetPasswordResponse(message="Đã đặt lại mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.")


@router.get("/oauth/config", response_model=OAuthConfigResponse)
def get_oauth_config():
    return oauth_config()


@router.post("/oauth/google", response_model=TokenResponse)
def oauth_google(body: GoogleOAuthRequest):
    profile = verify_google_id_token(body.credential)
    return login_or_register_oauth(profile)


@router.post("/oauth/facebook", response_model=TokenResponse)
def oauth_facebook(body: FacebookOAuthRequest):
    profile = verify_facebook_access_token(body.access_token)
    return login_or_register_oauth(profile)


@router.get("/me", response_model=UserPublic)
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=AuthMeUpdateResponse)
def patch_me(body: UserSelfUpdate, current_user: dict = Depends(get_current_user)):
    name: str | None = None
    if body.name is not None:
        stripped = body.name.strip()
        if not stripped:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên không hợp lệ")
        name = stripped
    new_password = body.password.strip() if body.password else None
    if name is None and not new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cần ít nhất tên hoặc mật khẩu mới")

    uid = int(current_user["id"])
    with db() as conn:
        row = conn.execute(
            "SELECT id, email, name, password_hash, role FROM users WHERE id = ?",
            (uid,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        new_name = name if name is not None else row["name"]
        new_hash = row["password_hash"]
        if new_password:
            new_hash = hash_password(new_password)

        conn.execute(
            "UPDATE users SET name = ?, password_hash = ? WHERE id = ?",
            (new_name, new_hash, uid),
        )
        updated = conn.execute(
            "SELECT id, email, name, role FROM users WHERE id = ?",
            (uid,),
        ).fetchone()

    user_dict = dict(updated)
    token = create_access_token(
        sub=str(user_dict["id"]),
        role=user_dict["role"],
        name=user_dict["name"] or str(user_dict["email"]).split("@")[0],
        email=user_dict["email"] or "",
    )
    return {"access_token": token, "token_type": "bearer", "user": user_dict}


@router.get("/users", response_model=list[UserPublic])
def list_users(user=Depends(require_role("admin"))):
    with db() as conn:
        rows = conn.execute(
            "SELECT id, email, name, role FROM users ORDER BY id ASC"
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/users", response_model=UserPublic)
def admin_create_user(body: AdminCreateUser, user=Depends(require_role("admin"))):
    with db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (body.email.lower(),)).fetchone()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email đã tồn tại")
        password_hash = hash_password(body.password)
        cur = conn.execute(
            "INSERT INTO users(email, name, password_hash, role) VALUES(?,?,?,?)",
            (body.email.lower(), body.name, password_hash, body.role),
        )
        row = conn.execute(
            "SELECT id, email, name, role FROM users WHERE id = ?",
            (int(cur.lastrowid),),
        ).fetchone()
        return dict(row)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, current_user: dict = Depends(require_role("admin"))):
    if int(current_user["id"]) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể xóa tài khoản admin đang đăng nhập",
        )

    with db() as conn:
        user = conn.execute("SELECT id, role FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Người dùng không tồn tại")

        if user["role"] == "admin":
            row = conn.execute("SELECT COUNT(*) AS total FROM users WHERE role = ?", ("admin",)).fetchone()
            if row and int(row["total"]) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Không thể xóa admin cuối cùng",
                )

        conn.execute(
            "DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM tickets WHERE requester_id = ?)",
            (user_id,),
        )
        conn.execute("DELETE FROM ticket_comments WHERE author_id = ?", (user_id,))
        conn.execute("UPDATE tickets SET assignee_id = NULL WHERE assignee_id = ?", (user_id,))
        conn.execute("DELETE FROM tickets WHERE requester_id = ?", (user_id,))
        conn.execute("DELETE FROM bookings WHERE organizer_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return None
