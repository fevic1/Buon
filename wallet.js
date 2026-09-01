(function () {
  const STORE = "buon_embed_v1";
  function jsonToBytes(s) { return Uint8Array.from(JSON.parse(s)); }
  function loadKp() {
    var raw = localStorage.getItem(STORE);
    if (!raw || !window.solanaWeb3) return null;
    try { return window.solanaWeb3.Keypair.fromSecretKey(jsonToBytes(raw)); }
    catch (e) { return null; }
  }
  function saveKp(kp) { localStorage.setItem(STORE, JSON.stringify(Array.from(kp.secretKey))); }
  function draw() {
    var list = document.getElementById("addrList");
    if (!list || !state.wallet) return;
    var evm = state.evm ? "<div class=\"addr-row\"><span class=\"meta\">EVM</span><code>" + state.evm + "</code><button class=\"ghost\" data-copy=\"" + state.evm + "\" type=\"button\">Copy</button></div>" : "<div class=\"meta\">EVM buys use the Privy 0x address (Base / ETH / BNB)</div>";
    list.innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + state.wallet + "</code><button class=\"ghost\" data-copy=\"" + state.wallet + "\" type=\"button\">Copy</button></div>" + evm;
    var btn = document.getElementById("connectBtn");
    if (btn) btn.textContent = "Cash account";
    var d = document.getElementById("disconnectBtn");
    if (d) d.hidden = false;
    var st = document.getElementById("walletStatus");
    if (st) st.textContent = "wallet on";
    var wa = document.getElementById("walletAddr");
    if (wa) wa.textContent = state.wallet;
  }
  window.openCashAccount = function () {
    if (!window.solanaWeb3) { log("solana web3 missing"); return null; }
    var kp = loadKp();
    if (!kp) { kp = window.solanaWeb3.Keypair.generate(); saveKp(kp); }
    state.kp = kp;
    state.wallet = kp.publicKey.toString();
    draw();
    log("Cash account " + state.wallet);
    if (typeof refreshBalance === "function") refreshBalance();
    return kp;
  };
  window.ensureWallet = async function () {
    var kp = state.kp || loadKp() || openCashAccount();
    if (!kp) throw new Error("Could not open cash account");
    state.kp = kp;
    state.wallet = kp.publicKey.toString();
    draw();
    return state.wallet;
  };
  window.signAndSend = async function (vtx) {
    var kp = state.kp || loadKp() || openCashAccount();
    if (!kp) throw new Error("No cash account to sign");
    vtx.sign([kp]);
    var conn = await connection();
    return await conn.sendRawTransaction(vtx.serialize(), { skipPreflight: false });
  };
  window.exportCashAccount = function () {
    var kp = state.kp || loadKp();
    if (!kp) { log("No key in this browser"); return; }
    var raw = JSON.stringify(Array.from(kp.secretKey));
    try { navigator.clipboard.writeText(raw); } catch (e) {}
    window.prompt("Cash account secret. Save it offline.", raw);
  };
  window.disconnectWallet = function () {
    state.kp = null; state.wallet = null; state.cashUsdc = 0;
    var btn = document.getElementById("connectBtn");
    if (btn) btn.textContent = "Sign in";
    var d = document.getElementById("disconnectBtn");
    if (d) d.hidden = true;
    log("Locked");
  };
  window.wipeCashAccount = function () {
    localStorage.removeItem(STORE);
    disconnectWallet();
    log("Key wiped from this browser");
  };
  var c = document.getElementById("connectBtn");
  if (c) c.onclick = function () { openCashAccount(); };
  var d = document.getElementById("disconnectBtn");
  if (d) d.onclick = function () { disconnectWallet(); };
  var w = document.getElementById("wipeBtn");
  if (w) w.onclick = function () { wipeCashAccount(); };
  var exp = document.getElementById("exportBtn");
  if (exp) exp.onclick = function () { exportCashAccount(); };
  function boot() { if (window.solanaWeb3) openCashAccount(); else setTimeout(boot, 200); }
  boot();
})();
