// Guard: require đăng nhập khách hàng hợp lệ (token + JWT + chưa hết hạn)
if (typeof isUserSessionValid !== "function" || !isUserSessionValid()) {
  window.location.replace("./login.html");
}
(function () {
  var payload = typeof parseJwtPayload === "function" ? parseJwtPayload(getToken()) : null;
  if (payload && payload.role === "admin") {
    window.location.replace("./admin-dashboard.html");
  }
})();

// `$` đã được định nghĩa trong shared.js — không khai báo lại (trùng `const $` sẽ làm cả file không chạy).

const DASH = {
  rooms: [],
  bookings: [],
  myBookings: [],
  filterText: "",
  lastSync: null,
  loadNote: "",
  calendarMode: "day",
  calendarBaseDate: new Date(),
  me: null,
  supportTickets: [],
  supportActiveId: null,
  supportPollTimer: null,
  supportLastCommentId: 0,
};

const SUPPORT_CATEGORY_LABELS = {
  thiet_bi_hong: "Thiết bị hư",
  phong_co_van_de: "Phòng có vấn đề",
  khac: "Khác",
};

const SUPPORT_STATUS_LABELS = {
  open: "Chờ xử lý",
  in_progress: "Đang xử lý",
  resolved: "Đã xử lý",
  closed: "Đã đóng",
  reopened: "Mở lại",
};

/** Giờ Việt Nam (UTC+7) — dùng làm mốc thống kê */
const VN_TZ = "Asia/Ho_Chi_Minh";

function formatVnDateInput(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatVnTimeInput(d) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Hiển thị ngày/giờ theo lịch Việt Nam (24h). */
function formatVnDate(d) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatVnTime(d) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function formatVnDateTime(d) {
  return formatVnDate(d) + " " + formatVnTime(d);
}

function formatVnTimeRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  return formatVnDate(s) + " " + formatVnTime(s) + " – " + formatVnTime(e);
}

/** Chuẩn hóa HH:mm (24h) cho ô nhập giờ VN. */
function normalizeVnTimeStr(raw) {
  const t = String(raw || "").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}

function readVnTimeInput(el) {
  if (!el) return "";
  return normalizeVnTimeStr(el.value) || "";
}

function buildVnTimeSlotOptions() {
  const slots = [];
  for (let h = 7; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m > 0) continue;
      slots.push(String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"));
    }
  }
  return slots;
}

const VN_TIME_SLOT_OPTIONS = buildVnTimeSlotOptions();
const VN_TIME_STEP_MINUTES = 30;

function addVnMinutes(timeStr, minutes) {
  const base = normalizeVnTimeStr(timeStr) || "09:00";
  const parts = base.split(":");
  let total = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + minutes;
  if (total < 0) total = 0;
  if (total >= 24 * 60) total = 23 * 60 + 30;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function setVnTimeValue(input, value) {
  if (!input) return;
  const v = normalizeVnTimeStr(value);
  if (!v) return;
  input.value = v;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  syncVnTimeSlotActive(input);
}

function closeAllVnTimePanels(exceptPanel) {
  document.querySelectorAll(".vn-time-slot-panel").forEach(function (panel) {
    if (exceptPanel && panel === exceptPanel) return;
    panel.classList.add("hidden");
  });
}

function syncVnTimeSlotActive(input) {
  const picker = input && input.closest(".vn-time-picker");
  if (!picker) return;
  const current = normalizeVnTimeStr(input.value);
  picker.querySelectorAll(".vn-time-slot-btn").forEach(function (btn) {
    btn.classList.toggle("is-active", btn.getAttribute("data-time") === current);
  });
}

function upgradeVnTimePicker(input) {
  if (!input || input.closest(".vn-time-picker")) return;

  input.setAttribute("inputmode", "numeric");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("maxlength", "5");
  if (!input.getAttribute("placeholder")) input.setAttribute("placeholder", "09:00");
  input.classList.add("vn-time-picker-input");

  const picker = document.createElement("div");
  picker.className = "vn-time-picker";
  ["mt-1", "w-full"].forEach(function (cls) {
    if (input.classList.contains(cls)) {
      picker.classList.add(cls);
      input.classList.remove(cls);
    }
  });

  const control = document.createElement("div");
  control.className = "vn-time-picker-control";

  const btnDown = document.createElement("button");
  btnDown.type = "button";
  btnDown.className = "vn-time-step vn-time-step-down";
  btnDown.setAttribute("aria-label", "Giảm 30 phút");
  btnDown.textContent = "−";

  const btnUp = document.createElement("button");
  btnUp.type = "button";
  btnUp.className = "vn-time-step vn-time-step-up";
  btnUp.setAttribute("aria-label", "Tăng 30 phút");
  btnUp.textContent = "+";

  const btnPick = document.createElement("button");
  btnPick.type = "button";
  btnPick.className = "vn-time-picker-toggle";
  btnPick.setAttribute("aria-label", "Chọn khung giờ");
  btnPick.title = "Chọn khung giờ";
  btnPick.innerHTML =
    '<iconify-icon icon="solar:clock-circle-linear" width="18" height="18"></iconify-icon>';

  const panel = document.createElement("div");
  panel.className = "vn-time-slot-panel hidden";
  const grid = document.createElement("div");
  grid.className = "vn-time-slot-grid";
  VN_TIME_SLOT_OPTIONS.forEach(function (slot) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "vn-time-slot-btn";
    b.setAttribute("data-time", slot);
    b.textContent = slot;
    b.addEventListener("click", function () {
      setVnTimeValue(input, slot);
      panel.classList.add("hidden");
    });
    grid.appendChild(b);
  });
  panel.appendChild(grid);
  panel.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  const parent = input.parentNode;
  parent.insertBefore(picker, input);
  control.appendChild(btnDown);
  control.appendChild(input);
  control.appendChild(btnUp);
  control.appendChild(btnPick);
  picker.appendChild(control);
  picker.appendChild(panel);

  btnDown.addEventListener("click", function () {
    setVnTimeValue(input, addVnMinutes(input.value, -VN_TIME_STEP_MINUTES));
  });
  btnUp.addEventListener("click", function () {
    setVnTimeValue(input, addVnMinutes(input.value, VN_TIME_STEP_MINUTES));
  });
  btnPick.addEventListener("click", function (e) {
    e.stopPropagation();
    const wasHidden = panel.classList.contains("hidden");
    closeAllVnTimePanels();
    if (wasHidden) {
      panel.classList.remove("hidden");
      syncVnTimeSlotActive(input);
    }
  });

  input.addEventListener("blur", function () {
    const n = normalizeVnTimeStr(input.value);
    if (n) input.value = n;
    syncVnTimeSlotActive(input);
  });
  input.addEventListener("focus", function () {
    syncVnTimeSlotActive(input);
  });

  syncVnTimeSlotActive(input);
}

function initVnTimePickers() {
  document.querySelectorAll(".vn-time-input").forEach(upgradeVnTimePicker);
  if (!document.body.dataset.vnTimePickerDocBound) {
    document.body.dataset.vnTimePickerDocBound = "1";
    document.addEventListener("click", function () {
      closeAllVnTimePanels();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAllVnTimePanels();
    });
  }
}

/** Chuỗi ngày + giờ là giờ tường Việt Nam → Date (instant) */
function vnWallClockToDate(dateStr, timeStr) {
  if (!dateStr) return new Date();
  const tm = timeStr && String(timeStr).length >= 4 ? String(timeStr).slice(0, 5) : "12:00";
  const isoTime = tm.length === 5 ? tm + ":00" : tm;
  return new Date(dateStr + "T" + isoTime + "+07:00");
}

/** Mốc thời gian đang chọn trên form (VN) */
function getVnRef() {
  const ds = $("vnRefDate") && $("vnRefDate").value;
  const ts =
    ($("vnRefTime") && (readVnTimeInput($("vnRefTime")) || $("vnRefTime").value)) || "12:00";
  if (!ds) return new Date();
  return vnWallClockToDate(ds, ts || "12:00");
}

function startOfVnDayForRef(ref) {
  const ds = formatVnDateInput(ref);
  return vnWallClockToDate(ds, "00:00");
}

function startOfNextVnDayForRef(ref) {
  return new Date(startOfVnDayForRef(ref).getTime() + 24 * 60 * 60 * 1000);
}

function endOfVnDayForRef(ref) {
  return new Date(startOfNextVnDayForRef(ref).getTime() - 1);
}

function vnYearMonthKey(inst) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(inst);
  const y = p.find((x) => x.type === "year");
  const m = p.find((x) => x.type === "month");
  return y && m ? y.value + "-" + m.value : "";
}

function decodeJwt(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch (_) {
    return null;
  }
}

function setUserInfoFromToken() {
  const payload = decodeJwt(getToken());
  if (!payload) return;
  const name = payload.name || "User";
  const email = payload.email || payload.sub_email || "";
  const initial = (name || email || "U").trim().charAt(0).toUpperCase();

  ["userAvatarInitial", "profileAvatarInitial"].forEach((id) => {
    const el = $(id);
    if (el) el.textContent = initial;
  });
  if ($("userNameLabel")) $("userNameLabel").textContent = name;
  if ($("userEmailLabel")) $("userEmailLabel").textContent = email || "—";
  if ($("profileRole") && !$("profileRole").dataset.fromServer) {
    const r = String(payload.role || "").toLowerCase();
    $("profileRole").textContent = "Vai trò: " + (r === "admin" ? "Quản trị" : "Khách hàng");
  }
}

function currentUserEmailFromToken() {
  const payload = decodeJwt(getToken());
  if (!payload) return "";
  return String(payload.email || payload.sub_email || "").trim().toLowerCase();
}

function bellStoreKey() {
  const email = currentUserEmailFromToken();
  return "mrp_bell_" + (email || "user");
}

