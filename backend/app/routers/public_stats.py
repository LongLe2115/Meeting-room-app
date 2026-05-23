"""
Thống kê công khai cho trang chủ (không cần đăng nhập).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

from ..db import db

router = APIRouter(prefix="/public", tags=["public"])


def _str_clean(v: object) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_bounds_local_iso() -> tuple[str, str]:
    """
    Đầu / cuối ngày theo múi giờ local của server.
    Frontend dashboard đang hiển thị theo local time.
    """
    now = datetime.now().astimezone()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1) - timedelta(microseconds=1)
    return start.isoformat(), end.isoformat()


def _compute_stats(*, total_rooms: int, bookings: list[dict]) -> dict:
    now = datetime.now(timezone.utc)

    start_day_iso, end_day_iso = _today_bounds_local_iso()
    start_day = datetime.fromisoformat(start_day_iso).astimezone(timezone.utc)
    end_day = datetime.fromisoformat(end_day_iso).astimezone(timezone.utc)

    active_now = []
    today = 0

    for b in bookings:
        if b.get("status") != "active":
            continue
        try:
            start_at = datetime.fromisoformat(str(b["start_at"]).replace("Z", "+00:00"))
            end_at = datetime.fromisoformat(str(b["end_at"]).replace("Z", "+00:00"))
        except Exception:
            continue

        if start_at <= now <= end_at:
            active_now.append(b)
        if start_at < end_day and end_at > start_day:
            today += 1

    rooms_in_use = len({b["room_id"] for b in active_now if b.get("room_id") is not None})
    utilization = round((rooms_in_use / total_rooms) * 100) if total_rooms > 0 else 0

    return {
        "total_rooms": total_rooms,
        "rooms_in_use": rooms_in_use,
        "today_meetings": today,
        "utilization_percent": utilization,
    }


@router.get("/dashboard-stats")
def dashboard_stats():
    """
    Trả về thống kê public cho section stats ở landing page.
    """
    with db() as conn:
        rooms = conn.execute(
            """
            SELECT id, name, location, capacity, image_url, amenities_json, status, price
            FROM rooms
            WHERE status = 'active'
            ORDER BY id ASC
            """
        ).fetchall()
        bookings = conn.execute(
            """
            SELECT b.id, b.room_id, b.start_at, b.end_at, b.title, b.status,
                   u.name AS organizer_name
            FROM bookings b
            LEFT JOIN users u ON u.id = b.organizer_id
            WHERE b.status = 'active'
            ORDER BY b.start_at DESC
            """
        ).fetchall()

    room_items = []
    for r in rooms:
        try:
            amenities = json.loads(r["amenities_json"] or "[]")
        except Exception:
            amenities = []
        if not isinstance(amenities, list):
            amenities = []
        try:
            price_v = float(r["price"]) if r["price"] is not None else 0.0
        except (KeyError, TypeError, ValueError):
            price_v = 0.0
        room_items.append(
            {
                "id": int(r["id"]),
                "name": r["name"],
                "location": r["location"],
                "capacity": int(r["capacity"]),
                "image_url": (r["image_url"] or "").strip(),
                "amenities": amenities,
                "status": r["status"],
                "price": price_v,
            }
        )
    booking_items = [
        {
            "id": int(b["id"]),
            "room_id": int(b["room_id"]),
            "start_at": b["start_at"],
            "end_at": b["end_at"],
            "title": b["title"],
            "status": b["status"],
            "organizer_name": _str_clean(b["organizer_name"]),
        }
        for b in bookings
    ]
    stats = _compute_stats(total_rooms=len(room_items), bookings=booking_items)

    return {**stats, "rooms": room_items, "bookings": booking_items}
