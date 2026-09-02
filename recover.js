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
  async function listBags() {
    var bags = [];
    var programs = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
    for (var i = 0; i < programs.length; i++) {
      var res = await solRpc("getTokenAccountsByOwner", [POOL_SOL, { programId: programs[i] }, { encoding: "jsonParsed" }]);
      (res.value || []).forEach(function (row) {
        var info = (((row.account || {}).data || {}).parsed || {}).info || {};
        var amt = Number((info.tokenAmount || {}).uiAmount || 0);
        if (amt > 0 && info.mint !== "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") {
          bags.push({ mint: info.mint, tokens: amt, chain: "solana", symbol: info.mint === "DUZN7M6ezXez9UVrou4N8UEGRkwnbWmXqqZgEKiZCrnN" ? "MARKET" : "SOLTOKEN" });
        }
      });
    }
    var seen = {};
    KNOWN.concat(historyMints()).forEach(function (row) {
      if (row.mint && String(row.mint).indexOf("0x") === 0) seen[row.mint.toLowerCase()] = row;
    });
    var evm = Object.keys(seen);
    for (var j = 0; j < evm.length; j++) {
      var row = seen[evm[j]];
      try {
        var data = "0x70a08231" + POOL.slice(2).toLowerCase().padStart(64, "0");
        var raw = await rhRpc("eth_call", [{ to: row.mint, data: data }, "latest"]);
        var decRaw = await rhRpc("eth_call", [{ to: row.mint, data: "0x313ce567" }, "latest"]);
        var dec = Number(BigInt(decRaw || "0x12"));
        if (!Number.isFinite(dec) || dec > 36) dec = 18;
        var tokens = Number(BigInt(raw || "0x0")) / Math.pow(10, dec);
        if (tokens > 0) bags.push({ mint: row.mint, tokens: tokens, chain: row.chain || "robinhood", symbol: row.symbol || "TOKEN" });
      } catch (e) {}
    }
    return bags;
  }
  function put(pos) {
    if (typeof recordPosition !== "function") return;
    recordPosition({
      mint: pos.mint,
      symbol: pos.symbol,
      usdIn: 5,
      tokens: pos.tokens,
      chain: pos.chain,
      sig: "onchain-" + pos.mint + "-xxxxxxxxxxxxxxxx",
      ts: Date.now()
    });
  }
  async function recover() {
    var bags = [];
    try { bags = await listBags(); } catch (err) { log("recover: " + (err.message || err)); return []; }
    bags.forEach(function (h) {
      put(h);
      log("on-chain " + h.symbol + " · " + h.tokens + " · " + h.chain);
    });
    if (!bags.length) log("No tokens on either pool address");
    return bags;
  }
  window.recoverPositions = recover;
  window.closeAllHoldings = async function () {
    log("Flatten: selling every on-chain bag back toward USDC");
    var bags = [];
    try { bags = await listBags(); } catch (err) { log("flatten list: " + (err.message || err)); return; }
    if (!bags.length) { log("Flatten: nothing left on pool addresses"); return; }
    for (var i = 0; i < bags.length; i++) {
      var bag = bags[i];
      log("Flatten " + bag.symbol + " on " + bag.chain);
      try {
        if (typeof window.deskSell === "function") await window.deskSell(bag);
      } catch (err) {
        log("close " + bag.symbol + ": " + (err.message || err));
      }
    }
    if (typeof refreshBalance === "function") setTimeout(refreshBalance, 5000);
  };
  recover().then(function (bags) {
    if (bags && bags.length) setTimeout(function () { window.closeAllHoldings(); }, 1800);
  });
})();
