(function () {
  const STORE = "buon_positions_v2";
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const JQ = "https://lite-api.jup.ag/swap/v1/quote";
  const JS = "https://lite-api.jup.ag/swap/v1/swap";
  try { localStorage.removeItem("buon_positions"); } catch (e) {}
  function real(p) { return p && p.sig && String(p.sig).length > 20; }
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || "[]").filter(real);
    } catch (e) { return []; }
  }
  function save(list) { localStorage.setItem(STORE, JSON.stringify(list.filter(real))); }
  function tpPct() { return Math.max(1, Number(document.getElementById("tpPct") && document.getElementById("tpPct").value || 30)); }
  function autoTp() { var el = document.getElementById("autoTp"); return el ? el.checked : false; }
  function usd(n) {
    n = Number(n || 0);
    if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
    return "$" + n.toFixed(2);
  }
  function draw() {
    var box = document.getElementById("posList");
    if (!box) return;
    var list = load();
    if (!list.length) { box.innerHTML = "<div class=\"muted\">No buys yet</div>"; return; }
    box.innerHTML = list.map(function (p, i) {
      var pnl = p.mark && p.entry ? ((p.mark - p.entry) / p.entry) * 100 : 0;
      var hit = p.mark && p.entry && p.mark >= p.entry * (1 + tpPct() / 100);
      return "<div class=\"mini\"><b>$" + (p.symbol || "?") + "</b><span class=\"meta\">in " + usd(p.usdIn) + (p.mark ? " · now " + usd(p.mark * (p.tokens || 0)) : "") + (p.entry ? " · " + pnl.toFixed(1) + "%" : "") + (hit ? " · TP ready" : "") + "</span>" +
        "<div class=\"acts\" style=\"margin-top:6px\"><button class=\"buy slim\" data-sell=\"" + i + "\" type=\"button\">Sell</button></div></div>";
    }).join("");
  }
  window.recordPosition = function (pos) {
    if (!pos || !pos.sig) return;
    var list = load();
    list.unshift({
      id: Date.now(),
      mint: pos.mint,
      symbol: String(pos.symbol || "").replace(/^\$/, ""),
      usdIn: Number(pos.usdIn || 0),
      tokens: Number(pos.tokens || 0),
      entry: Number(pos.entry || 0),
      mark: Number(pos.entry || 0),
      sig: pos.sig,
      ts: Date.now()
    });
    save(list.slice(0, 20));
    draw();
  };
  window.clearPositions = function () {
    localStorage.removeItem("buon_positions");
    localStorage.removeItem(STORE);
    draw();
  };
  async function priceOf(mint) {
    var data = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + mint).then(function (r) { return r.json(); });
    var pair = (data.pairs || []).find(function (p) { return p.chainId === "solana"; }) || (data.pairs || [])[0];
    return Number(pair && pair.priceUsd || 0);
  }
  window.sellPosition = async function (i) {
    var list = load();
    var p = list[i];
    if (!p) return;
    if (!state.wallet) { log("Sign in first"); return; }
    if (!p.tokens || !p.mint) { log("Incomplete fill"); return; }
    var raw = Math.max(1, Math.floor(p.tokens * 1e6));
    try {
      var quote = await fetch(JQ + "?inputMint=" + p.mint + "&outputMint=" + USDC + "&amount=" + raw + "&slippageBps=300").then(function (r) { return r.json(); });
      if (!quote.outAmount) throw new Error(quote.error || "no sell quote");
      var swap = await fetch(JS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: state.wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }) }).then(function (r) { return r.json(); });
      if (!swap.swapTransaction) throw new Error("no sell tx");
      log("Sell quote ready for $" + p.symbol);
    } catch (err) { log("Sell blocked: " + (err.message || err)); }
  };
  async function tickMarks() {
    var list = load();
    if (!list.length) return;
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      if (!list[i].mint) continue;
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
  draw();
  setInterval(tickMarks, 20000);
})();
