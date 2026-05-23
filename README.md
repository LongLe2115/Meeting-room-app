# Project Proposal — Meeting Room Pro (MRP)

## THÔNG TIN

**Nhóm**

- Thành viên 1: Lê Quang Long - 23636861
- Thành viên 2: Nguyễn Cẩm Hà -
- Thành viên 3: Lục Vỹ Kiệt -
- Thành viên 4: Dương Hồng Phong -

**Git**

- Git repository: https://github.com/LongLe2115/project-proposal

```
Lưu ý:
- Chỉ tạo git repository một lần, nếu đổi link repo nhóm sẽ bị trừ điểm.
```

---

## MÔ TẢ DỰ ÁN

### Ý tưởng

Dự án **Meeting Room Pro** (MRP) là hệ thống quản lý và đặt phòng họp thông minh cho doanh nghiệp/trường học: đăng nhập, xem phòng, lọc phòng trống, đặt theo khung giờ, quản trị phòng & đặt chỗ, hỗ trợ thiết bị qua ticket chat.

### Chi tiết triển khai hiện tại

- **Auth:** đăng ký/đăng nhập JWT, quên mật khẩu, OAuth Google/Facebook (tùy cấu hình), phiên admin/user tách riêng.
- **Phòng & đặt chỗ:** CRUD phòng (admin), đặt/hủy, chống trùng lịch, thanh toán chuyển khoản/QR, dashboard khách.
- **Admin:** quản lý user, phòng, booking, yêu cầu liên hệ, **hỗ trợ thiết bị** (chat, đánh dấu đã xử lý, xóa yêu cầu).
- **Frontend:** `index.html` (landing), `login.html`, `dashboard.html`, `admin-login.html`, `admin-dashboard.html`.

---

## Hướng dẫn chạy dự án

### 1) Cài dependencies

```bash
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Sao chép `.env.example` → `.env` và chỉnh `APP_DATABASE_URL`, `APP_JWT_SECRET`, v.v.

### 2) Chạy backend

```bash
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

- Swagger: http://127.0.0.1:8000/docs
- Tạo admin: `python -m backend.scripts.create_admin email@mật-khẩu "Tên Admin"`

### 3) Frontend

Mở http://127.0.0.1:8000 (backend serve static) hoặc Live Server trên thư mục `frontend/`.

- Khách: `login.html` → `dashboard.html`
- Admin: `admin-login.html` → `admin-dashboard.html`

---

## Cấu trúc mã nguồn

- `backend/app/modules/auth/` — đăng nhập, JWT, OAuth, reset password
- `backend/app/modules/booking/` — phòng, booking
- `backend/app/routers/` — tickets, contact, public stats
- `frontend/` — HTML/CSS/JS (Tailwind CDN)

Chi tiết ý tưởng ban đầu: xem `IDEAS.md`.
