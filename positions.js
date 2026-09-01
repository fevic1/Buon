(function () {
  const STORE = "buon_positions_v2";
  const POOL = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
  const RH_RPC = ["https://rpc.mainnet.chain.robinhood.com"];
  const BASE_RPC = ["https://base.publicnode.com"];
  function real(p) { return p && p.sig && String(p.sig).length > 20 && String(p.mint || "").length > 10; }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || "[]").filter(real); }
    catch (e) { return []; }
  }
  function save(list) {
    var seen = {};
    var out = [];
    list.filter(real).forEach(function (p) {
      var k = String(p.mint).toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(p);
    });
    localStorage.setItem(STORE, JSON.stringify(out.slice(0, 20)));
  }
  function tpPct() { return Math.max(1, Number((document.getElementById("tpPct") || {}).value || 30)); }
  function usd(n) {
    n = Number(n || 0);
    if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
    return "$" + n.toFixed(2);
  }
  function seed() {
    var list = load();
    var hasPongo = list.some(function (p) { return String(p.mint).toLowerCase() === "0xedaee44320107caa714baaec486261a87f27022d"; });
    if (!hasPongo) {
      list.push({
        mint: "0xedAee44320107CAa714BaAEc486261A87F27022d",
        symbol: "PONGO",
        usdIn: 5,
        chain: "robinhood",
        sig: "0x4bd8085827dddf92d0fe9a7b504bc8bb8bb565ace1ce1b300b72a592f84c7401",
        ts: Date.now()
      });
    }
    try {
      JSON.parse(localStorage.getItem("buon_history_v1") || "[]").forEach(function (h) {
        if (h.type !== "buy" || !h.dest || String(h.dest).length < 12) return;
        if (list.some(function (p) { return String(p.mint).toLowerCase() === String(h.dest).toLowerCase(); })) return;
        list.push({ mint: h.dest, symbol: h.note || "", usdIn: h.usd, chain: h.net, sig: String(h.dest) + String(h.ts || "xxxxxxxxxxxxxxxxxxxx"), ts: h.ts });
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
      var cost = Number(p.usdIn || 0);
      var now = Number(p.valueUsd || 0);
      var pnl = now && cost ? now - cost : 0;
      var pct = cost ? (pnl / cost) * 100 : 0;
      var hit = now && cost && now >= cost * (1 + tpPct() / 100);
      var col = pnl > 0.01 ? "#7dffb3" : pnl < -0.01 ? "#ff8d9a" : "inherit";
      return "<div class=\"mini\"><b>$" + (p.symbol || "open") + "</b><span class=\"meta\">" +
        (p.chain || "") + " · in " + usd(cost) +
        (p.entry ? " · entry $" + Number(p.entry).toPrecision(4) : "") +
        (p.mark ? " · now $" + Number(p.mark).toPrecision(4) : "") +
        (now ? " · val " + usd(now) : "") +
        " <b style=\"color:" + col + "\">" + (now ? (pnl >= 0 ? "+" : "") + pct.toFixed(1) + "%" : "pricing…") + "</b>" +
        (hit ? " · TP" : "") + "</span>" +
        "<div class=\"acts\" style=\"margin-top:6px\"><button class=\"buy slim\" data-sell=\"" + i + "\" type=\"button\">Sell</button></div></div>";
    }).join("");
  }
  window.recordPosition = function (pos) {
    if (!pos || !pos.sig || !pos.mint) return;
    var list = load();
    if (list.some(function (p) { return String(p.mint).toLowerCase() === String(pos.mint).toLowerCase(); })) { draw(); return; }
    list.unshift({
      mint: pos.mint,
      symbol: String(pos.symbol || "").replace(/^\$/, ""),
      usdIn: Number(pos.usdIn || 0),
      tokens: Number(pos.tokens || 0),
      entry: Number(pos.entry || 0),
      mark: Number(pos.mark || 0),
      chain: pos.chain || "",
      sig: pos.sig,
      ts: pos.ts || Date.now()
    });
    save(list);
    draw();
    tickMarks();
  };
  async function rpc(urls, body) {
    var last = "rpc";
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        var data = await res.json();
        if (data.error) { last = data.error.message; continue; }
        return data.result;
      } catch (e) { last = e.message || String(e); }
    }
    throw new Error(last);
  }
  async function tokenBal(mint) {
    var data = "0x70a08231" + POOL.slice(2).toLowerCase().padStart(64, "0");
    var raw = await rpc(RH_RPC, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: mint, data: data }, "latest"] });
    var decRaw = "0x12";
    try {
      decRaw = await rpc(RH_RPC, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: mint, data: "0x313ce567" }, "latest"] });
    } catch (e) {}
    var dec = Number(BigInt(decRaw || "0x12"));
    if (!Number.isFinite(dec) || dec > 36) dec = 18;
    return Number(BigInt(raw || "0x0")) / Math.pow(10, dec);
  }
  async function priceOf(mint) {
    var data = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + mint).then(function (r) { return r.json(); });
    var pair = (data.pairs || []).find(function (p) { return p.chainId === "robinhood" || p.chainId === "base" || p.chainId === "solana"; }) || (data.pairs || [])[0];
    return Number(pair && pair.priceUsd || 0);
  }
  async function tickMarks() {
    var list = load();
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.mint || String(p.mint).indexOf("0x") !== 0) continue;
      try {
        var px = await priceOf(p.mint);
        var tokens = p.tokens;
        try { tokens = await tokenBal(p.mint); } catch (e) {}
        if (px) { p.mark = px; changed = true; }
        if (tokens) {
          p.tokens = tokens;
          if (tokens && p.usdIn) p.entry = p.usdIn / tokens;
          p.valueUsd = tokens * (px || p.mark || 0);
          changed = true;
        }
      } catch (e) {}
    }
    if (changed) { save(list); }
    draw();
  }
  window.sellPosition = async function (i) {
    var list = load();
    var p = list[i];
    if (!p) return;
    log("Sell of $" + (p.symbol || "") + " next — open on " + (p.chain || "chain"));
  };
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("button[data-sell]");
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    sellPosition(Number(btn.dataset.sell));
  }, true);
  seed();
  draw();
  tickMarks();
  setInterval(tickMarks, 8000);
})();
