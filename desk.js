(function () {
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const ASSOC = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
  const JQ = "https://lite-api.jup.ag/swap/v1/quote";
  const JS = "https://lite-api.jup.ag/swap/v1/swap";
  const RPC_KEY = "buon_rpc";
  function normRpc(v) {
    v = String(v || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[0-9a-f-]{20,}$/i.test(v)) return "https://mainnet.helius-rpc.com/?api-key=" + v;
    return v;
  }
  function loadCreds() {
    var rpc = document.getElementById("rpcUrl");
    if (rpc && !rpc.value) rpc.value = localStorage.getItem(RPC_KEY) || "";
    ["sizeUsd", "minAlert", "minOverlap", "tapeKey"].forEach(function (id) {
      var el = document.getElementById(id);
      var saved = localStorage.getItem("buon_" + id);
      if (el && saved && !el.value) el.value = saved;
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
      rpc.value = normRpc(rpc.value);
      if (rpc.value) localStorage.setItem(RPC_KEY, rpc.value);
    }
    ["sizeUsd", "minAlert", "minOverlap", "tapeKey"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) localStorage.setItem("buon_" + id, el.value || "");
    });
    var auto = document.getElementById("autoBuy");
    if (auto) localStorage.setItem("buon_autoBuy", auto.checked ? "1" : "0");
  }
  loadCreds();
  ["rpcUrl", "sizeUsd", "minAlert", "minOverlap", "tapeKey", "autoBuy"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", saveCreds);
  });
  saveCreds();
  function rpcUrl() {
    var el = document.getElementById("rpcUrl");
    return normRpc(el && el.value) || localStorage.getItem(RPC_KEY) || "https://api.mainnet-beta.solana.com";
  }
  async function rpc(method, params) {
    var res = await fetch(rpcUrl(), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
    var data = await res.json();
    if (data.error) throw new Error(data.error.message || ("rpc " + res.status));
    return data.result;
  }
  window.connection = async function () { return new window.solanaWeb3.Connection(rpcUrl(), "confirmed"); };
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
  window.proposeBuy = window.deskBuy = async function (mint, symbol) {
    if (!state.wallet) await ensureWallet();
    await refreshBalance();
    var size = Number(document.getElementById("sizeUsd").value || 10);
    if (!(state.cashUsdc >= size)) { log("Need " + size + " USDC, have " + Number(state.cashUsdc || 0).toFixed(2)); return; }
    if ((await rpc("getBalance", [state.wallet])).value < 5000) { log("Need ~0.02 SOL on this address for network fees"); return; }
    try {
      if (String(mint || "").startsWith("0x")) throw new Error("no Solana mint");
      var quote = await fetch(JQ + "?inputMint=" + USDC + "&outputMint=" + mint + "&amount=" + atoms(size) + "&slippageBps=200").then(function (r) { return r.json(); });
      if (!quote.outAmount) throw new Error(quote.error || "no quote");
      var tokens = Number(quote.outAmount) / 1e6;
      var entry = tokens ? size / tokens : 0;
      var swap = await fetch(JS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: state.wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }) }).then(function (r) { return r.json(); });
      if (!swap.swapTransaction) throw new Error("no swap tx");
      var tx = window.solanaWeb3.VersionedTransaction.deserialize(Uint8Array.from(atob(swap.swapTransaction), function (c) { return c.charCodeAt(0); }));
      var sig = await signAndSend(tx);
      log("signed $" + symbol + " · " + sig);
      if (typeof recordPosition === "function") recordPosition({ mint: mint, symbol: symbol, usdIn: size, tokens: tokens, entry: entry, sig: sig });
      refreshBalance();
    } catch (err) { log("Buy blocked: " + (err.message || err)); }
  };
  document.getElementById("refreshBalTop").onclick = function () { refreshBalance(); };
  document.getElementById("refreshBal").onclick = function () { refreshBalance(); };
})();
