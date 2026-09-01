(function () {
  const DEFAULT_APP = "cmtid3972041k0cl7b7xyt0xs";
  const APP_KEY = "buon_privy_app";
  const CLIENT_KEY = "buon_privy_client";
  const EMAIL_KEY = "buon_privy_email";
  var privy = null;

  function val(id) { var el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
  function saveIds() {
    localStorage.setItem(APP_KEY, val("privyAppId") || DEFAULT_APP);
    localStorage.setItem(CLIENT_KEY, val("privyClientId"));
    localStorage.setItem(EMAIL_KEY, val("privyEmail"));
  }
  function loadIds() {
    var a = document.getElementById("privyAppId");
    var c = document.getElementById("privyClientId");
    var e = document.getElementById("privyEmail");
    if (a && !a.value) a.value = localStorage.getItem(APP_KEY) || DEFAULT_APP;
    if (c && !c.value) c.value = localStorage.getItem(CLIENT_KEY) || "";
    if (e && !e.value) e.value = localStorage.getItem(EMAIL_KEY) || "";
  }
  function errText(e) {
    if (!e) return "unknown";
    if (typeof e === "string") return e;
    return e.message || e.error || e.code || JSON.stringify(e);
  }

  async function loadSdk() {
    log("Loading Privy SDK");
    var mod = await import("https://esm.sh/@privy-io/js-sdk-core@0.72.1");
    return mod;
  }

  async function client() {
    if (privy) return privy;
    saveIds();
    var appId = val("privyAppId") || DEFAULT_APP;
    var clientId = val("privyClientId");
    var mod = await loadSdk();
    var Privy = mod.default || mod.Privy;
    var LocalStorage = mod.LocalStorage;
    if (!Privy) throw new Error("Privy SDK export missing");
    var opts = { appId: appId, storage: new LocalStorage() };
    if (clientId) opts.clientId = clientId;
    privy = new Privy(opts);
    log("Privy client ready");
    try {
      if (privy.embeddedWallet && privy.embeddedWallet.getURL) {
        var iframe = document.getElementById("privyFrame") || document.createElement("iframe");
        iframe.id = "privyFrame";
        iframe.src = privy.embeddedWallet.getURL();
        iframe.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;border:0";
        document.body.appendChild(iframe);
        if (privy.setMessagePoster) privy.setMessagePoster(iframe.contentWindow);
        window.addEventListener("message", function (ev) {
          if (ev.source !== iframe.contentWindow) return;
          var data = ev.data;
          if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) {} }
          if (privy.embeddedWallet.onMessage) privy.embeddedWallet.onMessage(data);
        });
      }
    } catch (e) { log("iframe: " + errText(e)); }
    return privy;
  }

  function solAddress(user) {
    if (!user) return null;
    var bags = [user.linked_accounts, user.linkedAccounts, user.wallets, user.smartWallets];
    for (var b = 0; b < bags.length; b++) {
      var list = bags[b] || [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i] || {};
        var chain = String(a.chain_type || a.chainType || a.type || a.chain || "").toLowerCase();
        if ((chain.indexOf("sol") >= 0 || chain.indexOf("svm") >= 0) && a.address) return a.address;
      }
    }
    if (user.wallet && user.wallet.address) return user.wallet.address;
    return null;
  }

  async function afterLogin(user) {
    log("Logged in, looking for Solana wallet");
    var addr = solAddress(user);
    if (!addr && privy.embeddedWallet && privy.embeddedWallet.create) {
      try {
        var created = await privy.embeddedWallet.create({ chainType: "solana" });
        user = created.user || created;
        addr = solAddress(user) || created.address;
      } catch (e) { log("create wallet: " + errText(e)); }
    }
    if (!addr) throw new Error("Login worked but no Solana wallet. Enable SVM embedded wallets in Privy.");
    state.wallet = addr;
    state.kp = null;
    state.privyUser = user;
    document.getElementById("connectBtn").textContent = "Cash account";
    document.getElementById("disconnectBtn").hidden = false;
    document.getElementById("walletStatus").textContent = "wallet on";
    document.getElementById("addrList").innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + addr + "</code><button class=\"ghost\" data-copy=\"" + addr + "\" type=\"button\">Copy</button></div><div class=\"meta\">Privy cash account</div>";
    log("Privy cash account " + addr);
    if (typeof refreshBalance === "function") refreshBalance();
  }

  async function sendCode() {
    var email = val("privyEmail");
    if (!email) throw new Error("Enter email");
    var p = await client();
    var fn = p.auth && p.auth.email && (p.auth.email.sendCode || p.auth.email.sendOTP);
    if (!fn) throw new Error("SDK has no email.sendCode");
    try { await fn.call(p.auth.email, email); }
    catch (e1) { await fn.call(p.auth.email, { email: email }); }
    log("Code sent to " + email);
  }

  async function loginCode() {
    var email = val("privyEmail");
    var code = val("privyCode");
    if (!email || !code) throw new Error("Email and code required");
    var p = await client();
    var emailApi = p.auth && p.auth.email;
    if (!emailApi) throw new Error("SDK has no auth.email");
    var session;
    var methods = ["loginWithCode", "login", "verifyCode"];
    var last;
    for (var i = 0; i < methods.length; i++) {
      var name = methods[i];
      if (typeof emailApi[name] !== "function") continue;
      try {
        session = await emailApi[name](email, code);
        log("Login via " + name);
        break;
      } catch (e1) {
        try {
          session = await emailApi[name]({ email: email, code: code });
          log("Login via " + name + " object");
          break;
        } catch (e2) { last = e2; }
      }
    }
    if (!session) throw last || new Error("All login methods failed");
    await afterLogin(session.user || session);
  }

  window.sendPrivyCode = function () {
    sendCode().catch(function (e) { log("Send code: " + errText(e)); });
  };
  window.verifyPrivyCode = function () {
    log("Opening cash account");
    loginCode().catch(function (e) { log("Open account: " + errText(e)); });
  };

  function bind(id, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      fn();
    });
  }
  bind("privySend", window.sendPrivyCode);
  bind("privyGo", window.verifyPrivyCode);
  loadIds();
  log("Privy login ready");
})();
