(function () {
  const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const BASE_RPCS = [
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
    "https://base.publicnode.com",
    "https://1rpc.io/base",
    "https://base.drpc.org"
  ];
  const CHAIN_ID = { ethereum: 1, eth: 1, base: 8453, bsc: 56, bnb: 56, binance: 56, robinhood: 4663, rh: 4663 };
  const POOL = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
  const LAST = "buon_pool_last";
  function loadCreds() {
    ["sizeUsd", "minAlert", "minOverlap", "tpPct"].forEach(function (id) {
      var el = document.getElementById(id);
      var v = localStorage.getItem("buon_" + id);
      if (el && v) el.value = v;
    });
    var last = Number(localStorage.getItem(LAST) || 0);
    if (last) {
      state.cashUsdc = last;
      var amt = document.getElementById("cashAmt");
      if (amt) amt.textContent = last.toFixed(2) + " USDC";
    }
  }
  loadCreds();
  async function evmRpc(urls, body) {
    var last = "no evm rpc";
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) { last = "http " + res.status; continue; }
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
  function paintCash(base, ok) {
    if (!ok) return;
    state.cashUsdc = Number(base || 0);
    var amt = document.getElementById("cashAmt");
    if (amt) amt.textContent = Number(base || 0).toFixed(2) + " USDC";
    if (typeof notePoolBalance === "function") notePoolBalance(base);
  }
  window.refreshBalance = window.deskRefresh = async function () {
    var pool = (window.BUON_POOL && window.BUON_POOL.evm) || POOL;
    try {
      var base = await baseUsdc(pool);
      paintCash(base, true);
    } catch (err) {
      log("pool rpc busy — using last " + Number(state.cashUsdc || 0).toFixed(2));
    }
  };
  function isEvm(chain, mint) {
    var c = String(chain || "").toLowerCase();
    if (String(mint || "").startsWith("0x")) return true;
    return !!(CHAIN_ID[c]);
  }
  window.proposeBuy = window.deskBuy = async function (mint, symbol, _auto, chain) {
    await refreshBalance();
    var size = Number((document.getElementById("sizeUsd") || {}).value || 10);
    if (!(state.cashUsdc >= size)) { log("Pool needs " + size + " USDC (showing " + Number(state.cashUsdc || 0).toFixed(2) + ")"); return; }
    if (!window.BUON_TK) { log("Turnkey not ready"); return; }
    log(isEvm(chain, mint) ? ("Ready to spend pool on $" + symbol) : ("Ready after Base→Solana hop for $" + symbol));
  };
  window.openSettings = function () { var sh = document.getElementById("setShade"); if (sh) sh.hidden = false; };
  window.closeSettings = function () { var sh = document.getElementById("setShade"); if (sh) sh.hidden = true; };
  var setBtn = document.getElementById("settingsBtn");
  if (setBtn) setBtn.onclick = function () { openSettings(); };
  var setX = document.getElementById("settingsClose");
  if (setX) setX.onclick = function () { closeSettings(); };
  var setSh = document.getElementById("setShade");
  if (setSh) setSh.onclick = function (e) { if (e.target === setSh) closeSettings(); };
  var bot = document.getElementById("refreshBal");
  if (bot) bot.onclick = function () { refreshBalance(); };
  refreshBalance();
})();
