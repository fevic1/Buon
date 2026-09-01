(function () {
  const DEFAULT_APP = "cmtid3972041k0cl7b7xyt0xs";
  const AUTH = "https://auth.privy.io/api/v1";
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function appId() { return val("privyAppId") || DEFAULT_APP; }
  function clientId() { return val("privyClientId"); }
  function headers(token) {
    var h = { "content-type": "application/json", "privy-app-id": appId() };
    if (clientId()) h["privy-client-id"] = clientId();
    if (token) h.authorization = "Bearer " + token;
    return h;
  }
  function errText(e) {
    if (!e) return "unknown";
    if (typeof e === "string") return e;
    return e.error || e.message || e.code || JSON.stringify(e);
  }
  async function post(path, body, token) {
    var res = await fetch(AUTH + path, { method: "POST", headers: headers(token), body: JSON.stringify(body || {}) });
    var text = await res.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
    if (!res.ok) throw new Error(data.error || data.message || text || ("HTTP " + res.status));
    return data;
  }
  function tokenOf(session) {
    return session.token || session.access_token || session.identity_token || session.privy_access_token || (session.session && session.session.token);
  }
  function solAddress(user) {
    if (!user) return null;
    var bags = [user.linked_accounts, user.linkedAccounts, user.wallets, user.embedded_wallets, user.embeddedWallets];
    for (var b = 0; b < bags.length; b++) {
      var list = bags[b] || [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i] || {};
        var chain = String(a.chain_type || a.chainType || a.type || a.wallet_client_type || "").toLowerCase();
        var addr = a.address || a.publicKey || a.public_key;
        if (!addr) continue;
        if (/sol|svm/.test(chain)) return addr;
        if (!String(addr).startsWith("0x") && String(addr).length >= 32) return addr;
      }
    }
    return null;
  }
  function showAccount(addr, user) {
    state.wallet = addr;
    state.kp = null;
    state.privyUser = user;
    document.getElementById("connectBtn").textContent = "Cash account";
    document.getElementById("disconnectBtn").hidden = false;
    document.getElementById("walletStatus").textContent = "wallet on";
    document.getElementById("walletAddr").textContent = addr;
    document.getElementById("addrList").innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + addr + "</code><button class=\"ghost\" data-copy=\"" + addr + "\" type=\"button\">Copy</button></div><div class=\"meta\">Privy cash account. Now send Solana USDC here.</div>";
    log("Privy cash account " + addr);
    if (typeof refreshBalance === "function") refreshBalance();
  }
  async function createSolana(session) {
    var token = tokenOf(session);
    var paths = ["/embedded_wallets", "/wallets", "/users/me/wallets"];
    var bodies = [
      { chain_type: "solana" },
      { chainType: "solana" },
      { chain_type: "solana", wallet_index: 0 }
    ];
    var last;
    for (var p = 0; p < paths.length; p++) {
      for (var b = 0; b < bodies.length; b++) {
        try {
          var created = await post(paths[p], bodies[b], token);
          var addr = created.address || solAddress(created.user || created) || solAddress(created);
          if (addr) return { addr: addr, user: created.user || created };
        } catch (e) { last = e; }
      }
    }
    try {
      var mod = await import("https://esm.sh/@privy-io/js-sdk-core@0.72.1");
      var Privy = mod.default || mod.Privy;
      var LocalStorage = mod.LocalStorage;
      var privy = new Privy({ appId: appId(), clientId: clientId() || undefined, storage: new LocalStorage() });
      if (privy.initialize) await privy.initialize();
      if (privy.embeddedWallet && privy.embeddedWallet.create) {
        var w = await privy.embeddedWallet.create({ chainType: "solana" });
        var addr2 = w.address || solAddress(w.user || w);
        if (addr2) return { addr: addr2, user: w.user || w };
      }
    } catch (e2) { last = e2; }
    throw last || new Error("Could not create Solana wallet");
  }
  window.sendPrivyCode = function () {
    var email = val("privyEmail");
    if (!email) { log("Enter email first"); return; }
    log("Sending login code");
    post("/passwordless/init", { email: email }).then(function () {
      log("Code sent to " + email);
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
      if (addr) { showAccount(addr, user); return; }
      log("Logged in. Creating Solana cash wallet");
      return createSolana(session).then(function (w) { showAccount(w.addr, w.user || user); });
    }).catch(function (e) { log("Open account failed: " + errText(e)); });
  };
  var a = document.getElementById("privyAppId");
  if (a && !a.value) a.value = DEFAULT_APP;
})();
