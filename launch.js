(function () {
  var PUMP = "https://frontend-api-v3.pump.fun/coins?limit=50&offset=0&sort=market_cap&searchTerm=&order=DESC&includeNsfw=false&creator=&complete=true&meta=";
  var DEX_PROFILES = "https://api.dexscreener.com/token-profiles/latest/v1";
  var DEX_TOKEN = "https://api.dexscreener.com/latest/dex/tokens/";
  var MIN_MC = 50000;

  function usd(n) {
    n = Number(n || 0);
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(0);
  }

  function card(t) {
    var buy = typeof buyBtn === "function" ? buyBtn(t.mint, t.symbol, "solana") : "";
    return "<div class=\"mini clickable\" data-token=\"" + t.symbol + "\" data-address=\"" + t.mint + "\" data-chain=\"solana\">" +
      "<b>$" + t.symbol + "</b><span class=\"meta\">" + (t.name || "Pump") + " · " + usd(t.mc) + "</span>" + buy + "</div>";
  }

  function draw(list, note) {
    var box = document.getElementById("gradList");
    if (!box) return;
    if (!list.length) {
      box.innerHTML = "<div class=\"muted\">" + (note || "No Pump graduates above filter") + "</div>";
      return;
    }
    box.innerHTML = list.slice(0, 15).map(card).join("");
  }

  function fromPumpRows(data) {
    var rows = Array.isArray(data) ? data : (data && (data.data || data.coins)) || [];
    var list = [];
    rows.forEach(function (c) {
      if (!c) return;
      if (c.complete === false) return;
      var symbol = String(c.symbol || "").replace(/^\$/, "").trim();
      if (!symbol || symbol.length > 16) return;
      var mc = Number(c.usd_market_cap || c.market_cap || 0);
      if (mc && mc < MIN_MC) return;
      if (!c.mint) return;
      list.push({ symbol: symbol, name: c.name || symbol, mint: c.mint, mc: mc || 0 });
    });
    return list;
  }

  async function loadPump() {
    var res = await fetch(PUMP, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("pump " + res.status);
    return fromPumpRows(await res.json());
  }

  function isPumpPair(p) {
    var dex = String(p.dexId || "").toLowerCase();
    var url = String(p.url || "") + String((p.baseToken || {}).address || "");
    return dex === "pumpswap" || dex === "pumpfun" || dex === "raydium" && /pump/i.test(url);
  }

  async function loadDexPump() {
    var profiles = await fetch(DEX_PROFILES).then(function (r) {
      if (!r.ok) throw new Error("dex profiles " + r.status);
      return r.json();
    });
    var mints = [];
    (Array.isArray(profiles) ? profiles : []).forEach(function (p) {
      var chain = String(p.chainId || p.chain || "").toLowerCase();
      var token = p.tokenAddress || p.address || "";
      if (chain.indexOf("sol") === -1 && chain !== "solana") return;
      if (token) mints.push(token);
    });
    mints = mints.slice(0, 25);
    var list = [];
    var seen = {};
    for (var i = 0; i < mints.length; i += 5) {
      var chunk = mints.slice(i, i + 5);
      try {
        var data = await fetch(DEX_TOKEN + chunk.join(",")).then(function (r) { return r.json(); });
        (data.pairs || []).forEach(function (p) {
          if (p.chainId !== "solana") return;
          if (!isPumpPair(p) && String((p.baseToken || {}).address || "").slice(-4) !== "pump") {
            if (String(p.dexId || "") !== "pumpswap") return;
          }
          var mint = (p.baseToken || {}).address;
          var symbol = (p.baseToken || {}).symbol;
          if (!mint || !symbol || seen[mint]) return;
          var mc = Number((p.marketCap || p.fdv || 0));
          if (mc && mc < MIN_MC) return;
          seen[mint] = true;
          list.push({ symbol: symbol, name: (p.baseToken || {}).name || symbol, mint: mint, mc: mc });
        });
      } catch (e) {}
    }
    list.sort(function (a, b) { return b.mc - a.mc; });
    return list;
  }

  window.loadGraduated = async function () {
    var list = [];
    var err = "";
    try { list = await loadPump(); }
    catch (e) { err = e.message || String(e); }
    if (!list.length) {
      try { list = await loadDexPump(); }
      catch (e2) { err = (err ? err + " · " : "") + (e2.message || e2); }
    }
    draw(list, err ? ("Pump blocked (" + err + ")") : "No Pump graduates above $50k");
    if (typeof log === "function") log("Pump graduated: " + list.length + (err ? " · " + err : ""));
    return list;
  };

  loadGraduated();
  setInterval(function () { loadGraduated(); }, 60000);
})();
