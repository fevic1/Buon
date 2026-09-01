(function () {
  const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const ETH_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const JQ = "https://lite-api.jup.ag/swap/v1/quote";
  const JS = "https://lite-api.jup.ag/swap/v1/swap";
  const SOL_RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com", "https://rpc.ankr.com/solana", "https://solana.api.onfinality.io/public"];
  var lastBalErr = "";
  function drawAddrs() {
    var list = document.getElementById("addrList");
    if (!list) return;
    if (!state.wallet) { list.innerHTML = "<div class=\"meta\">Create a cash account in this app.</div>"; return; }
    list.innerHTML = "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + state.wallet + "</code><button class=\"ghost\" data-copy=\"" + state.wallet + "\" type=\"button\">Copy</button></div>";
  }
  async function solRpc(method, params) {
    var last;
    for (var i = 0; i < SOL_RPCS.length; i++) {
      try {
        var res = await fetch(SOL_RPCS[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
        var data = await res.json();
        if (data.error) throw new Error(data.error.message || "rpc");
        return data.result;
      } catch (e) { last = e; }
    }
    if (typeof connection === "function" && window.solanaWeb3) {
      try {
        var conn = await connection();
        if (method === "getBalance") return { value: await conn.getBalance(new window.solanaWeb3.PublicKey(params[0])) };
        if (method === "getTokenAccountsByOwner") {
          var owner = new window.solanaWeb3.PublicKey(params[0]);
          var filt = params[1] || {};
          if (filt.mint) return await conn.getParsedTokenAccountsByOwner(owner, { mint: new window.solanaWeb3.PublicKey(filt.mint) });
        }
      } catch (e2) { last = e2; }
    }
    throw last || new Error("no solana rpc");
  }
  function uiAmount(accs) {
    var total = 0, list = (accs && accs.value) || [];
    for (var i = 0; i < list.length; i++) {
      var info = ((((list[i].account || {}).data || {}).parsed || {}).info || {});
      total += Number(((info.tokenAmount || {}).uiAmount) || 0);
    }
    return total;
  }
  window.refreshBalance = async function () {
    if (!state.wallet) return;
    drawAddrs();
    try {
      var lamports = await solRpc("getBalance", [state.wallet]);
      var sol = Number((lamports && lamports.value) || 0) / 1e9;
      var usdc = uiAmount(await solRpc("getTokenAccountsByOwner", [state.wallet, { mint: USDC }, { encoding: "jsonParsed" }]));
      state.cashUsdc = usdc;
      document.getElementById("cashAmt").textContent = usdc.toFixed(2) + " USDC";
      document.getElementById("gasAmt").textContent = "SOL gas " + sol.toFixed(4);
      document.getElementById("walletStatus").textContent = "cash " + usdc.toFixed(2) + " USDC";
      document.getElementById("walletBals").innerHTML = "<div class=\"bal-row\"><span>Solana USDC</span><span class=\"amt\">" + usdc.toFixed(2) + "</span></div><div class=\"bal-row\"><span>SOL gas</span><span class=\"amt\">" + sol.toFixed(4) + "</span></div>";
      lastBalErr = "";
    } catch (err) {
      var msg = String(err.message || err);
      if (msg !== lastBalErr) { lastBalErr = msg; log("balance: " + msg); }
    }
  };
  function atoms(n) { return Math.max(1, Math.floor(Number(n) * 1e6)); }
  function looksSol(mint) { return mint && !String(mint).startsWith("0x") && String(mint).length > 30; }
  async function solMint(chain, mint, symbol) {
    var c = String(chain || "").toLowerCase();
    if (looksSol(mint) && (!c || c === "sol" || c === "solana")) return mint;
    if (looksSol(mint)) return mint;
    var data = await fetch("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(String(symbol || "").replace(/^\$/, ""))).then(function (r) { return r.json(); });
    var want = String(symbol || "").replace(/^\$/, "").toUpperCase();
    var pairs = data.pairs || [];
    var hit = pairs.find(function (p) { return p.chainId === "solana" && String((p.baseToken || {}).symbol || "").toUpperCase() === want; }) || pairs.find(function (p) { return p.chainId === "solana"; });
    if (hit && hit.baseToken && hit.baseToken.address) return hit.baseToken.address;
    throw new Error("no Solana USDC market for $" + (symbol || "?"));
  }
  window.proposeBuy = async function (mint, symbol, fromAuto, chain) {
    log("Buy $" + (symbol || "?") + " · " + (chain || "?"));
    try { if (!state.wallet) await ensureWallet(); } catch (e) { log(e.message || String(e)); return; }
    await refreshBalance();
    var size = Number(document.getElementById("sizeUsd").value || 10);
    if (size > (state.cashUsdc || 0)) { log("Need " + size + " USDC on the cash account, have " + Number(state.cashUsdc || 0).toFixed(2)); return; }
    document.getElementById("botStatus").textContent = "quoting USDC";
    try {
      var outMint = await solMint(chain, mint, symbol);
      log("Jupiter USDC → $" + symbol + " " + outMint.slice(0, 8) + "…");
      var quote = await fetch(JQ + "?inputMint=" + USDC + "&outputMint=" + outMint + "&amount=" + atoms(size) + "&slippageBps=200").then(function (r) { return r.json(); });
      if (!quote.outAmount) throw new Error(quote.error || quote.errorCode || quote.message || "no quote");
      var swap = await fetch(JS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: state.wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }) }).then(function (r) { return r.json(); });
      if (!swap.swapTransaction) throw new Error(swap.error || swap.message || "no swap tx");
      var tx = window.solanaWeb3.VersionedTransaction.deserialize(Uint8Array.from(atob(swap.swapTransaction), function (c) { return c.charCodeAt(0); }));
      var sig = await signAndSend(tx);
      log("signed $" + symbol + " with " + size + " USDC · " + sig);
      document.getElementById("botStatus").textContent = "filled / sent";
      refreshBalance();
    } catch (err) {
      log("Buy blocked: " + (err.message || err));
      document.getElementById("botStatus").textContent = "idle";
    }
  };
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("button[data-mint], button.buy");
    if (!btn || btn.id === "connectBtn" || btn.id === "disconnectBtn" || btn.id === "wipeBtn" || btn.id === "exportBtn") return;
    ev.preventDefault();
    ev.stopPropagation();
    if (btn.dataset.mint) proposeBuy(btn.dataset.mint, btn.dataset.symbol, false, btn.dataset.chain);
    else log("That print has no mint yet");
  }, true);
  document.getElementById("refreshBalTop").onclick = function () { (state.wallet ? refreshBalance() : ensureWallet().then(refreshBalance)).catch(function (e) { log(e.message); }); };
  document.getElementById("refreshBal").onclick = function () { (state.wallet ? refreshBalance() : ensureWallet().then(refreshBalance)).catch(function (e) { log(e.message); }); };
})();
