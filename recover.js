(function () {
  var POOL = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
  var POOL_SOL = "8ZGuiQZzb6BMDeWjzPzowr6B839ftaJS15ihoscfqEk4";
  var SOL_RPC = "https://api.mainnet-beta.solana.com";
  var RH_RPC = "https://rpc.mainnet.chain.robinhood.com";
  var KNOWN = [
    { mint: "0xedAee44320107CAa714BaAEc486261A87F27022d", symbol: "PONGO", chain: "robinhood" },
    { mint: "DUZN7M6ezXez9UVrou4N8UEGRkwnbWmXqqZgEKiZCrnN", symbol: "MARKET", chain: "solana" }
  ];

  async function solRpc(method, params) {
    var res = await fetch(SOL_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
    var data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }
  async function rhRpc(method, params) {
    var res = await fetch(RH_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
    var data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }
  function historyMints() {
    try {
      return JSON.parse(localStorage.getItem("buon_history_v1") || "[]")
        .filter(function (h) { return h.dest && String(h.dest).length > 10; })
        .map(function (h) { return { mint: h.dest, symbol: h.note || "", chain: h.net || "" }; });
    } catch (e) { return []; }
  }
  async function solHolds() {
    var out = [];
    var programs = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
    for (var i = 0; i < programs.length; i++) {
      var res = await solRpc("getTokenAccountsByOwner", [POOL_SOL, { programId: programs[i] }, { encoding: "jsonParsed" }]);
      (res.value || []).forEach(function (row) {
        var info = (((row.account || {}).data || {}).parsed || {}).info || {};
        var amt = Number((info.tokenAmount || {}).uiAmount || 0);
        if (amt > 0) out.push({ mint: info.mint, tokens: amt, chain: "solana" });
      });
    }
    return out;
  }
  async function evmHold(mint) {
    var data = "0x70a08231" + POOL.slice(2).toLowerCase().padStart(64, "0");
    var raw = await rhRpc("eth_call", [{ to: mint, data: data }, "latest"]);
    var decRaw = "0x12";
    try { decRaw = await rhRpc("eth_call", [{ to: mint, data: "0x313ce567" }, "latest"]); } catch (e) {}
    var dec = Number(BigInt(decRaw || "0x12"));
    if (!Number.isFinite(dec) || dec > 36) dec = 18;
    var tokens = Number(BigInt(raw || "0x0")) / Math.pow(10, dec);
    return tokens;
  }
  async function nameOf(mint, fallback) {
    if (fallback) return fallback;
    try {
      var data = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + mint).then(function (r) { return r.json(); });
      var p = (data.pairs || [])[0];
      return (p && p.baseToken && p.baseToken.symbol) || mint.slice(0, 6);
    } catch (e) { return mint.slice(0, 6); }
  }
  function put(pos) {
    if (typeof recordPosition !== "function") return;
    recordPosition({
      mint: pos.mint,
      symbol: pos.symbol,
      usdIn: Number(pos.usdIn || 5),
      tokens: pos.tokens,
      chain: pos.chain,
      sig: "onchain-" + pos.mint + "-xxxxxxxxxxxxxxxx",
      ts: Date.now()
    });
  }
  async function recover() {
    var found = 0;
    try {
      var sols = await solHolds();
      for (var i = 0; i < sols.length; i++) {
        var h = sols[i];
        var symbol = await nameOf(h.mint, h.mint === "DUZN7M6ezXez9UVrou4N8UEGRkwnbWmXqqZgEKiZCrnN" ? "MARKET" : "");
        put({ mint: h.mint, symbol: symbol, tokens: h.tokens, chain: "solana", usdIn: 5 });
        log("on-chain " + symbol + " · " + h.tokens + " · Solana pool");
        found += 1;
      }
    } catch (err) { log("sol recover: " + (err.message || err)); }
    var seen = {};
    KNOWN.concat(historyMints()).forEach(function (row) {
      if (!row.mint || String(row.mint).indexOf("0x") !== 0) return;
      seen[row.mint.toLowerCase()] = row;
    });
    var evm = Object.keys(seen);
    for (var j = 0; j < evm.length; j++) {
      var row = seen[evm[j]];
      try {
        var tokens = await evmHold(row.mint);
        if (!tokens) continue;
        var symbol = await nameOf(row.mint, row.symbol);
        put({ mint: row.mint, symbol: symbol, tokens: tokens, chain: row.chain || "robinhood", usdIn: 5 });
        log("on-chain " + symbol + " · " + tokens + " · Robinhood pool");
        found += 1;
      } catch (err) { log("evm recover " + row.mint.slice(0, 8) + ": " + (err.message || err)); }
    }
    if (!found) log("No tokens on either pool address");
  }
  window.recoverPositions = recover;
  window.closeAllHoldings = async function () {
    var list = [];
    try { list = JSON.parse(localStorage.getItem("buon_positions_v2") || "[]"); } catch (e) {}
    if (!list.length) { log("Nothing to return"); return; }
    log("Returning " + list.length + " bag(s) to USDC");
    for (var i = 0; i < list.length; i++) {
      if (typeof window.deskSell === "function") {
        try { await window.deskSell(list[i]); }
        catch (err) { log("close " + (list[i].symbol || "") + ": " + (err.message || err)); }
      }
    }
  };
  recover();
})();
