# Meeting Room Pro (MRP) — Báo cáo kỹ thuật & hướng dẫn dự án

**Hệ thống đặt phòng họp + hỗ trợ thiết bị (ticket chat)**  
Repository: https://github.com/LongLe2115/project-proposal

---

## 1. THÔNG TIN NHÓM

| STT | Họ tên | MSSV |
|-----|--------|------|
| 1 | Lê Quang Long | 23636861 |
| 2 | Nguyễn Cẩm Hà | 23634731 |
| 3 | Lục Vỹ Kiệt |  23631351 |
| 4 | Dương Hồng Phong | 23725131 |



---

## 2. TỔNG QUAN DỰ ÁN

### 2.1 Mục tiêu

Xây dựng web app cho phép nhân viên/khách hàng **đặt phòng họp**, theo dõi lịch, thanh toán (tiền mặt / chuyển khoản), và **báo sự cố thiết bị–phòng** qua hội thoại với quản trị. Quản trị viên quản lý phòng, đặt chỗ, người dùng, yêu cầu liên hệ và phản hồi hỗ trợ.

### 2.2 Công nghệ

| Lớp | Công nghệ |
|-----|-----------|
| Backend | Python 3, **FastAPI**, Uvicorn, Pydantic v2 |
| Auth | JWT (python-jose), bcrypt/pbkdf2 (passlib) |
| Database | **PostgreSQL** (production/dev chính) hoặc SQLite (fallback `APP_DB` khác) |
| Frontend | HTML5, CSS (Tailwind CDN), JavaScript thuần (không framework) |
| Triển khai local | Backend serve luôn static `frontend/` tại port 8000 |

### 2.3 Kiến trúc tổng quan

```
[Trình duyệt]
    │  HTTPS/HTTP
    ▼
[FastAPI app — main.py]
    ├── /auth/*          Đăng ký, đăng nhập, OAuth, quên MK
    ├── /rooms/*         CRUD phòng, import CSV
    ├── /bookings/*      Đặt / hủy / lịch bận
    ├── /tickets/*       Hỗ trợ thiết bị (ticket + comment)
    ├── /public/*        Thống kê, form liên hệ (không cần login)
    ├── /contact-requests/*  Admin xem liên hệ
    ├── /payment-info    Thông tin QR chuyển khoản
    └── /*               Static frontend (index, login, dashboard, admin…)
```

---

## 3. ACTOR (TÁC NHÂN) & PHÂN QUYỀN

### 3.1 Danh sách actor

| Actor | Mô tả | Vai trò trong DB (`users.role`) |
|-------|--------|----------------------------------|
| **Khách (Guest)** | Chưa đăng nhập | — |
| **Khách hàng / Nhân viên (Customer)** | Đăng ký, đặt phòng, hủy đặt, ticket hỗ trợ | `customer` |
| **Quản trị (Admin)** | Quản lý toàn hệ thống | `admin` |

> **Ghi chú:** Đề cương ban đầu dùng `employee` / `agent`; phiên bản hiện tại **gộp nhân viên → `customer`**, **gộp hỗ trợ → `admin`** (admin vừa quản lý vừa trả lời ticket). Bảng `users` tự migrate role cũ `employee`/`agent` → `customer` khi khởi tạo DB.

### 3.2 Ma trận quyền (tóm tắt)

| Chức năng | Guest | Customer | Admin |
|-----------|:-----:|:--------:|:-----:|
| Xem landing, thống kê public | ✓ | ✓ | ✓ |
| Gửi form liên hệ (không login) | ✓ | — | — |
| Đăng ký / đăng nhập | ✓ | ✓ | ✓ (trang admin riêng) |
| Xem & đặt phòng | — | ✓ | ✓ |
| Hủy đặt phòng (có xác nhận hoàn tiền) | — | ✓ (của mình) | ✓ (mọi booking) |
| Ticket hỗ trợ thiết bị | — | ✓ (của mình) | ✓ (tất cả) |
| CRUD phòng, import CSV | — | — | ✓ |
| Quản lý user, contact requests | — | — | ✓ |
| Xóa booking / ticket (theo quy tắc) | — | ✓ (ticket đã xử lý) | ✓ |

### 3.3 Luồng use case chính (cho báo cáo UML)

