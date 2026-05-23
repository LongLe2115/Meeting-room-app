# Meeting Room Booking System + Customer Support Ticket

Tài liệu này liệt kê các ý tưởng/tính năng có thể triển khai cho dự án, theo hướng **MVP trước – mở rộng sau**.

## 1) Mục tiêu & đối tượng sử dụng

- **Nhân viên (Employee)**: đặt phòng họp, xem lịch, tạo ticket nhờ hỗ trợ.
- **Quản trị (Admin/Office Manager)**: quản lý phòng, quy định đặt phòng, duyệt/huỷ đặt, báo cáo sử dụng.
- **CS/IT Support (Agent)**: xử lý ticket, SLA, phân loại, báo cáo chất lượng hỗ trợ.

## 2) Phạm vi MVP đề xuất (làm được nhanh, dùng được ngay)

### 2.1 Đặt phòng họp (Meeting Room Booking)

- **Danh sách phòng**: sức chứa, tiện nghi (TV, máy chiếu, bảng trắng), địa điểm/tầng.
- **Lịch phòng theo ngày/tuần**: hiển thị slot trống/đã đặt.
- **Tạo đặt phòng**:
  - chọn phòng, thời gian bắt đầu/kết thúc
  - tiêu đề cuộc họp, mô tả, số người tham gia (tuỳ chọn)
  - mời người tham dự (email/nhân sự nội bộ) (tuỳ chọn)
- **Chống trùng lịch**: không cho đặt chồng thời gian.
- **Sửa/Huỷ đặt phòng**: chỉ chủ cuộc hẹn hoặc admin.
- **Quyền truy cập**: đăng nhập, phân vai trò cơ bản (employee/admin).

### 2.2 Ticket hỗ trợ (Customer Support Ticket)

- **Tạo ticket**: tiêu đề, mô tả, mức độ ưu tiên (Low/Med/High), file đính kèm.
- **Trạng thái**: Open → In Progress → Resolved → Closed (và Reopened).
- **Bình luận/trao đổi**: user và agent chat theo ticket.
- **Gán người xử lý**: agent nhận ticket/được assign bởi admin.
- **Lọc & tìm kiếm**: theo trạng thái, ưu tiên, người tạo, người xử lý.

## 3) Ý tưởng mở rộng theo module

## 3.1 Booking – trải nghiệm người dùng

- **Đặt nhanh (Quick book)**: gợi ý phòng phù hợp theo sức chứa/tiện nghi/địa điểm.
- **Xem lịch dạng “floor map”**: sơ đồ tầng/phòng, nhấn để xem slot trống.
- **Đặt định kỳ (Recurring booking)**: theo tuần/tháng, xử lý xung đột từng lần.
- **Check-in/No-show**:
  - yêu cầu check-in trong X phút, quá hạn thì tự huỷ để nhả phòng
  - thống kê no-show theo phòng/đơn vị
- **Danh sách chờ (Waitlist)**: khi phòng full, đăng ký chờ; có slot sẽ thông báo.

## 3.2 Booking – quy định & quản trị

- **Rule engine nhẹ**:
  - giới hạn thời lượng tối đa
  - giới hạn đặt trước bao nhiêu ngày
  - giờ “golden hours” cần duyệt
  - hạn mức theo phòng ban
- **Duyệt đặt phòng (Approval)**: một số phòng/khung giờ cần admin phê duyệt.
- **Khoá phòng bảo trì**: block thời gian để bảo trì/đặt thiết bị.
- **Audit log**: ai đặt/huỷ/sửa, khi nào, lý do.

## 3.3 Ticket – vận hành & chất lượng dịch vụ

- **SLA**:
  - thời gian phản hồi đầu tiên (First Response Time)
  - thời gian giải quyết (Resolution Time)
  - cảnh báo sắp quá hạn
- **Phân loại**: Category/Subcategory (IT, Facilities, HR...), tagging.
- **Canned responses**: mẫu trả lời nhanh.
- **Knowledge base/FAQ**: bài viết hướng dẫn, gợi ý tự xử lý trước khi tạo ticket.
- **CSAT**: đánh giá sau khi ticket resolved, dashboard chất lượng.
- **Escalation**: tự động nâng cấp ưu tiên/đẩy lên tuyến 2 khi quá SLA.

## 3.4 Tích hợp giữa Booking và Ticket (điểm khác biệt hay)

- **Ticket từ sự cố phòng họp**:
  - trong màn “đặt phòng/lịch phòng” có nút “Báo sự cố” (TV hỏng, máy lạnh…)
  - ticket tự gắn **RoomId** + thời gian + ảnh (nếu có)
- **Tự động tạo ticket**:
  - phòng bị báo lỗi nhiều lần → tự tạo ticket “Maintenance required”
  - nếu meeting bị huỷ do thiết bị lỗi → tạo ticket follow-up
- **Bảng điều khiển theo phòng**:
  - lịch sử booking + lịch sử ticket của từng phòng
  - gợi ý phòng “ổn định” (ít sự cố)

## 4) Dữ liệu cốt lõi (Entity gợi ý)

- **User**: id, name, email, role, department
- **Room**: id, name, location, capacity, amenities[], status
- **Booking**: id, roomId, organizerId, startAt, endAt, title, notes, status
- **Ticket**: id, requesterId, assigneeId, subject, description, priority, status, category, createdAt
- **TicketComment**: id, ticketId, authorId, body, attachments[], createdAt
- **AuditLog** (tuỳ chọn): actorId, action, entityType, entityId, payload, createdAt

## 5) Luồng nghiệp vụ quan trọng (nên làm chắc)

- **Chống trùng**: kiểm tra overlap theo (roomId, startAt, endAt).
- **Phân quyền**:
  - employee: tạo/sửa/huỷ booking của mình, tạo ticket của mình
  - agent: xử lý ticket, không sửa booking (trừ khi có quyền)
  - admin: quản lý room, override booking, xem báo cáo
- **Thông báo**:
  - booking: tạo/sửa/huỷ → email/notification
  - ticket: comment/status change/assign → email/notification

## 6) UI/UX screens gợi ý

- **Login / Profile**
- **Rooms** (list + filter)
- **Room details** (calendar + book)
- **My bookings**
- **Tickets** (list + filters)
- **Ticket details** (timeline comments)
- **Admin**:
  - room management
  - booking rules/approvals
  - ticket categories/SLA
  - dashboards

## 7) Báo cáo & dashboard (đáng làm nếu có thời gian)

- **Booking**: tỉ lệ lấp đầy theo phòng/khung giờ, no-show, top amenities.
- **Ticket**: số ticket theo category, SLA met %, thời gian xử lý trung bình, CSAT.
- **Kết hợp**: phòng nào hay phát sinh ticket, correlation giữa “quá tải booking” và “sự cố”.

## 8) Ý tưởng “nice-to-have” (tăng điểm)

- **SSO** (Google/Microsoft) nếu là nội bộ công ty.
- **Đa ngôn ngữ** (VI/EN).
- **Mobile-friendly** + PWA.
- **Tích hợp calendar** (ICS export, Google Calendar / Outlook).
- **QR code tại phòng**:
  - quét để check-in booking
  - quét để tạo ticket “báo sự cố phòng”

## 9) Gợi ý roadmap ngắn

- **Sprint 1**: Auth + Room CRUD + Booking tạo/xem/huỷ + chống trùng.
- **Sprint 2**: Ticket tạo/xử lý + comment + filters + assign.
- **Sprint 3**: Notifications + admin dashboard cơ bản + tích hợp “báo sự cố từ phòng”.

