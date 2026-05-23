(function () {
  "use strict";

  if (typeof initBackendCheck === "function") initBackendCheck();

  function parseJwt(token) {
    try {
      var parts = token.split(".");
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    } catch (_) {
      return null;
    }
  }

  var email = document.getElementById("adminEmail");
  var password = document.getElementById("adminPassword");
  var button = document.getElementById("btnAdminLogin");

  function submit() {
    var body = {
      email: (email.value || "").trim().toLowerCase(),
      password: password.value || "",
    };
    if (!body.email || !body.password) {
      alert("Nhập email và mật khẩu admin.");
      return;
    }

    button.disabled = true;
    button.textContent = "Đang đăng nhập...";
    api("/auth/login", { method: "POST", body: body })
      .then(function (tok) {
        var payload = parseJwt(tok.access_token);
        if (!payload || payload.role !== "admin") {
          alert("Tài khoản này không có quyền admin.");
          return;
        }
        setToken(tok.access_token);
        window.location.href = "./admin-dashboard.html";
      })
      .catch(function (e) {
        alert("Đăng nhập admin thất bại: " + (e && e.message ? e.message : "Lỗi không xác định"));
      })
      .finally(function () {
        button.disabled = false;
        button.textContent = "Đăng nhập";
      });
  }

  button && button.addEventListener("click", submit);
  password && password.addEventListener("keydown", function (e) {
    if (e.key === "Enter") submit();
  });
})();
