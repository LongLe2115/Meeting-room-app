from __future__ import annotations

import csv
import io
import json
import re
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from ...db import db
from ...schemas import RoomCreate, RoomCsvImportResult, RoomPublic, RoomUpdate
from ...security import require_role


router = APIRouter(prefix="/rooms", tags=["rooms"])


def _float_price(v: Any) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _row_to_room(row) -> dict:
    try:
        pr = _float_price(row["price"])
    except (KeyError, IndexError, TypeError):
        pr = 0.0
    return {
        "id": row["id"],
        "name": row["name"],
        "location": row["location"],
        "capacity": row["capacity"],
        "image_url": row["image_url"],
        "amenities": json.loads(row["amenities_json"] or "[]"),
        "status": row["status"],
        "price": pr,
    }


# --- CSV import: map tiêu đề cột (không phân biệt hoa thường, bỏ dấu cách thừa) ---
def _norm_header_cell(s: str) -> str:
    t = (s or "").strip().lower()
    t = re.sub(r"\s+", " ", t)
    return t


# Giá trị chuẩn -> tên trường RoomCreate
_HEADER_TO_FIELD: dict[str, str] = {}
for _field, _labels in (
    ("name", ("name", "tên phòng", "ten phong", "ten_phong")),
    ("location", ("location", "vị trí", "vi tri", "vi_tri")),
    ("capacity", ("capacity", "sức chứa", "suc chua", "suc_chua")),
    ("image_url", ("image_url", "ảnh url", "anh url", "image", "url ảnh")),
    ("amenities", ("amenities", "tiện nghi", "tien nghi", "tien_nghi")),
    ("status", ("status", "trạng thái", "trang thai")),
    ("price", ("price", "giá", "gia", "giá vnd", "gia vnd")),
):
    for lb in _labels:
        _HEADER_TO_FIELD[_norm_header_cell(lb)] = _field


def _resolve_csv_field(header: str) -> str | None:
    h = _norm_header_cell(header)
    if not h:
        return None
    direct = _HEADER_TO_FIELD.get(h)
    if direct:
        return direct
    # Ví dụ: "Giá (VND / giờ)" -> "giá"
    base = re.sub(r"\s*\(.*$", "", h).strip()
    if base and base != h:
        direct = _HEADER_TO_FIELD.get(base)
        if direct:
            return direct
    for label, field in _HEADER_TO_FIELD.items():
        if h == label or h.startswith(label + " ") or h.startswith(label + "("):
            return field
    return None


def _parse_csv_status(raw: str) -> str:
    t = _norm_header_cell(raw or "")
    if t in ("active", "hoạt động", "hoat dong", "1", "yes", "true", "đang mở", "dang mo"):
        return "active"
    if t in ("inactive", "tạm đóng", "tam dong", "0", "no", "false", "đóng", "dong"):
        return "inactive"
    return "active"


def _parse_csv_price(raw: str) -> float:
    if raw is None or str(raw).strip() == "":
        return 0.0
    t = str(raw).strip().replace(" ", "").replace(",", ".")
    try:
        return max(0.0, float(t))
    except ValueError:
        return 0.0


def _parse_csv_amenities(raw: str) -> list[str]:
    if not raw or not str(raw).strip():
        return []
    return [x.strip() for x in str(raw).split(",") if x.strip()]


@router.get("", response_model=list[RoomPublic])
def list_rooms(available_now: int | None = None):
    with db() as conn:
        rows = conn.execute(
            """
            SELECT id, name, location, capacity, image_url, amenities_json, status, price
            FROM rooms ORDER BY id DESC
            """
        ).fetchall()
        return [_row_to_room(r) for r in rows]


