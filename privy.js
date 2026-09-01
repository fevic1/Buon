(function () {
  const DEFAULT_APP = "cmtid3972041k0cl7b7xyt0xs";
  const AUTH = "https://auth.privy.io/api/v1";
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function appId() { return val("privyAppId") || DEFAULT_APP; }
  function clientId() { return val("privyClientId"); }
  function headers() {
    var h = { "content-type": "application/json", "privy-app-id": appId() };
    if (clientId()) h["privy-client-id"] = clientId();
    return h;
  }
  function errText(e) {
    if (!e) return "unknown";
    if (typeof e === "string") return e;
    return e.error || e.message || e.code || JSON.stringify(e);
  }
  async function post(path, body) {
    var res = await fetch(AUTH + path, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    var text = await res.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
    if (!res.ok) throw new Error(data.error || data.message || text || ("HTTP " + res.status));
    return data;
  }
  function solAddress(user) {
    if (!user) return null;
    var bags = [user.linked_accounts, user.linkedAccounts, user.wallets];
    for (var b = 0; b < bags.length; b++) {
      var list = bags[b] || [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i] || {};
        var chain = String(a.chain_type || a.chainType || a.type || "").toLowerCase();
        if ((/sol|svm/).test(chain) && a.address) return a.address;
        if (a.address && !String(a.address).startsWith("0x") && String(a.address).length > 30) return a.address;
      }
    }
    return user.wallet && user.wallet.address;
  }
  function showAccount(addr, user) {
    state.wallet = addr;
    state.kp = null;
    state.privyUser = user;
    document.getElementById("connectBtn").textContent = "Cash account";
    document.getElementById("disconnectBtn").hidden = false;
    document.getElementById("walletStatus").textContent = "wallet on";
    document.getElementById("walletAddr").textContent = addr;
    document.getElementById("addrList").innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + addr + "</code><button class=\"ghost\" data-copy=\"" + addr + "\" type=\"button\">Copy</button></div><div class=\"meta\">Privy cash account. Deposit Solana USDC here.</div>";
    log("Privy cash account " + addr);
    if (typeof refreshBalance === "function") refreshBalance();
  }
  window.sendPrivyCode = function () {
    var email = val("privyEmail");
    if (!email) { log("Enter email first"); return; }
    log("Sending login code");
    post("/passwordless/init", { email: email }).then(function () {
      log("Code sent to " + email + ". Check the inbox.");
    }).catch(function (e) { log("Send code failed: " + errText(e)); });
  };
  window.verifyPrivyCode = function () {
    var email = val("privyEmail");
    var code = val("privyCode");
    if (!email || !code) { log("Email and code required"); return; }
    log("Opening Privy session");
    post("/passwordless/authenticate", { email: email, code: code, mode: "login-or-sign-up" }).then(function (session) {
      var user = session.user || session;
      var addr = solAddress(user);
      if (!addr) throw new Error("Logged in, no Solana wallet on the user yet");
      showAccount(addr, user);
    }).catch(function (e) { log("Open account failed: " + errText(e)); });
  };
  var a = document.getElementById("privyAppId");
  if (a && !a.value) a.value = DEFAULT_APP;
})();
