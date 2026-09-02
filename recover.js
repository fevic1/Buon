(function () {
  var POOL = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
  var POOL_SOL = "8ZGuiQZzb6BMDeWjzPzowr6B839ftaJS15ihoscfqEk4";
  var SOL_RPC = "https://api.mainnet-beta.solana.com";
  var RH_RPC = "https://rpc.mainnet.chain.robinhood.com";
  var KNOWN = [
    { mint: "0xedAee44320107CAa714BaAEc486261A87F27022d", symbol: "PONGO", chain: "robinhood" },
    { mint: "DUZN7M6ezXez9UVrou4N8UEGRkwnbWmXqqZgEKiZCrnN", symbol: "MARKET", chain: "solana" }
  ];
  var busy = false;

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
    for (var j = 0; j < KNOWN.length; j++) {
      var row = KNOWN[j];
      if (String(row.mint).indexOf("0x") !== 0) continue;
      try {
        var data = "0x70a08231" + POOL.slice(2).toLowerCase().padStart(64, "0");
        var raw = await rhRpc("eth_call", [{ to: row.mint, data: data }, "latest"]);
        var tokens = Number(BigInt(raw || "0x0")) / 1e18;
        if (tokens > 0) bags.push({ mint: row.mint, tokens: tokens, chain: "robinhood", symbol: row.symbol });
      } catch (e) {}
    }
    return bags;
  }

  window.recoverPositions = async function () {
    return listBags();
  };

  window.closeAllHoldings = async function () {
    if (busy) return;
    busy = true;
    try {
      var bags = await listBags();
      log("Last close: " + bags.length + " bag(s)");
      for (var i = 0; i < bags.length; i++) {
        try {
          if (typeof window.deskSell === "function") await window.deskSell(bags[i]);
        } catch (err) {
          log("close " + bags[i].symbol + ": " + (err.message || err));
        }
      }
    } finally {
      if (typeof clearPositions === "function") clearPositions();
      busy = false;
    }
  };

  setTimeout(function () {
    if (typeof window.closeAllHoldings === "function") window.closeAllHoldings();
  }, 2200);
})();
