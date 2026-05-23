if (typeof initBackendCheck === "function") initBackendCheck();

function formatApiError(e) {
  var serverDetail =
    e?.data?.detail && Array.isArray(e.data.detail)
      ? e.data.detail.map(function (d) {
          return d.msg || JSON.stringify(d);
        }).join("\n")
      : e?.data?.detail || "";
  return serverDetail || e?.message || "Lỗi không xác định";
}

(function initResetPage() {
  var params = new URLSearchParams(window.location.search);
  var token = (params.get("token") || "").trim();
  var invalid = $("resetInvalid");
  var form = $("resetForm");
  var hidden = $("resetToken");

  if (!token) {
    if (invalid) {
      invalid.classList.remove("hidden");
      invalid.textContent =
        "Liên kết không hợp lệ. Vui lòng mở lại liên kết từ email hoặc yêu cầu đặt lại mật khẩu trên trang đăng nhập.";
    }
    if (form) form.classList.add("hidden");
    return;
  }

  if (hidden) hidden.value = token;

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var pw = ($("resetPassword").value || "").trim();
      var pw2 = ($("resetPasswordConfirm").value || "").trim();
      if (pw.length < 6) {
        alert("Mật khẩu tối thiểu 6 ký tự.");
        return;
      }
      if (pw !== pw2) {
        alert("Mật khẩu xác nhận không khớp.");
        return;
      }

      var btn = $("btnResetPassword");
      if (btn) btn.disabled = true;
      try {
        await api("/auth/reset-password", {
          method: "POST",
          body: {
            token: token,
            password: pw,
            password_confirm: pw2,
          },
        });
        alert("Đã đặt lại mật khẩu thành công. Vui lòng đăng nhập.");
        window.location.href = "./login.html";
      } catch (err) {
        alert("Không đặt lại được mật khẩu:\n" + formatApiError(err));
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }
})();
