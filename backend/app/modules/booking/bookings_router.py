from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, status

from ...db import db
from ...schemas import BookingBusy, BookingCancelBody, BookingCreate, BookingDetail, BookingPublic
from ...security import get_current_user, require_role


router = APIRouter(prefix="/bookings", tags=["bookings"])

_BOOKING_COLS = (
    "id, room_id, organizer_id, start_at, end_at, title, notes, status, "
    "payment_method, payment_channel"
)


def _parse_iso(dt: str) -> datetime:
    if dt.endswith("Z"):
        return datetime.fromisoformat(dt.replace("Z", "+00:00"))
    return datetime.fromisoformat(dt)


def _to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _payment_channel_from_row(row) -> str | None:
    raw = ""
    try:
        raw = str(row["payment_channel"] or "").strip().lower()
    except (KeyError, IndexError, TypeError):
        pass
    if raw in ("momo", "bank"):
        return raw
    return None


def _row_to_booking(row) -> dict:
    method = "cash"
    try:
        method = str(row["payment_method"] or "cash").strip().lower()
    except (KeyError, IndexError, TypeError):
        pass
    if method not in ("cash", "transfer"):
        method = "cash"

    channel = _payment_channel_from_row(row)
    if method == "cash":
        channel = None

    return {
        "id": row["id"],
        "room_id": row["room_id"],
        "organizer_id": row["organizer_id"],
        "start_at": _parse_iso(row["start_at"]),
        "end_at": _parse_iso(row["end_at"]),
        "title": row["title"],
        "notes": row["notes"],
        "status": row["status"],
        "payment_method": method,
        "payment_channel": channel,
    }


