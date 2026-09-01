(function () {
  const DEFAULT_APP = "cmtid3972041k0cl7b7xyt0xs";
  const AUTH = "https://auth.privy.io/api/v1";
  const STORE = "buon_embed_v1";
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
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }
    if (!res.ok) throw new Error(data.error || data.message || ("HTTP " + res.status));
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
        var addr = a.address;
        if (addr && (/sol|svm/.test(chain) || (!String(addr).startsWith("0x") && String(addr).length >= 32))) return addr;
      }
    }
    return null;
  }
  function showAccount(addr, note) {
    state.wallet = addr;
    document.getElementById("connectBtn").textContent = "Cash account";
    document.getElementById("disconnectBtn").hidden = false;
    document.getElementById("walletStatus").textContent = "wallet on";
    document.getElementById("walletAddr").textContent = addr;
    document.getElementById("addrList").innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + addr + "</code><button class=\"ghost\" data-copy=\"" + addr + "\" type=\"button\">Copy</button></div><div class=\"meta\">" + note + "</div>";
    log(note + " " + addr);
    if (typeof refreshBalance === "function") refreshBalance();
  }
  function openLocal() {
    if (!window.solanaWeb3) throw new Error("solana web3 missing");
    var raw = localStorage.getItem(STORE);
    var kp;
    if (raw) kp = window.solanaWeb3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    else {
      kp = window.solanaWeb3.Keypair.generate();
      localStorage.setItem(STORE, JSON.stringify(Array.from(kp.secretKey)));
    }
    state.kp = kp;
    showAccount(kp.publicKey.toString(), "Cash account ready. Send Solana USDC here.");
    return kp.publicKey.toString();
  }
  window.sendPrivyCode = function () {
    var email = val("privyEmail");
    if (!email) { log("Enter email first"); return; }
    log("Sending login code");
    post("/passwordless/init", { email: email }).then(function () {
      log("Code sent");
    }).catch(function (e) { log("Send code failed: " + errText(e)); });
  };
  window.verifyPrivyCode = function () {
    var email = val("privyEmail");
    var code = val("privyCode");
    log("Opening cash account");
    function finishLocal(why) {
      log(why);
      openLocal();
    }
    if (!email || !code) { finishLocal("No code — opening in-app cash account"); return; }
    post("/passwordless/authenticate", { email: email, code: code, mode: "login-or-sign-up" }).then(function (session) {
      var user = session.user || session;
      var addr = solAddress(user);
      if (addr) {
        state.kp = null;
        showAccount(addr, "Privy Solana account. Send USDC here.");
        return;
      }
      finishLocal("Privy logged in, no Solana wallet on that user. Opened in-app cash account instead.");
    }).catch(function (e) {
      finishLocal("Privy: " + errText(e) + ". Opened in-app cash account instead.");
    });
  };
  var a = document.getElementById("privyAppId");
  if (a && !a.value) a.value = DEFAULT_APP;
})();
