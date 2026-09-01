(function () {
  const APP_KEY = "buon_privy_app";
  const CLIENT_KEY = "buon_privy_client";
  const EMAIL_KEY = "buon_privy_email";
  var privy = null;
  var iframeReady = false;

  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function saveIds() {
    localStorage.setItem(APP_KEY, val("privyAppId"));
    localStorage.setItem(CLIENT_KEY, val("privyClientId"));
    localStorage.setItem(EMAIL_KEY, val("privyEmail"));
  }
  function loadIds() {
    var a = document.getElementById("privyAppId");
    var c = document.getElementById("privyClientId");
    var e = document.getElementById("privyEmail");
    if (a && !a.value) a.value = localStorage.getItem(APP_KEY) || "";
    if (c && !c.value) c.value = localStorage.getItem(CLIENT_KEY) || "";
    if (e && !e.value) e.value = localStorage.getItem(EMAIL_KEY) || "";
  }

  async function loadSdk() {
    return import("https://esm.sh/@privy-io/js-sdk-core@0.69.1");
  }

  async function client() {
    if (privy) return privy;
    saveIds();
    var appId = val("privyAppId") || localStorage.getItem(APP_KEY);
    var clientId = val("privyClientId") || localStorage.getItem(CLIENT_KEY);
    if (!appId) throw new Error("Paste the Privy App ID first");
    var mod = await loadSdk();
    var Privy = mod.default || mod.Privy;
    var LocalStorage = mod.LocalStorage;
    privy = new Privy({ appId: appId, clientId: clientId || undefined, storage: new LocalStorage() });
    await mountFrame();
    return privy;
  }

  async function mountFrame() {
    if (iframeReady || !privy || !privy.embeddedWallet) return;
    var iframe = document.getElementById("privyFrame");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "privyFrame";
      iframe.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
      document.body.appendChild(iframe);
    }
    iframe.src = privy.embeddedWallet.getURL();
    if (privy.setMessagePoster) privy.setMessagePoster(iframe.contentWindow);
    window.addEventListener("message", function (e) {
      if (e.source !== iframe.contentWindow) return;
      var data = typeof e.data === "string" ? (function () { try { return JSON.parse(e.data); } catch (err) { return e.data; } })() : e.data;
      if (privy.embeddedWallet && privy.embeddedWallet.onMessage) privy.embeddedWallet.onMessage(data);
    });
    iframeReady = true;
  }

  function solAddress(user) {
    var accounts = (user && (user.linked_accounts || user.linkedAccounts || user.wallets)) || [];
    for (var i = 0; i < accounts.length; i++) {
      var a = accounts[i] || {};
      var chain = String(a.chain_type || a.chainType || a.type || "").toLowerCase();
      if (chain.indexOf("sol") >= 0 && a.address) return a.address;
    }
    if (user && user.wallet && user.wallet.address) return user.wallet.address;
    return null;
  }

  async function afterLogin(user) {
    var addr = solAddress(user);
    if (!addr && privy.embeddedWallet && privy.embeddedWallet.create) {
      try {
        var created = await privy.embeddedWallet.create({ chainType: "solana" });
        user = created.user || created;
        addr = solAddress(user);
      } catch (e) {
        log("wallet create: " + (e.message || e));
      }
    }
    if (!addr) throw new Error("Privy logged in but no Solana wallet yet. Enable Solana embedded wallets in the Privy dashboard.");
    state.wallet = addr;
    state.privyUser = user;
    document.getElementById("connectBtn").textContent = "Cash account";
    document.getElementById("disconnectBtn").hidden = false;
    document.getElementById("walletStatus").textContent = "wallet on";
    var list = document.getElementById("addrList");
    if (list) list.innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + addr + "</code><button class=\"ghost\" data-copy=\"" + addr + "\" type=\"button\">Copy</button></div><div class=\"meta\">Privy cash account. Deposit Solana USDC here.</div>";
    log("Privy cash account " + addr);
    if (typeof refreshBalance === "function") refreshBalance();
  }

  window.sendPrivyCode = async function () {
    try {
      saveIds();
      var email = val("privyEmail");
      if (!email) throw new Error("Enter email");
      var p = await client();
      await p.auth.email.sendCode(email);
      log("Code sent to " + email);
    } catch (e) { log("Privy: " + (e.message || e)); }
  };

  window.verifyPrivyCode = async function () {
    try {
      var email = val("privyEmail");
      var code = val("privyCode");
      if (!email || !code) throw new Error("Email and code required");
      var p = await client();
      var session = await p.auth.email.login(email, code);
      var user = session.user || session;
      await afterLogin(user);
    } catch (e) { log("Privy: " + (e.message || e)); }
  };

  var sendBtn = document.getElementById("privySend");
  var goBtn = document.getElementById("privyGo");
  if (sendBtn) sendBtn.onclick = function () { sendPrivyCode(); };
  if (goBtn) goBtn.onclick = function () { verifyPrivyCode(); };
  loadIds();
})();
