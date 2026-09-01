(function () {
  var RPC = "https://api.mainnet-beta.solana.com";
  var TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  var TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

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

  async function tokensOf(owner) {
    var out = [];
    for (var prog of [TOKEN, TOKEN22]) {
      try {
        var res = await rpc("getTokenAccountsByOwner", [owner, { programId: prog }, { encoding: "jsonParsed" }]);
        var list = (res && res.value) || [];
        list.forEach(function (a) {
          var info = a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info;
          if (!info) return;
          var amt = Number(info.tokenAmount && info.tokenAmount.uiAmount || 0);
          if (amt <= 0) return;
          out.push({ mint: info.mint, amount: amt });
        });
      } catch (e) {}
    }
    return out;
  }

  async function named(holds) {
    if (!holds.length) return [];
    var ids = holds.map(function (h) { return h.mint; }).slice(0, 20).join(",");
    var data = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + ids).then(function (r) { return r.json(); });
    var map = {};
    (data.pairs || []).forEach(function (p) {
      var b = p.baseToken || {};
      if (!b.address || map[b.address]) return;
      map[b.address] = { symbol: b.symbol, chain: p.chainId, price: Number(p.priceUsd || 0) };
    });
    return holds.map(function (h) {
      var n = map[h.mint] || {};
      return {
        mint: h.mint,
        amount: h.amount,
        symbol: n.symbol || h.mint.slice(0, 4),
        chain: n.chain || "solana",
        value: n.price ? h.amount * n.price : 0
      };
    }).sort(function (a, b) { return b.value - a.value; });
  }

  function paint(rows) {
    var box = document.getElementById("sheetHolds");
    var note = document.getElementById("sheetNote");
    if (!box) return;
    if (!rows.length) {
      if (note) note.textContent = "No SPL tokens on the published Solana wallet.";
      return;
    }
    box.innerHTML = rows.map(function (t) {
      var val = t.value ? (t.value >= 1000 ? "$" + (t.value / 1000).toFixed(1) + "K" : "$" + t.value.toFixed(0)) : "";
      return '<div class="hold clickable" data-token="' + t.symbol + '" data-address="' + t.mint + '" data-chain="' + t.chain + '">' +
        "<div><b>$" + t.symbol + "</b><div class=\"meta\">" + t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " · " + val + "</div></div>" +
        '<button class="buy" data-mint="' + t.mint + '" data-symbol="' + t.symbol + '" data-chain="' + t.chain + '">Buy</button></div>';
    }).join("");
    if (note) note.textContent = "On-chain Solana book · " + rows.length + " tokens. EVM book needs a tape key.";
  }

  async function fill() {
    var sheet = document.getElementById("sheet");
    if (!sheet || document.getElementById("shade").hidden) return;
    var copies = [].map.call(sheet.querySelectorAll(".copy"), function (el) { return el.textContent || ""; });
    var sol = "";
    copies.forEach(function (t) {
      var m = t.match(/sol\s+([1-9A-HJ-NP-Za-km-z]{32,44})/i);
      if (m) sol = m[1];
    });
    if (!sol) return;
    var note = document.getElementById("sheetNote");
    if (note) note.textContent = "Reading on-chain book…";
    try {
      var holds = await tokensOf(sol);
      paint(await named(holds));
    } catch (err) {
      if (note) note.textContent = "On-chain book blocked: " + (err.message || err);
    }
  }

  document.addEventListener("click", function (ev) {
    if (!ev.target.closest("[data-trader]")) return;
    setTimeout(fill, 250);
  });
})();
