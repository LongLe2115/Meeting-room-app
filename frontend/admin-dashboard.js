(function () {
  "use strict";

  function parseJwt(token) {
    try {
      var parts = token.split(".");
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    } catch (_) {
      return null;
    }
  }

  var token = getToken();
  var payload = token ? parseJwt(token) : null;
  if (!payload || payload.role !== "admin") {
    setToken(null);
    window.location.href = "./admin-login.html";
    return;
  }

  if (typeof initBackendCheck === "function") initBackendCheck();

  function toast(message, type) {
    var container = document.getElementById("toastContainer");
    if (!container) return;
    var el = document.createElement("div");
    el.className =
      "px-4 py-3 rounded-lg shadow-lg text-sm font-medium " +
      (type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white");
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  function roleText(role) {
    return { customer: "Khách hàng", admin: "Quản trị" }[role] || role;
  }

  var activeContactId = null;
  var adminSupportTickets = [];
  var adminSupportActiveId = null;
  var adminSupportPollTimer = null;

  var ADMIN_SUPPORT_CAT = {
    thiet_bi_hong: "Thiết bị hư",
    phong_co_van_de: "Phòng có vấn đề",
    khac: "Khác",
  };
  var ADMIN_SUPPORT_ST = {
    open: "Chờ xử lý",
    in_progress: "Đang xử lý",
    resolved: "Đã xử lý",
    closed: "Đã đóng",
    reopened: "Mở lại",
  };

  function showView(page) {
    if (page !== "support") stopAdminSupportPoll();
    ["Overview", "Users", "Bookings", "Rooms", "Contacts", "Support"].forEach(function (name) {
      var el = document.getElementById("view" + name);
      if (el) el.classList.toggle("hidden", name.toLowerCase() !== page);
    });
    document.querySelectorAll(".sidebar-link").forEach(function (link) {
      var active = link.getAttribute("data-page") === page;
      link.classList.toggle("text-white", active);
      link.classList.toggle("bg-white/10", active);
      link.classList.toggle("border-l-4", active);
      link.classList.toggle("border-amber-400", active);
      link.classList.toggle("text-slate-300", !active);
    });
    if (page === "overview") loadOverview();
    if (page === "users") loadUsers();
    if (page === "bookings") loadBookings();
    if (page === "rooms") loadRooms();
    if (page === "contacts") loadContacts();
    if (page === "support") loadAdminSupportTickets();
  }

  function stopAdminSupportPoll() {
    if (adminSupportPollTimer) {
      clearInterval(adminSupportPollTimer);
      adminSupportPollTimer = null;
    }
  }

  function fmtSupportDt(iso) {
    try {
      return new Date(iso).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return String(iso || "");
    }
  }

  function updateAdminSupportBadge() {
    var badge = document.getElementById("sidebarSupportBadge");
    var n = adminSupportTickets.filter(function (t) {
      return t.status === "open" || t.status === "reopened";
    }).length;
    if (badge) {
      if (n > 0) {
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.classList.remove("hidden");
      } else badge.classList.add("hidden");
    }
  }

  function loadAdminSupportTickets() {
    var body = document.getElementById("adminSupportTableBody");
    var empty = document.getElementById("adminSupportEmpty");
    var filter = document.getElementById("adminSupportFilter");
    if (!body) return;
    body.innerHTML =
      '<tr><td colspan="4" class="px-3 py-4 text-slate-500">Đang tải...</td></tr>';
    var q = filter && filter.value ? "?status_=" + encodeURIComponent(filter.value) : "";
    api("/tickets" + q)
      .then(function (items) {
        adminSupportTickets = Array.isArray(items) ? items : [];
        if (adminSupportActiveId) {
          var activeT = adminSupportTickets.find(function (t) {
            return t.id === adminSupportActiveId;
          });
          if (activeT) updateAdminSupportActions(activeT);
        }
        updateAdminSupportBadge();
        body.innerHTML = "";
        if (empty) empty.classList.toggle("hidden", adminSupportTickets.length > 0);
        adminSupportTickets.forEach(function (t) {
          var tr = document.createElement("tr");
          tr.className =
            "hover:bg-slate-50 cursor-pointer " +
            (t.id === adminSupportActiveId ? "bg-emerald-50" : "");
          tr.innerHTML =
            "<td class=\"px-3 py-2 text-slate-600\">#" +
            t.id +
            "</td>" +
            '<td class="px-3 py-2 text-slate-700">' +
            (t.requester_name || "User") +
            "<br><span class=\"text-xs text-slate-500\">" +
            (t.requester_email || "") +
            "</span></td>" +
            '<td class="px-3 py-2 text-slate-800">' +
            (t.subject || "") +
            "<br><span class=\"text-xs text-slate-500\">" +
            (ADMIN_SUPPORT_CAT[t.category] || t.category) +
            (t.room_name ? " · " + t.room_name : "") +
            "</span></td>" +
            '<td class="px-3 py-2 text-xs font-medium">' +
            (ADMIN_SUPPORT_ST[t.status] || t.status) +
            "</td>";
          tr._ticket = t;
          tr.addEventListener("click", function () {
            openAdminSupportTicket(t.id);
          });
          body.appendChild(tr);
        });
      })
      .catch(function (e) {
        body.innerHTML =
          '<tr><td colspan="4" class="px-3 py-4 text-red-600">' +
          (e.message || "Lỗi") +
          "</td></tr>";
      });
  }

  function adminSupportDeletable(status) {
    return status === "resolved" || status === "closed";
  }

  function updateAdminSupportActions(ticket) {
    var btnResolve = document.getElementById("btnAdminSupportResolve");
    var btnDel = document.getElementById("btnAdminSupportDelete");
    var reply = document.getElementById("adminSupportReply");
    var btnReply = document.getElementById("btnAdminSupportReply");
    if (!ticket) return;
    var st = ticket.status || "open";
    if (btnResolve) {
      btnResolve.classList.toggle("hidden", st === "resolved" || st === "closed");
    }
    if (btnDel) {
      btnDel.classList.toggle("hidden", !adminSupportDeletable(st));
    }
    var closed = st === "closed";
    if (reply) reply.disabled = closed;
    if (btnReply) btnReply.disabled = closed;
  }

  function renderAdminSupportChat(ticket, comments) {
    var chat = document.getElementById("adminSupportChat");
    if (!chat) return;
    chat.innerHTML = "";
    var first = document.createElement("div");
    first.className = "support-bubble support-bubble--user";
    first.innerHTML =
      '<div class="support-bubble-meta">' +
      (ticket.requester_name || "Khách") +
      " · " +
      fmtSupportDt(ticket.created_at) +
      "</div><div>" +
      (ticket.description || "").replace(/</g, "&lt;") +
      "</div>";
    chat.appendChild(first);
    (comments || []).forEach(function (c) {
      var isAdmin = String(c.author_role || "").toLowerCase() === "admin";
      var div = document.createElement("div");
      div.className =
        "support-bubble " + (isAdmin ? "support-bubble--admin" : "support-bubble--user");
      var head = document.createElement("div");
      head.className = "support-bubble-head";
      var meta = document.createElement("div");
      meta.className = "support-bubble-meta";
      meta.textContent =
        (c.author_name || (isAdmin ? "Admin" : "User")) +
        " · " +
        fmtSupportDt(c.created_at);
      head.appendChild(meta);
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "support-bubble-del";
      delBtn.textContent = "Xóa";
      delBtn.title = "Xóa tin nhắn";
      delBtn.addEventListener("click", function () {
        deleteAdminSupportComment(c.id);
      });
      head.appendChild(delBtn);
      var body = document.createElement("div");
      body.textContent = c.body || "";
      div.appendChild(head);
      div.appendChild(body);
      chat.appendChild(div);
    });
    chat.scrollTop = chat.scrollHeight;
    updateAdminSupportActions(ticket);
  }

  function loadAdminSupportThread(id) {
    var ticket = adminSupportTickets.find(function (t) {
      return t.id === id;
    });
    if (!ticket) return;
    api("/tickets/" + id + "/comments")
      .then(function (comments) {
        renderAdminSupportChat(ticket, comments);
      })
      .catch(function () {});
  }

  function startAdminSupportPoll(id) {
    stopAdminSupportPoll();
    adminSupportPollTimer = setInterval(function () {
      if (adminSupportActiveId !== id) return;
      loadAdminSupportThread(id);
      loadAdminSupportTickets();
    }, 8000);
  }

  function openAdminSupportTicket(id) {
    adminSupportActiveId = id;
    var ticket = adminSupportTickets.find(function (t) {
      return t.id === id;
    });
    if (!ticket) return;
    document.getElementById("adminSupportThreadEmpty").classList.add("hidden");
    document.getElementById("adminSupportThreadPanel").classList.remove("hidden");
    document.getElementById("adminSupportThreadTitle").textContent =
      ticket.subject || "Yêu cầu #" + ticket.id;
    document.getElementById("adminSupportThreadMeta").textContent =
      (ticket.requester_name || "") +
      " · " +
      (ticket.requester_email || "") +
      " · " +
      (ADMIN_SUPPORT_CAT[ticket.category] || "");
    var stSel = document.getElementById("adminSupportStatus");
    if (stSel) stSel.value = ticket.status || "open";
    updateAdminSupportActions(ticket);
    loadAdminSupportThread(id);
    startAdminSupportPoll(id);
    loadAdminSupportTickets();
  }

  function markAdminSupportResolved() {
    if (!adminSupportActiveId) return;
    api("/tickets/" + adminSupportActiveId, {
      method: "PATCH",
      body: { status: "resolved" },
    })
      .then(function (updated) {
        var idx = adminSupportTickets.findIndex(function (t) {
          return t.id === adminSupportActiveId;
        });
        if (idx >= 0 && updated) adminSupportTickets[idx] = updated;
        var stSel = document.getElementById("adminSupportStatus");
        if (stSel) stSel.value = "resolved";
        updateAdminSupportActions(updated || { status: "resolved" });
        loadAdminSupportTickets();
        toast("Đã đánh dấu xử lý xong.");
      })
      .catch(function (e) {
        toast(e.message || "Lỗi", "error");
      });
  }

  function deleteAdminSupportTicket() {
    if (!adminSupportActiveId) return;
    var ticket = adminSupportTickets.find(function (t) {
      return t.id === adminSupportActiveId;
    });
    if (!ticket || !adminSupportDeletable(ticket.status)) {
      toast("Chỉ xóa được yêu cầu đã xử lý hoặc đã đóng.", "error");
      return;
    }
    if (!confirm("Xóa vĩnh viễn yêu cầu và toàn bộ hội thoại?")) return;
    var id = adminSupportActiveId;
    api("/tickets/" + id, { method: "DELETE" })
      .then(function () {
        adminSupportActiveId = null;
        stopAdminSupportPoll();
        document.getElementById("adminSupportThreadPanel").classList.add("hidden");
        document.getElementById("adminSupportThreadEmpty").classList.remove("hidden");
        loadAdminSupportTickets();
        toast("Đã xóa yêu cầu.");
      })
      .catch(function (e) {
        toast(e.message || "Lỗi", "error");
      });
  }

  function deleteAdminSupportComment(commentId) {
    if (!adminSupportActiveId || !commentId) return;
    if (!confirm("Xóa tin nhắn này?")) return;
    api(
      "/tickets/" + adminSupportActiveId + "/comments/" + commentId,
      { method: "DELETE" }
    )
      .then(function () {
        loadAdminSupportThread(adminSupportActiveId);
      })
      .catch(function (e) {
        toast(e.message || "Lỗi", "error");
      });
  }

  function sendAdminSupportReply() {
    if (!adminSupportActiveId) return;
    var text = (document.getElementById("adminSupportReply").value || "").trim();
    if (!text) return;
    var btn = document.getElementById("btnAdminSupportReply");
    if (btn) btn.disabled = true;
    api("/tickets/" + adminSupportActiveId + "/comments", {
      method: "POST",
      body: { body: text },
    })
      .then(function () {
        document.getElementById("adminSupportReply").value = "";
        loadAdminSupportThread(adminSupportActiveId);
        loadAdminSupportTickets();
        toast("Đã gửi phản hồi.");
      })
      .catch(function (e) {
        toast(e.message || "Lỗi", "error");
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function updateAdminSupportStatus() {
    if (!adminSupportActiveId) return;
    var st = document.getElementById("adminSupportStatus").value;
    api("/tickets/" + adminSupportActiveId, {
      method: "PATCH",
      body: { status: st },
    })
      .then(function (updated) {
        var idx = adminSupportTickets.findIndex(function (t) {
          return t.id === adminSupportActiveId;
        });
        if (idx >= 0 && updated) adminSupportTickets[idx] = updated;
        updateAdminSupportActions(updated || { status: st });
        loadAdminSupportTickets();
        loadAdminSupportThread(adminSupportActiveId);
        toast("Đã cập nhật trạng thái.");
      })
      .catch(function (e) {
        toast(e.message || "Lỗi", "error");
      });
  }

  function formatContactTime(createdAt) {
    try {
      return new Date(createdAt).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return String(createdAt || "");
    }
  }

  function updateContactBadge(count) {
    var badge = document.getElementById("sidebarContactBadge");
    var stat = document.getElementById("statContactsNew");
    var n = Number(count) || 0;
    if (stat) stat.textContent = String(n);
    if (!badge) return;
    if (n > 0) {
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  function loadContacts() {
    var body = document.getElementById("contactsTableBody");
    var empty = document.getElementById("contactsEmpty");
    var filter = document.getElementById("contactFilterStatus");
    if (!body) return;
    body.innerHTML =
      '<tr><td colspan="6" class="px-4 py-6 text-sm text-slate-500">Đang tải...</td></tr>';
    var q = filter && filter.value ? "?status_filter=" + encodeURIComponent(filter.value) : "";
    api("/contact-requests" + q)
      .then(function (items) {
        items = Array.isArray(items) ? items : [];
        var newCount = items.filter(function (c) { return c.status === "new"; }).length;
        updateContactBadge(newCount);
        body.innerHTML = "";
        if (empty) empty.classList.toggle("hidden", items.length > 0);
        items.forEach(function (c) {
          var tr = document.createElement("tr");
          tr.className =
            "hover:bg-slate-50 " + (c.status === "new" ? "bg-amber-50/40" : "");
          var preview =
            String(c.message || "").length > 80
              ? String(c.message).slice(0, 80) + "…"
              : c.message || "";
          tr.innerHTML =
            '<td class="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">' +
            formatContactTime(c.created_at) +
            "</td>" +
            '<td class="px-4 py-3 text-sm text-slate-800">' +
            (c.full_name || "") +
            "</td>" +
            '<td class="px-4 py-3 text-sm text-slate-600 break-all">' +
            (c.email || "") +
            "</td>" +
            '<td class="px-4 py-3 text-xs text-slate-600 max-w-xs">' +
            preview +
            "</td>" +
            '<td class="px-4 py-3 text-xs">' +
            (c.status === "new"
              ? '<span class="text-amber-700 font-semibold">Chưa đọc</span>'
              : '<span class="text-slate-500">Đã đọc</span>') +
            "</td>" +
            '<td class="px-4 py-3 text-sm"><button type="button" class="view-contact text-slate-800 font-medium hover:underline" data-id="' +
            c.id +
            '">Xem</button></td>';
          tr._contact = c;
          body.appendChild(tr);
        });
        body.querySelectorAll(".view-contact").forEach(function (btn) {
          btn.addEventListener("click", function () {
            openContactDetail(btn.closest("tr")._contact);
          });
        });
      })
      .catch(function (e) {
        body.innerHTML =
          '<tr><td colspan="6" class="px-4 py-6 text-sm text-red-600">Không tải được: ' +
          (e.message || "Lỗi") +
          "</td></tr>";
      });
  }

  function openContactDetail(c) {
    if (!c) return;
    activeContactId = c.id;
    var modal = document.getElementById("modalContactDetail");
    if ($("contactDetailTime")) $("contactDetailTime").textContent = formatContactTime(c.created_at);
    if ($("contactDetailName")) $("contactDetailName").textContent = c.full_name || "";
    if ($("contactDetailEmail")) $("contactDetailEmail").textContent = c.email || "";
    if ($("contactDetailMessage")) $("contactDetailMessage").textContent = c.message || "";
    var btnRead = document.getElementById("btnContactMarkRead");
    if (btnRead) btnRead.classList.toggle("hidden", c.status === "read");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
    }
    if (c.status === "new") {
      api("/contact-requests/" + c.id, { method: "PATCH", body: { status: "read" } })
        .then(function () {
          loadContacts();
          loadOverview();
        })
        .catch(function () {});
    }
  }

  function closeContactDetail() {
    activeContactId = null;
    var modal = document.getElementById("modalContactDetail");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  }

  function loadMe() {
    api("/auth/me").then(function (me) {
      var el = document.getElementById("headerAdminEmail");
      if (el) el.textContent = me.email || "Admin";
    }).catch(function () {});
  }

  function loadUsers() {
    var body = document.getElementById("usersTableBody");
    var empty = document.getElementById("usersEmpty");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-sm text-slate-500">Đang tải...</td></tr>';

    api("/auth/users")
      .then(function (users) {
        users = Array.isArray(users) ? users : [];
        body.innerHTML = "";
        if (empty) empty.classList.toggle("hidden", users.length > 0);
        users.forEach(function (u) {
          var isCurrentUser = String(u.id) === String(payload.sub);
          var tr = document.createElement("tr");
          tr.className = "hover:bg-slate-50";
          tr.innerHTML =
            '<td class="px-4 py-3 text-sm text-slate-700">' + u.id + '</td>' +
            '<td class="px-4 py-3 text-sm text-slate-700">' + (u.email || "") + '</td>' +
            '<td class="px-4 py-3 text-sm text-slate-700">' + (u.name || "") + '</td>' +
            '<td class="px-4 py-3 text-sm text-slate-700">' + roleText(u.role) + '</td>' +
            '<td class="px-4 py-3 text-sm">' +
            (isCurrentUser
              ? '<span class="text-xs text-slate-400 italic">Bản thân</span>'
              : '<button type="button" class="delete-user px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700" data-id="' + u.id + '" data-email="' + (u.email || "") + '">Xóa</button>') +
            '</td>';
          body.appendChild(tr);
        });

        body.querySelectorAll(".delete-user").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            var email = btn.getAttribute("data-email") || "người dùng";
            if (!confirm("Xóa tài khoản " + email + "?")) return;
            btn.disabled = true;
            api("/auth/users/" + id, { method: "DELETE" })
              .then(function () {
                toast("Đã xóa tài khoản " + email);
                loadUsers();
              })
              .catch(function (e) {
                btn.disabled = false;
                toast(e && e.message ? e.message : "Không thể xóa tài khoản", "error");
              });
          });
        });
      })
      .catch(function (e) {
        body.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-sm text-red-600">Không tải được danh sách: ' + (e.message || "Lỗi") + '</td></tr>';
      });
  }

  function loadOverview() {
    Promise.all([
      api("/auth/users").catch(function () { return []; }),
      api("/bookings").catch(function () { return []; }),
      api("/rooms").catch(function () { return []; }),
      api("/contact-requests?status_filter=new").catch(function () { return []; }),
    ]).then(function (results) {
      var users = Array.isArray(results[0]) ? results[0] : [];
      var bookings = Array.isArray(results[1]) ? results[1] : [];
      var rooms = Array.isArray(results[2]) ? results[2] : [];
      var newContacts = Array.isArray(results[3]) ? results[3] : [];
      var activeBookings = bookings.filter(function (b) { return b.status === "active"; });
      if (document.getElementById("statUsers")) document.getElementById("statUsers").textContent = users.length;
      if (document.getElementById("statBookings")) document.getElementById("statBookings").textContent = activeBookings.length;
      if (document.getElementById("statRooms")) document.getElementById("statRooms").textContent = rooms.length;
      updateContactBadge(newContacts.length);
    });
  }

  function formatTimeRange(b) {
    try {
      var start = new Date(b.start_at);
      var end = new Date(b.end_at);
      return start.toLocaleString("vi-VN") + " - " + end.toLocaleString("vi-VN");
    } catch (_) {
      return (b.start_at || "") + " - " + (b.end_at || "");
    }
  }

  function formatPaymentLabel(method, channel) {
    if (method === "transfer") {
      if (channel === "momo") return "CK · MoMo";
      if (channel === "bank") return "CK · Ngân hàng";
      return "Chuyển khoản";
    }
    return "Tiền mặt";
  }

  function loadBookings() {
    var body = document.getElementById("bookingsTableBody");
    var empty = document.getElementById("bookingsEmpty");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-sm text-slate-500">Đang tải...</td></tr>';
    Promise.all([
      api("/bookings"),
      api("/rooms").catch(function () { return []; }),
    ]).then(function (results) {
      var bookings = Array.isArray(results[0]) ? results[0] : [];
      var rooms = Array.isArray(results[1]) ? results[1] : [];
      var roomMap = {};
      rooms.forEach(function (r) { roomMap[r.id] = r.name; });
      body.innerHTML = "";
      if (empty) empty.classList.toggle("hidden", bookings.length > 0);
      bookings.forEach(function (b) {
        var tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50";
        var cancelBtn =
          b.status === "active"
            ? '<button type="button" class="cancel-booking text-slate-700 hover:underline mr-3" data-id="' +
              b.id +
              '">Hủy đặt</button>'
            : "";
        var deleteBtn =
          '<button type="button" class="delete-booking text-red-600 hover:underline font-medium" data-id="' +
          b.id +
          '">Xóa</button>';
        tr.innerHTML =
          '<td class="px-4 py-3 text-sm text-slate-700">' + (roomMap[b.room_id] || ("Phòng #" + b.room_id)) + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + (b.title || "") + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + formatTimeRange(b) + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + formatPaymentLabel(b.payment_method, b.payment_channel) + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-700">' + (b.status === "active" ? "Đang dùng" : "Đã hủy") + '</td>' +
          '<td class="px-4 py-3 text-sm whitespace-nowrap">' +
          cancelBtn +
          deleteBtn +
          '</td>';
        body.appendChild(tr);
      });
      body.querySelectorAll(".cancel-booking").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Hủy đặt phòng này?")) return;
          api("/bookings/" + btn.getAttribute("data-id") + "/cancel", { method: "POST" })
            .then(function () {
              toast("Đã hủy đặt phòng.");
              loadBookings();
              loadOverview();
            })
            .catch(function (e) { toast(e.message || "Không thể hủy đặt phòng", "error"); });
        });
      });
      body.querySelectorAll(".delete-booking").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Xóa vĩnh viễn bản ghi đặt phòng này khỏi hệ thống?")) return;
          api("/bookings/" + btn.getAttribute("data-id"), { method: "DELETE" })
            .then(function () {
              toast("Đã xóa đặt phòng.");
              loadBookings();
              loadOverview();
            })
            .catch(function (e) { toast(e.message || "Không thể xóa đặt phòng", "error"); });
        });
      });
    }).catch(function (e) {
      body.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-sm text-red-600">Không tải được đặt phòng: ' + (e.message || "Lỗi") + '</td></tr>';
    });
  }

  function roomPayload() {
    var pr = Number(String(document.getElementById("roomPrice").value || "0").replace(/\s/g, "").replace(",", "."));
    if (!isFinite(pr) || pr < 0) pr = 0;
    return {
      name: (document.getElementById("roomName").value || "").trim(),
      location: (document.getElementById("roomLocation").value || "").trim(),
      capacity: Number(document.getElementById("roomCapacity").value || 1),
      image_url: (document.getElementById("roomImageUrl").value || "").trim(),
      amenities: (document.getElementById("roomAmenities").value || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean),
      status: document.getElementById("roomStatus").value || "active",
      price: pr,
    };
  }

  function formatRoomPrice(n) {
    var x = Number(n);
    if (!isFinite(x)) return "—";
    return x.toLocaleString("vi-VN");
  }

  function openRoomModal(room) {
    document.getElementById("roomId").value = room && room.id ? room.id : "";
    document.getElementById("modalRoomTitle").textContent = room && room.id ? "Sửa phòng" : "Tạo phòng";
    document.getElementById("roomName").value = room && room.name ? room.name : "";
    document.getElementById("roomLocation").value = room && room.location ? room.location : "";
    document.getElementById("roomCapacity").value = room && room.capacity ? room.capacity : 10;
    document.getElementById("roomImageUrl").value = room && room.image_url ? room.image_url : "";
    document.getElementById("roomAmenities").value = room && Array.isArray(room.amenities) ? room.amenities.join(", ") : "";
    document.getElementById("roomPrice").value =
      room && room.price != null && room.price !== "" ? Number(room.price) : 0;
    document.getElementById("roomStatus").value = room && room.status ? room.status : "active";
    var modal = document.getElementById("modalRoom");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeRoomModal() {
    var modal = document.getElementById("modalRoom");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  function getSelectedRoomCheckboxes() {
    return Array.prototype.slice.call(document.querySelectorAll(".room-select:checked"));
  }

  function updateRoomsSelectionUI() {
    var selected = getSelectedRoomCheckboxes();
    var n = selected.length;
    var allBoxes = document.querySelectorAll(".room-select");
    var selectAll = document.getElementById("roomSelectAll");
    var btnBulk = document.getElementById("btnDeleteSelectedRooms");
    var hint = document.getElementById("roomsBulkHint");
    var label = document.getElementById("roomsSelectedLabel");

    if (btnBulk) {
      btnBulk.disabled = n === 0;
      btnBulk.textContent = "Xóa đã chọn (" + n + ")";
    }
    if (hint) hint.classList.toggle("hidden", allBoxes.length === 0);
    if (label) label.textContent = "Đã chọn " + n + " / " + allBoxes.length + " phòng";

    if (selectAll && allBoxes.length) {
      selectAll.indeterminate = n > 0 && n < allBoxes.length;
      selectAll.checked = n > 0 && n === allBoxes.length;
    }
  }

  function clearRoomSelection() {
    document.querySelectorAll(".room-select").forEach(function (cb) {
      cb.checked = false;
    });
    var selectAll = document.getElementById("roomSelectAll");
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
    updateRoomsSelectionUI();
  }

  function deleteRoomsByIds(ids) {
    var list = Array.isArray(ids) ? ids : [];
    if (!list.length) return Promise.resolve({ ok: 0, fail: 0 });

    return list.reduce(function (chain, id) {
      return chain.then(function (acc) {
        return api("/rooms/" + id, { method: "DELETE" })
          .then(function () {
            acc.ok += 1;
            return acc;
          })
          .catch(function () {
            acc.fail += 1;
            return acc;
          });
      });
    }, Promise.resolve({ ok: 0, fail: 0 }));
  }

  function deleteSelectedRooms() {
    var selected = getSelectedRoomCheckboxes();
    if (!selected.length) {
      toast("Chưa chọn phòng nào.", "error");
      return;
    }
    var ids = [];
    var names = [];
    selected.forEach(function (cb) {
      ids.push(cb.getAttribute("data-id"));
      var tr = cb.closest("tr");
      names.push(tr && tr._room && tr._room.name ? tr._room.name : "ID " + cb.getAttribute("data-id"));
    });
    var preview = names.slice(0, 5).join("\n• ");
    if (names.length > 5) preview += "\n… và " + (names.length - 5) + " phòng khác";
    if (
      !confirm(
        "Xóa " +
          ids.length +
          " phòng đã chọn?\n\n• " +
          preview +
          "\n\nCác đặt phòng liên quan có thể bị ảnh hưởng."
      )
    ) {
      return;
    }

    var btnBulk = document.getElementById("btnDeleteSelectedRooms");
    if (btnBulk) {
      btnBulk.disabled = true;
      btnBulk.textContent = "Đang xóa...";
    }

    deleteRoomsByIds(ids)
      .then(function (res) {
        if (res.fail === 0) {
          toast("Đã xóa " + res.ok + " phòng.");
        } else {
          toast("Xóa xong: " + res.ok + " thành công, " + res.fail + " lỗi.", "error");
        }
        loadRooms();
        loadOverview();
      })
      .finally(function () {
        updateRoomsSelectionUI();
      });
  }

  function loadRooms() {
    var body = document.getElementById("roomsTableBody");
    var empty = document.getElementById("roomsEmpty");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="9" class="px-4 py-6 text-sm text-slate-500">Đang tải...</td></tr>';
    var selectAll = document.getElementById("roomSelectAll");
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
    api("/rooms").then(function (rooms) {
      rooms = Array.isArray(rooms) ? rooms : [];
      body.innerHTML = "";
      if (empty) empty.classList.toggle("hidden", rooms.length > 0);
      rooms.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50 room-row";
        var imgSrc = r.image_url && String(r.image_url).trim();
        var thumb = imgSrc
          ? '<img src="' + imgSrc.replace(/"/g, "&quot;") + '" alt="" class="h-12 w-16 rounded-md object-cover border border-slate-200 bg-slate-50" loading="lazy" onerror="this.replaceWith(document.createTextNode(\'—\'))" />'
          : '<span class="text-slate-400">—</span>';
        tr.innerHTML =
          '<td class="px-3 py-3 text-center align-middle">' +
          '<input type="checkbox" class="room-select w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400" data-id="' +
          r.id +
          '" aria-label="Chọn phòng" />' +
          "</td>" +
          '<td class="px-4 py-3 text-sm text-slate-700">' +
          r.id +
          "</td>" +
          '<td class="px-4 py-3 align-middle">' +
          thumb +
          "</td>" +
          '<td class="px-4 py-3 text-sm text-slate-700">' +
          (r.name || "") +
          "</td>" +
          '<td class="px-4 py-3 text-sm text-slate-700">' +
          (r.location || "") +
          "</td>" +
          '<td class="px-4 py-3 text-sm text-slate-700">' +
          (r.capacity || "") +
          "</td>" +
          '<td class="px-4 py-3 text-sm text-slate-700 tabular-nums">' +
          formatRoomPrice(r.price) +
          "</td>" +
          '<td class="px-4 py-3 text-sm text-slate-700">' +
          (r.status === "active" ? "Hoạt động" : "Tạm đóng") +
          "</td>" +
          '<td class="px-4 py-3 text-sm"><button type="button" class="edit-room text-slate-700 hover:underline mr-3" data-id="' +
          r.id +
          '">Sửa</button><button type="button" class="delete-room text-red-600 hover:underline" data-id="' +
          r.id +
          '">Xóa</button></td>';
        tr._room = r;
        body.appendChild(tr);
      });

      body.querySelectorAll(".room-select").forEach(function (cb) {
        cb.addEventListener("change", updateRoomsSelectionUI);
      });

      body.querySelectorAll(".edit-room").forEach(function (btn) {
        btn.addEventListener("click", function () {
          openRoomModal(btn.closest("tr")._room);
        });
      });
      body.querySelectorAll(".delete-room").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Xóa phòng này?")) return;
          api("/rooms/" + btn.getAttribute("data-id"), { method: "DELETE" })
            .then(function () {
              toast("Đã xóa phòng.");
              loadRooms();
              loadOverview();
            })
            .catch(function (e) {
              toast(e.message || "Không thể xóa phòng", "error");
            });
        });
      });

      updateRoomsSelectionUI();
    }).catch(function (e) {
      body.innerHTML =
        '<tr><td colspan="9" class="px-4 py-6 text-sm text-red-600">Không tải được phòng: ' +
        (e.message || "Lỗi") +
        "</td></tr>";
      updateRoomsSelectionUI();
    });
  }

  function openCreateModal() {
    document.getElementById("newUserEmail").value = "";
    document.getElementById("newUserName").value = "";
    document.getElementById("newUserPassword").value = "";
    document.getElementById("newUserRole").value = "customer";
    var modal = document.getElementById("modalCreateUser");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeCreateModal() {
    var modal = document.getElementById("modalCreateUser");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  function adminLogout() {
    if (typeof clearAdminSession === "function") clearAdminSession();
    else setToken(null);
    window.location.href = "./admin-login.html";
  }
  document.getElementById("btnAdminLogout").addEventListener("click", adminLogout);
  var sidebarLogout = document.getElementById("btnSidebarLogout");
  if (sidebarLogout) sidebarLogout.addEventListener("click", adminLogout);
  document.querySelectorAll(".sidebar-link").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      showView(link.getAttribute("data-page") || "users");
    });
  });
  document.getElementById("btnCreateUser").addEventListener("click", openCreateModal);
  document.getElementById("modalCreateUserCancel").addEventListener("click", closeCreateModal);
  document.getElementById("modalCreateUser").addEventListener("click", function (e) {
    if (e.target === this) closeCreateModal();
  });
  document.getElementById("modalCreateUserConfirm").addEventListener("click", function () {
    var body = {
      email: (document.getElementById("newUserEmail").value || "").trim().toLowerCase(),
      name: (document.getElementById("newUserName").value || "").trim(),
      password: document.getElementById("newUserPassword").value || "",
      role: document.getElementById("newUserRole").value || "customer",
    };
    if (!body.email || !body.name || body.password.length < 6) {
      toast("Nhập đủ email, họ tên và mật khẩu tối thiểu 6 ký tự.", "error");
      return;
    }
    api("/auth/users", { method: "POST", body: body })
      .then(function () {
        closeCreateModal();
        toast("Đã tạo tài khoản.");
        loadUsers();
      })
      .catch(function (e) {
        toast(e && e.message ? e.message : "Tạo tài khoản thất bại", "error");
      });
  });

  var btnCreateRoom = document.getElementById("btnCreateRoom");
  if (btnCreateRoom) btnCreateRoom.addEventListener("click", function () { openRoomModal(null); });

  var roomSelectAll = document.getElementById("roomSelectAll");
  if (roomSelectAll) {
    roomSelectAll.addEventListener("change", function () {
      var checked = roomSelectAll.checked;
      document.querySelectorAll(".room-select").forEach(function (cb) {
        cb.checked = checked;
      });
      updateRoomsSelectionUI();
    });
  }
  var btnDeleteSelectedRooms = document.getElementById("btnDeleteSelectedRooms");
  if (btnDeleteSelectedRooms) {
    btnDeleteSelectedRooms.addEventListener("click", deleteSelectedRooms);
  }
  var btnClearRoomSelection = document.getElementById("btnClearRoomSelection");
  if (btnClearRoomSelection) {
    btnClearRoomSelection.addEventListener("click", clearRoomSelection);
  }
  var btnImportRoomsCsv = document.getElementById("btnImportRoomsCsv");
  var roomCsvFile = document.getElementById("roomCsvFile");
  if (btnImportRoomsCsv && roomCsvFile) {
    btnImportRoomsCsv.addEventListener("click", function () {
      roomCsvFile.click();
    });
    roomCsvFile.addEventListener("change", function (ev) {
      var input = ev.target;
      var f = input.files && input.files[0];
      if (!f) return;
      if (typeof apiForm !== "function") {
        toast("Thiếu apiForm (shared.js).", "error");
        input.value = "";
        return;
      }
      var fd = new FormData();
      fd.append("file", f);
      btnImportRoomsCsv.disabled = true;
      btnImportRoomsCsv.textContent = "Đang import...";
      apiForm("/rooms/import-csv", fd)
        .then(function (res) {
          var msg = "Import xong: tạo " + (res.created || 0) + " phòng.";
          if (res.failed) msg += " Lỗi " + res.failed + " dòng.";
          toast(msg, res.failed ? "error" : undefined);
          if (res.errors && res.errors.length) {
            console.warn(res.errors);
            if (res.errors.length <= 5) {
              alert(res.errors.join("\n"));
            } else {
              alert(res.errors.slice(0, 5).join("\n") + "\n… (xem console)");
            }
          }
          loadRooms();
          loadOverview();
        })
        .catch(function (e) {
          toast(e && e.message ? e.message : "Import thất bại", "error");
        })
        .finally(function () {
          btnImportRoomsCsv.disabled = false;
          btnImportRoomsCsv.textContent = "Import CSV";
          input.value = "";
        });
    });
  }
  var modalRoomCancel = document.getElementById("modalRoomCancel");
  if (modalRoomCancel) modalRoomCancel.addEventListener("click", closeRoomModal);
  var modalRoom = document.getElementById("modalRoom");
  if (modalRoom) modalRoom.addEventListener("click", function (e) {
    if (e.target === modalRoom) closeRoomModal();
  });
  var modalRoomConfirm = document.getElementById("modalRoomConfirm");
  if (modalRoomConfirm) {
    modalRoomConfirm.addEventListener("click", function () {
      var id = document.getElementById("roomId").value;
      var data = roomPayload();
      if (!data.name || !data.location || data.capacity < 1) {
        toast("Nhập đủ tên phòng, vị trí và sức chứa.", "error");
        return;
      }
      var path = id ? "/rooms/" + id : "/rooms";
      var method = id ? "PATCH" : "POST";
      modalRoomConfirm.disabled = true;
      modalRoomConfirm.textContent = "Đang lưu...";
      api(path, { method: method, body: data })
        .then(function () {
          closeRoomModal();
          toast(id ? "Đã cập nhật phòng." : "Đã tạo phòng.");
          loadRooms();
          loadOverview();
        })
        .catch(function (e) {
          var msg = (e && e.message) || "Không thể lưu phòng";
          if (e && e.status) msg = "[HTTP " + e.status + "] " + msg;
          toast(msg, "error");
        })
        .finally(function () {
          modalRoomConfirm.disabled = false;
          modalRoomConfirm.textContent = "Lưu";
        });
    });
  }

  var contactFilter = document.getElementById("contactFilterStatus");
  if (contactFilter) {
    contactFilter.addEventListener("change", loadContacts);
  }
  var btnContactDetailClose = document.getElementById("btnContactDetailClose");
  if (btnContactDetailClose) btnContactDetailClose.addEventListener("click", closeContactDetail);
  var modalContactDetail = document.getElementById("modalContactDetail");
  if (modalContactDetail) {
    modalContactDetail.addEventListener("click", function (e) {
      if (e.target === modalContactDetail) closeContactDetail();
    });
  }
  var btnContactMarkRead = document.getElementById("btnContactMarkRead");
  if (btnContactMarkRead) {
    btnContactMarkRead.addEventListener("click", function () {
      if (!activeContactId) return;
      api("/contact-requests/" + activeContactId, { method: "PATCH", body: { status: "read" } })
        .then(function () {
          toast("Đã đánh dấu đã đọc.");
          closeContactDetail();
          loadContacts();
          loadOverview();
        })
        .catch(function (e) {
          toast(e.message || "Lỗi", "error");
        });
    });
  }
  var btnContactDelete = document.getElementById("btnContactDelete");
  if (btnContactDelete) {
    btnContactDelete.addEventListener("click", function () {
      if (!activeContactId || !confirm("Xóa yêu cầu liên hệ này?")) return;
      api("/contact-requests/" + activeContactId, { method: "DELETE" })
        .then(function () {
          toast("Đã xóa.");
          closeContactDetail();
          loadContacts();
          loadOverview();
        })
        .catch(function (e) {
          toast(e.message || "Không xóa được", "error");
        });
    });
  }

  var adminSupportFilter = document.getElementById("adminSupportFilter");
  if (adminSupportFilter) adminSupportFilter.addEventListener("change", loadAdminSupportTickets);
  var btnAdminSupportReply = document.getElementById("btnAdminSupportReply");
  if (btnAdminSupportReply) btnAdminSupportReply.addEventListener("click", sendAdminSupportReply);
  var adminSupportStatus = document.getElementById("adminSupportStatus");
  if (adminSupportStatus) adminSupportStatus.addEventListener("change", updateAdminSupportStatus);
  var btnAdminSupportResolve = document.getElementById("btnAdminSupportResolve");
  if (btnAdminSupportResolve) btnAdminSupportResolve.addEventListener("click", markAdminSupportResolved);
  var btnAdminSupportDelete = document.getElementById("btnAdminSupportDelete");
  if (btnAdminSupportDelete) btnAdminSupportDelete.addEventListener("click", deleteAdminSupportTicket);

  loadMe();
  loadOverview();
  loadUsers();
  loadAdminSupportTickets();
})();
