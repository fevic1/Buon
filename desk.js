(function () {
  const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const WSOL = "So11111111111111111111111111111111111111112";
  const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const ASSOC = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
  const JQ = "https://lite-api.jup.ag/swap/v1/quote";
  const JS = "https://lite-api.jup.ag/swap/v1/swap";
  const RPC_KEY = "buon_rpc";
  const SOL_MIN = 0.03;
  const GAS_USDC = 2;
  const SOL_RPCS = ["https://api.mainnet-beta.solana.com", "https://solana.drpc.org", "https://solana-rpc.publicnode.com"];
  const BASE_RPCS = ["https://mainnet.base.org", "https://base.llamarpc.com"];
  const CHAIN_ID = { ethereum: 1, eth: 1, base: 8453, bsc: 56, bnb: 56, binance: 56, robinhood: 4663, rh: 4663 };
  function normRpc(v) {
    v = String(v || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[0-9a-f-]{8,}$/i.test(v)) return "https://mainnet.helius-rpc.com/?api-key=" + v;
    return v;
  }
  function solList() {
    var extra = normRpc((document.getElementById("rpcUrl") && document.getElementById("rpcUrl").value) || localStorage.getItem(RPC_KEY) || "");
    var list = extra ? [extra] : [];
    SOL_RPCS.forEach(function (u) { if (list.indexOf(u) < 0) list.push(u); });
    return list;
  }
  function loadCreds() {
    ["sizeUsd", "minAlert", "minOverlap", "tapeKey", "tpPct"].forEach(function (id) {
      var el = document.getElementById(id);
      var v = localStorage.getItem("buon_" + id);
      if (el && v) el.value = v;
    });
    var rpc = document.getElementById("rpcUrl");
    var saved = localStorage.getItem(RPC_KEY) || "";
    if (rpc && saved) rpc.value = saved;
    var last = Number(localStorage.getItem("buon_last_usdc") || 0);
    if (last) {
      state.cashUsdc = last;
      var amt = document.getElementById("cashAmt");
      if (amt) amt.textContent = last.toFixed(2) + " USDC";
    }
  }
  function saveCreds() {
    var rpc = document.getElementById("rpcUrl");
    if (rpc && rpc.value) {
      var n = normRpc(rpc.value);
      if (n) { rpc.value = n; localStorage.setItem(RPC_KEY, n); }
    }
    ["sizeUsd", "minAlert", "minOverlap", "tapeKey", "tpPct"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.value) localStorage.setItem("buon_" + id, el.value);
    });
  }
  loadCreds();
  ["rpcUrl", "sizeUsd", "minAlert", "minOverlap", "tapeKey", "tpPct"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", saveCreds);
    el.addEventListener("input", saveCreds);
  });
  async function solRpc(method, params) {
    var last = "no rpc";
    var urls = solList();
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
        var text = await res.text();
        var data;
        try { data = JSON.parse(text); } catch (e) { last = text.slice(0, 80); continue; }
        if (data.error) { last = data.error.message; continue; }
        return data.result;
      } catch (e) { last = e.message || String(e); }
    }
    throw new Error(last);
  }
  window.connection = async function () { return new window.solanaWeb3.Connection(solList()[0], "confirmed"); };
  async function solUsdc(owner) {
    var PK = window.solanaWeb3.PublicKey;
    var found = await PK.findProgramAddress([new PK(owner).toBuffer(), new PK(TOKEN).toBuffer(), new PK(USDC_SOL).toBuffer()], new PK(ASSOC));
    var acc = await solRpc("getAccountInfo", [found[0].toString(), { encoding: "jsonParsed" }]);
    var ta = acc && acc.value && acc.value.data && acc.value.data.parsed && acc.value.data.parsed.info && acc.value.data.parsed.info.tokenAmount;
    return Number((ta && ta.uiAmount) || 0);
  }
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
  function paintCash(base, solU, solG) {
    var total = Number(base || 0) + Number(solU || 0);
    state.cashUsdc = total;
    state.baseUsdc = Number(base || 0);
    state.solUsdc = Number(solU || 0);
    state.solGas = Number(solG || 0);
    localStorage.setItem("buon_last_usdc", String(total));
    var amt = document.getElementById("cashAmt");
    if (amt) amt.textContent = total.toFixed(2) + " USDC";
    var gas = document.getElementById("gasAmt");
    if (gas) gas.textContent = "";
    var box = document.getElementById("walletBals");
    if (box) box.textContent = "";
  }
  async function planGas(solU, solG) {
    if (solG >= SOL_MIN || !(solU >= GAS_USDC)) return;
    if (solG < 0.002) return;
    try {
      await fetch(JQ + "?inputMint=" + USDC_SOL + "&outputMint=" + WSOL + "&amount=" + Math.floor(GAS_USDC * 1e6) + "&slippageBps=200");
    } catch (e) {}
  }
  window.refreshBalance = window.deskRefresh = async function () {
    if (!state.wallet && !state.evm) return;
    var solU = 0, solG = 0, base = 0;
    try {
      if (state.wallet) {
        var lamports = await solRpc("getBalance", [state.wallet]);
        solG = Number((lamports && lamports.value) || 0) / 1e9;
        solU = await solUsdc(state.wallet);
      }
    } catch (err) {}
    try { if (state.evm) base = await baseUsdc(state.evm); } catch (err) {}
    paintCash(base, solU, solG);
    planGas(solU, solG);
  };
  function atoms(n) { return Math.max(1, Math.floor(Number(n) * 1e6)); }
  function looksSol(mint) { return mint && !String(mint).startsWith("0x") && String(mint).length > 30; }
  function isEvm(chain, mint) {
    var c = String(chain || "").toLowerCase();
    if (String(mint || "").startsWith("0x")) return true;
    return !!(CHAIN_ID[c]);
  }
  async function evmBuy(mint, symbol, chain) {
    var c = String(chain || "base").toLowerCase();
    var cid = CHAIN_ID[c] || 8453;
    var size = Number((document.getElementById("sizeUsd") || {}).value || 10);
    var evm = state.evm || "";
    if (!evm || !String(mint || "").startsWith("0x")) return;
    var url = "https://li.quest/v1/quote?fromChain=" + cid + "&toChain=" + cid + "&fromToken=USDC&toToken=" + mint + "&fromAmount=" + atoms(size) + "&fromAddress=" + evm;
    var q = await fetch(url).then(function (r) { return r.json(); });
    if (q.message || q.error) throw new Error(q.message || q.error || "no EVM route");
    log("Route on " + c);
  }
  async function solMint(mint, symbol) {
    if (looksSol(mint)) return mint;
    var q = String(symbol || "").replace(/^\$/, "");
    var data = await fetch("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(q)).then(function (r) { return r.json(); });
    var want = q.toUpperCase();
    var pairs = data.pairs || [];
    var hit = pairs.find(function (p) { return p.chainId === "solana" && String((p.baseToken || {}).symbol || "").toUpperCase() === want; }) || pairs.find(function (p) { return p.chainId === "solana"; });
    if (hit && hit.baseToken && hit.baseToken.address) return hit.baseToken.address;
    throw new Error("no Solana mint for $" + q);
  }
  window.proposeBuy = window.deskBuy = async function (mint, symbol, _auto, chain) {
    if (isEvm(chain, mint)) { try { await evmBuy(mint, symbol, chain); } catch (err) { log("Buy blocked: " + (err.message || err)); } return; }
    if (!state.wallet) throw new Error("Sign in first");
    await refreshBalance();
    var size = Number((document.getElementById("sizeUsd") || {}).value || 10);
    if (!(state.cashUsdc >= size)) { log("Need " + size + " USDC"); return; }
    try {
      var outMint = await solMint(mint, symbol);
      var quote = await fetch(JQ + "?inputMint=" + USDC_SOL + "&outputMint=" + outMint + "&amount=" + atoms(size) + "&slippageBps=200").then(function (r) { return r.json(); });
      if (!quote.outAmount) throw new Error(quote.error || "no quote");
      log("Jupiter quote for $" + symbol);
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
})();
