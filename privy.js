(function () {
  const DEFAULT_APP = "cmtid3972041k0cl7b7xyt0xs";
  const AUTH = "https://auth.privy.io/api/v1";
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function headers() {
    var h = { "content-type": "application/json", "privy-app-id": val("privyAppId") || DEFAULT_APP };
    var c = val("privyClientId");
    if (c) h["privy-client-id"] = c;
    return h;
  }
  async function post(path, body) {
    var res = await fetch(AUTH + path, { method: "POST", headers: headers(), body: JSON.stringify(body || {}) });
    var text = await res.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
    if (!res.ok) throw new Error(data.error || data.message || ("HTTP " + res.status));
    return data;
  }
  window.sendPrivyCode = function () {
    var email = val("privyEmail");
    if (!email) { log("Enter email"); return; }
    post("/passwordless/init", { email: email }).then(function () {
      log("Privy code sent to " + email);
    }).catch(function (e) { log("Send code failed: " + (e.message || e)); });
  };
  window.verifyPrivyCode = function () {
    var email = val("privyEmail");
    var code = val("privyCode");
    if (!email || !code) { log("Email and code required"); return; }
    post("/passwordless/authenticate", { email: email, code: code, mode: "login-or-sign-up" }).then(function (session) {
      var user = session.user || session;
      state.privyUser = user;
      log("Privy signed in " + (user.id || ""));
      if (typeof openCashAccount === "function") openCashAccount();
    }).catch(function (e) { log("Privy login failed: " + (e.message || e)); });
  };
  var a = document.getElementById("privyAppId");
  if (a && !a.value) a.value = DEFAULT_APP;
  var send = document.getElementById("privySend");
  var go = document.getElementById("privyGo");
  if (send) send.onclick = function () { sendPrivyCode(); };
  if (go) go.onclick = function () { verifyPrivyCode(); };
})();