1. **UC01** — Đăng ký / đăng nhập (email + mật khẩu, OAuth, remember me).  
2. **UC02** — Quên mật khẩu → email/link reset (`reset-password.html`).  
3. **UC03** — Xem phòng trống theo khung giờ (GMT+7) → đặt phòng.  
4. **UC04** — Thanh toán tiền mặt hoặc chuyển khoản (MoMo/Bank + QR).  
5. **UC05** — Hủy đặt phòng + **xác nhận hoàn tiền** (bắt buộc tick xác nhận).  
6. **UC06** — Gửi yêu cầu hỗ trợ thiết bị → chat với admin (polling 8s).  
7. **UC07** — Admin phản hồi ticket, đổi trạng thái, xóa khi đã xử lý.  
8. **UC08** — Admin quản lý phòng, booking, user, yêu cầu liên hệ landing.

---

## 4. PHẠM VI MVP

### 4.1 MVP đã triển khai (Done)

#### A. Xác thực & người dùng
- [x] Đăng ký khách hàng (`POST /auth/register`, role `customer`)
- [x] Đăng nhập JWT (`POST /auth/login`)
- [x] **Remember me** (kéo dài `exp` JWT)
- [x] **Quên mật khẩu / đặt lại mật khẩu** (`password_resets`, link demo `APP_SHOW_RESET_LINK`)
- [x] OAuth Google / Facebook (tùy `.env`)
- [x] Cập nhật hồ sơ (`PATCH /auth/me`)
- [x] Admin tạo/xóa user (`POST/DELETE /auth/users`)
- [x] **Phiên tách admin/user** (`access_token_admin` / `access_token_user` trong `localStorage`)

#### B. Phòng họp
- [x] CRUD phòng (admin)
- [x] Import danh sách phòng từ **CSV** (map cột giá VND/giờ)
- [x] Giá phòng theo giờ (`rooms.price`)
- [x] Danh sách phòng public + lọc phòng trống theo slot thời gian

#### C. Đặt phòng (Booking)
- [x] Tạo booking, kiểm tra **trùng lịch** theo phòng
- [x] Giới hạn **sức chứa** (`participant_count` ≤ `room.capacity`)
- [x] Thời gian hiển thị & nhập liệu **GMT+7, định dạng 24h**
- [x] Thanh toán: `cash` | `transfer` (kênh `momo` | `bank`)
- [x] Hiển thị **tổng tiền = giá/giờ × số giờ** khi chuyển khoản + QR
- [x] Hủy đặt phòng + **modal xác nhận hoàn tiền** (`refund_confirmed`, `refund_confirmed_at`)
- [x] Dashboard: lịch ngày/tuần, phòng khả dụng, cuộc họp của tôi

#### D. Ticket hỗ trợ thiết bị
- [x] Tạo ticket (loại: thiết bị hư / phòng có vấn đề / khác)
- [x] Comment chat user ↔ admin
- [x] Trạng thái: `open` → `in_progress` → `resolved` → `closed` / `reopened`
- [x] Admin: đánh dấu đã xử lý, xóa ticket/tin nhắn (theo quy tắc)
- [x] User: xác nhận đóng, xóa khi đã xử lý
- [x] Polling tự làm mới ~8 giây

#### E. Landing & Admin
- [x] `index.html`: hero, phòng, giá, slider, form **liên hệ** → `POST /public/contact`
- [x] `admin-dashboard.html`: users, bookings, rooms, contacts, support
- [x] Thống kê public `GET /public/dashboard-stats`

### 4.2 MVP / mở rộng chưa làm (Backlog — ghi trong báo cáo “hướng phát triển”)

- [ ] Role `agent` riêng cho CS (hiện admin đảm nhiệm)
- [ ] Duyệt đặt phòng (approval workflow)
- [ ] Đặt phòng định kỳ (recurring)
- [ ] Check-in / no-show tự hủy
- [ ] Email thật (SMTP) cho reset password & thông báo
- [ ] SLA ticket, file đính kèm, CSAT
- [ ] Audit log đầy đủ
- [ ] Unit test / E2E tự động (pytest, Playwright)
- [ ] WebSocket thay polling chat
- [ ] Tích hợp cổng thanh toán thật (VNPay, MoMo API)

---

## 5. CƠ SỞ DỮ LIỆU (ENTITY)

| Bảng | Mục đích |
|------|----------|
| `users` | Tài khoản, role, OAuth provider |
| `password_resets` | Token hash reset mật khẩu |
| `rooms` | Phòng: tên, vị trí, sức chứa, giá/giờ, ảnh, amenities JSON |
| `bookings` | Đặt phòng: thời gian, organizer, payment, `refund_confirmed_at` |
| `tickets` | Yêu cầu hỗ trợ |
| `ticket_comments` | Tin nhắn trong ticket |
| `contact_requests` | Form liên hệ từ landing (`new` / `read`) |

**Quan hệ chính:** `bookings.room_id → rooms`, `bookings.organizer_id → users`, `tickets.requester_id → users`, `tickets.room_id → rooms` (nullable).

