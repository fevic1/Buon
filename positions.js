(function () {
  const STORE = "buon_positions_v2";
  const KNOWN = [{
    mint: "0xedae",
    symbol: "RH",
    usdIn: 5,
    chain: "robinhood",
    sig: "0x4bd8085827dddf92d0fe9a7b504bc8bb8bb565ace1ce1b300b72a592f84c7401",
    ts: Date.parse("2026-09-01T07:53:55") || Date.now()
  }];
  function real(p) { return p && p.sig && String(p.sig).length > 20; }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || "[]").filter(real); }
    catch (e) { return []; }
  }
  function save(list) { localStorage.setItem(STORE, JSON.stringify(list.filter(real).slice(0, 20))); }
  function tpPct() { return Math.max(1, Number((document.getElementById("tpPct") || {}).value || 30)); }
  function usd(n) {
    n = Number(n || 0);
    if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
    return "$" + n.toFixed(2);
  }
  function seed() {
    var list = load();
    var sigs = {};
    list.forEach(function (p) { sigs[String(p.sig).toLowerCase()] = true; });
    KNOWN.forEach(function (p) {
      if (!sigs[p.sig.toLowerCase()]) list.push(p);
    });
    try {
      var hist = JSON.parse(localStorage.getItem("buon_history_v1") || "[]");
      hist.forEach(function (h) {
        if (h.type !== "buy" || !h.dest) return;
        var sig = "hist-" + (h.ts || "") + "-" + h.dest;
        if (sig.length < 21) sig = (sig + "---------------------").slice(0, 24);
        if (list.some(function (p) { return String(p.mint).toLowerCase() === String(h.dest).toLowerCase(); })) return;
        list.push({
          mint: h.dest,
          symbol: h.note || "",
          usdIn: h.usd,
          chain: h.net,
          sig: h.dest.length > 20 ? h.dest : sig,
          ts: h.ts
        });
      });
    } catch (e) {}
    save(list);
  }
  function draw() {
    var box = document.getElementById("posList");
    if (!box) return;
    var list = load();
    if (!list.length) { box.innerHTML = "<div class=\"muted\">No buys yet</div>"; return; }
    box.innerHTML = list.map(function (p, i) {
      var pnl = p.mark && p.entry ? ((p.mark - p.entry) / p.entry) * 100 : 0;
      var hit = p.mark && p.entry && p.mark >= p.entry * (1 + tpPct() / 100);
      var mint = String(p.mint || "");
      var short = mint.length > 12 ? mint.slice(0, 6) + "…" + mint.slice(-4) : mint;
      return "<div class=\"mini\"><b>$" + (p.symbol || "open") + "</b><span class=\"meta\">open · " + usd(p.usdIn) + " · " + (p.chain || "") +
        (p.entry ? " · " + pnl.toFixed(1) + "%" : "") + (hit ? " · TP ready" : "") +
        "<br>" + short + "</span>" +
        "<div class=\"acts\" style=\"margin-top:6px\"><button class=\"buy slim\" data-sell=\"" + i + "\" type=\"button\">Sell</button></div></div>";
    }).join("");
  }
  window.recordPosition = function (pos) {
    if (!pos || !pos.sig) return;
    var list = load();
    if (list.some(function (p) { return String(p.sig).toLowerCase() === String(pos.sig).toLowerCase(); })) { draw(); return; }
    list.unshift({
      mint: pos.mint,
      symbol: String(pos.symbol || "").replace(/^\$/, ""),
      usdIn: Number(pos.usdIn || 0),
      tokens: Number(pos.tokens || 0),
      entry: Number(pos.entry || 0),
      mark: Number(pos.entry || 0),
      chain: pos.chain || "",
      sig: pos.sig,
      ts: pos.ts || Date.now()
    });
    save(list);
    draw();
  };
  window.clearPositions = function () {
    localStorage.removeItem(STORE);
    draw();
  };
  async function priceOf(mint) {
    if (!mint || String(mint).length < 8) return 0;
    var data = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + mint).then(function (r) { return r.json(); });
    var pair = (data.pairs || [])[0];
    return Number(pair && pair.priceUsd || 0);
  }
  window.sellPosition = async function (i) {
    var list = load();
    var p = list[i];
    if (!p) return;
    log("Sell of $" + (p.symbol || "") + " is next — position is open on " + (p.chain || "chain"));
  };
  async function tickMarks() {
    var list = load();
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      if (!list[i].mint || String(list[i].mint).length < 8) continue;
      try {
        var px = await priceOf(list[i].mint);
        if (px) { list[i].mark = px; changed = true; }
      } catch (e) {}
    }
    if (changed) { save(list); draw(); }
  }
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("button[data-sell]");
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    sellPosition(Number(btn.dataset.sell));
  }, true);
  seed();
  draw();
  setInterval(tickMarks, 20000);
})();