function loadBellState() {
  try {
    const raw = localStorage.getItem(bellStoreKey());
    if (!raw) return { items: [], unread: 0, snapshot: {} };
    const obj = JSON.parse(raw);
    return {
      items: Array.isArray(obj.items) ? obj.items : [],
      unread: Number(obj.unread || 0) || 0,
      snapshot: obj.snapshot && typeof obj.snapshot === "object" ? obj.snapshot : {},
    };
  } catch (_) {
    return { items: [], unread: 0, snapshot: {} };
  }
}

function saveBellState(state) {
  try {
    localStorage.setItem(bellStoreKey(), JSON.stringify(state));
  } catch (_) {}
}

function formatVnTs(ts) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: VN_TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(ts));
  } catch (_) {
    return "";
  }
}

function renderBell() {
  const dot = $("headerBellDot");
  const list = $("bellList");
  const empty = $("bellEmpty");
  if (!dot || !list || !empty) return;

  const st = loadBellState();
  dot.classList.toggle("hidden", !(Number(st.unread || 0) > 0));

  const items = Array.isArray(st.items) ? st.items : [];
  list.innerHTML = "";
  empty.classList.toggle("hidden", items.length > 0);
  if (!items.length) return;

  items.slice(0, 20).forEach((it) => {
    const row = document.createElement("div");
    row.className = "px-4 py-3";
    row.innerHTML =
      '<p class="text-sm text-slate-900 leading-relaxed">' +
      (it.text || "") +
      "</p>" +
      '<p class="mt-1 text-xs text-slate-500">' +
      formatVnTs(it.at) +
      "</p>";
    list.appendChild(row);
  });
}

function pushBellItem(text) {
  const st = loadBellState();
  const item = {
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    text: String(text || ""),
    at: Date.now(),
  };
  st.items = [item].concat(st.items || []).slice(0, 30);
  st.unread = Math.min(99, (Number(st.unread || 0) || 0) + 1);
  saveBellState(st);
  renderBell();
}

function pushBellItemToState(st, text) {
  const item = {
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    text: String(text || ""),
    at: Date.now(),
  };
  st.items = [item].concat(st.items || []).slice(0, 30);
  st.unread = Math.min(99, (Number(st.unread || 0) || 0) + 1);
}

function bookingTimeShort(meta) {
  return formatVnTimeRange(meta.start_at, meta.end_at);
}

function updateBellFromMyBookings(myBookings) {
  const st = loadBellState();
  const prev = st.snapshot || {};
  const next = {};

  (Array.isArray(myBookings) ? myBookings : []).forEach((b) => {
    const id = String(b.id);
    const meta = {
      status: b.status || "active",
      room_id: Number(b.room_id),
      start_at: b.start_at,
      end_at: b.end_at,
      title: b.title || "",
    };
    next[id] = meta;

    if (!prev[id] && meta.status === "active") {
      const room = DASH.rooms.find((r) => r.id === meta.room_id);
      pushBellItemToState(
        st,
        "Bạn đã đặt " +
          (room ? room.name : "Phòng " + meta.room_id) +
          " (" +
          bookingTimeShort(meta) +
          ")."
      );
    } else if (prev[id] && prev[id].status === "active" && meta.status !== "active") {
      const room = DASH.rooms.find((r) => r.id === meta.room_id);
      pushBellItemToState(
        st,
        "Bạn đã hủy " +
          (room ? room.name : "Phòng " + meta.room_id) +
          " (" +
          bookingTimeShort(meta) +
          ")."
      );
    }
  });

  st.snapshot = next;
  saveBellState(st);
  renderBell();
}

function toggleBell(open) {
  const dd = $("bellDropdown");
  if (!dd) return;
  const wantOpen = typeof open === "boolean" ? open : dd.classList.contains("hidden");
  dd.classList.toggle("hidden", !wantOpen);
  if (wantOpen) {
    const st = loadBellState();
    st.unread = 0;
    saveBellState(st);
    renderBell();
  }
}

function initBell() {
  const btn = $("btnHeaderBell");
  const dd = $("bellDropdown");
  if (!btn || !dd) return;

  renderBell();
  btn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    toggleBell();
  });

  const mark = $("btnBellMarkRead");
  if (mark) {
    mark.addEventListener("click", function (e) {
      e.preventDefault();
      const st = loadBellState();
      st.unread = 0;
      saveBellState(st);
      renderBell();
    });
  }

  document.addEventListener("click", function (e) {
    if (dd.classList.contains("hidden")) return;
    if (dd.contains(e.target) || btn.contains(e.target)) return;
    toggleBell(false);
  });
}

async function refreshMyBookingsAndNotify() {
  try {
    const mine = normalizeBookings(await fetchJsonAuth("/bookings/mine"));
    DASH.myBookings = mine;
    updateBellFromMyBookings(mine);
    renderMyMeetings();
    renderBell();
  } catch (_) {}
}

function startBellPolling() {
  setInterval(function () {
    if (document.hidden) return;
    refreshMyBookingsAndNotify();
  }, 20000);
}

function apiBaseUrl() {
  return typeof getApiBase === "function" ? getApiBase() : "";
}

/** GET /rooms là public — luôn lấy được danh sách phòng (không phụ thuộc token). */
async function fetchRoomsPublic() {
  const base = apiBaseUrl();
  const res = await fetch(base + "/rooms", { method: "GET" });
  if (!res.ok) throw new Error("rooms " + res.status);
  const data = await res.json();
  return normalizeRooms(data);
}

async function fetchPublicStatsRooms() {
  const base = apiBaseUrl();
  const res = await fetch(base + "/public/dashboard-stats", { method: "GET" });
  if (!res.ok) throw new Error("public " + res.status);
  const data = await res.json();
  if (data && Array.isArray(data.rooms)) return normalizeRooms(data.rooms);
  return [];
}

