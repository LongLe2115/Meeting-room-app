if (typeof initBackendCheck === "function") initBackendCheck();

(function showLoginFlash() {
  try {
    var msg = sessionStorage.getItem("login_flash");
    if (!msg) return;
    sessionStorage.removeItem("login_flash");
    var card = document.querySelector(".account-card");
    if (!card) return;
    var box = document.createElement("p");
    box.className = "login-flash";
    box.setAttribute("role", "alert");
    box.textContent = msg;
    var sub = card.querySelector(".account-card-subtitle");
    if (sub && sub.parentNode) sub.parentNode.insertBefore(box, sub.nextSibling);
    else card.insertBefore(box, card.children[1] || null);
  } catch (_) {}
})();

var OAUTH_CFG = null;
var googleScriptLoaded = false;
var facebookScriptLoaded = false;

var REMEMBER_ME_KEY = "mrp_remember_me";
var REMEMBER_EMAIL_KEY = "mrp_remember_email";

function loadRememberPrefs() {
  var remember = localStorage.getItem(REMEMBER_ME_KEY) === "1";
  var email = localStorage.getItem(REMEMBER_EMAIL_KEY) || "";
  var cb = $("rememberMe");
  var emailEl = $("loginEmail");
  if (cb) cb.checked = remember;
  if (remember && email && emailEl && !String(emailEl.value || "").trim()) {
    emailEl.value = email;
  }
}

function saveRememberPrefs(email, remember) {
  if (remember) {
    localStorage.setItem(REMEMBER_ME_KEY, "1");
    localStorage.setItem(REMEMBER_EMAIL_KEY, String(email || "").toLowerCase());
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY);
    localStorage.removeItem(REMEMBER_EMAIL_KEY);
  }
}

function isRememberMeChecked() {
  var cb = $("rememberMe");
  return !!(cb && cb.checked);
}

function showLoginPanel() {
  var tabs = document.querySelector(".account-tabs");
  if (tabs) tabs.classList.remove("hidden");
  $("tab-forgot")?.classList.add("hidden");
  $("tab-login")?.classList.remove("hidden");
  $("tab-register")?.classList.add("hidden");
  document.querySelectorAll(".account-tab").forEach(function (t) {
    t.classList.toggle("active", t.dataset.tab === "login");
  });
  if (accountTitle) accountTitle.textContent = "Đăng nhập";
  var res = $("forgotResult");
  if (res) {
    res.classList.add("hidden");
    res.innerHTML = "";
  }
}

function showForgotPanel() {
  var tabs = document.querySelector(".account-tabs");
  if (tabs) tabs.classList.add("hidden");
  $("tab-login")?.classList.add("hidden");
  $("tab-register")?.classList.add("hidden");
  $("tab-forgot")?.classList.remove("hidden");
  if (accountTitle) accountTitle.textContent = "Quên mật khẩu";
  var email = ($("loginEmail")?.value || "").trim();
  if (email && $("forgotEmail")) $("forgotEmail").value = email;
}

function formatApiError(e) {
  var serverDetail =
    e?.data?.detail && Array.isArray(e.data.detail)
      ? e.data.detail.map(function (d) {
          return d.msg || JSON.stringify(d);
        }).join("\n")
      : e?.data?.detail || "";
  return serverDetail || e?.message || "Lỗi không xác định";
}

function goToCustomerDashboard() {
  window.location.replace(
    typeof getCustomerDashboardUrl === "function"
      ? getCustomerDashboardUrl()
      : "./dashboard.html"
  );
}

function completeAuth(token, opts) {
  opts = opts || {};
  var payload = typeof parseJwtPayload === "function" ? parseJwtPayload(token) : null;
  if (payload && payload.role === "admin") {
    alert("Email này là tài khoản quản trị. Vui lòng đăng nhập tại trang Quản trị.");
    window.location.href = "./admin-login.html";
    return;
  }
  if (typeof establishUserSession === "function") {
    establishUserSession(token);
  } else {
    setToken(token);
  }
  var email =
    opts.email ||
    (payload && (payload.email || payload.sub_email)) ||
    ($("loginEmail") && $("loginEmail").value) ||
    "";
  saveRememberPrefs(email, opts.remember != null ? opts.remember : isRememberMeChecked());
  goToCustomerDashboard();
}

/** Đã đăng nhập hợp lệ → vào dashboard, tránh mở lại form login. */
(function redirectIfAlreadyLoggedIn() {
  if (typeof isUserSessionValid === "function" && isUserSessionValid()) {
    goToCustomerDashboard();
  }
})();

const accountTitle = document.getElementById("accountTitle");
loadRememberPrefs();

