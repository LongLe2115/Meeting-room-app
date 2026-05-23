"""Yêu cầu liên hệ từ trang chủ — gửi công khai, admin xem/quản lý."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..db import db
from ..schemas import ContactRequestCreate, ContactRequestPublic, ContactRequestStatusUpdate
from ..security import require_role


router = APIRouter(tags=["contact"])
public_router = APIRouter(prefix="/public", tags=["public"])
admin_router = APIRouter(prefix="/contact-requests", tags=["contact"])


def _row_to_contact(row) -> dict:
    return {
        "id": row["id"],
        "full_name": row["full_name"],
        "email": row["email"],
        "message": row["message"],
        "status": row["status"],
        "created_at": row["created_at"],
    }


@public_router.post("/contact", response_model=ContactRequestPublic, status_code=status.HTTP_201_CREATED)
def submit_contact(body: ContactRequestCreate):
    full_name = body.full_name.strip()
    email = body.email.lower().strip()
    message = body.message.strip()
    if not full_name or not email or not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vui lòng nhập đủ thông tin")

    with db() as conn:
        cur = conn.execute(
            """
            INSERT INTO contact_requests(full_name, email, message, status)
            VALUES(?, ?, ?, 'new')
            """,
            (full_name, email, message),
        )
        row_id = int(cur.lastrowid)
        row = conn.execute(
            """
            SELECT id, full_name, email, message, status, created_at
            FROM contact_requests WHERE id = ?
            """,
            (row_id,),
        ).fetchone()
    return _row_to_contact(row)


@admin_router.get("", response_model=list[ContactRequestPublic])
def list_contact_requests(
  user=Depends(require_role("admin")),
  status_filter: str | None = None,
):
    _ = user
    sql = """
        SELECT id, full_name, email, message, status, created_at
        FROM contact_requests
    """
    params: tuple = ()
    if status_filter in ("new", "read"):
        sql += " WHERE status = ?"
        params = (status_filter,)
    sql += " ORDER BY created_at DESC, id DESC"
    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_contact(r) for r in rows]


@admin_router.patch("/{request_id}", response_model=ContactRequestPublic)
def update_contact_request(
    request_id: int,
    body: ContactRequestStatusUpdate,
    user=Depends(require_role("admin")),
):
    _ = user
    if body.status not in ("new", "read"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Trạng thái không hợp lệ")

    with db() as conn:
        exists = conn.execute(
            "SELECT id FROM contact_requests WHERE id = ?",
            (request_id,),
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu")

        conn.execute(
            "UPDATE contact_requests SET status = ? WHERE id = ?",
            (body.status, request_id),
        )
        row = conn.execute(
            """
            SELECT id, full_name, email, message, status, created_at
            FROM contact_requests WHERE id = ?
            """,
            (request_id,),
        ).fetchone()
    return _row_to_contact(row)


@admin_router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact_request(request_id: int, user=Depends(require_role("admin"))):
    _ = user
    with db() as conn:
        cur = conn.execute("DELETE FROM contact_requests WHERE id = ?", (request_id,))
        if getattr(cur, "rowcount", 0) == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu")
    return None
