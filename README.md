# Meeting Room Booking System + Customer Support Ticket

Repo này bắt đầu triển khai theo tài liệu `IDEAS.md` (MVP trước).

## Chạy backend (FastAPI + SQLite)

### 1) Cài dependencies

```bash
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2) Chạy server

```bash
uvicorn backend.app.main:app --reload
```

Mở Swagger UI tại `http://127.0.0.1:8000/docs`.

## MVP hiện có (Sprint 1)

- Auth: register/login + JWT (tách module riêng)
- Rooms: CRUD (thuộc lõi đặt phòng)
- Bookings: tạo/xem/huỷ + kiểm tra trùng lịch theo phòng (thuộc lõi đặt phòng)
- Tickets: tạo/list/detail/comments + assign/update cơ bản

## Cấu trúc backend (tách module)

- `backend/app/modules/auth/`: hệ thống đăng nhập/đăng ký + JWT
- `backend/app/modules/booking/`: lõi đặt phòng (rooms, bookings)
- `backend/app/routers/*`: wrapper để giữ tương thích import (có thể bỏ sau)

## Chạy frontend (MVP)

Frontend là vanilla HTML/JS, tách thành:

- `frontend/login.html`: trang đăng nhập/đăng ký (form họ tên + OAuth Google/Facebook)
- `frontend/booking.html`: trang lõi đặt phòng (hiển thị ảnh phòng)

Bạn có thể:

- chạy backend trước
- mở file `frontend/login.html` (hoặc `frontend/index.html` sẽ tự redirect) bằng trình duyệt (hoặc dùng Live Server trong VSCode/Cursor)
- đặt `API` = `http://127.0.0.1:8000` (mặc định)
# import môi trường psql
.venv\Scripts\Activate.ps1

$env:APP_DB = "postgresql"
$env:APP_POSTGRES_HOST = "localhost"
$env:APP_POSTGRES_PORT = "5432"
$env:APP_POSTGRES_DATABASE = "meeting_room_db"
$env:APP_POSTGRES_USER = "postgres"
$env:APP_POSTGRES_PASSWORD = "123456"
# chạy môi trường 
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
# Tạo admin (chạy trong thư mục này, sau khi đã Activate.ps1)
python -m backend.scripts.create_admin quanly@gmail.com 2112005 "Admin"

# Nếu báo `No module named backend.scripts.create_admin`: đảm bảo đang ở đúng thư mục
# `project-proposal-demo\project-proposal-demo` (có thư mục `backend\scripts\`).
# Nếu `psycopg2` / `pip` lỗi: tạo lại venv — `python -m venv .venv` rồi `pip install -r requirements.txt`

### OAuth Google / Facebook (tùy chọn)

Thêm vào `.env`:

```
GOOGLE_CLIENT_ID=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
```

Google: [Google Cloud Console](https://console.cloud.google.com/) — OAuth client, authorized origin `http://127.0.0.1:8000`.  
Facebook: [Meta for Developers](https://developers.facebook.com/) — thêm `http://127.0.0.1:8000` vào Valid OAuth Redirect URIs.