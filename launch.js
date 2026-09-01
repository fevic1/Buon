(function () {
  var PUMP = "https://frontend-api-v3.pump.fun/coins?offset=0&limit=40&sort=market_cap&order=DESC&includeNsfw=false&complete=true";
  var DEX = "https://api.dexscreener.com/token-boosts/top/v1";
  var MIN_MC = 50000;

  function usd(n) {
    n = Number(n || 0);
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(0);
  }
  function card(t) {
    var buy = typeof buyBtn === "function" ? buyBtn(t.mint, t.symbol, t.chain) : "";
    return "<div class=\"mini clickable\" data-token=\"" + t.symbol + "\" data-address=\"" + t.mint + "\" data-chain=\"" + t.chain + "\">" +
      "<b>$" + t.symbol + "</b><span class=\"meta\">" + t.chain + " · graduated · " + usd(t.mc) + "</span>" + buy + "</div>";
  }
  function draw(list) {
    var box = document.getElementById("crowdedList");
    if (!box) return;
    if (!list.length) { box.innerHTML = "<div class=\"muted\">No graduated names passed the filter</div>"; return; }
    box.innerHTML = list.slice(0, 12).map(card).join("");
  }
  async function pumpGraduated() {
    var res = await fetch(PUMP);
    var data = await res.json();
    var out = [];
    (Array.isArray(data) ? data : []).forEach(function (c) {
      if (!c || !c.complete || c.nsfw) return;
      var mc = Number(c.usd_market_cap || c.market_cap || 0);
      if (mc < MIN_MC) return;
      out.push({ symbol: String(c.symbol || "?").replace(/^\$/, ""), mint: c.mint, chain: "solana", mc: mc, src: "pump" });
    });
    return out;
  }
  async function dexBoosted() {
    try {
      var res = await fetch(DEX);
      var data = await res.json();
      var out = [];
      (Array.isArray(data) ? data : []).forEach(function (t) {
        var chain = String(t.chainId || "");
        if (["solana", "base", "bsc", "ethereum", "monad"].indexOf(chain) < 0) return;
        out.push({ symbol: (t.tokenName || t.description || "TOK").slice(0, 12), mint: t.tokenAddress, chain: chain, mc: 0, src: "dex" });
      });
      return out;
    } catch (e) { return []; }
  }
  window.loadGraduated = async function () {
    var list = [];
    try { list = list.concat(await pumpGraduated()); } catch (e) {}
    try { list = list.concat(await dexBoosted()); } catch (e) {}
    var seen = {};
    list = list.filter(function (t) {
      var k = (t.chain + ":" + t.mint).toLowerCase();
      if (!t.mint || seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    draw(list);
    if (typeof log === "function") log("Graduated filter: " + list.length + " names");
    return list;
  };
  loadGraduated();
  setInterval(function () { loadGraduated().catch(function () {}); }, 60000);
})();
