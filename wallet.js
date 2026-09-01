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
    list.innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + state.wallet + "</code><button class=\"ghost\" data-copy=\"" + state.wallet + "\" type=\"button\">Copy</button></div>" +
      "<div class=\"meta\">Key stays in this browser. Export shows it below.</div><textarea id=\"keyView\" hidden readonly></textarea>";
    var btn = document.getElementById("connectBtn");
    if (btn) btn.textContent = "Cash account";
    document.getElementById("disconnectBtn").hidden = false;
    document.getElementById("walletStatus").textContent = "wallet on";
    document.getElementById("walletAddr").textContent = state.wallet;
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
    var box = document.getElementById("keyView");
    if (!box) {
      box = document.createElement("textarea");
      box.id = "keyView";
      box.readOnly = true;
      document.getElementById("addrList").appendChild(box);
    }
    box.hidden = false;
    box.value = raw;
    box.style.cssText = "width:100%;min-height:90px;margin-top:8px;background:#0b0a14;color:#eaedff;border:1px solid rgba(203,208,235,.2);border-radius:10px;padding:8px;font:12px ui-monospace,monospace";
    try { navigator.clipboard.writeText(raw); } catch (e) {}
    window.prompt("Cash account secret (64 numbers). Save it offline.", raw);
    log("Secret key shown. Anyone with it can spend the USDC.");
  };
  window.disconnectWallet = function () {
    state.kp = null; state.wallet = null; state.cashUsdc = 0;
    document.getElementById("connectBtn").textContent = "Create cash account";
    document.getElementById("disconnectBtn").hidden = true;
    document.getElementById("walletStatus").textContent = "wallet off";
    document.getElementById("cashAmt").textContent = "\u2014 USDC";
    document.getElementById("gasAmt").textContent = "SOL gas \u2014";
    document.getElementById("addrList").innerHTML = "<div class=\"meta\">Cash account locked</div>";
    log("Locked");
  };
  window.wipeCashAccount = function () {
    localStorage.removeItem(STORE);
    disconnectWallet();
    log("Key wiped from this browser");
  };
  document.getElementById("connectBtn").onclick = function () { openCashAccount(); };
  document.getElementById("disconnectBtn").onclick = function () { disconnectWallet(); };
  document.getElementById("wipeBtn").onclick = function () { wipeCashAccount(); };
  var exp = document.getElementById("exportBtn");
  if (exp) exp.onclick = function () { exportCashAccount(); };
  function boot() { if (window.solanaWeb3) openCashAccount(); else setTimeout(boot, 200); }
  boot();
})();
