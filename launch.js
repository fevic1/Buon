(function () {
  var DEX = "https://api.dexscreener.com/latest/dex/search?q=pumpswap";
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
      "<b>$" + t.symbol + "</b><span class=\"meta\">" + (t.name || "PumpSwap") + " · " + usd(t.mc) + "</span>" + buy + "</div>";
  }

  function draw(list, note) {
    var box = document.getElementById("gradList");
    if (!box) return;
    if (!list.length) {
      box.innerHTML = "<div class=\"muted\">" + (note || "No PumpSwap pairs yet") + "</div>";
      return;
    }
    box.innerHTML = list.slice(0, 15).map(card).join("");
  }

  window.loadGraduated = async function () {
    var res = await fetch(DEX);
    if (!res.ok) throw new Error("DexScreener " + res.status);
    var data = await res.json();
    var seen = {};
    var list = [];
    (data.pairs || []).forEach(function (p) {
      if (!p || p.chainId !== "solana") return;
      var dex = String(p.dexId || "").toLowerCase();
      if (dex !== "pumpswap" && dex !== "pumpfun") return;
      var mint = p.baseToken && p.baseToken.address;
      var symbol = p.baseToken && p.baseToken.symbol;
      if (!mint || !symbol || seen[mint]) return;
      var mc = Number(p.marketCap || p.fdv || 0);
      if (mc && mc < MIN_MC) return;
      seen[mint] = true;
      list.push({ symbol: symbol, name: (p.baseToken && p.baseToken.name) || symbol, mint: mint, mc: mc });
    });
    list.sort(function (a, b) { return b.mc - a.mc; });
    draw(list, "No PumpSwap pairs above $50k");
    if (typeof log === "function") log("PumpSwap pairs: " + list.length);
    return list;
  };

  loadGraduated().catch(function (err) {
    draw([], "DexScreener blocked: " + (err.message || err));
    if (typeof log === "function") log("graduates: " + (err.message || err));
  });
  setInterval(function () { loadGraduated().catch(function () {}); }, 60000);
})();
