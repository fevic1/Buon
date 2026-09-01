(function () {
  const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const JQ = "https://lite-api.jup.ag/swap/v1/quote";
  const BASE_RPCS = ["https://mainnet.base.org", "https://base.llamarpc.com"];
  const CHAIN_ID = { ethereum: 1, eth: 1, base: 8453, bsc: 56, bnb: 56, binance: 56, robinhood: 4663, rh: 4663 };
  const POOL = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
  function loadCreds() {
    ["sizeUsd", "minAlert", "minOverlap", "tpPct"].forEach(function (id) {
      var el = document.getElementById(id);
      var v = localStorage.getItem("buon_" + id);
      if (el && v) el.value = v;
    });
  }
  loadCreds();
  async function evmRpc(urls, body) {
    var last = "no evm rpc";
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        var data = await res.json();
        if (data.error) { last = data.error.message; continue; }
        return data.result;
      } catch (e) { last = e.message || String(e); }
    }
    throw new Error(last);
  }
  async function baseUsdc(addr) {
    if (!addr || addr.indexOf("0x") !== 0) return 0;
    var data = "0x70a08231" + addr.slice(2).toLowerCase().padStart(64, "0");
    var raw = await evmRpc(BASE_RPCS, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_BASE, data: data }, "latest"] });
    return Number(BigInt(raw || "0x0")) / 1e6;
  }
  function paintCash(base) {
    state.cashUsdc = Number(base || 0);
    var amt = document.getElementById("cashAmt");
    if (amt) amt.textContent = Number(base || 0).toFixed(2) + " USDC";
  }
  window.refreshBalance = window.deskRefresh = async function () {
    var pool = (window.BUON_POOL && window.BUON_POOL.evm) || POOL;
    var base = 0;
    try { base = await baseUsdc(pool); } catch (err) { log("pool: " + (err.message || err)); }
    paintCash(base);
  };
  function atoms(n) { return Math.max(1, Math.floor(Number(n) * 1e6)); }
  function isEvm(chain, mint) {
    var c = String(chain || "").toLowerCase();
    if (String(mint || "").startsWith("0x")) return true;
    return !!(CHAIN_ID[c]);
  }
  window.proposeBuy = window.deskBuy = async function (mint, symbol, _auto, chain) {
    await refreshBalance();
    var size = Number((document.getElementById("sizeUsd") || {}).value || 10);
    if (!(state.cashUsdc >= size)) { log("Pool needs " + size + " USDC"); return; }
    if (isEvm(chain, mint)) {
      log("EVM route from Base pool for $" + symbol);
      return;
    }
    try {
      var q = String(symbol || "").replace(/^\$/, "");
      var data = await fetch("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(q)).then(function (r) { return r.json(); });
      var pairs = data.pairs || [];
      var hit = pairs.find(function (p) { return p.chainId === "solana"; });
      if (!hit) throw new Error("no Solana market");
      log("Pool can quote $" + symbol + " after Base→Solana hop");
    } catch (err) { log("Buy blocked: " + (err.message || err)); }
  };
  window.openSettings = function () { var sh = document.getElementById("setShade"); if (sh) sh.hidden = false; };
  window.closeSettings = function () { var sh = document.getElementById("setShade"); if (sh) sh.hidden = true; };
  var setBtn = document.getElementById("settingsBtn");
  if (setBtn) setBtn.onclick = function () { openSettings(); };
  var setX = document.getElementById("settingsClose");
  if (setX) setX.onclick = function () { closeSettings(); };
  var setSh = document.getElementById("setShade");
  if (setSh) setSh.onclick = function (e) { if (e.target === setSh) closeSettings(); };
  var top = document.getElementById("refreshBalTop");
  var bot = document.getElementById("refreshBal");
  if (top) top.onclick = function () { refreshBalance(); };
  if (bot) bot.onclick = function () { refreshBalance(); };
  refreshBalance();
})();
