// Auth guard
if (!getToken()) {
  window.location.href = "./login.html";
}

// Prefill API base from storage
(() => {
  const stored = localStorage.getItem("api_base");
  if (stored) $("apiBase").value = stored;
  $("apiBase").addEventListener("change", () => setApiBase($("apiBase").value));
})();

$("btnLogout").addEventListener("click", () => {
  setToken("");
  window.location.href = "./login.html";
});

function pill(text, kind) {
  const span = document.createElement("span");
  span.className = `pill ${kind || ""}`.trim();
  span.textContent = text;
  return span;
}

function roomCard(r) {
  const div = document.createElement("div");
  div.className = "item room-item";

  const media = document.createElement("div");
  media.className = "room-media";
  const img = document.createElement("img");
  img.className = "room-img";
  img.alt = r.name;
  img.loading = "lazy";
  img.src =
    r.image_url ||
    "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
          <rect width='100%' height='100%' fill='#0b1220'/>
          <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#a8b3cf' font-family='Arial' font-size='22'>No image</text>
        </svg>`
      );
  img.addEventListener("error", () => {
    img.src =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
          <rect width='100%' height='100%' fill='#0b1220'/>
          <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#ff5d7a' font-family='Arial' font-size='22'>Image error</text>
        </svg>`
      );
  });
  media.appendChild(img);

  const content = document.createElement("div");
  content.className = "room-content";

  const title = document.createElement("div");
  title.className = "item-title";
  title.textContent = `#${r.id} ${r.name}`;

  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.innerHTML = `
    <div>Location: <b>${r.location}</b></div>
    <div>Capacity: <b>${r.capacity}</b></div>
    <div>Amenities: <b>${(r.amenities || []).join(", ") || "-"}</b></div>
  `;

  const actions = document.createElement("div");
  actions.className = "item-actions";
  actions.appendChild(pill(r.status, r.status === "active" ? "ok" : "warn"));

  const btnPick = document.createElement("button");
  btnPick.className = "btn btn-ghost";
  btnPick.textContent = "Chọn phòng";
  btnPick.addEventListener("click", () => {
    $("bookingRoomId").value = r.id;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  actions.appendChild(btnPick);

  content.appendChild(title);
  content.appendChild(meta);
  content.appendChild(actions);

  div.appendChild(media);
  div.appendChild(content);
  return div;
}

$("btnLoadRooms").addEventListener("click", async () => {
  try {
    const rooms = await api("/rooms");
    renderList($("roomsList"), rooms, roomCard);
  } catch (e) {
    alert("Không load được danh sách phòng: " + (e?.message || "Lỗi"));
  }
});

$("btnCreateRoom").addEventListener("click", async () => {
  try {
    const body = {
      name: $("roomName").value,
      location: $("roomLocation").value,
      capacity: Number($("roomCapacity").value),
      image_url: $("roomImageUrl").value || "",
      amenities: parseCommaList($("roomAmenities").value),
      status: "active",
      price: 0,
    };
    await api("/rooms", { method: "POST", body });
    alert("Tạo phòng thành công");
    $("btnLoadRooms").click();
  } catch (e) {
    alert("Tạo phòng thất bại (cần token admin): " + (e?.message || "Lỗi"));
  }
});

function bookingCard(b) {
  const div = document.createElement("div");
  div.className = "item";
  const title = document.createElement("div");
  title.className = "item-title";
  title.textContent = `#${b.id} Room ${b.room_id} — ${b.title}`;
  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.innerHTML = `
    <div>Organizer: <b>${b.organizer_id}</b></div>
    <div>Time: <b>${formatDt(b.start_at)}</b> → <b>${formatDt(b.end_at)}</b></div>
  `;
  const actions = document.createElement("div");
  actions.className = "item-actions";
  actions.appendChild(pill(b.status, b.status === "active" ? "ok" : "warn"));

  if (b.status === "active") {
    const btn = document.createElement("button");
    btn.className = "btn btn-ghost";
    btn.textContent = "Cancel";
    btn.addEventListener("click", async () => {
      try {
        const updated = await api(`/bookings/${b.id}/cancel`, { method: "POST" });
        log("Cancelled booking", updated);
        $("btnLoadMyBookings").click();
      } catch (e) {
        log("Cancel booking failed", { message: e.message, status: e.status, data: e.data });
      }
    });
    actions.appendChild(btn);
  }

  div.appendChild(title);
  div.appendChild(meta);
  div.appendChild(actions);
  return div;
}

$("btnLoadBookings").addEventListener("click", async () => {
  try {
    const items = await api("/bookings");
    renderList($("bookingsList"), items, bookingCard);
  } catch (e) {
    alert("Không load được danh sách bookings: " + (e?.message || "Lỗi"));
  }
});

$("btnLoadMyBookings").addEventListener("click", async () => {
  try {
    const items = await api("/bookings/mine");
    renderList($("bookingsList"), items, bookingCard);
  } catch (e) {
    alert("Không load được bookings của bạn: " + (e?.message || "Lỗi"));
  }
});

$("btnCreateBooking").addEventListener("click", async () => {
  try {
    const body = {
      room_id: Number($("bookingRoomId").value),
      title: $("bookingTitle").value,
      start_at: $("bookingStart").value,
      end_at: $("bookingEnd").value,
      notes: $("bookingNotes").value || "",
    };
    await api("/bookings", { method: "POST", body });
    alert("Tạo booking thành công");
    $("btnLoadMyBookings").click();
  } catch (e) {
    alert("Tạo booking thất bại: " + (e?.message || "Lỗi"));
  }
});