---

## 6. API CHÍNH (tham chiếu Swagger `/docs`)

### Auth `/auth`
| Method | Path | Mô tả |
|--------|------|--------|
| POST | `/register` | Đăng ký |
| POST | `/login` | Đăng nhập → JWT |
| POST | `/forgot-password` | Yêu cầu reset |
| POST | `/reset-password` | Đặt lại MK |
| GET | `/oauth/config` | Cấu hình OAuth |
| POST | `/oauth/google`, `/oauth/facebook` | Đăng nhập MXH |
| GET/PATCH | `/me` | Hồ sơ |
| GET/POST/DELETE | `/users`, `/users/{id}` | Admin quản lý user |

### Booking `/rooms`, `/bookings`
| Method | Path | Mô tả |
|--------|------|--------|
| GET/POST/PATCH/DELETE | `/rooms` | Phòng (+ import CSV) |
| GET/POST | `/bookings` | Danh sách / tạo đặt phòng |
| GET | `/bookings/mine` | Đặt phòng của tôi |
| GET | `/bookings/busy` | Slot bận (không lộ chi tiết) |
| POST | `/bookings/{id}/cancel` | Hủy (+ body `refund_confirmed`) |
| DELETE | `/bookings/{id}` | Admin xóa hẳn |

### Ticket `/tickets`
| Method | Path | Mô tả |
|--------|------|--------|
| GET/POST | `/tickets` | List / tạo (`?mine=1` cho user) |
| GET/PATCH/DELETE | `/tickets/{id}` | Chi tiết / cập nhật / xóa |
| GET/POST/DELETE | `/tickets/{id}/comments` | Chat / xóa tin |

### Public & khác
| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/public/dashboard-stats` | Thống kê landing |
| POST | `/public/contact` | Form liên hệ |
| GET | `/payment-info` | Thông tin chuyển khoản |
| GET | `/health` | Health check |

---

## 7. FRONTEND — TRANG & FILE

| File | Vai trò |
|------|---------|
| `index.html` | Landing, đặt phòng quick, liên hệ |
| `login.html` + `login.js` | Đăng nhập/đăng ký, OAuth, remember me |
| `reset-password.html` | Đặt lại mật khẩu |
| `dashboard.html` + `dashboard.js` | **Trang chính khách** sau login |
| `admin-login.html` | Đăng nhập admin |
| `admin-dashboard.html` + `admin-dashboard.js` | Trang quản trị |
| `shared.js` | API client, JWT, session, `formatDt` VN |
| `booking.js` | Trang phụ (legacy/demo đặt phòng đơn giản) |

> **Đã bỏ / không còn trong repo:** `booking.html` (luồng chính chuyển sang `dashboard.html`).

---

## 8. NHẬT KÝ THAY ĐỔI (SO VỚI ĐỀ CƯƠNG BAN ĐẦU)

Phần này dùng trực tiếp cho mục **“Các hạng mục đã sửa / thêm / xóa”** trong báo cáo.

### 8.1 Đã THÊM mới

| Hạng mục | Chi tiết |
|----------|----------|
| PostgreSQL | Hỗ trợ `APP_DB=postgresql`, `db_postgresql.py` |
| Dashboard khách | `dashboard.html` thay cho flow booking đơn giản |
| Giờ Việt Nam 24h | `vnWallClockToDate`, time picker ±30 phút, slot grid |
| Thanh toán | `payment_method`, `payment_channel`, QR, tổng tiền theo giờ |
| Hoàn tiền khi hủy | Modal xác nhận, API `refund_confirmed`, `refund_confirmed_at` |
| Quên mật khẩu | `password_resets`, `forgot-password`, `reset-password.html` |
| Remember me | JWT expire dài hơn khi tick |
| OAuth | Google + Facebook (optional) |
| Phiên tách | `access_token_admin` / `access_token_user` |
| Ticket hỗ trợ UI | Chat user/admin, polling, xóa/đánh dấu xử lý |
| Form liên hệ | `contact_requests` + admin xem |
| Import CSV phòng | Map cột giá `Giá (VND / giờ)` |
| `.env.example`, `.gitignore` | Không commit secret |
| GitHub | Push full source lên `LongLe2115/project-proposal` |

### 8.2 Đã SỬA đổi

| Hạng mục | Trước | Sau |
|----------|-------|-----|
| Vai trò user | `employee`, `agent`, `admin` | `customer`, `admin` |
| Trang sau login | `booking.html` | `dashboard.html` |
| Serve frontend | Live Server riêng port 5500 | FastAPI mount `/` port 8000 |
| Hủy booking | `confirm()` → hủy ngay | Modal hoàn tiền + API body |
| Admin hủy booking | Giống user | Gửi `refund_confirmed: true`, không bắt modal |
| Ticket list | Chưa có UI đầy đủ | Admin + user dashboard, badge số ticket |
| Xử lý 401 | Xóa hết token | Chỉ xóa token đúng actor (admin/user) |

### 8.3 Đã XÓA / không còn dùng

| Hạng mục | Ghi chú |
|----------|---------|
| `booking.html` | Không còn trong repo; thay bằng dashboard |
| Role `employee` / `agent` trong logic mới | Migrate DB → `customer` |
| Token JWT dùng chung một key | Thay bằng key tách theo trang |
| Đăng ký tạo admin từ form public | Admin chỉ tạo qua script / admin panel |

---

## 9. CẤU HÌNH MÔI TRƯỜNG (`.env`)

Sao chép `.env.example` → `.env` ( **không commit `.env`** ).

| Biến | Ý nghĩa |
|------|---------|
| `APP_DB` | `postgresql` hoặc sqlite |
| `APP_POSTGRES_*` | Kết nối PostgreSQL |
| `APP_JWT_SECRET` | Bí mật ký JWT — **đổi khi deploy** |
| `APP_JWT_EXPIRE_MINUTES` | Thời hạn token thường |
| `APP_JWT_REMEMBER_EXPIRE_MINUTES` | Thời hạn khi remember me |
| `APP_PUBLIC_URL` | Domain public (link reset password) |
| `APP_SHOW_RESET_LINK` | `true` dev: hiện link reset trên UI; **`false` production** |
| `GOOGLE_CLIENT_ID`, `FACEBOOK_*` | OAuth (tuỳ chọn) |
| `PAYMENT_*` | SĐT MoMo, STK ngân hàng, URL QR |

---

## 10. HƯỚNG DẪN CHẠY LOCAL

### 10.1 Cài đặt

```powershell
cd project-proposal-demo
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Chỉnh .env (PostgreSQL, JWT secret, …)
```
### Nếu lỗi môi trường chạy các lệnh sau với các phiên bản khác 
```
Remove-Item -Recurse -Force .venv # xóa môi trường cũ
py -m venv .venv # tạo env mới
.venv\Scripts\Activate # activate môi trường
pip install -r requirements.txt # cài package 
```

### 10.2 Chạy server

```powershell
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

