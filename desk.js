(function () {
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const ASSOC = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
  const JQ = "https://lite-api.jup.ag/swap/v1/quote";
  const JS = "https://lite-api.jup.ag/swap/v1/swap";
  const RPC_KEY = "buon_rpc";
  const CHAIN_ID = { ethereum: 1, eth: 1, base: 8453, bsc: 56, bnb: 56, binance: 56, robinhood: 4663, rh: 4663 };
  function normRpc(v) {
    v = String(v || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[0-9a-f-]{8,}$/i.test(v)) return "https://mainnet.helius-rpc.com/?api-key=" + v;
    return v;
  }
  function loadCreds() {
    var rpc = document.getElementById("rpcUrl");
    var saved = localStorage.getItem(RPC_KEY) || "";
    if (rpc) rpc.value = saved || rpc.value || "";
    ["sizeUsd", "minAlert", "minOverlap", "tapeKey"].forEach(function (id) {
      var el = document.getElementById(id);
      var v = localStorage.getItem("buon_" + id);
      if (el && v) el.value = v;
    });
    var auto = document.getElementById("autoBuy");
    if (auto) auto.checked = localStorage.getItem("buon_autoBuy") === "1";
    var last = Number(localStorage.getItem("buon_last_usdc") || 0);
    if (last) {
      state.cashUsdc = last;
      var amt = document.getElementById("cashAmt");
      if (amt) amt.textContent = last.toFixed(2) + " USDC";
    }
  }
  function saveCreds() {
    var rpc = document.getElementById("rpcUrl");
    if (rpc) {
      var n = normRpc(rpc.value);
      if (n) { rpc.value = n; localStorage.setItem(RPC_KEY, n); }
    }
    ["sizeUsd", "minAlert", "minOverlap", "tapeKey"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.value) localStorage.setItem("buon_" + id, el.value);
    });
    var auto = document.getElementById("autoBuy");
    if (auto) localStorage.setItem("buon_autoBuy", auto.checked ? "1" : "0");
  }
  loadCreds();
  ["rpcUrl", "sizeUsd", "minAlert", "minOverlap", "tapeKey", "autoBuy"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", saveCreds);
    el.addEventListener("input", saveCreds);
  });
  function rpcUrl() {
    return normRpc(document.getElementById("rpcUrl") && document.getElementById("rpcUrl").value) || localStorage.getItem(RPC_KEY) || "";
  }
  async function rpc(method, params) {
    var url = rpcUrl();
    if (!url) throw new Error("Paste Helius RPC once — it will be saved");
    var res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
    var data = await res.json();
    if (data.error) throw new Error(data.error.message || ("rpc " + res.status));
    return data.result;
  }
  window.connection = async function () {
    var url = rpcUrl();
    if (!url) throw new Error("Paste Helius RPC once — it will be saved");
    return new window.solanaWeb3.Connection(url, "confirmed");
  };
  async function usdcOf(owner) {
    var PK = window.solanaWeb3.PublicKey;
    var found = await PK.findProgramAddress([new PK(owner).toBuffer(), new PK(TOKEN).toBuffer(), new PK(USDC).toBuffer()], new PK(ASSOC));
    var acc = await rpc("getAccountInfo", [found[0].toString(), { encoding: "jsonParsed" }]);
    var ta = acc && acc.value && acc.value.data && acc.value.data.parsed && acc.value.data.parsed.info && acc.value.data.parsed.info.tokenAmount;
    return Number((ta && ta.uiAmount) || 0);
  }
  function paintCash(usdc, sol) {
    state.cashUsdc = usdc;
    localStorage.setItem("buon_last_usdc", String(usdc));
    document.getElementById("cashAmt").textContent = usdc.toFixed(2) + " USDC";
    document.getElementById("gasAmt").textContent = "SOL gas " + Number(sol || 0).toFixed(4);
    document.getElementById("walletStatus").textContent = "cash " + usdc.toFixed(2) + " USDC";
    document.getElementById("walletBals").innerHTML = "<div class=\"bal-row\"><span>Solana USDC</span><span class=\"amt\">" + usdc.toFixed(2) + "</span></div><div class=\"bal-row\"><span>SOL gas</span><span class=\"amt\">" + Number(sol || 0).toFixed(4) + "</span></div>";
  }
  window.refreshBalance = window.deskRefresh = async function () {
    if (!state.wallet) return;
    try {
      var lamports = await rpc("getBalance", [state.wallet]);
      var sol = Number((lamports && lamports.value) || 0) / 1e9;
      var usdc = await usdcOf(state.wallet);
      paintCash(usdc, sol);
    } catch (err) {
      log("balance: " + (err.message || err));
      var last = Number(localStorage.getItem("buon_last_usdc") || 0);
      if (last) paintCash(last, 0);
    }
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
    var size = Number(document.getElementById("sizeUsd").value || 10);
    var evm = state.evm || "";
    log("$" + symbol + " is on " + c + ". That spend is EVM USDC, not Solana USDC.");
    if (!evm) {
      log("Use the Privy EVM address for Base / Ethereum / BNB. Robinhood needs that chain’s USDC too.");
      return;
    }
    if (!String(mint || "").startsWith("0x")) {
      log("No EVM mint on this tape line yet.");
      return;
    }
    var url = "https://li.quest/v1/quote?fromChain=" + cid + "&toChain=" + cid + "&fromToken=USDC&toToken=" + mint + "&fromAmount=" + atoms(size) + "&fromAddress=" + evm;
    var q = await fetch(url).then(function (r) { return r.json(); });
    if (q.message || q.error) throw new Error(q.message || q.error || "no EVM route");
    var out = q.estimate && q.estimate.toAmount;
    log("Route on " + c + " via " + (q.tool || "DEX") + (out ? (" → " + out) : "") + ". Sign needs the Privy EVM key funded with USDC + gas on that chain.");
  }
  async function solMint(mint, symbol) {
    if (looksSol(mint)) return mint;
    var q = String(symbol || "").replace(/^\$/, "");
    if (!q) throw new Error("no Solana mint");
    var data = await fetch("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(q)).then(function (r) { return r.json(); });
    var want = q.toUpperCase();
    var pairs = data.pairs || [];
    var hit = pairs.find(function (p) { return p.chainId === "solana" && String((p.baseToken || {}).symbol || "").toUpperCase() === want; }) || pairs.find(function (p) { return p.chainId === "solana"; });
    if (hit && hit.baseToken && hit.baseToken.address) return hit.baseToken.address;
    throw new Error("no Solana mint for $" + q);
  }
  window.proposeBuy = window.deskBuy = async function (mint, symbol, _auto, chain) {
    if (isEvm(chain, mint)) {
      try { await evmBuy(mint, symbol, chain); } catch (err) { log("Buy blocked: " + (err.message || err)); }
      return;
    }
    if (!state.wallet) await ensureWallet();
    await refreshBalance();
    var size = Number(document.getElementById("sizeUsd").value || 10);
    if (!(state.cashUsdc >= size)) { log("Need " + size + " Solana USDC, have " + Number(state.cashUsdc || 0).toFixed(2)); return; }
    if ((await rpc("getBalance", [state.wallet])).value < 5000) { log("Need ~0.02 SOL on this address for network fees"); return; }
    try {
      var outMint = await solMint(mint, symbol);
      var quote = await fetch(JQ + "?inputMint=" + USDC + "&outputMint=" + outMint + "&amount=" + atoms(size) + "&slippageBps=200").then(function (r) { return r.json(); });
      if (!quote.outAmount) throw new Error(quote.error || "no quote");
      var dec = Number(quote.outputDecimals || 6);
      var tokens = Number(quote.outAmount) / Math.pow(10, dec);
      var entry = tokens ? size / tokens : 0;
      var swap = await fetch(JS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: state.wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }) }).then(function (r) { return r.json(); });
      if (!swap.swapTransaction) throw new Error("no swap tx");
      var tx = window.solanaWeb3.VersionedTransaction.deserialize(Uint8Array.from(atob(swap.swapTransaction), function (c) { return c.charCodeAt(0); }));
      var sig = await signAndSend(tx);
      log("signed $" + symbol + " · " + sig);
      if (typeof recordPosition === "function") recordPosition({ mint: outMint, symbol: symbol, usdIn: size, tokens: tokens, entry: entry, sig: sig });
      refreshBalance();
    } catch (err) { log("Buy blocked: " + (err.message || err)); }
  };
  var top = document.getElementById("refreshBalTop");
  var bot = document.getElementById("refreshBal");
  if (top) top.onclick = function () { refreshBalance(); };
  if (bot) bot.onclick = function () { refreshBalance(); };
})();
