# Project Proposal

## THÔNG TIN

**Nhóm**

- Thành viên 1: Lê Quang Long - 23636861
- Thành viên 2: Nguyễn Cẩm Hà - 23634731
- Thành viên 3: Lục Vỹ Kiệt - 23631351
- Thành viên 4: Dương Hồng Phong -23725131

**Git**

- Git repository: https://github.com/LongLe2115/project-proposal



## MÔ TẢ DỰ ÁN

### Ý tưởng

```
Dự án "Meeting Room Pro" (MRP) là hệ thống quản lý và đặt phòng họp thông minh cho doanh nghiệp.
Nhóm chọn đề tài này vì nhu cầu sử dụng phòng họp trong công ty/trường học rất phổ biến; việc đặt phòng
thủ công dễ trùng lịch, khó theo dõi trạng thái phòng theo thời gian thực. Phần mềm cho phép nhân viên
đăng nhập, xem danh sách phòng (truyền thống, hybrid, hội thảo, không gian mở), lọc phòng trống, đặt phòng
theo khung giờ và hủy/sửa đặt phòng; quản trị viên có tài khoản riêng để quản lý phòng và toàn bộ đặt chỗ.
So với các giải pháp hiện có, MRP tập trung giao diện thân thiện, thống kê tổng quan trên trang chủ,
lịch theo ngày/tuần lấy từ backend, và tách rõ luồng khách hàng (đăng ký/đăng nhập) với luồng quản lý (đăng nhập admin).
```

### Chi tiết

```
- Đăng ký / Đăng nhập: Khách hàng đăng ký với email @gmail.com, vai trò mặc định là nhân viên (employee).
  Tài khoản quản lý (admin) do hệ thống tạo sẵn, đăng nhập qua trang riêng (admin-login).

- Phòng họp: Mỗi phòng có tên, vị trí, sức chứa, ảnh, danh sách tiện nghi (amenities), trạng thái (active/inactive).
  Trang chủ hiển thị các loại phòng (truyền thống, hybrid, hội thảo, không gian mở) và danh sách phòng thực
  từ API với trạng thái Trống/Đang họp và thời gian trống đến/kết thúc.

- Đặt phòng: Chọn phòng, thời gian bắt đầu–kết thúc, tiêu đề, ghi chú. Backend kiểm tra chống trùng lịch theo phòng.
  Chỉ chủ đặt hoặc admin mới hủy được. Sau đặt thành công, lưu thông báo để hiển thị ở icon chuông trên trang chủ.

- Lịch và thống kê: Trang chủ có thẻ thống kê (tổng phòng, đang sử dụng, lịch hôm nay, hiệu suất) và khung "Lịch hôm nay / tuần"
  lấy từ API /bookings, hiển thị "Không có plan" nếu không có cuộc họp. Lọc phòng trống theo thời gian thực (nút Lọc).

- Trang lõi đặt phòng (booking.html): Sau đăng nhập khách hàng chuyển đến đây; có danh sách phòng (có ảnh), form tạo booking,
  danh sách "My bookings" với nút Hủy. Admin có thể quản lý phòng và toàn bộ booking (tùy triển khai).

- Giao diện: Trang chủ landing (hero, giá cả, thiết bị slider, khách hàng, tin tức, liên hệ), nav thống nhất, avatar và chuông
  chỉ hiện khi đã đăng nhập. Phong cách SaaS: màu trung tính, primary nhấn, bo góc, shadow nhẹ.
```

---

## PHÂN TÍCH & THIẾT KẾ

```
- Kiến trúc: Frontend (HTML/CSS/JS vanilla, Tailwind) gọi REST API; Backend FastAPI + SQLite, JWT cho auth.

- Entity chính:
  - User: id, email, name, password_hash, role (employee | agent | admin).
  - Room: id, name, location, capacity, image_url, amenities (JSON), status.
  - Booking: id, room_id, organizer_id, start_at, end_at, title, notes, status (active | cancelled).

- Luồng nghiệp vụ:
  - Đăng ký: POST /auth/register → luôn tạo role "employee". Đăng nhập: POST /auth/login → trả JWT.
  - Admin: đăng nhập qua trang admin-login, kiểm tra role trong JWT; nếu không phải admin thì từ chối.
  - Đặt phòng: POST /bookings với room_id, start_at, end_at, title, notes; backend kiểm tra overlap theo phòng và status active.
  - Hủy: POST /bookings/{id}/cancel; chỉ owner hoặc admin.

- Phân quyền:
  - Khách (chưa login): xem trang chủ, thống kê không load được hoặc 0; nút Đăng nhập/Đăng ký.
  - Employee: xem/đặt/hủy booking của mình, xem rooms, lịch, thống kê.
  - Admin: quản lý phòng (CRUD), xem/hủy mọi booking (tùy endpoint).

- Frontend chính: index.html (landing + room types + room cards từ API + pricing + devices + customers + news + contact),
  login.html (đăng nhập/đăng ký khách), admin-login.html (đăng nhập quản lý), booking.html (lõi đặt phòng). shared.js: getApiBase,
  getToken/setToken, api(). Dashboard (dashboard.html) tùy chọn, hiện tại sau login chuyển về booking.html.
```

---

## KẾ HOẠCH

### MVP

- **Mô tả chức năng MVP (thời hạn hoàn thành MVP 12.04.2026):**
  - Auth: đăng ký (chỉ role employee), đăng nhập khách + đăng nhập quản lý (admin) tách riêng.
  - Rooms: CRUD (admin), danh sách phòng trên trang chủ lấy từ API, hiển thị theo trạng thái booking.
  - Bookings: tạo đặt phòng, xem danh sách / của tôi, hủy đặt; kiểm tra trùng lịch theo phòng.
  - Trang chủ: hero, thống kê (tổng phòng, đang dùng, lịch hôm nay, hiệu suất), loại phòng (truyền thống, hybrid, hội thảo, không gian mở), lưới phòng từ API, lịch ngày/tuần từ API, lọc phòng trống, giá cả, thiết bị (slider), khách hàng, tin tức, liên hệ.
  - UI: sidebar/header nếu dùng dashboard; ẩn avatar/chuông khi chưa đăng nhập; thông báo khi đặt phòng thành công.

- **Kế hoạch kiểm thử:** Kiểm thử thủ công: đăng ký → đăng nhập → đặt phòng → kiểm tra trùng lịch → hủy đặt; đăng nhập admin riêng; kiểm tra hiển thị lịch và thống kê khi có/không dữ liệu. Có thể bổ sung test API (pytest) cho các endpoint auth và bookings.

- **Chức năng dự trù phase kế tiếp:** Ticket hỗ trợ (tạo ticket, comment, assign, trạng thái); duyệt đặt phòng; quy định đặt phòng (thời lượng tối đa, đặt trước); thông báo email; báo cáo sử dụng phòng.

### Beta Version

- **Kết quả kiểm thử:** (Nhóm cập nhật sau khi chạy kiểm thử Beta.)
- **Báo cáo:** (Nhóm bổ sung báo cáo Beta.)
- **Thời hạn hoàn thành dự kiến:** Chậm nhất 10.05.2026