- App: http://127.0.0.1:8000  
- API docs: http://127.0.0.1:8000/docs  
- Khách: http://127.0.0.1:8000/login.html  
- Admin: http://127.0.0.1:8000/admin-login.html  

### 10.3 Tạo tài khoản admin

```powershell
python -m backend.scripts.create_admin quanly@gmail.com MatKhauManh "Admin"
```

---

## 11. DEPLOY (TÓM TẮT)

1. PostgreSQL cloud + biến môi trường trên server (Render / Railway / VPS).  
2. `pip install -r requirements.txt` → `uvicorn … --host 0.0.0.0 --port $PORT`.  
3. HTTPS + `APP_PUBLIC_URL` đúng domain.  
4. `APP_SHOW_RESET_LINK=false`, `APP_JWT_SECRET` mạnh.  
5. **Lưu ý:** `shared.js` — `getApiBase()` cần cùng origin khi deploy HTTPS (port ≠ 8000); nên sửa trước production.  
6. Không commit `.env`; dùng secret manager trên cloud.

---

## 12. LỖ HỔNG, HẠN CHẾ & RỦI RO (GHI TRONG BÁO CÁO)

Phần quan trọng cho **đánh giá nghiệp vụ & bảo mật** — thể hiện nhóm hiểu giới hạn hệ thống.

### 12.1 Bảo mật

| # | Vấn đề | Mức độ | Ghi chú |
|---|--------|--------|---------|
| 1 | JWT lưu `localStorage` | Trung bình | Dễ bị XSS đọc token; production nên cân nhắc HttpOnly cookie |
| 2 | `APP_JWT_SECRET` mặc định dev | Cao (nếu quên đổi) | Bắt buộc đổi khi deploy |
| 3 | CORS `allow_origins=["*"]` | Trung bình | Chấp nhận mọi origin; thu hẹp khi có domain cố định |
| 4 | Reset password hiện link demo | Trung bình | `APP_SHOW_RESET_LINK=true` lộ link trên UI — tắt production |
| 5 | Không có rate limit login/register | Trung bình | Dễ brute-force / spam |
| 6 | Không có CAPTCHA form liên hệ | Thấp | Spam contact requests |
| 7 | OAuth phụ thuộc cấu hình đúng redirect | Trung bình | Sai domain → login MXH lỗi |
| 8 | Admin xóa user/booking không soft-delete | Thấp | Mất dữ liệu vĩnh viễn |

