(function () {
  var PUMP = "https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=market_cap&order=DESC&includeNsfw=false&complete=true";
  var MIN_MC = 50000;
  function usd(n) {
    n = Number(n || 0);
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(0);
  }
  function card(t) {
    var buy = typeof buyBtn === "function" ? buyBtn(t.mint, t.symbol, t.chain) : "";
    return "<div class=\"mini clickable\" data-token=\"" + t.symbol + "\" data-address=\"" + t.mint + "\" data-chain=\"solana\">" +
      "<b>$" + t.symbol + "</b><span class=\"meta\">" + t.name + " · " + usd(t.mc) + "</span>" + buy + "</div>";
  }
  function draw(list) {
    var box = document.getElementById("gradList");
    if (!box) return;
    if (!list.length) { box.innerHTML = "<div class=\"muted\">No graduated Pump coins above filter</div>"; return; }
    box.innerHTML = list.slice(0, 15).map(card).join("");
  }
  window.loadGraduated = async function () {
    var res = await fetch(PUMP);
    var data = await res.json();
    var list = [];
    (Array.isArray(data) ? data : []).forEach(function (c) {
      if (!c || c.complete !== true || c.nsfw) return;
      var symbol = String(c.symbol || "").replace(/^\$/, "").trim();
      if (!symbol || symbol.length > 16) return;
      var mc = Number(c.usd_market_cap || 0);
      if (!mc) mc = Number(c.market_cap || 0);
      if (mc < MIN_MC) return;
      list.push({ symbol: symbol, name: c.name || symbol, mint: c.mint, chain: "solana", mc: mc });
    });
    draw(list);
    if (typeof log === "function") log("Graduated live: " + list.length);
    return list;
  };
  loadGraduated().catch(function (err) {
    var box = document.getElementById("gradList");
    if (box) box.textContent = "Launchpad fetch failed";
    if (typeof log === "function") log("graduated: " + (err.message || err));
  });
  setInterval(function () { loadGraduated().catch(function () {}); }, 45000);
})();
