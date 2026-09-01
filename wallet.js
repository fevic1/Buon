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
    var extra = "";
    if (state.privyUser) extra = "<div class=\"meta\">Also signed into Privy as email</div>";
    list.innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + state.wallet + "</code><button class=\"ghost\" data-copy=\"" + state.wallet + "\" type=\"button\">Copy</button></div>" +
      "<div class=\"meta\">This is the spend account. Send Solana USDC here, then Buy.</div>" + extra;
    var btn = document.getElementById("connectBtn");
    var disc = document.getElementById("disconnectBtn");
    if (btn) btn.textContent = "Cash account";
    if (disc) disc.hidden = false;
    var st = document.getElementById("walletStatus");
    if (st) st.textContent = "wallet on";
    var wa = document.getElementById("walletAddr");
    if (wa) wa.textContent = state.wallet;
  }
  window.openCashAccount = function () {
    if (!window.solanaWeb3) { log("solana web3 missing"); return null; }
    var kp = loadKp();
    if (!kp) {
      kp = window.solanaWeb3.Keypair.generate();
      saveKp(kp);
    }
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
  window.disconnectWallet = function () {
    state.kp = null;
    state.wallet = null;
    state.cashUsdc = 0;
    document.getElementById("connectBtn").textContent = "Create cash account";
    document.getElementById("disconnectBtn").hidden = true;
    document.getElementById("walletStatus").textContent = "wallet off";
    document.getElementById("cashAmt").textContent = "\u2014 USDC";
    document.getElementById("gasAmt").textContent = "SOL gas \u2014";
    document.getElementById("addrList").innerHTML = "<div class=\"meta\">Cash account locked</div>";
    log("Logged out. Key stays in this browser until Wipe local.");
  };
  window.wipeCashAccount = function () {
    localStorage.removeItem(STORE);
    disconnectWallet();
    log("Cash key wiped");
  };
  var c = document.getElementById("connectBtn");
  if (c) c.onclick = function () { openCashAccount(); };
  var d = document.getElementById("disconnectBtn");
  if (d) d.onclick = function () { disconnectWallet(); };
  var w = document.getElementById("wipeBtn");
  if (w) w.onclick = function () { wipeCashAccount(); };
  function boot() {
    if (window.solanaWeb3) openCashAccount();
    else setTimeout(boot, 200);
  }
  boot();
})();