@router.post(
    "/import-csv",
    response_model=RoomCsvImportResult,
    dependencies=[Depends(require_role("admin"))],
)
async def import_rooms_csv(file: UploadFile = File(...)):
    """
    Import hàng loạt phòng từ CSV (UTF-8).
    Dòng đầu là tiêu đề; các cột nhận diện được (tiếng Việt hoặc tiếng Anh):
    Tên phòng/name, Vị trí/location, Sức chứa/capacity, Ảnh URL/image_url,
    Tiện nghi/amenities (cách nhau bởi dấu phẩy), Trạng thái/status, Giá/price.
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File rỗng")

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File phải là UTF-8",
        ) from e

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Thiếu dòng tiêu đề CSV")

    col_map: dict[str, str] = {}
    for h in reader.fieldnames:
        if not h:
            continue
        field = _resolve_csv_field(h)
        if field:
            col_map[field] = h.strip()

    required = ("name", "location", "capacity")
    missing = [f for f in required if f not in col_map]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV thiếu cột bắt buộc: " + ", ".join(missing),
        )

    created = 0
    failed = 0
    errors: list[str] = []
    line_no = 1  # header

    for row in reader:
        line_no += 1
        try:
            def cell(field: str) -> str:
                key = col_map.get(field)
                if not key:
                    return ""
                return (row.get(key) or "").strip()

            name = cell("name")
            location = cell("location")
            cap_raw = cell("capacity")
            if not name or not location or not cap_raw:
                failed += 1
                errors.append(f"Dòng {line_no}: thiếu tên, vị trí hoặc sức chứa")
                continue
            try:
                capacity = int(float(cap_raw.replace(",", ".")))
            except ValueError:
                failed += 1
                errors.append(f"Dòng {line_no}: sức chứa không hợp lệ")
                continue
            if capacity < 1:
                failed += 1
                errors.append(f"Dòng {line_no}: sức chứa phải >= 1")
                continue

            image_url = cell("image_url") if "image_url" in col_map else ""
            amenities = _parse_csv_amenities(cell("amenities")) if "amenities" in col_map else []
            status_val = _parse_csv_status(cell("status")) if "status" in col_map else "active"
            price_val = _parse_csv_price(cell("price")) if "price" in col_map else 0.0

            body = RoomCreate(
                name=name,
                location=location,
                capacity=capacity,
                image_url=image_url,
                amenities=amenities,
                status=status_val,  # type: ignore[arg-type]
                price=price_val,
            )

            with db() as conn:
                conn.execute(
                    """
                    INSERT INTO rooms(name, location, capacity, image_url, amenities_json, status, price)
                    VALUES(?,?,?,?,?,?,?)
                    """,
                    (
                        body.name,
                        body.location,
                        body.capacity,
                        body.image_url,
                        json.dumps(body.amenities),
                        body.status,
                        body.price,
                    ),
                )
            created += 1
        except Exception as e:  # pragma: no cover - defensive
            failed += 1
            errors.append(f"Dòng {line_no}: {e!s}")

    return RoomCsvImportResult(created=created, failed=failed, errors=errors[:50])


@router.get("/{room_id}", response_model=RoomPublic)
def get_room(room_id: int):
    with db() as conn:
        row = conn.execute(
            """
            SELECT id, name, location, capacity, image_url, amenities_json, status, price
            FROM rooms WHERE id = ?
            """,
            (room_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
        return _row_to_room(row)


@router.post("", response_model=RoomPublic, dependencies=[Depends(require_role("admin"))])
def create_room(body: RoomCreate):
    with db() as conn:
        cur = conn.execute(
            """
            INSERT INTO rooms(name, location, capacity, image_url, amenities_json, status, price)
            VALUES(?,?,?,?,?,?,?)
            """,
            (
                body.name,
                body.location,
                body.capacity,
                body.image_url,
                json.dumps(body.amenities),
                body.status,
                body.price,
            ),
        )
        room_id = int(cur.lastrowid)
        row = conn.execute(
            """
            SELECT id, name, location, capacity, image_url, amenities_json, status, price
            FROM rooms WHERE id = ?
            """,
            (room_id,),
        ).fetchone()
        return _row_to_room(row)


@router.patch("/{room_id}", response_model=RoomPublic, dependencies=[Depends(require_role("admin"))])
def update_room(room_id: int, body: RoomUpdate):
    with db() as conn:
        existing = conn.execute(
            """
            SELECT id, name, location, capacity, image_url, amenities_json, status, price
            FROM rooms WHERE id = ?
            """,
            (room_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

        name = body.name if body.name is not None else existing["name"]
        location = body.location if body.location is not None else existing["location"]
        capacity = body.capacity if body.capacity is not None else existing["capacity"]
        image_url = body.image_url if body.image_url is not None else existing["image_url"]
        amenities_json = (
            json.dumps(body.amenities) if body.amenities is not None else existing["amenities_json"]
        )
        status_value = body.status if body.status is not None else existing["status"]
        if body.price is not None:
            price_val = float(body.price)
        else:
            try:
                price_val = _float_price(existing["price"])
            except (KeyError, IndexError, TypeError):
                price_val = 0.0

        conn.execute(
            """
            UPDATE rooms
            SET name = ?, location = ?, capacity = ?, image_url = ?, amenities_json = ?, status = ?, price = ?
            WHERE id = ?
            """,
            (name, location, capacity, image_url, amenities_json, status_value, price_val, room_id),
        )
        row = conn.execute(
            """
            SELECT id, name, location, capacity, image_url, amenities_json, status, price
            FROM rooms WHERE id = ?
            """,
            (room_id,),
        ).fetchone()
        return _row_to_room(row)


@router.delete("/{room_id}", status_code=204, dependencies=[Depends(require_role("admin"))])
def delete_room(room_id: int):
    with db() as conn:
        cur = conn.execute("DELETE FROM rooms WHERE id = ?", (room_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return None
