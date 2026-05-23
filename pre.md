# Nội dung slide — theo mã nguồn dự án **Meeting Room Pro**

Tài liệu bám sát repo hiện tại (`backend/` FastAPI, `frontend/` HTML/JS, DB SQLite hoặc PostgreSQL). Chỉnh lời văn slide cho phù hợp thời lượng trình bày.

---

## SLIDE 2 — Giới thiệu bài toán

**Bối cảnh (trong code):** Doanh nghiệp cần **quản lý và đặt phòng họp** tập trung — tránh **trùng lịch** cùng một phòng, cần **nhìn nhanh trạng thái** phòng (trống / đang họp), và **phân quyền** giữa người dùng thường và quản trị.

**Hệ thống trong repo:** Ứng dụng web **Meeting Room Pro (MRP)** — nền tảng đặt phòng họp có **trang marketing** (`index.html`), **dashboard người dùng** (`dashboard.html` + `dashboard.js`), **khu vực quản trị** (`admin-dashboard.html` + `admin-dashboard.js`), xác thực **JWT** (`/auth/login`, `/auth/register`), API **REST** (`/rooms`, `/bookings`, `/public/dashboard-stats`, …).

**Có thể nói thêm:** Module **ticket hỗ trợ** (`/tickets`) — tách khỏi luồng đặt phòng nhưng nằm chung backend (theo `README.md` / `main.py`).

---

## SLIDE 3 — Mục tiêu hệ thống

**Gợi ý gắn với code:**

| Mục tiêu | Thể hiện trong dự án |
|----------|----------------------|
| Cho phép người dùng **đăng ký / đăng nhập** và **đặt / xem / hủy** lịch phòng | `login.html`, `dashboard.js` → `POST /bookings`, `GET /bookings/mine`, hủy qua API |
| **Quản lý phòng** (thông tin, giá, tiện nghi, trạng thái) | Admin CRUD `PATCH/POST/DELETE /rooms`, trường `price`, import CSV `POST /rooms/import-csv` |
| **Thống kê công khai** trên landing (không cần login) | `GET /public/dashboard-stats` — dùng trên `index.html` |
| **Bảo mật theo vai trò** | JWT + `require_role`: `employee`, `agent`, `admin` (`security.py`, các router) |
| **Lưu trữ linh hoạt** | SQLite mặc định hoặc PostgreSQL (`APP_DB=postgresql`, `db_postgresql.py`) |

---

## SLIDE 4 — Use case / Chức năng (theo actor)

**Actor: Người dùng đã đăng nhập (role `user` — giao diện gọi là “Khách hàng”)**

- Đăng ký / đăng nhập (email `@gmail.com` theo validate trong `schemas.py`).
- Xem **dashboard**: trang chủ, **cuộc họp của tôi**, **phòng khả dụng** (lọc theo thời gian), **hồ sơ** (cập nhật tên/mật khẩu qua `PATCH /auth/me`).
- **Đặt phòng**: chọn phòng, khung giờ, tiêu đề — backend kiểm tra **trùng lịch** theo phòng (`bookings_router`).
- Xem / hủy booking của mình (`/bookings/mine`, cancel).

**Actor: Quản trị (`admin`)**

- **Quản lý phòng**: tạo / sửa / xóa phòng; thuộc tính: tên, vị trí, sức chứa, URL ảnh, tiện nghi, **giá (VNĐ)**, trạng thái hoạt động.
- **Import CSV** hàng loạt phòng (cùng bộ thuộc tính, UTF-8, tiêu đề cột tiếng Việt hoặc Anh).
- **Quản lý người dùng**: danh sách, tạo tài khoản, xóa (`/auth/users`, …).
- Xem **tổng quan / đặt phòng** trong admin (thống kê, bảng booking — theo `admin-dashboard.js`).

**Actor: Nhân viên (`agent`) — nếu trình bày**

- Trong code có role `agent`; module **ticket** có gán ticket (`assign`) cho `agent` / `admin` (`tickets.py`). Có thể mô tả là hỗ trợ vận hành / xử lý yêu cầu.

