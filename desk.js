(function () {
  const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const SOL_RPCS = [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com"
  ];
  const BASE_RPCS = [
    "https://base.publicnode.com",
    "https://mainnet.base.org",
    "https://1rpc.io/base",
    "https://base.drpc.org"
  ];
  const POOL = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
  const LAST = "buon_pool_last";
  function loadCreds() {
    ["sizeUsd", "keepUsd", "minAlert", "minOverlap", "tpPct"].forEach(function (id) {
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
  async function solRpc(method, params) {
    var last = "sol rpc";
    for (var i = 0; i < SOL_RPCS.length; i++) {
      try {
        var res = await fetch(SOL_RPCS[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
        if (!res.ok) { last = "http " + res.status; continue; }
        var data = await res.json();
        if (data.error) { last = data.error.message || "sol rpc"; continue; }
        return data.result;
      } catch (e) { last = e.message || String(e); }
    }
    throw new Error(last);
  }
  async function solUsdc(addr) {
    if (!addr) return 0;
    var res = await solRpc("getTokenAccountsByOwner", [addr, { mint: USDC_SOL }, { encoding: "jsonParsed" }]);
    var rows = (res && res.value) || [];
    if (!rows.length) return 0;
    var info = (((rows[0].account || {}).data || {}).parsed || {}).info || {};
    return Number((info.tokenAmount || {}).amount || "0") / 1e6;
  }
  function paintCash(solUsdcBal, baseUsdcBal) {
    var pool = (window.BUON_POOL && window.BUON_POOL.evm) || POOL;
    var solPart = Number(solUsdcBal || 0);
    var basePart = Number(baseUsdcBal || 0);
    var effective = solPart + basePart;
    state.cashUsdc = effective;
    localStorage.setItem(LAST, String(state.cashUsdc));
    var amt = document.getElementById("cashAmt");
    if (amt) amt.textContent = effective.toFixed(2) + " USDC";
    var st = document.getElementById("walletStatus");
    if (st) st.textContent = "sol exec " + solPart.toFixed(2) + " · base reserve " + basePart.toFixed(2) + " · effective " + effective.toFixed(2);
    if (typeof notePoolBalance === "function") notePoolBalance(effective);
  }
  window.refreshBalance = window.deskRefresh = async function () {
    var pool = (window.BUON_POOL && window.BUON_POOL.evm) || POOL;
    var sol = (window.BUON_POOL && window.BUON_POOL.sol) || "";
    try {
      var values = await Promise.allSettled([solUsdc(sol), baseUsdc(pool)]);
      var solBal = values[0] && values[0].status === "fulfilled" ? values[0].value : 0;
      var baseBal = values[1] && values[1].status === "fulfilled" ? values[1].value : 0;
      paintCash(solBal, baseBal);
      if (values[0].status !== "fulfilled" || values[1].status !== "fulfilled") {
        var st = document.getElementById("walletStatus");
        if (st) st.textContent = "cash partial · sol " + Number(solBal || 0).toFixed(2) + " · base " + Number(baseBal || 0).toFixed(2);
      }
      if (typeof window.primeExecutionHub === "function") {
        window.primeExecutionHub({ wait: false }).catch(function (err) {
          if (typeof log === "function") log("hub prime: " + (err.message || err));
        });
      }
    } catch (err) {
      var st = document.getElementById("walletStatus");
      if (st) st.textContent = "cash rpc fail";
      if (typeof log === "function") log("cash: " + (err.message || err));
    }
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
  setInterval(refreshBalance, 6000);
})();
