(function () {
  var POOL_SOL = "8ZGuiQZzb6BMDeWjzPzowr6B839ftaJS15ihoscfqEk4";
  var RPC = "https://api.mainnet-beta.solana.com";

  async function rpc(method, params) {
    var res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  async function solHolds() {
    var out = [];
    var programs = [
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    ];
    for (var i = 0; i < programs.length; i++) {
      var res = await rpc("getTokenAccountsByOwner", [POOL_SOL, { programId: programs[i] }, { encoding: "jsonParsed" }]);
      (res.value || []).forEach(function (row) {
        var info = (((row.account || {}).data || {}).parsed || {}).info || {};
        var amt = Number((info.tokenAmount || {}).uiAmount || 0);
        if (amt > 0) out.push({ mint: info.mint, tokens: amt, chain: "solana" });
      });
    }
    return out;
  }

  async function nameOf(mint) {
    try {
      var data = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + mint).then(function (r) { return r.json(); });
      var p = (data.pairs || [])[0];
      return (p && p.baseToken && p.baseToken.symbol) || mint.slice(0, 4);
    } catch (e) { return mint.slice(0, 4); }
  }

  async function recover() {
    try {
      var holds = await solHolds();
      for (var i = 0; i < holds.length; i++) {
        var h = holds[i];
        var symbol = await nameOf(h.mint);
        if (typeof recordPosition === "function") {
          recordPosition({
            mint: h.mint,
            symbol: symbol,
            usdIn: Number(h.tokens && 0),
            tokens: h.tokens,
            chain: "solana",
            sig: "onchain-" + h.mint + "-xxxxxxxxxxxxxxxx",
            ts: Date.now()
          });
        }
        if (typeof log === "function") log("recovered $" + symbol + " · " + h.tokens + " on Solana pool");
      }
      if (!holds.length && typeof log === "function") log("Solana pool has no token accounts to recover");
    } catch (err) {
      if (typeof log === "function") log("recover: " + (err.message || err));
    }
  }

  window.recoverPositions = recover;
  recover();
})();
