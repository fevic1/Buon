(function () {
  var STORE = "buon_positions_v2";
  var POOL = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
  var RH_RPC = ["https://rpc.mainnet.chain.robinhood.com"];

  function real(p) { return p && p.sig && String(p.sig).length > 20 && String(p.mint || "").length > 10; }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || "[]").filter(real); }
    catch (e) { return []; }
  }
  function save(list) {
    localStorage.setItem(STORE, JSON.stringify(list.filter(real).slice(0, 20)));
  }
  function tpPct() { return Math.max(1, Number((document.getElementById("tpPct") || {}).value || 30)); }
  function tpUsd() { return Math.max(0, Number((document.getElementById("tpUsd") || {}).value || 50)); }
  function usd(n) {
    n = Number(n || 0);
    if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
    return "$" + n.toFixed(2);
  }
  function cls(pnl) { if (pnl > 0.02) return "up"; if (pnl < -0.02) return "down"; return ""; }

  function draw() {
    var box = document.getElementById("posList");
    if (!box) return;
    var list = load();
    if (!list.length) { box.innerHTML = "<div class=\"muted\">No open positions</div>"; return; }
    box.innerHTML = list.map(function (p, i) {
      var cost = Number(p.usdIn || 0);
      var now = Number(p.valueUsd || 0);
      var pnl = now && cost ? now - cost : 0;
      var pct = cost ? (pnl / cost) * 100 : 0;
      var dollarHit = now && cost && pnl >= tpUsd();
      var pctHit = now && cost && pct >= tpPct();
      return "<div class=\"pos-card " + cls(pnl) + "\">" +
        "<div class=\"pos-top\"><b>$" + (p.symbol || "open") + "</b><span class=\"pos-pnl\">" +
        (now ? ((pnl >= 0 ? "+" : "") + usd(pnl) + " · " + pct.toFixed(1) + "%") : "mark…") + "</span></div>" +
        "<span class=\"meta\">" + (p.chain || "") + " · cost " + usd(cost) +
        (p.mark ? " · px $" + Number(p.mark).toPrecision(4) : "") +
        (now ? " · val " + usd(now) : "") +
        (dollarHit || pctHit ? " · TP ready" : "") + "</span>" +
        "<div class=\"acts\">" +
        "<button class=\"buy slim\" data-add=\"" + i + "\" type=\"button\">Add</button>" +
        "<button class=\"ghost slim\" data-cancel=\"" + i + "\" type=\"button\">Cancel</button>" +
        "<button class=\"buy slim wide\" data-sell=\"" + i + "\" type=\"button\">Take profit</button>" +
        "</div></div>";
    }).join("");
  }

  window.recordPosition = function (pos) {
    if (!pos || !pos.sig || !pos.mint) return;
    var list = load();
    var key = String(pos.mint).toLowerCase();
    var hit = list.find(function (p) { return String(p.mint).toLowerCase() === key; });
    if (hit) {
      hit.usdIn = Number(hit.usdIn || 0) + Number(pos.usdIn || 0);
      hit.sig = pos.sig;
      hit.ts = pos.ts || Date.now();
    } else {
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
    }
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
    var pairs = data.pairs || [];
    var pair = pairs.find(function (p) { return p.chainId === "robinhood"; }) ||
      pairs.find(function (p) { return p.chainId === "solana"; }) ||
      pairs.find(function (p) { return p.chainId === "base"; }) ||
      pairs[0];
    return Number(pair && pair.priceUsd || 0);
  }

  async function tickMarks() {
    var list = load();
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.mint) continue;
      try {
        var px = await priceOf(p.mint);
        if (px) { p.mark = px; if (!p.entry) p.entry = px; changed = true; }
        if (String(p.mint).indexOf("0x") === 0) {
          try {
            var tokens = await tokenBal(p.mint);
            if (tokens) {
              p.tokens = tokens;
              if (p.usdIn) p.entry = p.usdIn / tokens;
              p.valueUsd = tokens * (px || p.mark || 0);
              changed = true;
            }
          } catch (e) {}
        }
        if (!p.valueUsd && px && p.entry) {
          p.valueUsd = Number(p.usdIn || 0) * (px / p.entry);
          changed = true;
        } else if (!p.valueUsd && px && p.usdIn) {
          p.valueUsd = Number(p.usdIn);
          p.entry = px;
          changed = true;
        }
      } catch (e) {}
    }
    if (changed) save(list);
    draw();
  }

  window.sellPosition = async function (i) {
    var list = load();
    var p = list[i];
    if (!p) return false;
    try {
      if (typeof window.deskSell !== "function") throw new Error("sell route not loaded");
      await window.deskSell(p);
      list = load().filter(function (row) { return String(row.mint).toLowerCase() !== String(p.mint).toLowerCase(); });
      save(list);
      draw();
      return true;
    } catch (err) {
      log("close failed: " + (err.message || err));
      return false;
    }
  };

  document.addEventListener("click", function (ev) {
    var add = ev.target.closest("button[data-add]");
    var cancel = ev.target.closest("button[data-cancel]");
    var sell = ev.target.closest("button[data-sell]");
    if (!add && !cancel && !sell) return;
    ev.preventDefault();
    ev.stopPropagation();
    var list = load();
    if (add) {
      var p = list[Number(add.dataset.add)];
      if (p && typeof window.deskBuy === "function") window.deskBuy(p.mint, p.symbol, false, p.chain);
      return;
    }
    if (cancel || sell) {
      var idx = Number((cancel || sell).dataset.cancel || (cancel || sell).dataset.sell);
      window.sellPosition(idx);
    }
  }, true);

  draw();
  tickMarks();
  setInterval(tickMarks, 8000);
})();
