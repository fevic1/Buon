(function () {
  function usd(n) {
    n = Number(n || 0);
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(0);
  }
  function card(t) {
    var buy = typeof buyBtn === "function" ? buyBtn(t.mint, t.symbol, "solana") : "";
    return "<div class=\"mini clickable\" data-token=\"" + t.symbol + "\" data-address=\"" + t.mint + "\" data-chain=\"solana\">" +
      "<b>$" + t.symbol + "</b><span class=\"meta\">" + (t.name || "Pump") + " · " + usd(t.mc) + "</span>" + buy + "</div>";
  }
  function draw(list, note) {
    var box = document.getElementById("gradList");
    if (!box) return;
    if (!list.length) {
      box.innerHTML = "<div class=\"muted\">" + (note || "Waiting for Actions snapshot") + "</div>";
      return;
    }
    box.innerHTML = list.slice(0, 15).map(card).join("");
  }
  window.loadGraduated = async function () {
    var res = await fetch("./data/graduates.json?t=" + Date.now());
    if (!res.ok) throw new Error("snapshot " + res.status);
    var data = await res.json();
    var list = data.coins || [];
    var note = list.length ? "" : (data.error || "No graduates in snapshot yet");
    draw(list, note);
    if (typeof log === "function") log("Pump snapshot: " + list.length + " · " + (data.source || "?"));
    return list;
  };
  loadGraduated().catch(function (err) {
    draw([], err.message || String(err));
  });
  setInterval(function () { loadGraduated().catch(function () {}); }, 60000);
})();