@router.get("", response_model=list[BookingPublic])
def list_bookings(user=Depends(get_current_user), room_id: int | None = None):
    with db() as conn:
        is_admin = user.get("role") == "admin"
        if room_id is None:
            if is_admin:
                rows = conn.execute(
                    f"""
                    SELECT {_BOOKING_COLS}
                    FROM bookings
                    ORDER BY start_at DESC
                    """
                ).fetchall()
            else:
                rows = conn.execute(
                    f"""
                    SELECT {_BOOKING_COLS}
                    FROM bookings
                    WHERE organizer_id = ?
                    ORDER BY start_at DESC
                    """,
                    (user["id"],),
                ).fetchall()
        else:
            if is_admin:
                rows = conn.execute(
                    f"""
                    SELECT {_BOOKING_COLS}
                    FROM bookings
                    WHERE room_id = ?
                    ORDER BY start_at DESC
                    """,
                    (room_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    f"""
                    SELECT {_BOOKING_COLS}
                    FROM bookings
                    WHERE room_id = ?
                      AND organizer_id = ?
                    ORDER BY start_at DESC
                    """,
                    (room_id, user["id"]),
                ).fetchall()
        return [_row_to_booking(r) for r in rows]


@router.get("/mine", response_model=list[BookingPublic])
def my_bookings(user=Depends(get_current_user)):
    with db() as conn:
        rows = conn.execute(
            f"""
            SELECT {_BOOKING_COLS}
            FROM bookings
            WHERE organizer_id = ?
            ORDER BY start_at DESC
            """,
            (user["id"],),
        ).fetchall()
        return [_row_to_booking(r) for r in rows]


@router.get("/busy", response_model=list[BookingBusy])
def busy_bookings(user=Depends(get_current_user), room_id: int | None = None):
    """Trả về lịch bận để kiểm tra trùng giờ (ẩn title/notes/người đặt)."""
    with db() as conn:
        if room_id is None:
            rows = conn.execute(
                """
                SELECT id, room_id, start_at, end_at, status
                FROM bookings
                WHERE status = 'active'
                ORDER BY start_at DESC
                """
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, room_id, start_at, end_at, status
                FROM bookings
                WHERE status = 'active'
                  AND room_id = ?
                ORDER BY start_at DESC
                """,
                (room_id,),
            ).fetchall()
        return [
            {
                "id": r["id"],
                "room_id": r["room_id"],
                "start_at": _parse_iso(r["start_at"]),
                "end_at": _parse_iso(r["end_at"]),
                "status": r["status"],
            }
            for r in rows
        ]


@router.get("/{booking_id}", response_model=BookingDetail)
def get_booking(booking_id: int, user=Depends(get_current_user)):
    with db() as conn:
        row = conn.execute(
            f"""
            SELECT b.id, b.room_id, b.organizer_id, b.start_at, b.end_at, b.title, b.notes, b.status,
                   b.payment_method, b.payment_channel,
                   COALESCE(r.name, '') AS room_name,
                   COALESCE(u.name, '') AS organizer_name,
                   COALESCE(u.email, '') AS organizer_email
            FROM bookings b
            LEFT JOIN rooms r ON r.id = b.room_id
            LEFT JOIN users u ON u.id = b.organizer_id
            WHERE b.id = ?
            """,
            (booking_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
        if user["role"] != "admin" and row["organizer_id"] != user["id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        data = _row_to_booking(row)
        data.update(
            {
                "room_name": row["room_name"],
                "organizer_name": row["organizer_name"],
                "organizer_email": row["organizer_email"],
            }
        )
        return data


@router.post("", response_model=BookingPublic)
def create_booking(body: BookingCreate, user=Depends(get_current_user)):
    if body.end_at <= body.start_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid time range")

    start_iso = _to_iso(body.start_at)
    end_iso = _to_iso(body.end_at)
    payment_channel_db = body.payment_channel or ""

    with db() as conn:
        room = conn.execute(
            "SELECT id, status, capacity FROM rooms WHERE id = ?",
            (body.room_id,),
        ).fetchone()
        if not room:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
        if room["status"] != "active":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Room is inactive")
        cap = int(room["capacity"] or 0)
        if body.participant_count is not None and cap > 0 and body.participant_count > cap:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Số người ({body.participant_count}) vượt sức chứa tối đa của phòng ({cap} người). "
                    "Hãy giảm số người tham gia hoặc chọn phòng lớn hơn."
                ),
            )

        overlap = conn.execute(
            """
            SELECT id
            FROM bookings
            WHERE room_id = ?
              AND status = 'active'
              AND NOT (end_at <= ? OR start_at >= ?)
            LIMIT 1
            """,
            (body.room_id, start_iso, end_iso),
        ).fetchone()
        if overlap:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Time slot is not available")

        cur = conn.execute(
            """
            INSERT INTO bookings(
                room_id, organizer_id, start_at, end_at, title, notes, status,
                payment_method, payment_channel
            )
            VALUES(?,?,?,?,?,?, 'active', ?, ?)
            """,
            (
                body.room_id,
                user["id"],
                start_iso,
                end_iso,
                body.title,
                body.notes,
                body.payment_method,
                payment_channel_db,
            ),
        )
        booking_id = int(cur.lastrowid)
        row = conn.execute(
            f"""
            SELECT {_BOOKING_COLS}
            FROM bookings
            WHERE id = ?
            """,
            (booking_id,),
        ).fetchone()
        return _row_to_booking(row)


@router.post("/{booking_id}/cancel", response_model=BookingPublic)
def cancel_booking(
    booking_id: int,
    body: BookingCancelBody = Body(default_factory=BookingCancelBody),
    user=Depends(get_current_user),
):
    with db() as conn:
        row = conn.execute(
            f"""
            SELECT {_BOOKING_COLS}
            FROM bookings
            WHERE id = ?
            """,
            (booking_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
        if row["status"] != "active":
            return _row_to_booking(row)

        is_owner = row["organizer_id"] == user["id"]
        is_admin = user.get("role") == "admin"
        if not is_owner and not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        booking = _row_to_booking(row)
        if not is_admin:
            if booking["payment_method"] == "transfer" and not body.refund_confirmed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cần xác nhận đã nhận hoàn tiền trước khi hủy đặt phòng",
                )
            if booking["payment_method"] == "cash" and not body.refund_confirmed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cần xác nhận trước khi hủy đặt phòng",
                )

        refund_at = _to_iso(datetime.now(timezone.utc)) if body.refund_confirmed else None
        try:
            conn.execute(
                "UPDATE bookings SET status = 'cancelled', refund_confirmed_at = ? WHERE id = ?",
                (refund_at, booking_id),
            )
        except Exception:
            conn.execute("UPDATE bookings SET status = 'cancelled' WHERE id = ?", (booking_id,))
        updated = conn.execute(
            f"""
            SELECT {_BOOKING_COLS}
            FROM bookings
            WHERE id = ?
            """,
            (booking_id,),
        ).fetchone()
        return _row_to_booking(updated)


@router.delete("/{booking_id}", status_code=204, dependencies=[Depends(require_role("admin"))])
def delete_booking_admin(booking_id: int):
    with db() as conn:
        cur = conn.execute("DELETE FROM bookings WHERE id = ?", (booking_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return None
