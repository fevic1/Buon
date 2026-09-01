(function () {
  const DEFAULT_APP = "cmtid3972041k0cl7b7xyt0xs";
  const AUTH = "https://auth.privy.io/api/v1";
  const SESS = "buon_privy_session";
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function appId() { return val("privyAppId") || DEFAULT_APP; }
  function headers() {
    var h = { "content-type": "application/json", "privy-app-id": appId() };
    var c = val("privyClientId");
    if (c) h["privy-client-id"] = c;
    return h;
  }
  function errText(e) { return (e && (e.message || e.error)) || String(e || "unknown"); }
  async function post(path, body) {
    var res = await fetch(AUTH + path, { method: "POST", headers: headers(), body: JSON.stringify(body || {}) });
    var text = await res.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (err) { data = { raw: text }; }
    if (!res.ok) throw new Error(data.error || data.message || ("HTTP " + res.status));
    return data;
  }
  function accountsOf(user) {
    return (user && (user.linked_accounts || user.linkedAccounts)) || [];
  }
  function emailOf(user) {
    var list = accountsOf(user);
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].type || "").toLowerCase() === "email") return list[i].address;
    }
    return user && (user.email || user.email_address);
  }
  function solOf(user) {
    var list = accountsOf(user);
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var t = String(a.type || a.chain_type || a.chainType || "").toLowerCase();
      if ((/solana|svm/).test(t) && a.address) return a.address;
    }
    return null;
  }
  function paintUser(user) {
    var id = user.id || user.did || user.user_id || "unknown";
    var email = emailOf(user) || val("privyEmail") || "";
    var types = accountsOf(user).map(function (a) { return a.type || a.chain_type || "?"; }).join(", ") || "none";
    var sol = solOf(user);
    state.privyUser = user;
    document.getElementById("walletAddr").textContent = email ? ("Privy \u00b7 " + email) : ("Privy \u00b7 " + id);
    document.getElementById("connectBtn").textContent = "Signed in";
    document.getElementById("disconnectBtn").hidden = false;
    document.getElementById("walletStatus").textContent = "privy on";
    var html = "<div class=\"meta\">Privy user</div><div class=\"addr-row\"><span class=\"meta\">ID</span><code>" + id + "</code></div>";
    if (email) html += "<div class=\"addr-row\"><span class=\"meta\">Email</span><code>" + email + "</code></div>";
    html += "<div class=\"meta\">Linked: " + types + "</div>";
    if (sol) {
      state.wallet = sol;
      html += "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + sol + "</code><button class=\"ghost\" data-copy=\"" + sol + "\" type=\"button\">Copy</button></div>";
    } else {
      state.wallet = null;
      html += "<div class=\"meta\">No Solana wallet on this Privy user. FOMO creates that in their React app, not in this static page.</div>";
    }
    document.getElementById("addrList").innerHTML = html;
    log("Privy session " + id + " \u00b7 " + (email || "") + " \u00b7 linked " + types + (sol ? (" \u00b7 " + sol) : " \u00b7 no Solana wallet"));
    if (sol && typeof refreshBalance === "function") refreshBalance();
  }
  window.sendPrivyCode = function () {
    var email = val("privyEmail");
    if (!email) { log("Enter email first"); return; }
    log("Sending Privy code");
    post("/passwordless/init", { email: email }).then(function () {
      log("Privy sent a code to " + email);
    }).catch(function (e) { log("Send code failed: " + errText(e)); });
  };
  window.verifyPrivyCode = function () {
    var email = val("privyEmail");
    var code = val("privyCode");
    if (!email || !code) { log("Email and code required"); return; }
    log("Checking Privy code");
    post("/passwordless/authenticate", { email: email, code: code, mode: "login-or-sign-up" }).then(function (session) {
      var user = session.user || session;
      try { localStorage.setItem(SESS, JSON.stringify({ id: user.id, email: emailOf(user), linked: accountsOf(user).map(function (a) { return { type: a.type, chain_type: a.chain_type, address: a.address }; }) })); } catch (e) {}
      paintUser(user);
    }).catch(function (e) { log("Privy login failed: " + errText(e)); });
  };
  var a = document.getElementById("privyAppId");
  if (a && !a.value) a.value = DEFAULT_APP;
  try {
    var saved = JSON.parse(localStorage.getItem(SESS) || "null");
    if (saved && saved.id) {
      paintUser({ id: saved.id, linked_accounts: (saved.linked || []).concat(saved.email ? [{ type: "email", address: saved.email }] : []) });
    }
  } catch (e) {}
})();
