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
      list.innerHTML = "<div class=\"meta\">Log in with email to open the Privy cash account.</div>";
      return;
    }
    list.innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + state.wallet + "</code><button class=\"ghost\" data-copy=\"" + state.wallet + "\" type=\"button\">Copy</button></div>";
  }
  window.openCashAccount = function () {
    log("Use Send code + Open cash account for Privy. Local key is fallback only.");
    return state.kp || loadKp();
  };
  window.openLocalCashAccount = function () {
    if (!window.solanaWeb3) { log("web3 missing"); return null; }
    var kp = loadKp() || window.solanaWeb3.Keypair.generate();
    saveKp(kp);
    state.kp = kp;
    state.wallet = kp.publicKey.toString();
    setUi(true);
    drawAddrs();
    log("Local fallback account " + state.wallet);
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
    document.getElementById("cashAmt").textContent = "\u2014 USDC";
    document.getElementById("gasAmt").textContent = "SOL gas \u2014";
    document.getElementById("walletBals").innerHTML = "";
    log("Logged out");
  };
  window.wipeCashAccount = function () {
    localStorage.removeItem(STORE);
    disconnectWallet();
    log("Local key wiped");
  };
  window.exportCashAccount = function () {
    var kp = state.kp || loadKp();
    if (!kp) { log("No local key"); return; }
    navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(Array.from(kp.secretKey)));
    log("Local secret copied");
  };
  window.ensureWallet = async function () {
    if (state.wallet) return state.wallet;
    throw new Error("Open the Privy cash account first");
  };
  window.signAndSend = async function (vtx) {
    var kp = state.kp || loadKp();
    if (!kp) throw new Error("Privy signing is next; local key not loaded");
    vtx.sign([kp]);
    var conn = await connection();
    return await conn.sendRawTransaction(vtx.serialize());
  };
  document.getElementById("connectBtn").onclick = function () {
    log("Use Open cash account under email");
  };
  var disc = document.getElementById("disconnectBtn");
  if (disc) disc.onclick = function () { disconnectWallet(); };
  var wipe = document.getElementById("wipeBtn");
  if (wipe) wipe.onclick = function () { wipeCashAccount(); };
  var exp = document.getElementById("exportBtn");
  if (exp) exp.onclick = function () { exportCashAccount(); };
})();