async function fetchJsonAuth(path) {
  if (typeof api === "function") return api(path);
  const token = typeof getToken === "function" ? getToken() : "";
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(apiBaseUrl() + path, { headers });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function normalizeRooms(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((r) => r && r.id != null)
    .map((r) => ({
      id: Number(r.id),
      name: r.name || "Phòng " + r.id,
      location: r.location != null && String(r.location).trim() ? String(r.location) : "—",
      capacity: Number(r.capacity || 0),
      amenities: Array.isArray(r.amenities) ? r.amenities : [],
      status: r.status || "active",
      price: Number(r.price) || 0,
      image_url:
        r.image_url != null && String(r.image_url).trim()
          ? String(r.image_url).trim()
          : "",
    }));
}

function normalizeBookings(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((b) => b && b.id != null)
    .map((b) => ({
      id: Number(b.id),
      room_id: Number(b.room_id),
      title: b.title || "Cuộc họp",
      start_at: b.start_at,
      end_at: b.end_at,
      status: b.status || "active",
      notes: b.notes || "",
      participant_count:
        b.participant_count == null || b.participant_count === ""
          ? null
          : Number(b.participant_count),
      payment_method: b.payment_method === "transfer" ? "transfer" : "cash",
      payment_channel:
        b.payment_channel === "momo" || b.payment_channel === "bank"
          ? b.payment_channel
          : null,
    }));
}

function formatPaymentLabel(method, channel) {
  if (method === "transfer") {
    if (channel === "momo") return "Chuyển khoản · Ví MoMo";
    if (channel === "bank") return "Chuyển khoản · Ngân hàng";
    return "Chuyển khoản";
  }
  return "Tiền mặt";
}

var PAYMENT_INFO = null;

function qrImageUrlFromPayload(payload) {
  if (!payload) return "";
  return (
    "https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=" +
    encodeURIComponent(payload)
  );
}

async function ensurePaymentInfo() {
  if (PAYMENT_INFO) return PAYMENT_INFO;
  try {
    const base = typeof getApiBase === "function" ? getApiBase() : "";
    const res = await fetch(base + "/public/payment-info");
    if (!res.ok) throw new Error("HTTP " + res.status);
    PAYMENT_INFO = await res.json();
    return PAYMENT_INFO;
  } catch (e) {
    console.warn("payment-info:", e);
    return null;
  }
}

function getSelectedRoomPrice() {
  const roomId = parseInt(($("modalRoomId") && $("modalRoomId").value) || "", 10);
  if (!roomId || Number.isNaN(roomId)) return 0;
  const room = DASH.rooms.find(function (r) {
    return r.id === roomId;
  });
  return room ? Number(room.price) || 0 : 0;
}

/** Số giờ đặt phòng từ form modal (null nếu chưa hợp lệ). */
function getModalBookingDurationHours() {
  const dateStr = $("modalDate") && $("modalDate").value;
  const t0 =
    readVnTimeInput($("modalStartTime")) ||
    normalizeVnTimeStr($("modalStartTime") && $("modalStartTime").value);
  const t1 =
    readVnTimeInput($("modalEndTime")) ||
    normalizeVnTimeStr($("modalEndTime") && $("modalEndTime").value);
  if (!dateStr || !t0 || !t1) return null;
  const start = vnWallClockToDate(dateStr, t0);
  const end = vnWallClockToDate(dateStr, t1);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return null;
  return (end.getTime() - start.getTime()) / 3600000;
}

function formatBookingHoursLabel(hours) {
  if (hours <= 0) return "0";
  if (Math.abs(hours - Math.round(hours)) < 0.001) return String(Math.round(hours));
  return hours.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

/** Giá/giờ × số giờ = tổng (VNĐ, làm tròn). */
function getBookingPriceBreakdown() {
  const hourly = getSelectedRoomPrice();
  const hours = getModalBookingDurationHours();
  if (hours == null) {
    return { hourly: hourly, hours: 0, total: 0, valid: false };
  }
  const total = hourly > 0 ? Math.round(hourly * hours) : 0;
  return { hourly: hourly, hours: hours, total: total, valid: true };
}

function formatTransferTotalText(breakdown) {
  const b = breakdown || getBookingPriceBreakdown();
  if (!b.valid) return "";
  if (b.hourly <= 0) return "";
  const hLbl = formatBookingHoursLabel(b.hours);
  return (
    b.hourly.toLocaleString("vi-VN") +
    " ₫/giờ × " +
    hLbl +
    " giờ = " +
    b.total.toLocaleString("vi-VN") +
    " ₫"
  );
}

function updateTransferPriceDisplay() {
  const el = $("modalTransferTotalPrice");
  if (!el) return;
  const method = document.querySelector('input[name="modalPaymentMethod"]:checked');
  const isTransfer = method && method.value === "transfer";
  if (!isTransfer) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  const b = getBookingPriceBreakdown();
  el.classList.remove("hidden");
  if (b.valid && b.hourly > 0) {
    el.textContent = formatTransferTotalText(b);
    el.classList.remove("text-slate-500");
    el.classList.add("text-emerald-700");
  } else if (b.hourly > 0) {
    el.textContent = "(chọn khung giờ để tính)";
    el.classList.add("text-slate-500");
    el.classList.remove("text-emerald-700");
  } else {
    el.textContent = "";
    el.classList.add("hidden");
  }
}

function buildTransferMemo() {
  const title = ($("modalMeetingTitle") && $("modalMeetingTitle").value) || "Cuoc hop";
  const slug = String(title)
    .trim()
    .slice(0, 24)
    .replace(/\s+/g, " ");
  return "MRP " + slug;
}

function renderTransferQrPanel() {
  const panel = $("modalQrPanel");
  const method = document.querySelector('input[name="modalPaymentMethod"]:checked');
  const channelEl = document.querySelector('input[name="modalPaymentChannel"]:checked');
  const isTransfer = method && method.value === "transfer";
  const channel = channelEl ? channelEl.value : "";

  if (!panel) return;
  if (!isTransfer || !channel || !PAYMENT_INFO) {
    panel.classList.add("hidden");
    return;
  }

  const info = channel === "momo" ? PAYMENT_INFO.momo : PAYMENT_INFO.bank;
  if (!info) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  try {
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (_) {}

  const breakdown = getBookingPriceBreakdown();
  if ($("modalQrTitle")) {
    $("modalQrTitle").textContent =
      channel === "momo" ? "Quét mã QR MoMo để thanh toán" : "Quét mã QR ngân hàng để thanh toán";
  }
  if ($("modalQrAmount")) {
    if (breakdown.valid && breakdown.total > 0) {
      $("modalQrAmount").textContent =
        "Tổng thanh toán: " +
        breakdown.total.toLocaleString("vi-VN") +
        " ₫ (" +
        formatTransferTotalText(breakdown) +
        ")";
    } else if (breakdown.hourly > 0) {
      $("modalQrAmount").textContent =
        "Giá phòng: " +
        breakdown.hourly.toLocaleString("vi-VN") +
        " ₫/giờ — chọn đủ ngày và khung giờ để tính tổng.";
    } else {
      $("modalQrAmount").textContent =
        "Vui lòng chuyển đúng số tiền theo thỏa thuận với quản lý.";
    }
  }
  updateTransferPriceDisplay();

  const qrSrc =
    (info.qr_image_url && String(info.qr_image_url).trim()) ||
    qrImageUrlFromPayload(info.qr_payload);
  if ($("modalQrImage")) {
    $("modalQrImage").src = qrSrc;
    $("modalQrImage").alt = "QR " + (info.label || channel);
  }

  if ($("modalQrAccountName")) {
    $("modalQrAccountName").textContent = info.account_name || "—";
  }
  if ($("modalQrAccountDetail")) {
    if (channel === "momo") {
      $("modalQrAccountDetail").innerHTML =
        "Số MoMo: <strong>" + (info.phone || "—") + "</strong>";
    } else {
      $("modalQrAccountDetail").innerHTML =
        (info.bank_name ? info.bank_name + " · " : "") +
        "STK: <strong>" +
        (info.account_no || "—") +
        "</strong>";
    }
  }
  const memo = buildTransferMemo();
  if ($("modalQrMemo")) $("modalQrMemo").textContent = memo;
}

function updateBookingModalPaymentActions() {
  const method = document.querySelector('input[name="modalPaymentMethod"]:checked');
  const isTransfer = method && method.value === "transfer";
  const channelEl = document.querySelector('input[name="modalPaymentChannel"]:checked');
  const btnCash = $("btnModalConfirm");
  const btnTransfer = $("btnTransferSuccess");

  if (btnCash) {
    btnCash.classList.toggle("hidden", isTransfer);
    btnCash.disabled = false;
  }
  if (btnTransfer) {
    const showTransferBtn = isTransfer && !!channelEl;
    btnTransfer.classList.toggle("hidden", !showTransferBtn);
  }

  renderTransferQrPanel();
  updateTransferPriceDisplay();
}

function updateTransferOptionsVisibility() {
  const transferBox = $("modalTransferOptions");
  const method = document.querySelector('input[name="modalPaymentMethod"]:checked');
  const isTransfer = method && method.value === "transfer";
  if (transferBox) transferBox.classList.toggle("hidden", !isTransfer);

  if (!isTransfer) {
    const panel = $("modalQrPanel");
    if (panel) panel.classList.add("hidden");
  } else {
    ensurePaymentInfo().then(function () {
      renderTransferQrPanel();
    });
  }
  updateTransferPriceDisplay();
  updateBookingModalPaymentActions();
}

function resetBookingPaymentForm() {
  const cash = document.querySelector('input[name="modalPaymentMethod"][value="cash"]');
  if (cash) cash.checked = true;
  document.querySelectorAll('input[name="modalPaymentChannel"]').forEach(function (el) {
    el.checked = false;
  });
  const panel = $("modalQrPanel");
  if (panel) panel.classList.add("hidden");
  updateTransferOptionsVisibility();
}

function readBookingPaymentFromModal() {
  const methodEl = document.querySelector('input[name="modalPaymentMethod"]:checked');
  const method = methodEl ? methodEl.value : "cash";
  if (method === "cash") {
    return { payment_method: "cash", payment_channel: null };
  }
  const channelEl = document.querySelector('input[name="modalPaymentChannel"]:checked');
  if (!channelEl) {
    return null;
  }
  return { payment_method: "transfer", payment_channel: channelEl.value };
}

function normalizeBusyBookings(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((b) => b && b.id != null)
    .map((b) => ({
      id: Number(b.id),
      room_id: Number(b.room_id),
      title: "Đã đặt",
      start_at: b.start_at,
      end_at: b.end_at,
      status: b.status || "active",
    }));
}

async function loadData() {
  DASH.loadNote = "";
  let rooms = [];
  let bookings = [];
  let myBookings = [];

  try {
    rooms = await fetchRoomsPublic();
  } catch (e) {
    DASH.loadNote = "Phòng: " + (e && e.message ? e.message : "lỗi mạng");
    try {
      rooms = await fetchPublicStatsRooms();
    } catch (e2) {
      DASH.loadNote += " | " + (e2 && e2.message ? e2.message : "");
    }
  }

  try {
    bookings = normalizeBusyBookings(await fetchJsonAuth("/bookings/busy"));
  } catch (_) {
    bookings = [];
  }

  try {
    myBookings = normalizeBookings(await fetchJsonAuth("/bookings/mine"));
  } catch (_) {
    myBookings = [];
  }

  DASH.rooms = rooms.filter((r) => r.status !== "inactive");
  DASH.bookings = bookings;
  DASH.myBookings = myBookings;
  DASH.lastSync = new Date();

  syncAvailFiltersOptions();
  fillSupportRoomSelect();

  updateBellFromMyBookings(myBookings);
  renderBell();

  const cnt = $("dashRoomCount");
  if (cnt) {
    cnt.textContent =
      DASH.rooms.length > 0
        ? "Đang có " + DASH.rooms.length + " phòng hoạt động"
        : DASH.loadNote || "Không tải được danh sách phòng.";
  }

  renderAll();
  updateCalModeStyles();
  updateCalendarRangeLabel();
}

function matchTextRoom(room, q) {
  if (!q) return true;
  const hay = (room.name + " " + room.location + " " + room.id).toLowerCase();
  return hay.indexOf(q) !== -1;
}

function parseFloorLabel(locationText) {
  const s = String(locationText || "").trim();
  if (!s) return "";
  const m = s.match(/(?:tầng|tang|floor)\s*([0-9]+)/i);
  if (m && m[1]) return "Tầng " + String(m[1]);
  return "";
}

function getAvailFilterValues() {
  const floor = ($("availFilterFloor") && $("availFilterFloor").value) || "";
  const roomId = ($("availFilterRoom") && $("availFilterRoom").value) || "";
  return { floor: String(floor || ""), roomId: String(roomId || "") };
}

function getAvailableRoomsByUiFilters() {
  const { floor, roomId } = getAvailFilterValues();
  return getFilteredRooms().filter((r) => {
    if (floor) {
      const fl = parseFloorLabel(r.location);
      if (fl !== floor) return false;
    }
    if (roomId) {
      if (String(r.id) !== String(roomId)) return false;
    }
    return true;
  });
}

function syncAvailFiltersOptions() {
  const floorSel = $("availFilterFloor");
  const roomSel = $("availFilterRoom");
  if (!floorSel || !roomSel) return;

  const selectedFloor = floorSel.value || "";
  const selectedRoom = roomSel.value || "";

  const floors = new Set();
  DASH.rooms.forEach((r) => {
    const fl = parseFloorLabel(r.location);
    if (fl) floors.add(fl);
  });
  const floorsSorted = Array.from(floors).sort((a, b) => {
    const na = parseInt(a.replace(/\D+/g, ""), 10);
    const nb = parseInt(b.replace(/\D+/g, ""), 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });

  floorSel.innerHTML = '<option value="">Tất cả tầng</option>';
  floorsSorted.forEach((fl) => {
    const opt = document.createElement("option");
    opt.value = fl;
    opt.textContent = fl;
    floorSel.appendChild(opt);
  });
  if (selectedFloor) floorSel.value = selectedFloor;

  const rooms = DASH.rooms
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  roomSel.innerHTML = '<option value="">Tất cả phòng</option>';
  rooms.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = String(r.id);
    opt.textContent = (r.name || ("Phòng " + r.id)) + (r.location ? " • " + r.location : "");
    roomSel.appendChild(opt);
  });
  if (selectedRoom) roomSel.value = selectedRoom;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

const VN_WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function vnDateStrAddDays(dateStr, days) {
  const noon = vnWallClockToDate(dateStr, "12:00");
  return formatVnDateInput(new Date(noon.getTime() + days * 86400000));
}

function vnWeekdayIndex(inst) {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: VN_TZ,
    weekday: "short",
  }).format(inst);
  return VN_WD[wd] ?? 0;
}

/** Tuần lịch (Thứ 2 → Chủ nhật) theo ngày dương lịch Việt Nam. */
function weekRangeMondayVn(ref) {
  const ds = formatVnDateInput(ref);
  const diffToMon = (vnWeekdayIndex(ref) + 6) % 7;
  const monStr = vnDateStrAddDays(ds, -diffToMon);
  const sunStr = vnDateStrAddDays(monStr, 6);
  const monday = vnWallClockToDate(monStr, "00:00");
  const sundayEnd = new Date(vnWallClockToDate(sunStr, "00:00").getTime() + 86400000 - 1);
  return { monday, sunday: sundayEnd, monStr, sunStr };
}

function bookingInCalendarView(b) {
  let s;
  let e;
  try {
    s = new Date(b.start_at);
    e = new Date(b.end_at);
  } catch (_) {
    return false;
  }
  if (DASH.calendarMode === "day") {
    const ds = formatVnDateInput(DASH.calendarBaseDate);
    const sd = vnWallClockToDate(ds, "00:00");
    const ed = new Date(vnWallClockToDate(ds, "00:00").getTime() + 86400000);
    return s < ed && e > sd;
  }
  const { monday, sunday } = weekRangeMondayVn(DASH.calendarBaseDate);
  const weekEnd = new Date(sunday.getTime() + 1);
  return s < weekEnd && e > monday;
}

function getFilteredRooms() {
  const q = DASH.filterText.trim().toLowerCase();
  return DASH.rooms.filter((r) => matchTextRoom(r, q));
}

function getFilteredBookings() {
  const roomIds = new Set(getFilteredRooms().map((r) => r.id));
  // Lịch hiển thị trên dashboard của user: chỉ lấy cuộc họp của chính mình.
  return DASH.myBookings.filter((b) => {
    if (b.status !== "active") return false;
    if (!roomIds.has(b.room_id)) return false;
    return bookingInCalendarView(b);
  });
}

function renderStats() {
  const rooms = getFilteredRooms();
  // Thống kê trên dashboard của user: chỉ tính theo cuộc họp của chính mình.
  const bookingsForStats = DASH.myBookings.filter((b) => {
    if (b.status !== "active") return false;
    if (!rooms.some((r) => r.id === b.room_id)) return false;
    return true;
  });
  const ref = getVnRef();

  const todayStart = startOfVnDayForRef(ref);
  const todayEnd = endOfVnDayForRef(ref);

  const todays = bookingsForStats.filter((b) => {
    const s = new Date(b.start_at);
    const e = new Date(b.end_at);
    return s < todayEnd && e > todayStart;
  });
  const next7End = new Date(ref.getTime() + 7 * 24 * 60 * 60 * 1000);
  const next7 = bookingsForStats.filter((b) => {
    const s = new Date(b.start_at);
    return s >= ref && s <= next7End;
  });
  const ymRef = vnYearMonthKey(ref);
  const thisMonth = bookingsForStats.filter((b) => {
    const s = new Date(b.start_at);
    return vnYearMonthKey(s) === ymRef;
  });

  if ($("statTodayMyMeetings")) $("statTodayMyMeetings").textContent = String(todays.length);
  if ($("statUpcomingMyMeetings")) $("statUpcomingMyMeetings").textContent = String(next7.length);
  if ($("statMonthMyBookings")) $("statMonthMyBookings").textContent = String(thisMonth.length);

  let topRoom = "Chưa có dữ liệu";
  const counts = {};
  bookingsForStats.forEach((b) => {
    counts[b.room_id] = (counts[b.room_id] || 0) + 1;
  });
  let topId = null;
  let topCount = 0;
  Object.keys(counts).forEach((id) => {
    if (counts[id] > topCount) {
      topCount = counts[id];
      topId = Number(id);
    }
  });
  if (topId != null) {
    const room = rooms.find((r) => r.id === topId);
    topRoom = room ? room.name : "Phòng " + topId;
  }
  if ($("statTopRoom")) $("statTopRoom").textContent = topRoom;
}

function renderRoomsOverview() {
  const tableBody = $("roomsQuickBody");
  const empty = $("roomsQuickEmpty");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const rooms = getFilteredRooms();
  if (empty) empty.classList.toggle("hidden", rooms.length > 0);

  rooms.forEach((r) => {
    const ref = getVnRef();
    // Trạng thái "Đang sử dụng" trên dashboard của user: theo lịch của chính mình.
    const hasActive = DASH.myBookings.some((b) => {
      if (b.room_id !== r.id || b.status !== "active") return false;
      const s = new Date(b.start_at);
      const e = new Date(b.end_at);
      return s <= ref && ref <= e;
    });
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50";
    const imgUrl = r.image_url && String(r.image_url).trim();
    const thumb = imgUrl
      ? '<img src="' +
        imgUrl.replace(/"/g, "&quot;") +
        '" alt="" class="h-10 w-14 rounded-lg object-cover border border-slate-200 bg-slate-100" loading="lazy" onerror="this.style.display=\'none\'" />'
      : '<span class="inline-flex h-10 w-14 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[10px] text-slate-400">—</span>';
    tr.innerHTML =
      '<td class="px-4 py-3 align-middle">' +
      thumb +
      "</td>" +
      '<td class="px-4 py-3 text-xs text-slate-700">' +
      r.name +
      "</td>" +
      '<td class="px-4 py-3 text-xs text-slate-500">' +
      r.location +
      "</td>" +
      '<td class="px-4 py-3 text-xs text-slate-500">' +
      (r.capacity || 0) +
      " người</td>" +
      '<td class="px-4 py-3 text-xs font-medium ' +
      (hasActive ? "text-rose-600" : "text-emerald-600") +
      '">' +
      (hasActive ? "Đang sử dụng" : "Đang trống") +
      "</td>";
    tableBody.appendChild(tr);
  });
}

function updateCalendarRangeLabel() {
  const label = $("calendarRangeLabel");
  if (!label) return;
  if (DASH.calendarMode === "day") {
    label.textContent = new Intl.DateTimeFormat("vi-VN", {
      timeZone: VN_TZ,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    }).format(DASH.calendarBaseDate);
  } else {
    const { monStr, sunStr } = weekRangeMondayVn(DASH.calendarBaseDate);
    const fmt = new Intl.DateTimeFormat("vi-VN", {
      timeZone: VN_TZ,
      day: "2-digit",
      month: "2-digit",
    });
    label.textContent =
      fmt.format(vnWallClockToDate(monStr, "12:00")) +
      " – " +
      fmt.format(vnWallClockToDate(sunStr, "12:00"));
  }
}

function updateCalModeStyles() {
  const dayBtn = $("btnCalDay");
  const weekBtn = $("btnCalWeek");
  const active =
    "px-3 py-1.5 rounded-lg border border-slate-900 bg-slate-900 text-white text-xs font-medium shadow-sm";
  const idle =
    "px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50";
  if (dayBtn) dayBtn.className = DASH.calendarMode === "day" ? active : idle;
  if (weekBtn) weekBtn.className = DASH.calendarMode === "week" ? active : idle;
}

function renderCalendar() {
  const box = $("calendarGrid");
  if (!box) return;
  box.innerHTML = "";

  const bookings = getFilteredBookings()
    .slice()
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  const rooms = DASH.rooms;

  if (!bookings.length) {
    box.innerHTML =
      '<p class="text-xs text-slate-500">Không có cuộc họp trong khung ' +
      (DASH.calendarMode === "day" ? "ngày" : "tuần") +
      " này (hoặc chưa có lịch).</p>";
    return;
  }

  bookings.slice(0, 20).forEach((b) => {
    const room = rooms.find((r) => r.id === b.room_id);
    const row = document.createElement("div");
    row.className =
      "rounded-xl border border-slate-200 bg-white p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2";
    const s = new Date(b.start_at);
    const e = new Date(b.end_at);
    row.innerHTML =
      '<div><p class="text-sm font-semibold text-slate-900">' +
      (b.title || "Cuộc họp") +
      "</p>" +
      '<p class="text-xs text-slate-500">' +
      (room ? room.name : "Phòng " + b.room_id) +
      "</p></div>" +
      '<p class="text-xs text-slate-600 whitespace-nowrap">' +
      formatVnTimeRange(s, e) +
      "</p>";
    box.appendChild(row);
  });
}

function renderMyMeetings() {
  const container = $("myMeetingsList");
  if (!container) return;
  container.innerHTML = "";
  const items = DASH.myBookings
    .slice()
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  if (!items.length) {
    container.innerHTML =
      '<p class="text-xs text-slate-600">Bạn chưa có cuộc họp nào. Mở <strong>Phòng khả dụng</strong> và bấm <strong>Đặt phòng này</strong> trên thẻ phòng.</p>';
    return;
  }
  items.forEach((b) => {
    const room = DASH.rooms.find((r) => r.id === b.room_id);
    const row = document.createElement("div");
    row.className =
      "rounded-2xl border border-slate-200 bg-white px-3 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3";
    const s = new Date(b.start_at);
    const e = new Date(b.end_at);
    const meta =
      formatVnTimeRange(s, e) +
      " · " +
      (room ? room.name : "Phòng " + b.room_id);
    row.innerHTML =
      '<div class="flex flex-col gap-1">' +
      '<p class="text-sm font-semibold text-slate-900">' +
      (b.title || "Cuộc họp") +
      "</p>" +
      '<p class="text-xs text-slate-500">' +
      meta +
      "</p>" +
      '<p class="text-xs text-slate-400">Thanh toán: ' +
      formatPaymentLabel(b.payment_method, b.payment_channel) +
      "</p>" +
      '<p class="text-xs text-slate-400">Trạng thái: ' +
      (b.status === "active" ? "Đang hiệu lực" : "Đã hủy") +
      "</p></div>";
    const actions = document.createElement("div");
    actions.className = "flex items-center gap-2 sm:justify-end";

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className =
      "px-3 py-1.5 rounded-full border border-slate-300 text-xs text-slate-700 hover:bg-slate-100 whitespace-nowrap";
    viewBtn.textContent = "Xem chi tiết";
    viewBtn.addEventListener("click", function () {
      openBookingDetailModal(b.id);
    });
    actions.appendChild(viewBtn);

    if (b.status === "active") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "px-3 py-1.5 rounded-full border border-slate-300 text-xs text-slate-700 hover:bg-slate-100 whitespace-nowrap";
      btn.textContent = "Hủy đặt";
      btn.addEventListener("click", async function () {
        if (!confirm("Hủy cuộc họp này?")) return;
        try {
          if (typeof api === "function") {
            await api("/bookings/" + b.id + "/cancel", { method: "POST" });
          } else {
            throw new Error("Thiếu api()");
          }
          await loadData();
        } catch (err) {
          alert("Không hủy được: " + (err && err.message ? err.message : "Lỗi"));
        }
      });
      actions.appendChild(btn);
    }
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function showBookingDetailModal() {
  const m = $("bookingDetailModal");
  if (!m) return;
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function hideBookingDetailModal() {
  const m = $("bookingDetailModal");
  if (!m) return;
  m.classList.add("hidden");
  m.classList.remove("flex");
}

function openBookingDetailModal(bookingId) {
  const bid = bookingId != null ? Number(bookingId) : NaN;
  const b = Number.isFinite(bid) ? DASH.myBookings.find((x) => x.id === bid) : null;
  if (!b) {
    alert("Không tìm thấy cuộc họp để xem chi tiết.");
    return;
  }

  const room = DASH.rooms.find((r) => r.id === b.room_id);
  const s = new Date(b.start_at);
  const e = new Date(b.end_at);
  const timeStr = formatVnTimeRange(s, e);

  if ($("detailMeetingTitle")) $("detailMeetingTitle").textContent = b.title || "Cuộc họp";
  if ($("detailRoom")) $("detailRoom").textContent = room ? room.name : "Phòng " + b.room_id;
  if ($("detailTime")) $("detailTime").textContent = timeStr;
  if ($("detailStatus")) {
    $("detailStatus").textContent = b.status === "active" ? "Đang hiệu lực" : "Đã hủy";
    $("detailStatus").className =
      "text-xs font-medium " + (b.status === "active" ? "text-emerald-700" : "text-slate-500");
  }
  if ($("detailParticipants")) {
    $("detailParticipants").textContent =
      b.participant_count != null && !Number.isNaN(Number(b.participant_count))
        ? String(b.participant_count) + " người"
        : "—";
  }
  if ($("detailNotes")) {
    const notes = String(b.notes || "").trim();
    $("detailNotes").textContent = notes ? notes : "—";
  }
  if ($("detailPayment")) {
    $("detailPayment").textContent = formatPaymentLabel(b.payment_method, b.payment_channel);
  }

  showBookingDetailModal();
}

/** Khung giờ đang lọc ở tab Phòng khả dụng (null nếu chưa hợp lệ). */
function getAvailableRoomSlotRange() {
  const d = $("availFilterDate");
  const t0 = $("availFilterStart");
  const t1 = $("availFilterEnd");
  if (!d || !t0 || !t1) return null;
  const ds = d.value;
  const a = readVnTimeInput(t0) || normalizeVnTimeStr(t0.value);
  const b = readVnTimeInput(t1) || normalizeVnTimeStr(t1.value);
  if (!ds || !a || !b) return null;
  const start = vnWallClockToDate(ds, a);
  const end = vnWallClockToDate(ds, b);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return null;
  return { start: start, end: end, dateStr: ds, startStr: a, endStr: b };
}

function roomHasBookingInSlot(roomId, slotStart, slotEnd) {
  return DASH.bookings.some(function (b) {
    if (b.room_id !== roomId || b.status !== "active") return false;
    const bs = new Date(b.start_at);
    const be = new Date(b.end_at);
    return bs < slotEnd && be > slotStart;
  });
}

function updateAvailSlotSummary() {
  const el = $("availSlotSummary");
  if (!el) return;
  const rng = getAvailableRoomSlotRange();
  if (!rng) {
    el.textContent = "Chọn đủ ngày và giờ (bắt đầu phải trước giờ kết thúc).";
    return;
  }
  el.textContent =
    "Đang kiểm tra (GMT+7): " +
    formatVnDateTime(rng.start) +
    " → " +
    formatVnTime(rng.end);
}

function renderAvailableRooms() {
  const grid = $("availableRoomsGrid");
  if (!grid) return;
  grid.innerHTML = "";
  updateAvailSlotSummary();

  const rooms = getAvailableRoomsByUiFilters();
  if (!rooms.length) {
    grid.innerHTML =
      '<p class="text-xs text-slate-600">Không có phòng phù hợp (hoặc chưa có phòng trong hệ thống).</p>';
    return;
  }

  const slot = getAvailableRoomSlotRange();
  if (!slot) {
    grid.innerHTML =
      '<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Chọn đủ <strong>ngày</strong> và <strong>khung giờ</strong> (bắt đầu &lt; kết thúc) phía trên để xem phòng còn trống hay đã đặt.</p>';
    return;
  }

  // Yêu cầu: phòng đã có lịch trùng giờ thì KHÔNG HIỂN THỊ trong danh sách "Phòng khả dụng".
  const availableRooms = rooms.filter((r) => !roomHasBookingInSlot(r.id, slot.start, slot.end));
  if (!availableRooms.length) {
    grid.innerHTML =
      '<p class="text-xs text-slate-600">Không còn phòng trống trong khung giờ này.</p>';
    return;
  }

  availableRooms.forEach((r) => {
    const card = document.createElement("div");
    card.className =
      "rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col";
    const imgUrl = r.image_url && String(r.image_url).trim();
    const media = document.createElement("div");
    if (imgUrl) {
      media.className = "relative w-full aspect-[16/10] bg-slate-100 shrink-0";
      const im = document.createElement("img");
      im.src = imgUrl;
      im.alt = r.name || "Phòng";
      im.className = "h-full w-full object-cover";
      im.loading = "lazy";
      im.onerror = function () {
        media.classList.add("hidden");
      };
      media.appendChild(im);
      card.appendChild(media);
    }
    const body = document.createElement("div");
    body.className = "p-4 flex flex-col gap-2 flex-1";
    body.innerHTML =
      '<p class="text-sm font-semibold text-slate-900">' +
      r.name +
      "</p>" +
      '<p class="text-xs text-slate-500">' +
      r.location +
      "</p>" +
      '<p class="text-xs text-slate-500">Sức chứa: ' +
      (r.capacity || 0) +
      " người</p>" +
      (Number(r.price) > 0
        ? '<p class="text-xs font-medium text-slate-800">' +
          Number(r.price).toLocaleString("vi-VN") +
          " ₫ / giờ</p>"
        : "");
    const status = document.createElement("p");
    status.className = "text-[11px] font-medium text-emerald-600";
    status.textContent = "Còn trống — có thể đặt";
    body.appendChild(status);
    const bookBtn = document.createElement("button");
    bookBtn.type = "button";
    bookBtn.className =
      "mt-1 inline-flex justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800";
    bookBtn.textContent = "Đặt phòng này";
    bookBtn.addEventListener("click", function () {
      openBookingModal(r.id);
    });
    body.appendChild(bookBtn);
    card.appendChild(body);
    grid.appendChild(card);
  });
}

function renderSyncInfo() {
  const el = $("dashSyncInfo");
  if (!el) return;
  if (!DASH.lastSync) {
    el.textContent = "";
    return;
  }
  el.textContent =
    "Lần tải (GMT+7): " +
    new Intl.DateTimeFormat("vi-VN", {
      timeZone: VN_TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(DASH.lastSync);
}

function renderAll() {
  renderStats();
  renderRoomsOverview();
  renderCalendar();
  renderMyMeetings();
  renderAvailableRooms();
  renderSyncInfo();
}

function initFilterUi() {
  const search = $("quickSearch");
  if (search) {
    search.addEventListener("input", function () {
      DASH.filterText = String(search.value || "");
      renderAll();
    });
  }

  const vnD = $("vnRefDate");
  const vnT = $("vnRefTime");
  const nowRef = new Date();
  if (vnD && !vnD.value) vnD.value = formatVnDateInput(nowRef);
  if (vnT && !vnT.value) vnT.value = formatVnTimeInput(nowRef);
  function onVnRefChange() {
    renderAll();
  }
  if (vnD) {
    vnD.addEventListener("change", onVnRefChange);
    vnD.addEventListener("input", onVnRefChange);
  }
  if (vnT) {
    vnT.addEventListener("change", onVnRefChange);
    vnT.addEventListener("input", onVnRefChange);
  }

  const btn = $("btnDashRefresh");
  if (btn) btn.addEventListener("click", loadData);

  function doLogout() {
    if (typeof clearUserSession === "function") clearUserSession();
    else setToken("");
    window.location.href = "./login.html";
  }
  if ($("btnHeaderLogout")) {
    $("btnHeaderLogout").addEventListener("click", doLogout);
  }
}

function initAvailableSlotFilter() {
  const now = new Date();
  const dateEl = $("availFilterDate");
  if (dateEl && !dateEl.value) dateEl.value = formatVnDateInput(now);
  const sEl = $("availFilterStart");
  if (sEl && !sEl.value) sEl.value = "09:00";
  const eEl = $("availFilterEnd");
  if (eEl && !eEl.value) eEl.value = "10:00";
  [dateEl, sEl, eEl].forEach(function (el) {
    if (!el) return;
    el.addEventListener("change", function () {
      renderAvailableRooms();
    });
    el.addEventListener("input", function () {
      renderAvailableRooms();
    });
  });

  const floorSel = $("availFilterFloor");
  const roomSel = $("availFilterRoom");
  [floorSel, roomSel].forEach(function (el) {
    if (!el) return;
    el.addEventListener("change", function () {
      renderAvailableRooms();
    });
  });
}

function initCalendarNav() {
  if ($("btnCalDay")) {
    $("btnCalDay").addEventListener("click", function () {
      DASH.calendarMode = "day";
      updateCalModeStyles();
      updateCalendarRangeLabel();
      renderAll();
    });
  }
  if ($("btnCalWeek")) {
    $("btnCalWeek").addEventListener("click", function () {
      DASH.calendarMode = "week";
      updateCalModeStyles();
      updateCalendarRangeLabel();
      renderAll();
    });
  }
  if ($("btnCalPrev")) {
    $("btnCalPrev").addEventListener("click", function () {
      const d = new Date(DASH.calendarBaseDate);
      if (DASH.calendarMode === "day") d.setDate(d.getDate() - 1);
      else d.setDate(d.getDate() - 7);
      DASH.calendarBaseDate = d;
      updateCalendarRangeLabel();
      renderAll();
    });
  }
  if ($("btnCalNext")) {
    $("btnCalNext").addEventListener("click", function () {
      const d = new Date(DASH.calendarBaseDate);
      if (DASH.calendarMode === "day") d.setDate(d.getDate() + 1);
      else d.setDate(d.getDate() + 7);
      DASH.calendarBaseDate = d;
      updateCalendarRangeLabel();
      renderAll();
    });
  }
}

function stopSupportPoll() {
  if (DASH.supportPollTimer) {
    clearInterval(DASH.supportPollTimer);
    DASH.supportPollTimer = null;
  }
}

function supportCategoryLabel(key) {
  return SUPPORT_CATEGORY_LABELS[key] || key || "—";
}

function supportStatusLabel(st) {
  return SUPPORT_STATUS_LABELS[st] || st || "—";
}

function formatSupportDt(iso) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: VN_TZ,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch (_) {
    return String(iso || "");
  }
}

function fillSupportRoomSelect() {
  const sel = $("supportRoomId");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Không chọn phòng —</option>';
  DASH.rooms.forEach(function (r) {
    const opt = document.createElement("option");
    opt.value = String(r.id);
    opt.textContent = (r.name || "Phòng " + r.id) + (r.location ? " · " + r.location : "");
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

function updateSupportNavBadge() {
  const badge = $("navSupportBadge");
  if (!badge) return;
  const open = DASH.supportTickets.filter(function (t) {
    return t.status === "open" || t.status === "in_progress" || t.status === "reopened";
  }).length;
  if (open > 0) {
    badge.textContent = open > 99 ? "99+" : String(open);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

async function loadSupportTickets() {
  try {
    const items = await api("/tickets?mine=1");
    DASH.supportTickets = Array.isArray(items) ? items : [];
    updateSupportNavBadge();
    renderSupportTicketList();
    if (DASH.supportActiveId) {
      const active = DASH.supportTickets.find(function (t) {
        return t.id === DASH.supportActiveId;
      });
      if (active) updateSupportThreadActions(active);
      const still = !!active;
      if (!still) {
        DASH.supportActiveId = null;
        stopSupportPoll();
        if ($("supportThreadPanel")) $("supportThreadPanel").classList.add("hidden");
        if ($("supportThreadEmpty")) $("supportThreadEmpty").classList.remove("hidden");
      }
    }
  } catch (e) {
    console.warn("support tickets", e);
  }
}

function renderSupportTicketList() {
  const list = $("supportTicketList");
  const empty = $("supportTicketListEmpty");
  if (!list) return;
  list.innerHTML = "";
  const items = DASH.supportTickets;
  if (empty) empty.classList.toggle("hidden", items.length > 0);
  items.forEach(function (t) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "w-full text-left rounded-xl border px-3 py-2.5 text-xs transition-colors " +
      (t.id === DASH.supportActiveId
        ? "border-emerald-500 bg-emerald-50"
        : "border-slate-200 bg-white hover:bg-slate-50");
    btn.innerHTML =
      '<p class="font-semibold text-slate-900 truncate">' +
      (t.subject || "Yêu cầu #" + t.id) +
      "</p>" +
      '<p class="text-slate-500 mt-0.5">' +
      supportCategoryLabel(t.category) +
      (t.room_name ? " · " + t.room_name : "") +
      "</p>" +
      '<p class="mt-1"><span class="font-medium">' +
      supportStatusLabel(t.status) +
      "</span> · " +
      formatSupportDt(t.created_at) +
      "</p>";
    btn.addEventListener("click", function () {
      openSupportTicket(t.id);
    });
    list.appendChild(btn);
  });
}

function getSupportUserId() {
  const token = typeof getToken === "function" ? getToken() : "";
  const payload = typeof parseJwtPayload === "function" ? parseJwtPayload(token) : null;
  if (!payload || payload.sub == null) return null;
  const id = parseInt(String(payload.sub), 10);
  return Number.isNaN(id) ? null : id;
}

function supportTicketDeletable(status) {
  return status === "resolved" || status === "closed";
}

function supportCanDeleteComment(ticket, comment) {
  if (!ticket || !comment || !comment.id) return false;
  const uid = getSupportUserId();
  const isMine = uid != null && parseInt(comment.author_id, 10) === uid;
  return isMine && supportTicketDeletable(ticket.status);
}

function updateSupportThreadActions(ticket) {
  const wrap = $("supportThreadActions");
  const btnDone = $("btnSupportConfirmDone");
  const btnDel = $("btnSupportDeleteTicket");
  const replyWrap = $("supportReplyInput") && $("supportReplyInput").closest("div");
  if (!ticket || !wrap) return;
  wrap.classList.remove("hidden");
  const st = ticket.status || "open";
  const deletable = supportTicketDeletable(st);
  if (btnDone) {
    btnDone.classList.toggle("hidden", st !== "resolved");
  }
  if (btnDel) {
    btnDel.classList.toggle("hidden", !deletable);
  }
  const closed = st === "closed";
  if ($("supportReplyInput")) $("supportReplyInput").disabled = closed;
  if ($("btnSupportReply")) $("btnSupportReply").disabled = closed;
  if (replyWrap && closed) {
    replyWrap.classList.add("opacity-60");
  } else if (replyWrap) {
    replyWrap.classList.remove("opacity-60");
  }
}

function renderSupportChat(ticket, comments) {
  const chat = $("supportChat");
  if (!chat) return;
  chat.innerHTML = "";
  const meBubble = document.createElement("div");
  meBubble.className = "support-bubble support-bubble--me";
  meBubble.innerHTML =
    '<div class="support-bubble-meta">Bạn · ' +
    formatSupportDt(ticket.created_at) +
    "</div>" +
    "<div>" +
    (ticket.description || "").replace(/</g, "&lt;") +
    "</div>";
  chat.appendChild(meBubble);

  (comments || []).forEach(function (c) {
    const isAdmin = String(c.author_role || "").toLowerCase() === "admin";
    const div = document.createElement("div");
    div.className =
      "support-bubble " + (isAdmin ? "support-bubble--admin" : "support-bubble--me");
    const who = isAdmin ? "Quản trị" : c.author_name || "Bạn";
    const head = document.createElement("div");
    head.className = "support-bubble-head";
    const meta = document.createElement("div");
    meta.className = "support-bubble-meta";
    meta.textContent = who + " · " + formatSupportDt(c.created_at);
    head.appendChild(meta);
    if (supportCanDeleteComment(ticket, c)) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "support-bubble-del";
      delBtn.textContent = "Xóa";
      delBtn.title = "Xóa tin nhắn";
      delBtn.addEventListener("click", function () {
        deleteSupportComment(c.id);
      });
      head.appendChild(delBtn);
    }
    const body = document.createElement("div");
    body.textContent = c.body || "";
    div.appendChild(head);
    div.appendChild(body);
    chat.appendChild(div);
    if (c.id > DASH.supportLastCommentId) DASH.supportLastCommentId = c.id;
  });
  chat.scrollTop = chat.scrollHeight;
  updateSupportThreadActions(ticket);
}

async function loadSupportThread(ticketId) {
  const ticket = DASH.supportTickets.find(function (t) {
    return t.id === ticketId;
  });
  if (!ticket) return;
  try {
    const comments = await api("/tickets/" + ticketId + "/comments");
    renderSupportChat(ticket, comments);
  } catch (e) {
    console.warn("support thread", e);
  }
}

async function confirmSupportDone() {
  if (!DASH.supportActiveId) return;
  if (!confirm("Xác nhận sự cố đã được xử lý xong?")) return;
  try {
    await api("/tickets/" + DASH.supportActiveId, {
      method: "PATCH",
      body: { status: "closed" },
    });
    await loadSupportTickets();
    const t = DASH.supportTickets.find(function (x) {
      return x.id === DASH.supportActiveId;
    });
    if (t) updateSupportThreadActions(t);
    await loadSupportThread(DASH.supportActiveId);
  } catch (e) {
    alert("Không cập nhật được: " + (e && e.message ? e.message : "Lỗi"));
  }
}

async function deleteSupportTicket() {
  if (!DASH.supportActiveId) return;
  const t = DASH.supportTickets.find(function (x) {
    return x.id === DASH.supportActiveId;
  });
  if (!t || !supportTicketDeletable(t.status)) {
    alert("Chỉ xóa được yêu cầu đã xử lý hoặc đã đóng.");
    return;
  }
  if (!confirm("Xóa vĩnh viễn yêu cầu này và toàn bộ hội thoại?")) return;
  const id = DASH.supportActiveId;
  try {
    await api("/tickets/" + id, { method: "DELETE" });
    DASH.supportActiveId = null;
    stopSupportPoll();
    if ($("supportThreadPanel")) $("supportThreadPanel").classList.add("hidden");
    if ($("supportThreadEmpty")) $("supportThreadEmpty").classList.remove("hidden");
    if ($("supportThreadActions")) $("supportThreadActions").classList.add("hidden");
    await loadSupportTickets();
  } catch (e) {
    alert("Không xóa được: " + (e && e.message ? e.message : "Lỗi"));
  }
}

async function deleteSupportComment(commentId) {
  if (!DASH.supportActiveId || !commentId) return;
  if (!confirm("Xóa tin nhắn này?")) return;
  try {
    await api(
      "/tickets/" + DASH.supportActiveId + "/comments/" + commentId,
      { method: "DELETE" }
    );
    await loadSupportThread(DASH.supportActiveId);
  } catch (e) {
    alert("Không xóa được: " + (e && e.message ? e.message : "Lỗi"));
  }
}

function startSupportPoll(ticketId) {
  stopSupportPoll();
  DASH.supportPollTimer = setInterval(function () {
    if (DASH.supportActiveId !== ticketId) return;
    loadSupportThread(ticketId);
    loadSupportTickets();
  }, 8000);
}

function openSupportTicket(ticketId) {
  DASH.supportActiveId = ticketId;
  DASH.supportLastCommentId = 0;
  const ticket = DASH.supportTickets.find(function (t) {
    return t.id === ticketId;
  });
  if (!ticket) return;
  if ($("supportThreadEmpty")) $("supportThreadEmpty").classList.add("hidden");
  if ($("supportThreadPanel")) $("supportThreadPanel").classList.remove("hidden");
  if ($("supportThreadTitle")) $("supportThreadTitle").textContent = ticket.subject || "Yêu cầu #" + ticket.id;
  if ($("supportThreadMeta")) {
    $("supportThreadMeta").textContent =
      supportCategoryLabel(ticket.category) +
      (ticket.room_name ? " · " + ticket.room_name : "") +
      " · " +
      supportStatusLabel(ticket.status);
  }
  renderSupportTicketList();
  updateSupportThreadActions(ticket);
  loadSupportThread(ticketId);
  startSupportPoll(ticketId);
}

async function submitSupportTicket() {
  const category = ($("supportCategory") && $("supportCategory").value) || "khac";
  const subject = ($("supportSubject") && $("supportSubject").value.trim()) || "";
  const description = ($("supportDescription") && $("supportDescription").value.trim()) || "";
  const roomRaw = $("supportRoomId") && $("supportRoomId").value;
  const room_id = roomRaw ? parseInt(roomRaw, 10) : null;
  if (!subject || !description) {
    alert("Nhập tiêu đề và mô tả chi tiết.");
    return;
  }
  const priority = category === "thiet_bi_hong" ? "high" : "medium";
  const btn = $("btnSupportSubmit");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang gửi...";
  }
  try {
    const created = await api("/tickets", {
      method: "POST",
      body: {
        subject: subject,
        description: description,
        priority: priority,
        category: category,
        room_id: room_id && !Number.isNaN(room_id) ? room_id : null,
      },
    });
    if ($("supportSubject")) $("supportSubject").value = "";
    if ($("supportDescription")) $("supportDescription").value = "";
    await loadSupportTickets();
    if (created && created.id) openSupportTicket(created.id);
    alert("Đã gửi yêu cầu hỗ trợ. Quản trị sẽ phản hồi trong hội thoại.");
  } catch (e) {
    alert("Không gửi được: " + (e && e.message ? e.message : "Lỗi"));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Gửi yêu cầu hỗ trợ";
    }
  }
}

async function sendSupportReply() {
  if (!DASH.supportActiveId) {
    alert("Chọn yêu cầu trước.");
    return;
  }
  const body = ($("supportReplyInput") && $("supportReplyInput").value.trim()) || "";
  if (!body) return;
  const btn = $("btnSupportReply");
  if (btn) btn.disabled = true;
  try {
    await api("/tickets/" + DASH.supportActiveId + "/comments", {
      method: "POST",
      body: { body: body },
    });
    if ($("supportReplyInput")) $("supportReplyInput").value = "";
    await loadSupportThread(DASH.supportActiveId);
    await loadSupportTickets();
  } catch (e) {
    alert("Không gửi được: " + (e && e.message ? e.message : "Lỗi"));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initSupportUi() {
  fillSupportRoomSelect();
  if ($("btnSupportSubmit")) {
    $("btnSupportSubmit").addEventListener("click", submitSupportTicket);
  }
  if ($("btnSupportReply")) {
    $("btnSupportReply").addEventListener("click", sendSupportReply);
  }
  if ($("btnSupportConfirmDone")) {
    $("btnSupportConfirmDone").addEventListener("click", confirmSupportDone);
  }
  if ($("btnSupportDeleteTicket")) {
    $("btnSupportDeleteTicket").addEventListener("click", deleteSupportTicket);
  }
}

function initNav() {
  Array.from(document.querySelectorAll(".nav-item")).forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-nav");
      if (view !== "support") stopSupportPoll();
      document.querySelectorAll(".nav-item").forEach((b) => {
        b.classList.remove("bg-slate-900", "text-emerald-400", "font-medium");
      });
      btn.classList.add("bg-slate-900", "text-emerald-400", "font-medium");
      ["dashboard", "my-meetings", "available-rooms", "support", "profile"].forEach((id) => {
        const el = $("view-" + id);
        if (!el) return;
        const show = id === view;
        el.classList.toggle("hidden", !show);
        el.classList.toggle("view-enter", show);
      });
      setTimeout(function () {
        document.querySelectorAll("main > section.view-enter").forEach(function (sec) {
          sec.classList.remove("view-enter");
        });
      }, 400);
      const mainEl = document.querySelector("main");
      if (mainEl) mainEl.scrollTo({ top: 0, behavior: "smooth" });
      if (view === "profile" && typeof loadProfileForm === "function") loadProfileForm();
      if (view === "support") {
        fillSupportRoomSelect();
        loadSupportTickets();
      }
      renderAll();
    });
  });

  if ($("btnSidebarLogout")) {
    $("btnSidebarLogout").addEventListener("click", () => {
      if (typeof clearUserSession === "function") clearUserSession();
      else setToken("");
      window.location.href = "./login.html";
    });
  }
}

function showBookingModal() {
  resetBookingPaymentForm();
  ensurePaymentInfo();
  const m = $("bookingModal");
  if (!m) return;
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function hideBookingModal() {
  const m = $("bookingModal");
  if (!m) return;
  m.classList.add("hidden");
  m.classList.remove("flex");
}

function setModalRoomContext(roomId) {
  const hid = $("modalRoomId");
  const nameEl = $("modalRoomName");
  const imgEl = $("modalRoomImage");
  const partIn = $("modalParticipants");
  const hint = $("modalCapacityHint");
  const rid = roomId != null ? Number(roomId) : NaN;
  const room = Number.isFinite(rid) ? DASH.rooms.find(function (r) { return r.id === rid; }) : null;
  if (hid) hid.value = room ? String(room.id) : "";
  if (nameEl) nameEl.textContent = room ? room.name : "—";
  if (imgEl) {
    const u = room && room.image_url && String(room.image_url).trim();
    if (u) {
      imgEl.src = u;
      imgEl.alt = room.name || "Phòng";
      imgEl.classList.remove("hidden");
      imgEl.onerror = function () {
        imgEl.classList.add("hidden");
      };
    } else {
      imgEl.removeAttribute("src");
      imgEl.classList.add("hidden");
    }
  }
  if (room && partIn) {
    const cap = Number(room.capacity) || 0;
    if (cap > 0) {
      partIn.max = String(cap);
      partIn.setAttribute("max", String(cap));
    } else {
      partIn.removeAttribute("max");
    }
  }
  if (hint) {
    hint.textContent = room
      ? "Sức chứa tối đa: " +
        (Number(room.capacity) || 0) +
        " người — không đặt vượt quá (chỉnh số người tham gia cho phù hợp)."
      : "";
  }
}

function setDefaultModalTimes() {
  const d = $("modalDate");
  const st = $("modalStartTime");
  const et = $("modalEndTime");
  const now = new Date();
  if (d) d.value = formatVnDateInput(now);
  if (st) st.value = "09:00";
  if (et) et.value = "10:00";
  const title = $("modalMeetingTitle");
  if (title && !String(title.value || "").trim()) title.value = "Cuộc họp";
}

/** Đồng bộ modal đặt phòng với khung giờ đang lọc ở Phòng khả dụng. */
function applyAvailFilterToModal() {
  const rng = getAvailableRoomSlotRange();
  if (!rng) return false;
  const d = $("modalDate");
  const st = $("modalStartTime");
  const et = $("modalEndTime");
  if (d) d.value = rng.dateStr;
  if (st) st.value = rng.startStr;
  if (et) et.value = rng.endStr;
  const title = $("modalMeetingTitle");
  if (title && !String(title.value || "").trim()) title.value = "Cuộc họp";
  return true;
}

function openBookingModal(roomId) {
  setModalRoomContext(roomId);
  if (!applyAvailFilterToModal()) {
    setDefaultModalTimes();
  }
  showBookingModal();
}

async function submitBookingModal() {
  if (typeof isUserSessionValid === "function" && !isUserSessionValid()) {
    alert(
      "Bạn chưa đăng nhập hoặc phiên đã hết hạn. Vui lòng đăng nhập lại trước khi đặt phòng."
    );
    if (typeof handleApiUnauthorized === "function") {
      handleApiUnauthorized("Not authenticated");
    } else {
      window.location.href = "./login.html?redirect=dashboard.html&reason=session";
    }
    return;
  }
  const roomId = parseInt(($("modalRoomId") && $("modalRoomId").value) || "", 10);
  const dateStr = $("modalDate").value;
  const t0 = readVnTimeInput($("modalStartTime")) || normalizeVnTimeStr($("modalStartTime").value);
  const t1 = readVnTimeInput($("modalEndTime")) || normalizeVnTimeStr($("modalEndTime").value);
  const title = ($("modalMeetingTitle").value || "").trim() || "Cuộc họp";
  let notes = ($("modalNotes").value || "").trim();
  if (!roomId || Number.isNaN(roomId)) {
    alert("Thiếu phòng — hãy đặt từ thẻ phòng (Phòng khả dụng).");
    return;
  }
  const part = $("modalParticipants");
  let participantCount = null;
  if (part && String(part.value || "").trim() !== "") {
    participantCount = parseInt(String(part.value).trim(), 10);
    if (Number.isNaN(participantCount) || participantCount < 1) {
      alert("Số người tham gia phải là số nguyên ≥ 1.");
      return;
    }
  }
  const roomMeta = DASH.rooms.find(function (r) {
    return r.id === roomId;
  });
  const cap = roomMeta ? Number(roomMeta.capacity) || 0 : 0;
  if (participantCount != null && cap > 0 && participantCount > cap) {
    alert(
      'Phòng "' +
        (roomMeta.name || "") +
        '" chỉ có sức chứa tối đa ' +
        cap +
        " người. Bạn đang nhập " +
        participantCount +
        " người — hãy giảm xuống tối đa " +
        cap +
        " hoặc chọn phòng khác (admin có thể tăng sức chứa phòng trong quản trị)."
    );
    return;
  }
  if (part && part.value) {
    notes = (notes ? notes + "\n" : "") + "Số người dự kiến: " + String(part.value).trim();
  }
  if (!dateStr || !t0 || !t1) {
    alert("Chọn đủ ngày và giờ bắt đầu / kết thúc.");
    return;
  }
  if (!t0 || !t1) {
    alert("Nhập giờ theo định dạng 24h (ví dụ 09:00, 14:30) — giờ Việt Nam GMT+7.");
    return;
  }
  const start = vnWallClockToDate(dateStr, t0);
  const end = vnWallClockToDate(dateStr, t1);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    alert("Thời gian không hợp lệ (giờ kết thúc phải sau giờ bắt đầu).");
    return;
  }
  const payment = readBookingPaymentFromModal();
  if (!payment) {
    alert("Chọn phương thức chuyển khoản: MoMo hoặc Ngân hàng.");
    return;
  }
  if (payment.payment_method === "transfer") {
    const panel = $("modalQrPanel");
    if (panel && panel.classList.contains("hidden")) {
      alert("Chọn MoMo hoặc Ngân hàng để hiện mã QR thanh toán.");
      return;
    }
    notes =
      (notes ? notes + "\n" : "") +
      "Đã xác nhận chuyển khoản (" +
      (payment.payment_channel === "momo" ? "MoMo" : "Ngân hàng") +
      "). Nội dung CK: " +
      buildTransferMemo();
    const breakdown = getBookingPriceBreakdown();
    if (breakdown.valid && breakdown.total > 0) {
      notes +=
        "\nSố tiền: " +
        breakdown.total.toLocaleString("vi-VN") +
        " VND (" +
        breakdown.hourly.toLocaleString("vi-VN") +
        "/giờ × " +
        formatBookingHoursLabel(breakdown.hours) +
        " giờ)";
    } else if (breakdown.hourly > 0) {
      notes += "\nGiá phòng: " + breakdown.hourly.toLocaleString("vi-VN") + " VND/giờ";
    }
  }

  const payload = {
    room_id: roomId,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    title: title,
    notes: notes || "",
    payment_method: payment.payment_method,
  };
  if (payment.payment_channel) payload.payment_channel = payment.payment_channel;
  if (participantCount != null) payload.participant_count = participantCount;
  try {
    await api("/bookings", {
      method: "POST",
      body: payload,
    });
    hideBookingModal();
    await loadData();
    alert(
      payment.payment_method === "transfer"
        ? "Đặt phòng thành công. Hệ thống đã ghi nhận bạn đã chuyển khoản."
        : "Đặt phòng thành công."
    );
  } catch (e) {
    if (e && e.status === 401) return;
    var msg = e && e.message ? e.message : "Lỗi";
    if (String(msg).toLowerCase().indexOf("not authenticated") !== -1) {
      msg = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    }
    alert("Không đặt được: " + msg);
  }
}

async function loadProfileForm() {
  if (!$("profileNameInput")) return;
  try {
    const u = await api("/auth/me");
    DASH.me = u || null;
    $("profileNameInput").value = u.name || "";
    $("profileEmailInput").value = u.email || "";
    const r = String(u.role || "").toLowerCase();
    $("profileRole").textContent = "Vai trò: " + (r === "admin" ? "Quản trị" : "Khách hàng");
    $("profileRole").dataset.fromServer = "1";
    const initial = ((u.name || u.email || "U") + "").trim().charAt(0).toUpperCase();
    if ($("profileAvatarInitial")) $("profileAvatarInitial").textContent = initial;
    if ($("userAvatarInitial")) $("userAvatarInitial").textContent = initial;
    if ($("userNameLabel")) $("userNameLabel").textContent = u.name || "";
    if ($("userEmailLabel")) $("userEmailLabel").textContent = u.email || "";
    if ($("profileSaveMsg")) $("profileSaveMsg").textContent = "";
  } catch (e) {
    if ($("profileSaveMsg")) $("profileSaveMsg").textContent = "Không tải hồ sơ: " + (e && e.message ? e.message : "");
  }
}

async function saveProfileForm() {
  const name = ($("profileNameInput").value || "").trim();
  const pw = ($("profilePasswordNew").value || "").trim();
  const pw2 = ($("profilePasswordConfirm").value || "").trim();
  if (!name) {
    alert("Nhập họ tên.");
    return;
  }
  if (pw || pw2) {
    if (pw.length < 6) {
      alert("Mật khẩu mới tối thiểu 6 ký tự.");
      return;
    }
    if (pw !== pw2) {
      alert("Hai lần nhập mật khẩu không khớp.");
      return;
    }
  }
  const body = { name: name };
  if (pw) body.password = pw;
  try {
    const res = await api("/auth/me", { method: "PATCH", body: body });
    if (res.access_token) setToken(res.access_token);
    $("profilePasswordNew").value = "";
    $("profilePasswordConfirm").value = "";
    setUserInfoFromToken();
    await loadProfileForm();
    if ($("profileSaveMsg")) $("profileSaveMsg").textContent = "Đã lưu.";
  } catch (e) {
    alert("Không lưu được: " + (e && e.message ? e.message : ""));
  }
}

function initBookingModal() {
  const m = $("bookingModal");
  if (!m) return;
  if ($("btnCloseModal")) $("btnCloseModal").addEventListener("click", hideBookingModal);
  if ($("btnModalCancel")) $("btnModalCancel").addEventListener("click", hideBookingModal);
  if ($("btnModalConfirm")) $("btnModalConfirm").addEventListener("click", submitBookingModal);
  if ($("btnTransferSuccess")) {
    $("btnTransferSuccess").addEventListener("click", function () {
      const payment = readBookingPaymentFromModal();
      if (!payment || payment.payment_method !== "transfer") {
        alert("Chọn phương thức chuyển khoản và kênh MoMo hoặc Ngân hàng.");
        return;
      }
      const panel = $("modalQrPanel");
      if (panel && panel.classList.contains("hidden")) {
        alert("Chọn MoMo hoặc Ngân hàng để hiện mã QR.");
        return;
      }
      submitBookingModal();
    });
  }
  document.querySelectorAll('input[name="modalPaymentMethod"]').forEach(function (el) {
    el.addEventListener("change", updateTransferOptionsVisibility);
  });
  document.querySelectorAll('input[name="modalPaymentChannel"]').forEach(function (el) {
    el.addEventListener("change", updateTransferOptionsVisibility);
  });
  ["modalDate", "modalStartTime", "modalEndTime"].forEach(function (id) {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", function () {
      updateTransferPriceDisplay();
      renderTransferQrPanel();
    });
    el.addEventListener("input", function () {
      updateTransferPriceDisplay();
      renderTransferQrPanel();
    });
  });
  ensurePaymentInfo();
  m.addEventListener("click", function (ev) {
    if (ev.target === m) hideBookingModal();
  });
}

function initBookingDetailModal() {
  const m = $("bookingDetailModal");
  if (!m) return;
  if ($("btnCloseDetailModal")) $("btnCloseDetailModal").addEventListener("click", hideBookingDetailModal);
  if ($("btnDetailClose")) $("btnDetailClose").addEventListener("click", hideBookingDetailModal);
  m.addEventListener("click", function (ev) {
    if (ev.target === m) hideBookingDetailModal();
  });
}

function initProfileForm() {
  if ($("btnProfileSave")) $("btnProfileSave").addEventListener("click", saveProfileForm);
  if ($("btnProfileReload")) $("btnProfileReload").addEventListener("click", loadProfileForm);
}

setUserInfoFromToken();
initBell();
startBellPolling();
initBookingModal();
initBookingDetailModal();
initProfileForm();
initVnTimePickers();
initSupportUi();
initFilterUi();
initAvailableSlotFilter();
initCalendarNav();
initNav();
loadProfileForm();
loadData();
loadSupportTickets();