**Actor: Khách (chưa đăng nhập)**

- Xem **landing** `index.html`: hero, thống kê từ API public, **danh sách phòng động**, lịch hôm nay, khách hàng (logo), tin tức, liên hệ.

---

## SLIDE 5 — Kiến trúc hệ thống

**Tầng trình bày (gợi ý sơ đồ):**

```
[Trình duyệt]  →  HTML/JS/CSS (Tailwind CDN) + Iconify
       ↓  fetch + Bearer JWT
[FastAPI]  uvicorn — CORS mở cho dev
       ↓
[SQLite / PostgreSQL]  — bảng users, rooms (có price), bookings, tickets, …
```

**Backend (`backend/app/`):**

- `main.py`: `FastAPI`, mount static `frontend/`, routers: `auth`, `rooms`, `bookings`, `tickets`, `public`.
- Xác thực: **JWT** (`python-jose`), mật khẩu **bcrypt/passlib** (`pbkdf2_sha256`).
- API tài liệu tự sinh: **Swagger** `/docs`.

**Frontend:**

- Không framework SPA — **từng trang HTML** + `shared.js` (API base, token, `api()` / `apiForm()`).
- `dashboard.js` gọi `GET /rooms`, `GET /bookings`, v.v.

**Public API (landing):**

- `GET /public/dashboard-stats` — phòng active + booking (join organizer) phục vụ thống kê và thẻ phòng trên `index.html`.

---

## SLIDE 6 — Demo

**Luồng gợi ý (chụp màn hình / quay video):**

1. **Landing** `index.html`: thống kê, phòng load từ API, nút vào đăng nhập / đặt phòng.
2. **Đăng nhập** `login.html` → **Dashboard** `dashboard.html`: đặt phòng, xem “Cuộc họp của tôi”, phòng trống.
3. **Admin** `admin-login.html` → `admin-dashboard.html`: quản lý phòng, **giá**, **import CSV**, tài khoản (nếu cần).

**Lệnh chạy (tham `README.md`):** `uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000`

---

## SLIDE 7 — Sử dụng AI (tình hình)

**Gợi ý nội dung trung thực:**

- Dùng **trợ lý AI trong IDE** (ví dụ Cursor) để: gợi ý refactor, sinh boilerplate API, hỗ trợ chỉnh HTML/CSS.
- **Giới hạn:** AI không thay thế kiểm thử tay, review bảo mật (JWT secret, quyền admin), và kiểm chứng nghiệp vụ đặt phòng.


---

## SLIDE 8 — Kết quả / Tiến độ

**Đã có trong code (có thể liệt kê):**

- Hoàn chỉnh luồng: **auth**, **rooms** (kèm **price**), **bookings**, **public stats** cho landing.
- **Admin**: CRUD phòng, **import CSV**, quản lý user, xem booking.
- **UI**: landing + dashboard user + admin; responsive cơ bản (sidebar, bảng).
- **DB**: hỗ trợ **PostgreSQL** cho môi trường production-like.

**Hướng mở rộng (nếu muốn ghi “tương lai”):**

- Thanh toán thực tế gắn với `price`, thông báo email, lịch đồng bộ Google/Outlook.
- Test tự động (pytest), CI/CD.

---

## Phụ lục — File chính (để bạn ghi chú slide hoặc báo cáo)

| Khu vực | File / thư mục |
|---------|----------------|
| API & app | `backend/app/main.py`, `modules/auth/`, `modules/booking/`, `routers/public_stats.py`, `routers/tickets.py` |
| Giao diện người dùng | `frontend/index.html`, `dashboard.html`, `dashboard.js`, `login.html` |
| Quản trị | `frontend/admin-dashboard.html`, `admin-dashboard.js` |
| Chung | `frontend/shared.js` |
| Cấu hình DB | `backend/app/db.py`, `db_postgresql.py`, biến môi trường `APP_DB`, `APP_POSTGRES_*` |

---

