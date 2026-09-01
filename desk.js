(function () {
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const ASSOC = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
  const JQ = "https://lite-api.jup.ag/swap/v1/quote";
  const JS = "https://lite-api.jup.ag/swap/v1/swap";
  function rpcUrl() {
    var el = document.getElementById("rpcUrl");
    return (el && el.value.trim()) || "https://api.mainnet-beta.solana.com";
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
  window.refreshBalance = window.deskRefresh = async function () {
    if (!state.wallet) return;
    try {
      var lamports = await rpc("getBalance", [state.wallet]);
      var sol = Number((lamports && lamports.value) || 0) / 1e9;
      var usdc = await usdcOf(state.wallet);
      state.cashUsdc = usdc;
      document.getElementById("cashAmt").textContent = usdc.toFixed(2) + " USDC";
      document.getElementById("gasAmt").textContent = "SOL gas " + sol.toFixed(4);
      document.getElementById("walletStatus").textContent = "cash " + usdc.toFixed(2) + " USDC";
      document.getElementById("walletBals").innerHTML = "<div class=\"bal-row\"><span>Solana USDC</span><span class=\"amt\">" + usdc.toFixed(2) + "</span></div><div class=\"bal-row\"><span>SOL gas</span><span class=\"amt\">" + sol.toFixed(4) + "</span></div>";
    } catch (err) {
      log("balance: " + (err.message || err));
    }
  };
  function atoms(n) { return Math.max(1, Math.floor(Number(n) * 1e6)); }
  window.proposeBuy = async function (mint, symbol, fromAuto, chain) {
    if (!state.wallet) await ensureWallet();
    await refreshBalance();
    var size = Number(document.getElementById("sizeUsd").value || 10);
    if (size > (state.cashUsdc || 0)) { log("Need " + size + " USDC, have " + Number(state.cashUsdc || 0).toFixed(2)); return; }
    try {
      var outMint = mint;
      if (String(mint || "").startsWith("0x")) throw new Error("no Solana mint");
      var quote = await fetch(JQ + "?inputMint=" + USDC + "&outputMint=" + outMint + "&amount=" + atoms(size) + "&slippageBps=200").then(function (r) { return r.json(); });
      if (!quote.outAmount) throw new Error(quote.error || "no quote");
      var swap = await fetch(JS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: state.wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }) }).then(function (r) { return r.json(); });
      if (!swap.swapTransaction) throw new Error("no swap tx");
      var tx = window.solanaWeb3.VersionedTransaction.deserialize(Uint8Array.from(atob(swap.swapTransaction), function (c) { return c.charCodeAt(0); }));
      var sig = await signAndSend(tx);
      log("signed $" + symbol + " · " + sig);
      refreshBalance();
    } catch (err) { log("Buy blocked: " + (err.message || err)); }
  };
  document.getElementById("refreshBalTop").onclick = function () { refreshBalance(); };
  document.getElementById("refreshBal").onclick = function () { refreshBalance(); };
})();
