/* NAS Files auth pages — progressive enhancement over mcp-auth-proxy's built-in pages.
   Upstream form actions, methods and field names are reused untouched; if anything
   here throws, html.nb-ready is never set and the original page stays usable. */
(function () {
  "use strict";

  var ICON = {
    nas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3.5" width="18" height="7" rx="2"/><rect x="3" y="13.5" width="18" height="7" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4.5M12 17.5h.01"/></svg>',
    read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    write: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M12 11v5M9.5 13.5h5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="flex:none;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16h.01"/></svg>'
  };

  var ERRORS = {
    "Invalid password": "密碼不正確，請再試一次。",
    "Password is required": "請輸入存取密碼。"
  };

  var CLIENTS = {
    "claude.ai": "Claude",
    "chatgpt.com": "ChatGPT",
    "chat.openai.com": "ChatGPT"
  };
  var CLIENT_KEY = "nb-client-host";

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "html") node.innerHTML = attrs[k]; // static icon markup only
      else if (k === "text") node.textContent = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function rememberClient() {
    try {
      var ref = document.referrer && new URL(document.referrer);
      if (ref && ref.host !== location.host) sessionStorage.setItem(CLIENT_KEY, ref.host);
    } catch (e) { /* storage may be blocked; client name is cosmetic */ }
  }

  function clientName() {
    var host = null;
    try { host = sessionStorage.getItem(CLIENT_KEY); } catch (e) {}
    if (!host) return null;
    var match = Object.keys(CLIENTS).filter(function (h) { return host === h || host.endsWith("." + h); })[0];
    return match ? CLIENTS[match] : null;
  }

  function mount(card, title) {
    document.documentElement.lang = "zh-Hant";
    document.title = title + " · NAS Files";
    var icon = document.querySelector('link[rel="icon"]') || el("link", { rel: "icon" });
    icon.href = "/.brand/icon.svg";
    document.head.appendChild(icon);
    var foot = el("p", { class: "nb-foot", html: ICON.lock + "<span>連線已加密 · NAS Files · mcp.nas.hisamori.app</span>" });
    document.body.appendChild(el("main", { class: "nb-root" }, [card, foot]));
    document.documentElement.classList.add("nb-ready");
  }

  function header(iconKey, title, sub, warn) {
    return [
      el("div", { class: "nb-mark" + (warn ? " is-warn" : ""), html: ICON[iconKey] }),
      el("h1", { class: "nb-title", text: title }),
      sub ? el("p", { class: "nb-sub", text: sub }) : null
    ];
  }

  function busy(button, label) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "";
    button.appendChild(el("span", { class: "nb-spinner", "aria-hidden": "true" }));
    button.appendChild(el("span", { text: label }));
  }

  function resetOnReturn(button, label) {
    // Back/forward cache restores the page with the button still busy.
    window.addEventListener("pageshow", function (e) {
      if (!e.persisted) return;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = label;
    });
  }

  function renderLogin(orig) {
    rememberClient();
    var upstreamError = (document.querySelector(".error-message") || {}).textContent;
    upstreamError = upstreamError ? upstreamError.trim() : "";

    var alert = el("div", { class: "nb-alert", role: "alert", id: "nb-error", hidden: !upstreamError });
    function showError(msg) {
      alert.innerHTML = ICON.alert;
      alert.appendChild(el("span", { text: msg }));
      alert.hidden = false;
      input.setAttribute("aria-invalid", "true");
    }

    var input = el("input", {
      class: "nb-input", id: "nb-password", name: "password", type: "password",
      autocomplete: "current-password", required: true, autofocus: true,
      "aria-describedby": "nb-error", spellcheck: "false"
    });
    var reveal = el("button", { class: "nb-reveal", type: "button", "aria-controls": "nb-password", "aria-pressed": "false", text: "顯示" });
    reveal.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      reveal.textContent = show ? "隱藏" : "顯示";
      reveal.setAttribute("aria-pressed", String(show));
      input.focus();
    });

    var submit = el("button", { class: "nb-btn", type: "submit", text: "登入" });
    var form = el("form", { action: orig.getAttribute("action") || "/.auth/login", method: orig.getAttribute("method") || "POST", novalidate: true }, [
      // Unnamed, so never submitted: only helps password managers pair the saved login.
      el("input", { class: "nb-sr", type: "text", autocomplete: "username", value: "nas-files", tabindex: "-1", "aria-hidden": "true", readonly: true }),
      alert,
      el("label", { class: "nb-label", for: "nb-password", text: "存取密碼" }),
      el("div", { class: "nb-field" }, [input, reveal]),
      submit
    ]);

    form.addEventListener("submit", function (e) {
      if (!input.value) {
        e.preventDefault();
        showError(ERRORS["Password is required"]);
        input.focus();
        return;
      }
      busy(submit, "正在驗證…");
    });
    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid")) { input.removeAttribute("aria-invalid"); alert.hidden = true; }
    });
    resetOnReturn(submit, "登入");

    if (upstreamError) showError(ERRORS[upstreamError] || upstreamError);

    var card = el("section", { class: "nb-card", "aria-labelledby": "nb-title" },
      header("nas", "登入 NAS Files", "這是你家中 NAS 的 AI 檔案入口。輸入存取密碼後，就能讓 AI 助理讀取你的檔案。")
        .concat([form]));
    card.querySelector(".nb-title").id = "nb-title";
    mount(card, "登入");
    if (upstreamError) input.select();
  }

  function renderConsent(orig) {
    rememberClient();
    var who = clientName();
    var submit = el("button", { class: "nb-btn", type: "submit", text: "允許存取" });
    var cancel = el("button", { class: "nb-btn is-secondary", type: "button", text: "取消" });
    var form = el("form", { method: orig.getAttribute("method") || "post", action: orig.getAttribute("action") || false }, [
      el("ul", { class: "nb-perms" }, [
        el("li", {}, [
          el("span", { html: ICON.read }),
          el("div", {}, [el("strong", { text: "讀取 NAS 上的共用資料夾" }), el("span", { text: "唯讀，無法修改或刪除任何檔案。" })])
        ]),
        el("li", {}, [
          el("span", { html: ICON.write }),
          el("div", {}, [el("strong", { text: "寫入「AI回寫」資料夾" }), el("span", { text: "只能在 /volume1/AI回寫 建立、修改與刪除檔案。" })])
        ])
      ]),
      submit,
      cancel,
      el("p", { class: "nb-note", text: "授權會一直有效，直到你在該 AI 應用中中斷連接，或管理員撤銷所有連線。" })
    ]);
    form.addEventListener("submit", function () { busy(submit, "正在授權…"); });
    resetOnReturn(submit, "允許存取");

    var card = el("section", { class: "nb-card", "aria-labelledby": "nb-title" },
      header("nas", (who ? who + " " : "這個 AI 應用") + "想要存取你的 NAS",
        "允許後，" + (who ? who + " " : "它") + "可以透過 NAS Files 連接器使用以下權限。").concat([form]));
    card.querySelector(".nb-title").id = "nb-title";

    cancel.addEventListener("click", function () {
      card.replaceChildren.apply(card, header("nas", "已取消授權", "沒有授與任何權限。你可以關閉這個頁面，回到 AI 應用。"));
      window.close(); // works only when the page was opened as a popup
    });

    mount(card, "授權存取");
    submit.focus();
  }

  function renderError(container) {
    var detail = (container.querySelector(".error-details") || {}).textContent;
    detail = detail ? detail.trim() : "";
    var card = el("section", { class: "nb-card", "aria-labelledby": "nb-title" },
      header("warn", "連線過程發生錯誤", "請回到 AI 應用重新連接。如果一直出現，請把下面的訊息提供給管理員。", true)
        .concat([detail ? el("p", { class: "nb-detail", text: detail }) : null]));
    card.querySelector(".nb-title").id = "nb-title";
    mount(card, "發生錯誤");
  }

  function renderUnauthorized() {
    var card = el("section", { class: "nb-card", "aria-labelledby": "nb-title" },
      header("warn", "沒有存取權限", "這個帳號已登入，但沒有被允許使用 NAS Files。", true).concat([
        el("a", { class: "nb-btn is-secondary", href: "/.auth/logout", text: "登出並換一個帳號" })
      ]));
    card.querySelector(".nb-title").id = "nb-title";
    mount(card, "沒有存取權限");
  }

  function run() {
    var login = document.querySelector("form.password-form");
    if (login) return renderLogin(login);
    var forms = document.forms;
    if (forms.length === 1 && !forms[0].querySelector("input") && /^\s*Authorize\s*$/.test(forms[0].textContent)) return renderConsent(forms[0]);
    var box = document.querySelector(".error-container");
    if (box && box.querySelector(".error-icon")) return renderError(box);
    if (box && box.querySelector(".logout-button")) return renderUnauthorized();
  }

  try {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { try { run(); } catch (e) {} });
    else run();
  } catch (e) { /* leave upstream page visible */ }
})();
