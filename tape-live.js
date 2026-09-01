(function () {
  var WS = atob("d3NzOi8vYXBpLmZvbW9hcGkuaW8vd3MvYWxlcnRz");
  var API = atob("aHR0cHM6Ly9hcGkuZm9tb2FwaS5pbw==");

  function normalize(raw) {
    var a = raw && raw.alert ? raw.alert : raw;
    if (!a || typeof a !== "object") return null;
    if (raw && raw.type === "welcome") return null;
    var t = String(a.type || a.notificationType || "").toLowerCase();
    var text = String((a.text || (a.raw && a.raw.text) || "")).toLowerCase();
    if (!t || t === "alert" || t === "notification" || t === "trade") {
      if (/\bbuy\b/.test(text)) t = "buy";
      else if (/\bsell\b/.test(text)) t = "sell";
      else if (/thesis/.test(text)) t = "thesis";
    }
    a.type = t || "tape";
    return a.trader ? a : null;
  }

  function newestAge(alerts) {
    var ts = 0;
    (alerts || []).forEach(function (a) { if (a.ts && a.ts > ts) ts = a.ts; });
    if (!ts) return "no ts";
    var ms = ts > 1e12 ? ts : ts * 1000;
    var m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
    return m < 1 ? "live" : m + "m lag";
  }

  function ingestOne(a, trade) {
    var n = normalize(a);
    if (!n) return;
    if (typeof ingest === "function") ingest(n, trade);
    if (typeof renderFeed === "function") {
      var id = n.id || (n.ts + "-" + n.trader + "-" + n.token);
      if (state && state.seen && state.seen.has && !state._tapePaint) {
        /* feed already painted by ingest path in app */
      }
    }
  }

  async function pull() {
    try {
      var res = await fetch(API + "/v2/alerts?limit=50");
      var data = await res.json();
      var alerts = (data.alerts || []).map(normalize).filter(Boolean);
      var added = 0;
      alerts.slice().reverse().forEach(function (a) {
        if (!state || !state.seen) return;
        var id = a.id || (a.ts + "-" + a.trader + "-" + a.token);
        var had = state.seen.has(id);
        if (typeof ingest === "function") ingest(a, false);
        if (!had && typeof renderFeed === "function") {
          renderFeed(a, true);
          added += 1;
        }
      });
      var meta = document.getElementById("feedMeta");
      if (meta) meta.textContent = added + " new · " + alerts.length + " on tape · " + newestAge(alerts);
    } catch (e) {
      var meta = document.getElementById("feedMeta");
      if (meta) meta.textContent = "tape poll failed";
    }
  }

  function sock() {
    var ws;
    try { ws = new WebSocket(WS); }
    catch (e) { setTimeout(sock, 5000); return; }
    ws.onopen = function () {
      if (typeof log === "function") log("Live tape socket on");
      var st = document.getElementById("apiStatus");
      if (st) st.textContent = "tape socket on";
    };
    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        var a = normalize(msg);
        if (!a) return;
        var before = state.seen ? state.seen.size : 0;
        if (typeof ingest === "function") ingest(a, true);
        if (state.seen && state.seen.size > before && typeof renderFeed === "function") renderFeed(a, true);
      } catch (e) {}
    };
    ws.onclose = function () { setTimeout(sock, 4000); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  sock();
  pull();
  setInterval(pull, 8000);
})();
