(function () {
  var STORE = "buon_history_v1";
  var LAST = "buon_pool_last";
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || "[]"); }
    catch (e) { return []; }
  }
  function save(list) { localStorage.setItem(STORE, JSON.stringify(list.slice(0, 80))); }
  function when(ts) {
    var d = new Date(ts);
    return d.toLocaleString();
  }
  function draw() {
    var box = document.getElementById("histList");
    if (!box) return;
    var list = load();
    if (!list.length) { box.innerHTML = "<div class=\"muted\">No cash events yet</div>"; return; }
    box.innerHTML = list.map(function (e) {
      return "<div class=\"mini\"><b>" + e.type + " · $" + Number(e.usd || 0).toFixed(2) + "</b><span class=\"meta\">" +
        (e.net || "base") + (e.dest ? " → " + e.dest.slice(0, 6) + "…" : "") + " · " + when(e.ts) + "</span></div>";
    }).join("");
  }
  window.recordHistory = function (e) {
    e = e || {};
    var list = load();
    list.unshift({
      type: e.type || "event",
      usd: Number(e.usd || 0),
      net: e.net || "base",
      dest: e.dest || "",
      note: e.note || "",
      ts: e.ts || Date.now()
    });
    save(list);
    draw();
  };
  window.notePoolBalance = function (usd) {
    usd = Number(usd || 0);
    var prevRaw = localStorage.getItem(LAST);
    var prev = prevRaw == null ? null : Number(prevRaw);
    localStorage.setItem(LAST, String(usd));
    if (prev == null) {
      if (usd > 0.009) recordHistory({ type: "deposit", usd: usd, net: "sol-usdc-hub", note: "pool first seen" });
      return;
    }
    var delta = Math.round((usd - prev) * 100) / 100;
    if (delta >= 0.01) recordHistory({ type: "deposit", usd: delta, net: "sol-usdc-hub" });
    if (delta <= -0.01) recordHistory({ type: "withdraw", usd: Math.abs(delta), net: "sol-usdc-hub" });
  };
  draw();
})();