### 12.2 Nghiệp vụ & tính đúng đắn

| # | Vấn đề | Ghi chú |
|---|--------|---------|
| 1 | Hoàn tiền **tự khai báo** | User tick “đã nhận hoàn tiền” — không có đối soát ngân hàng thật |
| 2 | Chuyển khoản không xác minh webhook | Đặt phòng thành công sau khi user bấm “đã chuyển khoản” — tin tưởng phía client |
| 3 | Không khóa phòng khi thanh toán pending | Hai user có thể tranh slot nếu cùng đặt sát thời điểm |
| 4 | Hủy phòng không hoàn tự động qua cổng thanh toán | Chỉ quy trình UI + trạng thái `cancelled` |
| 5 | Ticket polling 8s | Tốn request; không real-time như WebSocket |
| 6 | Múi giờ | Logic frontend/backend hướng GMT+7; server UTC lệch có thể ảnh hưởng edge case |
| 7 | `participant_count` | Có validate với capacity; có thể chưa persist đủ trên mọi DB migration cũ |

### 12.3 Kỹ thuật & vận hành

| # | Vấn đề | Ghi chú |
|---|--------|---------|
| 1 | Không có test tự động trong CI | Kiểm thử chủ yếu thủ công |
| 2 | SQLite vs PostgreSQL | Code đa DB nhưng test chủ yếu một môi trường |
| 3 | File video/ảnh lớn trong `frontend/` | Tăng dung lượng repo & thời gian tải |
| 4 | Không backup DB tự động trong app | Phụ thuộc nhà cung cấp cloud |
| 5 | `getApiBase()` hardcode `127.0.0.1:8000` | Lỗi khi deploy split domain nếu không sửa |

### 12.4 Khuyến nghị khi demo / bảo vệ

- Demo bằng **một domain** (FastAPI serve static) tránh lỗi API base.  
- Dùng tài khoản admin riêng, không commit `.env`.  
- Giải thích rõ: **MVP chứng minh quy trình**, chưa phải hệ thống thanh toán/hoàn tiền tài chính đầy đủ.  
- Nêu roadmap: email SMTP, payment gateway, audit log, test automation.

---

## 13. KỊCH BẢN KIỂM THỬ GỢI Ý (CHO BÁO CÁO)

| ID | Kịch bản | Kết quả mong đợi |
|----|----------|------------------|
| T1 | Đăng ký → login → dashboard | Vào được, JWT lưu `access_token_user` |
| T2 | Đặt phòng trùng giờ | API 400/409, không tạo trùng |
| T3 | Đặt chuyển khoản, hiển thị đúng tổng tiền | QR + số tiền = giá×giờ |
| T4 | Hủy booking chuyển khoản không tick hoàn tiền | Không hủy được |
| T5 | Tick hoàn tiền → hủy | `status=cancelled`, `refund_confirmed_at` có giá trị |
| T6 | User tạo ticket → admin reply | User thấy reply sau poll |
| T7 | Admin + user cùng lúc 2 tab | Không văng session (sau fix token tách) |
| T8 | Form liên hệ landing | Admin thấy trong contact requests |
| T9 | Quên MK → reset | Đổi MK, login lại được |
| T10 | Import CSV phòng | Giá hiển thị đúng trên web |

---

## 14. CẤU TRÚC THƯ MỤC

```
project-proposal-demo/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry, mount frontend
│   │   ├── db.py, db_postgresql.py
│   │   ├── security.py          # JWT, password
│   │   ├── schemas.py
│   │   ├── modules/auth/        # Login, OAuth, reset password
│   │   ├── modules/booking/     # Rooms, bookings
│   │   └── routers/             # tickets, contact, public_stats, payment
│   └── scripts/create_admin.py
├── frontend/                    # HTML/JS/CSS
├── data/                        # SQLite local (gitignore)
├── .env.example
├── .gitignore
├── requirements.txt
├── IDEAS.md                     # Ý tưởng mở rộng gốc
└── README.md                    # File này
```

---

## 15. TÀI LIỆU THAM KHẢO

- FastAPI: https://fastapi.tiangolo.com/
- Repository nhóm: https://github.com/LongLe2115/project-proposal
- Ý tưởng & backlog chi tiết: `IDEAS.md`

---

*Tài liệu cập nhật theo trạng thái mã nguồn tại thời điểm hoàn thiện MVP — dùng làm căn cứ viết báo cáo đồ án, slide bảo vệ và checklist demo.*