for (const t of document.querySelectorAll(".account-tab")) {
  t.addEventListener("click", () => {
    showLoginPanel();
    document.querySelectorAll(".account-tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.dataset.tab;
    $("tab-login").classList.toggle("hidden", tab !== "login");
    $("tab-register").classList.toggle("hidden", tab !== "register");
    if (accountTitle) accountTitle.textContent = tab === "login" ? "Đăng nhập" : "Đăng ký tài khoản";
  });
}

$("forgotPassword")?.addEventListener("click", function (e) {
  e.preventDefault();
  showForgotPanel();
});

$("backToLogin")?.addEventListener("click", function (e) {
  e.preventDefault();
  showLoginPanel();
});

function bindForgotPasswordForm() {
  var btn = document.getElementById("btnForgotSubmit");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", async function () {
    var emailEl = document.getElementById("forgotEmail");
    var email = (emailEl && emailEl.value ? emailEl.value : "").trim().toLowerCase();
    if (!email || email.indexOf("@") === -1) {
      alert("Vui lòng nhập email hợp lệ (ví dụ: ten@gmail.com).");
      return;
    }
    var box = document.getElementById("forgotResult");
    var oldLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Đang xử lý...";
    if (box) {
      box.classList.add("hidden");
      box.innerHTML = "";
    }
    try {
      var res = await api("/auth/forgot-password", {
        method: "POST",
        body: { email: email },
      });
      if (box) {
        box.classList.remove("hidden");
        box.classList.toggle("account-forgot-result--warn", !res.email_found || !res.reset_url);
        var html = "<p>" + (res.message || "Đã xử lý yêu cầu.") + "</p>";
        if (res.reset_url) {
          html +=
            '<p class="mt-2"><strong>Bấm để đặt lại mật khẩu:</strong><br>' +
            '<a class="account-forgot-reset-btn" href="' +
            res.reset_url.replace(/"/g, "&quot;") +
            '">Mở trang đặt lại mật khẩu</a></p>' +
            '<p class="mt-2 text-xs opacity-80">Hoặc copy link: ' +
            res.reset_url +
            "</p>";
        } else if (!res.email_found) {
          html +=
            '<p class="mt-2">Chưa có tài khoản? <a href="#" id="forgotGoRegister">Đăng ký ngay</a></p>';
        }
        box.innerHTML = html;
        var goReg = document.getElementById("forgotGoRegister");
        if (goReg) {
          goReg.addEventListener("click", function (ev) {
            ev.preventDefault();
            showLoginPanel();
            var regTab = document.querySelector('.account-tab[data-tab="register"]');
            if (regTab) regTab.click();
          });
        }
        box.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch (e) {
      var errText = formatApiError(e);
      if (String(errText).toLowerCase().indexOf("not found") !== -1) {
        errText =
          "API chưa sẵn sàng. Hãy khởi động lại backend (uvicorn port 8000) rồi thử lại.";
      }
      alert("Không gửi được yêu cầu:\n" + errText);
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  });
}

bindForgotPasswordForm();

(() => {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "register") {
    const registerTab = Array.from(document.querySelectorAll(".account-tab")).find(
      (el) => el.dataset.tab === "register"
    );
    if (registerTab) registerTab.click();
  }
})();

function validateRegisterForm() {
  const firstName = ($("regFirstName").value || "").trim();
  const lastName = ($("regLastName").value || "").trim();
  const email = ($("regEmail").value || "").trim().toLowerCase();
  const password = $("regPassword").value || "";
  const confirm = $("regPasswordConfirm").value || "";

  if (!firstName) {
    alert("Vui lòng nhập tên.");
    return null;
  }
  if (!lastName) {
    alert("Vui lòng nhập họ.");
    return null;
  }
  if (!email || !email.includes("@")) {
    alert("Vui lòng nhập email hợp lệ.");
    return null;
  }
  if (password.length < 6) {
    alert("Mật khẩu tối thiểu 6 ký tự.");
    return null;
  }
  if (password !== confirm) {
    alert("Mật khẩu xác nhận không khớp.");
    return null;
  }

  return {
    name: (firstName + " " + lastName).trim(),
    email,
    password,
    role: "customer",
  };
}

$("btnRegister").addEventListener("click", async () => {
  const body = validateRegisterForm();
  if (!body) return;

  const btn = $("btnRegister");
  btn.disabled = true;
  try {
    await api("/auth/register", { method: "POST", body });
    const tok = await api("/auth/login", {
      method: "POST",
      body: {
        email: body.email,
        password: body.password,
        remember_me: isRememberMeChecked(),
      },
    });
    completeAuth(tok.access_token, { email: body.email, remember: isRememberMeChecked() });
  } catch (e) {
    console.error("Register error", e);
    alert("Đăng ký thất bại:\n" + formatApiError(e));
  } finally {
    btn.disabled = false;
  }
});

$("btnLogin").addEventListener("click", async () => {
  const email = ($("loginEmail").value || "").trim().toLowerCase();
  const password = $("loginPassword").value || "";
  if (!email) {
    alert("Vui lòng nhập email.");
    return;
  }
  if (!password) {
    alert("Vui lòng nhập mật khẩu.");
    return;
  }

  const btn = $("btnLogin");
  btn.disabled = true;
  try {
    const remember = isRememberMeChecked();
    const tok = await api("/auth/login", {
      method: "POST",
      body: { email: email, password: password, remember_me: remember },
    });
    completeAuth(tok.access_token, { email: email, remember: remember });
  } catch (e) {
    var msg = "Đăng nhập thất bại: " + formatApiError(e);
    msg += "\n\n• Dùng tài khoản quản lý? Đăng nhập tại trang Quản trị (admin-login.html).";
    alert(msg);
  } finally {
    btn.disabled = false;
  }
});

function setOAuthHint(text) {
  const el = $("oauthHint");
  if (!el) return;
  if (!text) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
}

function loadScript(src) {
  return new Promise(function (resolve, reject) {
    var existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      if (existing.dataset.loaded === "1") resolve();
      else existing.addEventListener("load", resolve);
      return;
    }
    var s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = function () {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function handleGoogleCredential(response) {
  try {
    const tok = await api("/auth/oauth/google", {
      method: "POST",
      body: { credential: response.credential },
    });
    completeAuth(tok.access_token, { remember: isRememberMeChecked() });
  } catch (e) {
    alert("Đăng nhập Google thất bại:\n" + formatApiError(e));
  }
}

window.handleGoogleCredential = handleGoogleCredential;

function initGoogleButton(cfg) {
  if (!cfg.google_enabled || !cfg.google_client_id) return;
  var wrap = $("googleSignInWrap");
  if (!wrap) return;

  loadScript("https://accounts.google.com/gsi/client")
    .then(function () {
      google.accounts.id.initialize({
        client_id: cfg.google_client_id,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: false,
      });

      // Nút Google thật (trong lớp trong suốt) + icon SVG hiển thị bên dưới
      wrap.innerHTML = "";
      google.accounts.id.renderButton(wrap, {
        type: "icon",
        shape: "square",
        theme: "outline",
        size: "large",
        width: 52,
      });

      googleScriptLoaded = true;
    })
    .catch(function () {
      setOAuthHint("Không tải được Google Sign-In.");
    });
}

function initFacebook(cfg) {
  if (!cfg.facebook_enabled || !cfg.facebook_app_id) return;

  window.fbAsyncInit = function () {
    FB.init({
      appId: cfg.facebook_app_id,
      cookie: true,
      xfbml: false,
      version: "v19.0",
    });
    facebookScriptLoaded = true;
  };

  loadScript("https://connect.facebook.net/vi_VN/sdk.js").catch(function () {
    setOAuthHint("Không tải được Facebook SDK.");
  });
}

$("btnFacebookLogin")?.addEventListener("click", function () {
  if (!OAUTH_CFG?.facebook_enabled) {
    alert(
      "Facebook OAuth chưa cấu hình.\nThêm FACEBOOK_APP_ID và FACEBOOK_APP_SECRET vào file .env."
    );
    return;
  }
  if (!facebookScriptLoaded || typeof FB === "undefined") {
    alert("Facebook SDK đang tải, vui lòng thử lại sau vài giây.");
    return;
  }
  FB.login(
    function (res) {
      if (!res.authResponse) return;
      api("/auth/oauth/facebook", {
        method: "POST",
        body: { access_token: res.authResponse.accessToken },
      })
        .then(function (tok) {
          completeAuth(tok.access_token, { remember: isRememberMeChecked() });
        })
        .catch(function (e) {
          alert("Đăng nhập Facebook thất bại:\n" + formatApiError(e));
        });
    },
    { scope: "email,public_profile" }
  );
});

(async function initOAuthProviders() {
  try {
    OAUTH_CFG = await api("/auth/oauth/config");
    const hints = [];
    if (!OAUTH_CFG.google_enabled) hints.push("Google: thêm GOOGLE_CLIENT_ID vào .env");
    if (!OAUTH_CFG.facebook_enabled) hints.push("Facebook: thêm FACEBOOK_APP_ID vào .env");
    if (hints.length) setOAuthHint(hints.join(" • "));

    initGoogleButton(OAUTH_CFG);
    initFacebook(OAUTH_CFG);

    if (!OAUTH_CFG.google_enabled) {
      var hit = document.querySelector(".account-google-hit");
      if (hit) hit.style.opacity = "0.45";
      if ($("googleSignInWrap")) $("googleSignInWrap").innerHTML = "";
    }
    $("btnFacebookLogin").disabled = !OAUTH_CFG.facebook_enabled;
  } catch (e) {
    console.warn("OAuth config:", e);
    setOAuthHint("Không tải cấu hình OAuth. Kiểm tra backend đang chạy.");
  }
})();
