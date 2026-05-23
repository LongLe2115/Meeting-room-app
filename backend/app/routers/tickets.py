from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from ..db import db
from ..schemas import (
    TicketCommentCreate,
    TicketCommentPublic,
    TicketCreate,
    TicketPublic,
    TicketUpdate,
)
from ..security import get_current_user, require_role


router = APIRouter(prefix="/tickets", tags=["tickets"])


def _parse_sqlite_dt(s: str) -> datetime:
    try:
        raw = str(s or "").strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        return datetime.fromisoformat(raw.replace(" ", "T"))
    except ValueError:
        return datetime.fromisoformat(str(s))


def _row_to_ticket(row) -> dict:
    d = {
        "id": row["id"],
        "requester_id": row["requester_id"],
        "assignee_id": row["assignee_id"],
        "subject": row["subject"],
        "description": row["description"],
        "priority": row["priority"],
        "status": row["status"],
        "category": row["category"],
        "room_id": row["room_id"],
        "created_at": _parse_sqlite_dt(row["created_at"]),
        "requester_name": None,
        "requester_email": None,
        "room_name": None,
        "comment_count": None,
    }
    keys = row.keys() if hasattr(row, "keys") else []
    if "requester_name" in keys and row["requester_name"]:
        d["requester_name"] = row["requester_name"]
    if "requester_email" in keys and row["requester_email"]:
        d["requester_email"] = row["requester_email"]
    if "room_name" in keys and row["room_name"]:
        d["room_name"] = row["room_name"]
    if "comment_count" in keys and row["comment_count"] is not None:
        d["comment_count"] = int(row["comment_count"])
    return d


def _row_to_comment(row) -> dict:
    keys = row.keys() if hasattr(row, "keys") else []
    return {
        "id": row["id"],
        "ticket_id": row["ticket_id"],
        "author_id": row["author_id"],
        "body": row["body"],
        "created_at": _parse_sqlite_dt(row["created_at"]),
        "author_name": row["author_name"] if "author_name" in keys else "",
        "author_role": row["author_role"] if "author_role" in keys else "",
    }


def _get_ticket_row(conn, ticket_id: int):
    return conn.execute(
        """
        SELECT id, requester_id, assignee_id, subject, description, priority, status, category, room_id, created_at
        FROM tickets WHERE id = ?
        """,
        (ticket_id,),
    ).fetchone()


