(function () {
  var RPC = "https://api.mainnet-beta.solana.com";
  var API = atob("aHR0cHM6Ly9hcGkuZm9tb2FwaS5pbw==");
  var TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  var STORE = "buon_holds_v1";
  var CACHE = "buon_top10_books";

  function loadSeen() {
    try { return JSON.parse(localStorage.getItem(STORE) || "{}"); }
    catch (e) { return {}; }
  }
  function saveSeen(s) { localStorage.setItem(STORE, JSON.stringify(s)); }
  function ago(ts) {
    var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h";
    return Math.floor(s / 86400) + "d";
  }
  function usd(n) {
    n = Number(n || 0);
    if (!n) return "";
    if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
    return "$" + n.toFixed(0);
  }

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
    var res = await rpc("getTokenAccountsByOwner", [owner, { programId: TOKEN }, { encoding: "jsonParsed" }]);
    var out = [];
    ((res && res.value) || []).forEach(function (a) {
      var info = a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info;
      if (!info) return;
      var amt = Number(info.tokenAmount && info.tokenAmount.uiAmount || 0);
      if (amt <= 0) return;
      if (info.mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") return;
      out.push({ mint: info.mint, amount: amt });
    });
    return out;
  }

  async function names(mints) {
    var map = {};
    for (var i = 0; i < mints.length; i += 8) {
      var chunk = mints.slice(i, i + 8);
      try {
        var data = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + chunk.join(",")).then(function (r) { return r.json(); });
        (data.pairs || []).forEach(function (p) {
          var b = p.baseToken || {};
          if (!b.address || map[b.address]) return;
          map[b.address] = { symbol: b.symbol, price: Number(p.priceUsd || 0), chain: p.chainId || "solana" };
        });
      } catch (e) {}
    }
    return map;
  }

  async function top10() {
    var res = await fetch(API + "/v2/leaderboard/24h?limit=10");
    var data = await res.json();
    return (data.traders || []).slice(0, 10);
  }

  function paint(groups, meta) {
    var box = document.getElementById("crowdedList");
    if (!box) return;
    if (!groups.length) {
      box.innerHTML = "<div class=\"muted\">" + (meta || "No shared Solana book yet") + "</div>";
      return;
    }
    box.innerHTML = groups.map(function (g) {
      var people = g.holders.map(function (h) { return "@" + h.handle + " " + ago(h.since); }).join(" · ");
      return "<div class=\"mini clickable\" data-token=\"" + g.symbol + "\" data-address=\"" + g.mint + "\" data-chain=\"" + g.chain + "\">" +
        "<b>$" + g.symbol + "</b>" +
        "<span class=\"meta\">" + g.holders.length + "/10 hold · " + usd(g.value) + " · oldest " + ago(g.oldest) + "</span>" +
        "<span class=\"meta\">" + people + "</span>" +
        (g.mint ? "<div class=\"acts\" style=\"margin-top:6px\"><button class=\"buy slim\" data-mint=\"" + g.mint + "\" data-symbol=\"" + g.symbol + "\" data-chain=\"" + g.chain + "\">Buy</button></div>" : "") +
        "</div>";
    }).join("");
  }

  async function tick() {
    var box = document.getElementById("crowdedList");
    if (box) box.innerHTML = "<div class=\"muted\">Reading top 10 Solana books…</div>";
    try {
      var traders = await top10();
      var seen = loadSeen();
      var books = [];
      for (var i = 0; i < traders.length; i++) {
        var t = traders[i];
        var sol = t.wallets && t.wallets.solana;
        if (!sol) continue;
        try {
          var holds = await tokensOf(sol);
          holds.forEach(function (h) {
            var key = sol + ":" + h.mint;
            if (!seen[key]) seen[key] = Date.now();
          });
          books.push({ handle: t.handle, rank: t.rank, sol: sol, holds: holds });
        } catch (e) {}
        await new Promise(function (ok) { setTimeout(ok, 220); });
      }
      saveSeen(seen);
      var byMint = {};
      books.forEach(function (b) {
        b.holds.forEach(function (h) {
          if (!byMint[h.mint]) byMint[h.mint] = [];
          byMint[h.mint].push({
            handle: b.handle,
            rank: b.rank,
            amount: h.amount,
            since: seen[b.sol + ":" + h.mint] || Date.now()
          });
        });
      });
      var shared = Object.keys(byMint).filter(function (m) { return byMint[m].length >= 2; });
      var meta = await names(shared);
      var groups = shared.map(function (mint) {
        var holders = byMint[mint].sort(function (a, b) { return a.rank - b.rank; });
        var info = meta[mint] || {};
        var value = holders.reduce(function (s, h) { return s + h.amount * (info.price || 0); }, 0);
        var oldest = holders.reduce(function (min, h) { return Math.min(min, h.since); }, Date.now());
        return {
          mint: mint,
          symbol: info.symbol || mint.slice(0, 4),
          chain: info.chain || "solana",
          holders: holders,
          value: value,
          oldest: oldest
        };
      }).sort(function (a, b) { return b.holders.length - a.holders.length || b.value - a.value; });
      localStorage.setItem(CACHE, JSON.stringify({ ts: Date.now(), groups: groups.slice(0, 12) }));
      paint(groups.slice(0, 8), groups.length ? "" : "Top 10 share no Solana mint right now");
      var st = document.getElementById("apiStatus");
      if (st) st.textContent = "top10 chain · " + groups.length + " shared";
    } catch (err) {
      paint([], "Watch failed: " + (err.message || err));
    }
  }

  try {
    var cached = JSON.parse(localStorage.getItem(CACHE) || "null");
    if (cached && cached.groups) paint(cached.groups, "");
  } catch (e) {}
  tick();
  setInterval(tick, 90000);
})();
