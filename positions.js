(function () {
  const STORE = "buon_positions";
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const JQ = "https://lite-api.jup.ag/swap/v1/quote";
  const JS = "https://lite-api.jup.ag/swap/v1/swap";
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || "[]"); }
    catch (e) { return []; }
  }
  function save(list) { localStorage.setItem(STORE, JSON.stringify(list)); }
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
    var list = load();
    list.unshift({
      id: Date.now(),
      mint: pos.mint,
      symbol: String(pos.symbol || "").replace(/^\$/, ""),
      usdIn: Number(pos.usdIn || 0),
      tokens: Number(pos.tokens || 0),
      entry: Number(pos.entry || 0),
      mark: Number(pos.entry || 0),
      sig: pos.sig || "",
      ts: Date.now()
    });
    save(list.slice(0, 20));
    draw();
    log("Booked $" + pos.symbol + " " + usd(pos.usdIn));
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
    if (!state.wallet) await ensureWallet();
    var tokens = p.tokens;
    if (!tokens) {
      log("No token amount stored for $" + p.symbol);
      return;
    }
    var raw = Math.max(1, Math.floor(tokens * 1e6));
    try {
      var quote = await fetch(JQ + "?inputMint=" + p.mint + "&outputMint=" + USDC + "&amount=" + raw + "&slippageBps=300").then(function (r) { return r.json(); });
      if (!quote.outAmount) throw new Error(quote.error || "no sell quote");
      var swap = await fetch(JS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: state.wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }) }).then(function (r) { return r.json(); });
      if (!swap.swapTransaction) throw new Error("no sell tx");
      var tx = window.solanaWeb3.VersionedTransaction.deserialize(Uint8Array.from(atob(swap.swapTransaction), function (c) { return c.charCodeAt(0); }));
      var sig = await signAndSend(tx);
      log("Sold $" + p.symbol + " · " + sig);
      list.splice(i, 1);
      save(list);
      draw();
      if (typeof refreshBalance === "function") refreshBalance();
    } catch (err) { log("Sell blocked: " + (err.message || err)); }
  };
  async function tickMarks() {
    var list = load();
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      if (!list[i].mint) continue;
      try {
        var px = await priceOf(list[i].mint);
        if (px) { list[i].mark = px; changed = true; }
        if (autoTp() && list[i].entry && px >= list[i].entry * (1 + tpPct() / 100)) {
          log("TP hit $" + list[i].symbol + " +" + tpPct() + "%");
          await sellPosition(i);
          return;
        }
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
  ["tpPct", "autoTp"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var saved = localStorage.getItem("buon_" + id);
    if (id === "autoTp") el.checked = saved === "1";
    else if (saved) el.value = saved;
    el.addEventListener("change", function () {
      localStorage.setItem("buon_" + id, id === "autoTp" ? (el.checked ? "1" : "0") : el.value);
    });
  });
  draw();
  setInterval(tickMarks, 20000);
  setTimeout(tickMarks, 2500);
})();