def _check_ticket_access(ticket_row, user: dict) -> None:
    if user["role"] == "admin":
        return
    if int(ticket_row["requester_id"]) != int(user["id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("", response_model=list[TicketPublic])
def list_tickets(
    user=Depends(get_current_user),
    status_: str | None = None,
    priority: str | None = None,
    mine: bool = False,
):
    where = []
    params: list[object] = []

    if user["role"] != "admin" or mine:
        where.append("t.requester_id = ?")
        params.append(user["id"])

    if status_:
        where.append("t.status = ?")
        params.append(status_)
    if priority:
        where.append("t.priority = ?")
        params.append(priority)

    sql = """
      SELECT t.id, t.requester_id, t.assignee_id, t.subject, t.description, t.priority, t.status,
             t.category, t.room_id, t.created_at,
             u.name AS requester_name, u.email AS requester_email,
             r.name AS room_name,
             (SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = t.id) AS comment_count
      FROM tickets t
      JOIN users u ON u.id = t.requester_id
      LEFT JOIN rooms r ON r.id = t.room_id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY t.created_at DESC"

    with db() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
        return [_row_to_ticket(r) for r in rows]


@router.post("", response_model=TicketPublic)
def create_ticket(body: TicketCreate, user=Depends(get_current_user)):
    with db() as conn:
        if body.room_id is not None:
            room = conn.execute("SELECT id FROM rooms WHERE id = ?", (body.room_id,)).fetchone()
            if not room:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

        cur = conn.execute(
            """
            INSERT INTO tickets(requester_id, assignee_id, subject, description, priority, status, category, room_id)
            VALUES(?, NULL, ?, ?, ?, 'open', ?, ?)
            """,
            (user["id"], body.subject, body.description, body.priority, body.category, body.room_id),
        )
        ticket_id = int(cur.lastrowid)
        row = conn.execute(
            """
            SELECT t.id, t.requester_id, t.assignee_id, t.subject, t.description, t.priority, t.status,
                   t.category, t.room_id, t.created_at,
                   u.name AS requester_name, u.email AS requester_email,
                   r.name AS room_name, 0 AS comment_count
            FROM tickets t
            JOIN users u ON u.id = t.requester_id
            LEFT JOIN rooms r ON r.id = t.room_id
            WHERE t.id = ?
            """,
            (ticket_id,),
        ).fetchone()
        return _row_to_ticket(row)


@router.get("/{ticket_id}", response_model=TicketPublic)
def get_ticket(ticket_id: int, user=Depends(get_current_user)):
    with db() as conn:
        row = conn.execute(
            """
            SELECT t.id, t.requester_id, t.assignee_id, t.subject, t.description, t.priority, t.status,
                   t.category, t.room_id, t.created_at,
                   u.name AS requester_name, u.email AS requester_email,
                   r.name AS room_name,
                   (SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = t.id) AS comment_count
            FROM tickets t
            JOIN users u ON u.id = t.requester_id
            LEFT JOIN rooms r ON r.id = t.room_id
            WHERE t.id = ?
            """,
            (ticket_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        _check_ticket_access(row, user)
        return _row_to_ticket(row)


@router.get("/{ticket_id}/comments", response_model=list[TicketCommentPublic])
def list_comments(ticket_id: int, user=Depends(get_current_user)):
    with db() as conn:
        ticket = _get_ticket_row(conn, ticket_id)
        if not ticket:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        _check_ticket_access(ticket, user)

        rows = conn.execute(
            """
            SELECT c.id, c.ticket_id, c.author_id, c.body, c.created_at,
                   u.name AS author_name, u.role AS author_role
            FROM ticket_comments c
            JOIN users u ON u.id = c.author_id
            WHERE c.ticket_id = ?
            ORDER BY c.created_at ASC
            """,
            (ticket_id,),
        ).fetchall()
        return [_row_to_comment(r) for r in rows]


@router.post("/{ticket_id}/comments", response_model=TicketCommentPublic)
def add_comment(ticket_id: int, body: TicketCommentCreate, user=Depends(get_current_user)):
    with db() as conn:
        ticket = _get_ticket_row(conn, ticket_id)
        if not ticket:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        _check_ticket_access(ticket, user)

        if ticket["status"] == "closed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Yêu cầu đã đóng — không thể gửi thêm tin nhắn",
            )

        cur = conn.execute(
            "INSERT INTO ticket_comments(ticket_id, author_id, body) VALUES(?,?,?)",
            (ticket_id, user["id"], body.body.strip()),
        )
        comment_id = int(cur.lastrowid)

        if user["role"] == "admin" and ticket["status"] == "open":
            conn.execute(
                "UPDATE tickets SET status = 'in_progress', assignee_id = ? WHERE id = ?",
                (user["id"], ticket_id),
            )
        elif user["role"] != "admin" and ticket["status"] in ("resolved",):
            conn.execute("UPDATE tickets SET status = 'reopened' WHERE id = ?", (ticket_id,))

        row = conn.execute(
            """
            SELECT c.id, c.ticket_id, c.author_id, c.body, c.created_at,
                   u.name AS author_name, u.role AS author_role
            FROM ticket_comments c
            JOIN users u ON u.id = c.author_id
            WHERE c.id = ?
            """,
            (comment_id,),
        ).fetchone()
        return _row_to_comment(row)


@router.patch("/{ticket_id}", response_model=TicketPublic)
def update_ticket(ticket_id: int, body: TicketUpdate, user=Depends(get_current_user)):
    with db() as conn:
        existing = _get_ticket_row(conn, ticket_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

        is_requester = int(existing["requester_id"]) == int(user["id"])
        is_admin = user["role"] == "admin"
        if not is_requester and not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        subject = body.subject if body.subject is not None else existing["subject"]
        description = body.description if body.description is not None else existing["description"]
        priority = body.priority if body.priority is not None else existing["priority"]
        category = body.category if body.category is not None else existing["category"]
        room_id = body.room_id if body.room_id is not None else existing["room_id"]
        status_value = existing["status"]
        assignee_id = existing["assignee_id"]

        if room_id is not None:
            room = conn.execute("SELECT id FROM rooms WHERE id = ?", (room_id,)).fetchone()
            if not room:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

        if is_admin:
            if body.status is not None:
                status_value = body.status
            if body.assignee_id is not None:
                assignee_id = body.assignee_id
        else:
            if body.assignee_id is not None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
            if body.status is not None:
                if body.status == "closed" and existing["status"] == "resolved" and is_requester:
                    status_value = "closed"
                else:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        conn.execute(
            """
            UPDATE tickets
            SET subject = ?, description = ?, priority = ?, status = ?, category = ?, assignee_id = ?, room_id = ?
            WHERE id = ?
            """,
            (subject, description, priority, status_value, category, assignee_id, room_id, ticket_id),
        )
        row = conn.execute(
            """
            SELECT t.id, t.requester_id, t.assignee_id, t.subject, t.description, t.priority, t.status,
                   t.category, t.room_id, t.created_at,
                   u.name AS requester_name, u.email AS requester_email,
                   r.name AS room_name,
                   (SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = t.id) AS comment_count
            FROM tickets t
            JOIN users u ON u.id = t.requester_id
            LEFT JOIN rooms r ON r.id = t.room_id
            WHERE t.id = ?
            """,
            (ticket_id,),
        ).fetchone()
        return _row_to_ticket(row)


def _ticket_deletable(status: str) -> bool:
    return status in ("resolved", "closed")


@router.delete("/{ticket_id}")
def delete_ticket(ticket_id: int, user=Depends(get_current_user)):
    with db() as conn:
        ticket = _get_ticket_row(conn, ticket_id)
        if not ticket:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        _check_ticket_access(ticket, user)

        if not _ticket_deletable(ticket["status"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chỉ xóa được yêu cầu đã xử lý hoặc đã đóng",
            )

        conn.execute("DELETE FROM tickets WHERE id = ?", (ticket_id,))
        return {"ok": True}


@router.delete("/{ticket_id}/comments/{comment_id}")
def delete_comment(ticket_id: int, comment_id: int, user=Depends(get_current_user)):
    with db() as conn:
        ticket = _get_ticket_row(conn, ticket_id)
        if not ticket:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        _check_ticket_access(ticket, user)

        row = conn.execute(
            "SELECT id, author_id FROM ticket_comments WHERE id = ? AND ticket_id = ?",
            (comment_id, ticket_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

        is_admin = user["role"] == "admin"
        is_author = int(row["author_id"]) == int(user["id"])
        ticket_done = _ticket_deletable(ticket["status"])

        if not is_admin and not (is_author and ticket_done):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ xóa tin nhắn khi yêu cầu đã xử lý xong (hoặc do quản trị)",
            )

        conn.execute("DELETE FROM ticket_comments WHERE id = ?", (comment_id,))
        return {"ok": True}


@router.post("/{ticket_id}/assign/{assignee_id}", response_model=TicketPublic, dependencies=[Depends(require_role("admin"))])
def assign_ticket(ticket_id: int, assignee_id: int):
    with db() as conn:
        ticket = conn.execute("SELECT id FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        if not ticket:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        conn.execute(
            "UPDATE tickets SET assignee_id = ?, status = 'in_progress' WHERE id = ?",
            (assignee_id, ticket_id),
        )
        row = conn.execute(
            """
            SELECT t.id, t.requester_id, t.assignee_id, t.subject, t.description, t.priority, t.status,
                   t.category, t.room_id, t.created_at,
                   u.name AS requester_name, u.email AS requester_email,
                   r.name AS room_name, 0 AS comment_count
            FROM tickets t
            JOIN users u ON u.id = t.requester_id
            LEFT JOIN rooms r ON r.id = t.room_id
            WHERE t.id = ?
            """,
            (ticket_id,),
        ).fetchone()
        return _row_to_ticket(row)
