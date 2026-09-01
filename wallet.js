(function () {
  const STORE = "buon_embed_v1";
  function bytesToJson(u8) { return JSON.stringify(Array.from(u8)); }
  function jsonToBytes(s) { return Uint8Array.from(JSON.parse(s)); }
  function loadKp() {
    var raw = localStorage.getItem(STORE);
    if (!raw || !window.solanaWeb3) return null;
    try { return window.solanaWeb3.Keypair.fromSecretKey(jsonToBytes(raw)); }
    catch (e) { return null; }
  }
  function saveKp(kp) { localStorage.setItem(STORE, bytesToJson(kp.secretKey)); }
  function setUi(on) {
    var c = document.getElementById("connectBtn");
    var d = document.getElementById("disconnectBtn");
    if (c) c.textContent = on ? "Cash account" : "Create cash account";
    if (d) d.hidden = !on;
    var st = document.getElementById("walletStatus");
    if (st) st.textContent = on ? "wallet on" : "wallet off";
  }
  function drawAddrs() {
    var list = document.getElementById("addrList");
    if (!list) return;
    if (!state.wallet) {
      list.innerHTML = "<div class=\"meta\">Create a cash account in this app. Deposit Solana USDC to that address.</div>";
      return;
    }
    list.innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + state.wallet + "</code><button class=\"ghost\" data-copy=\"" + state.wallet + "\" type=\"button\">Copy</button></div>" +
      "<div class=\"meta\">This address is the Buon cash account. It is not Phantom.</div>";
  }
  window.openCashAccount = function () {
    if (!window.solanaWeb3) { log("web3 missing"); return null; }
    var kp = loadKp();
    if (!kp) {
      kp = window.solanaWeb3.Keypair.generate();
      saveKp(kp);
      log("Cash account created in this app");
    } else {
      log("Cash account unlocked");
    }
    state.kp = kp;
    state.wallet = kp.publicKey.toString();
    state.evm = null;
    setUi(true);
    drawAddrs();
    if (typeof refreshBalance === "function") refreshBalance();
    return kp;
  };
  window.disconnectWallet = function () {
    state.kp = null;
    state.wallet = null;
    state.evm = null;
    state.cashUsdc = 0;
    setUi(false);
    drawAddrs();
    var cash = document.getElementById("cashAmt");
    var gas = document.getElementById("gasAmt");
    if (cash) cash.textContent = "— USDC";
    if (gas) gas.textContent = "SOL gas —";
    var box = document.getElementById("walletBals");
    if (box) box.innerHTML = "";
    log("Cash account locked. Key stays in this browser until you wipe it.");
  };
  window.wipeCashAccount = function () {
    localStorage.removeItem(STORE);
    disconnectWallet();
    log("Cash account wiped from this browser");
  };
  window.exportCashAccount = function () {
    var kp = state.kp || loadKp();
    if (!kp) { log("No cash account"); return; }
    var raw = JSON.stringify(Array.from(kp.secretKey));
    navigator.clipboard && navigator.clipboard.writeText(raw);
    log("Secret key copied. Anyone with it can spend the cash.");
  };
  window.ensureWallet = async function () {
    var kp = state.kp || loadKp() || openCashAccount();
    if (!kp) throw new Error("Could not open cash account");
    state.kp = kp;
    state.wallet = kp.publicKey.toString();
    setUi(true);
    drawAddrs();
    return state.wallet;
  };
  window.signAndSend = async function (vtx) {
    var kp = state.kp || loadKp();
    if (!kp) throw new Error("No cash account to sign");
    vtx.sign([kp]);
    var raw = vtx.serialize();
    if (typeof connection === "function") {
      var conn = await connection();
      return await conn.sendRawTransaction(raw, { skipPreflight: false });
    }
    throw new Error("No send path");
  };
  document.getElementById("connectBtn").onclick = function () {
    try { openCashAccount(); } catch (e) { log(e.message || String(e)); }
  };
  var disc = document.getElementById("disconnectBtn");
  if (disc) disc.onclick = function () { disconnectWallet(); };
  var wipe = document.getElementById("wipeBtn");
  if (wipe) wipe.onclick = function () { wipeCashAccount(); };
  var exp = document.getElementById("exportBtn");
  if (exp) exp.onclick = function () { exportCashAccount(); };
  setTimeout(function () {
    if (loadKp()) openCashAccount();
  }, 300);
})();
