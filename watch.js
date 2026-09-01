(function () {
  var API = atob("aHR0cHM6Ly9hcGkuZm9tb2FwaS5pbw==");
  var TAPE = "buon_tape_top10";
  var CACHE = "buon_top10_books";

  function ago(ts) {
    if (!ts) return "";
    var ms = ts > 1e12 ? ts : ts * 1000;
    var s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
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
  function keyOf(a) {
    if (a.tokenAddress) return String(a.tokenAddress).toLowerCase();
    return String(a.token || "?").replace(/^\$/, "").toUpperCase();
  }

  function paint(groups, empty) {
    var box = document.getElementById("crowdedList");
    if (!box) return;
    if (!groups.length) {
      box.innerHTML = "<div class=\"muted\">" + (empty || "No shared book yet") + "</div>";
      return;
    }
    box.innerHTML = groups.map(function (g) {
      var people = g.holders.map(function (h) {
        return "@" + h.handle + " " + (h.side || "hold") + " " + ago(h.since);
      }).join(" · ");
      return "<div class=\"mini clickable\" data-token=\"" + g.symbol + "\" data-address=\"" + (g.mint || "") + "\" data-chain=\"" + g.chain + "\">" +
        "<b>$" + g.symbol + "</b>" +
        "<span class=\"meta\">" + g.holders.length + "/10 · " + (g.chain || "") + " · buy " + usd(g.buyUsd) + " · sell " + usd(g.sellUsd) + "</span>" +
        "<span class=\"meta\">" + people + "</span>" +
        (g.mint ? "<div class=\"acts\" style=\"margin-top:6px\"><button class=\"buy slim\" data-mint=\"" + g.mint + "\" data-symbol=\"" + g.symbol + "\" data-chain=\"" + g.chain + "\">Buy</button></div>" : "") +
        "</div>";
    }).join("");
  }

  function remember(alerts) {
    var prev = [];
    try { prev = JSON.parse(localStorage.getItem(TAPE) || "[]"); } catch (e) {}
    var seen = {};
    prev.forEach(function (a) { seen[a.id] = true; });
    alerts.forEach(function (a) {
      if (!a || !a.id || seen[a.id]) return;
      prev.push({
        id: a.id,
        ts: a.ts,
        type: a.type,
        trader: a.trader,
        token: a.token,
        tokenAddress: a.tokenAddress,
        chain: a.chain,
        usdValue: a.usdValue
      });
    });
    if (prev.length > 400) prev = prev.slice(-400);
    localStorage.setItem(TAPE, JSON.stringify(prev));
    return prev;
  }

  function cluster(traders, tape) {
    var top = {};
    traders.forEach(function (t) { top[String(t.handle || "").toLowerCase()] = t; });
    var by = {};
    tape.forEach(function (a) {
      var handle = String(a.trader || "").replace(/^@/, "").toLowerCase();
      if (!top[handle]) return;
      var k = keyOf(a);
      if (!by[k]) by[k] = { mint: a.tokenAddress || "", symbol: String(a.token || k).replace(/^\$/, ""), chain: a.chain || "", buyUsd: 0, sellUsd: 0, people: {} };
      var g = by[k];
      if (a.tokenAddress && !g.mint) g.mint = a.tokenAddress;
      if (a.chain && !g.chain) g.chain = a.chain;
      var side = String(a.type || "").toLowerCase();
      var usdV = Number(a.usdValue || 0);
      if (side === "buy") g.buyUsd += usdV;
      if (side === "sell") g.sellUsd += usdV;
      if (!g.people[handle] || (a.ts && a.ts < g.people[handle].since)) {
        g.people[handle] = { handle: a.trader, side: side, since: a.ts || Date.now(), rank: top[handle].rank };
      } else {
        g.people[handle].side = side || g.people[handle].side;
      }
    });
    return Object.keys(by).map(function (k) {
      var g = by[k];
      var holders = Object.keys(g.people).map(function (h) { return g.people[h]; });
      return {
        mint: g.mint,
        symbol: g.symbol,
        chain: g.chain,
        holders: holders,
        buyUsd: g.buyUsd,
        sellUsd: g.sellUsd
      };
    }).filter(function (g) { return g.holders.length >= 2; })
      .sort(function (a, b) { return b.holders.length - a.holders.length || (b.buyUsd - b.sellUsd) - (a.buyUsd - a.sellUsd); });
  }

  async function tick() {
    try {
      var board = await fetch(API + "/v2/leaderboard/24h?limit=10").then(function (r) { return r.json(); });
      var traders = (board.traders || []).slice(0, 10);
      var live = await fetch(API + "/v2/alerts?limit=50").then(function (r) { return r.json(); });
      var tape = remember(live.alerts || []);
      var groups = cluster(traders, tape);
      localStorage.setItem(CACHE, JSON.stringify({ ts: Date.now(), groups: groups.slice(0, 12) }));
      paint(groups.slice(0, 8), "Top 10 have not printed the same mint on the stored tape yet");
      var st = document.getElementById("apiStatus");
      if (st) st.textContent = "top10 tape · " + groups.length + " shared";
    } catch (err) {
      paint([], "Watch failed: " + (err.message || err));
    }
  }

  try {
    var cached = JSON.parse(localStorage.getItem(CACHE) || "null");
    if (cached && cached.groups) paint(cached.groups);
  } catch (e) {}
  tick();
  setInterval(tick, 20000);
})();
