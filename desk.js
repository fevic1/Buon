(function () {
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const TOKEN2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
  const ASSOC = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
  const JQ = "https://lite-api.jup.ag/swap/v1/quote";
  const JS = "https://lite-api.jup.ag/swap/v1/swap";
  function rpcList() {
    var el = document.getElementById("rpcUrl");
    var extra = el && el.value.trim();
    var list = [];
    if (extra) list.push(extra);
    list.push("https://api.mainnet-beta.solana.com");
    return list;
  }
  function cleanErr(e) {
    var s = String((e && e.message) || e || "rpc");
    if (s.length > 140) return s.slice(0, 140) + "…";
    return s;
  }
  async function solRpc(method, params) {
    var last;
    var urls = rpcList();
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
        var data = await res.json();
        if (data.error) throw new Error(data.error.message || ("rpc " + res.status));
        return data.result;
      } catch (e) { last = e; }
    }
    throw last || new Error("no solana rpc");
  }
  window.connection = async function () {
    return new window.solanaWeb3.Connection(rpcList()[0], "confirmed");
  };
  async function ata(owner, mint, program) {
    var PK = window.solanaWeb3.PublicKey;
    var found = await PK.findProgramAddress(
      [new PK(owner).toBuffer(), new PK(program).toBuffer(), new PK(mint).toBuffer()],
      new PK(ASSOC)
    );
    return found[0].toString();
  }
  function uiFromAccount(info) {
    if (!info) return 0;
    var parsed = info.data && info.data.parsed && info.data.parsed.info && info.data.parsed.info.tokenAmount;
    if (parsed && parsed.uiAmount != null) return Number(parsed.uiAmount);
    return 0;
  }
  async function usdcAmount(owner) {
    var programs = [TOKEN, TOKEN2022];
    for (var i = 0; i < programs.length; i++) {
      try {
        var addr = await ata(owner, USDC, programs[i]);
        var acc = await solRpc("getAccountInfo", [addr, { encoding: "jsonParsed" }]);
        var n = uiFromAccount(acc && acc.value);
        if (n) return n;
      } catch (e) {}
    }
    try {
      var list = await solRpc("getTokenAccountsByOwner", [owner, { mint: USDC }, { encoding: "jsonParsed" }]);
      var rows = (list && list.value) || [];
      var total = 0;
      for (var j = 0; j < rows.length; j++) {
        total += Number((((((rows[j].account || {}).data || {}).parsed || {}).info || {}).tokenAmount || {}).uiAmount || 0);
      }
      return total;
    } catch (e2) { return 0; }
  }
  window.refreshBalance = async function () {
    if (!state.wallet) return;
    try {
      var lamports = await solRpc("getBalance", [state.wallet]);
      var sol = Number((lamports && lamports.value) || 0) / 1e9;
      var usdc = await usdcAmount(state.wallet);
      state.cashUsdc = usdc;
      document.getElementById("cashAmt").textContent = usdc.toFixed(2) + " USDC";
      document.getElementById("gasAmt").textContent = "SOL gas " + sol.toFixed(4);
      document.getElementById("walletStatus").textContent = "cash " + usdc.toFixed(2) + " USDC";
      document.getElementById("walletBals").innerHTML = "<div class=\"bal-row\"><span>Solana USDC</span><span class=\"amt\">" + usdc.toFixed(2) + "</span></div><div class=\"bal-row\"><span>SOL gas</span><span class=\"amt\">" + sol.toFixed(4) + "</span></div>";
      if (!usdc) log("USDC read 0. Solscan can index it before this RPC does.");
    } catch (err) {
      log("balance: " + cleanErr(err));
    }
  };
  function atoms(n) { return Math.max(1, Math.floor(Number(n) * 1e6)); }
  function looksSol(mint) { return mint && !String(mint).startsWith("0x") && String(mint).length > 30; }
  async function solMint(chain, mint, symbol) {
    if (looksSol(mint)) return mint;
    var data = await fetch("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(String(symbol || "").replace(/^\$/, ""))).then(function (r) { return r.json(); });
    var want = String(symbol || "").replace(/^\$/, "").toUpperCase();
    var pairs = data.pairs || [];
    var hit = pairs.find(function (p) { return p.chainId === "solana" && String((p.baseToken || {}).symbol || "").toUpperCase() === want; });
    if (hit && hit.baseToken && hit.baseToken.address) return hit.baseToken.address;
    throw new Error("no Solana USDC market for $" + (symbol || "?"));
  }
  window.proposeBuy = async function (mint, symbol, fromAuto, chain) {
    log("Buy $" + (symbol || "?"));
    try { if (!state.wallet) await ensureWallet(); } catch (e) { log(e.message || String(e)); return; }
    await refreshBalance();
    var size = Number(document.getElementById("sizeUsd").value || 10);
    if (size > (state.cashUsdc || 0)) { log("Need " + size + " USDC, have " + Number(state.cashUsdc || 0).toFixed(2)); return; }
    try {
      var outMint = await solMint(chain, mint, symbol);
      var quote = await fetch(JQ + "?inputMint=" + USDC + "&outputMint=" + outMint + "&amount=" + atoms(size) + "&slippageBps=200").then(function (r) { return r.json(); });
      if (!quote.outAmount) throw new Error(quote.error || quote.message || "no quote");
      var swap = await fetch(JS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: state.wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }) }).then(function (r) { return r.json(); });
      if (!swap.swapTransaction) throw new Error(swap.error || "no swap tx");
      var tx = window.solanaWeb3.VersionedTransaction.deserialize(Uint8Array.from(atob(swap.swapTransaction), function (c) { return c.charCodeAt(0); }));
      var sig = await signAndSend(tx);
      log("signed $" + symbol + " · " + sig);
      refreshBalance();
    } catch (err) { log("Buy blocked: " + cleanErr(err)); }
  };
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("button[data-mint], button.buy");
    if (!btn || btn.id === "connectBtn") return;
    if (btn.dataset.mint) {
      ev.preventDefault();
      ev.stopPropagation();
      proposeBuy(btn.dataset.mint, btn.dataset.symbol, false, btn.dataset.chain);
    }
  }, true);
  var top = document.getElementById("refreshBalTop");
  var side = document.getElementById("refreshBal");
  if (top) top.onclick = function () { refreshBalance(); };
  if (side) side.onclick = function () { refreshBalance(); };
})();
