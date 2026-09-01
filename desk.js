(function () {
  const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const ETH_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const JQ = "https://lite-api.jup.ag/swap/v1/quote";
  const JS = "https://lite-api.jup.ag/swap/v1/swap";
  const SOL_RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
  function phantom() { return window.solana; }
  function setConnected(on) { document.getElementById("connectBtn").textContent = on ? "Connected" : "Connect wallet"; }
  function drawAddrs() {
    const list = document.getElementById("addrList");
    if (!state.wallet) { list.innerHTML = "<div class=\"meta\">Connect Phantom to load USDC cash</div>"; return; }
    const row = function (label, value) {
      return value ? "<div class=\"addr-row\"><span class=\"meta\">" + label + "</span><code>" + value + "</code><button class=\"ghost\" data-copy=\"" + value + "\" type=\"button\">Copy</button></div>" : "";
    };
    list.innerHTML = row("SOL", state.wallet) + row("EVM", state.evm);
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
    throw last || new Error("no solana rpc");
  }
  function uiAmount(accs) {
    var total = 0;
    var list = (accs && accs.value) || [];
    for (var i = 0; i < list.length; i++) {
      var info = ((((list[i].account || {}).data || {}).parsed || {}).info || {});
      total += Number(((info.tokenAmount || {}).uiAmount) || 0);
    }
    return total;
  }
  async function evmUsdc(token, rpc) {
    if (!state.evm) return 0;
    try {
      var data = "0x70a08231" + state.evm.slice(2).toLowerCase().padStart(64, "0");
      var res = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data: data }, "latest"] }) });
      var out = await res.json();
      return parseInt(out.result || "0x0", 16) / 1e6;
    } catch (e) { return 0; }
  }
  window.refreshBalance = async function () {
    if (!state.wallet) return;
    drawAddrs();
    try {
      var lamports = await solRpc("getBalance", [state.wallet]);
      var sol = Number((lamports && lamports.value) || 0) / 1e9;
      var usdcAcc = await solRpc("getTokenAccountsByOwner", [state.wallet, { mint: USDC }, { encoding: "jsonParsed" }]);
      var usdc = uiAmount(usdcAcc);
      state.cashUsdc = usdc;
      var base = await evmUsdc(BASE_USDC, "https://base-rpc.publicnode.com");
      var eth = await evmUsdc(ETH_USDC, "https://ethereum-rpc.publicnode.com");
      document.getElementById("cashAmt").textContent = usdc.toFixed(2) + " USDC";
      document.getElementById("gasAmt").textContent = "SOL gas " + sol.toFixed(4);
      document.getElementById("walletStatus").textContent = "cash " + usdc.toFixed(2) + " USDC";
      var extra = "";
      if (base) extra += "<div class=\"bal-row\"><span>Base USDC</span><span class=\"amt\">" + base.toFixed(2) + "</span></div>";
      if (eth) extra += "<div class=\"bal-row\"><span>ETH USDC</span><span class=\"amt\">" + eth.toFixed(2) + "</span></div>";
      document.getElementById("walletBals").innerHTML = "<div class=\"bal-row\"><span>Solana USDC</span><span class=\"amt\">" + usdc.toFixed(2) + "</span></div>" + extra + "<div class=\"bal-row\"><span>SOL gas</span><span class=\"amt\">" + sol.toFixed(4) + "</span></div>";
    } catch (err) { log("balance: " + (err.message || err)); }
  };
  window.ensureWallet = async function () {
    var p = phantom();
    if (!p || !p.isPhantom) { window.open("https://phantom.app/", "_blank"); throw new Error("Install Phantom"); }
    var res = await p.connect();
    state.wallet = res.publicKey.toString();
    try {
      var eth = window.phantom && window.phantom.ethereum;
      if (eth && eth.request) {
        var acc = await eth.request({ method: "eth_requestAccounts" });
        state.evm = acc && acc[0];
      }
    } catch (e) {}
    setConnected(true);
    drawAddrs();
    await refreshBalance();
    return state.wallet;
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
    if (size > (state.cashUsdc || 0)) { log("Need " + size + " Solana USDC, have " + Number(state.cashUsdc || 0).toFixed(2)); return; }
    document.getElementById("botStatus").textContent = "quoting USDC";
    try {
      var outMint = await solMint(chain, mint, symbol);
      log("Jupiter USDC → $" + symbol + " " + outMint.slice(0, 8) + "…");
      var quote = await fetch(JQ + "?inputMint=" + USDC + "&outputMint=" + outMint + "&amount=" + atoms(size) + "&slippageBps=200").then(function (r) { return r.json(); });
      if (!quote.outAmount) throw new Error(quote.error || quote.errorCode || quote.message || "no quote");
      var swap = await fetch(JS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: state.wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }) }).then(function (r) { return r.json(); });
      if (!swap.swapTransaction) throw new Error(swap.error || swap.message || "no swap tx");
      var tx = window.solanaWeb3.VersionedTransaction.deserialize(Uint8Array.from(atob(swap.swapTransaction), function (c) { return c.charCodeAt(0); }));
      var sent = await window.solana.signAndSendTransaction(tx);
      log("signed $" + symbol + " with " + size + " USDC · " + (sent.signature || sent));
      document.getElementById("botStatus").textContent = "filled / sent";
      refreshBalance();
    } catch (err) {
      var msg = String(err.message || err);
      if (/User rejected|denied|cancelled/i.test(msg)) log("Phantom rejected the swap");
      else if (/insufficient|lamport|0x1/i.test(msg)) log("Need more SOL gas for ATA rent");
      else log("Buy blocked: " + msg);
      document.getElementById("botStatus").textContent = "idle";
    }
  };
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("button[data-mint], button.buy");
    if (!btn || btn.id === "connectBtn") return;
    ev.preventDefault();
    ev.stopPropagation();
    if (btn.dataset.mint) proposeBuy(btn.dataset.mint, btn.dataset.symbol, false, btn.dataset.chain);
    else log("That print has no mint yet");
  }, true);
  document.getElementById("connectBtn").onclick = function () { ensureWallet().then(function () { log("Phantom ready"); }).catch(function (e) { log(e.message); setConnected(false); }); };
  document.getElementById("refreshBalTop").onclick = function () { (state.wallet ? refreshBalance() : ensureWallet()).catch(function (e) { log(e.message); }); };
  document.getElementById("refreshBal").onclick = function () { (state.wallet ? refreshBalance() : ensureWallet()).catch(function (e) { log(e.message); }); };
})();
