(function () {
  var COOL = {};
  function num(id, fallback) {
    var el = document.getElementById(id);
    var n = Number(el && el.value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }
  function opens() {
    try {
      return JSON.parse(localStorage.getItem("buon_positions_v2") || "[]");
    } catch (e) { return []; }
  }
  window.passStrategy = function (mint, symbol, auto) {
    if (!auto) return true;
    var maxOpen = num("maxOpen", 2);
    var keep = num("keepUsd", 5);
    var size = num("sizeUsd", 10);
    var list = opens();
    if (list.length >= maxOpen) {
      log("strategy: max open " + maxOpen);
      return false;
    }
    var key = String(mint || symbol || "").toLowerCase();
    if (list.some(function (p) { return String(p.mint || "").toLowerCase() === key; })) {
      log("strategy: already in $" + symbol);
      return false;
    }
    if (COOL[key] && Date.now() - COOL[key] < 15 * 60 * 1000) {
      log("strategy: cooldown $" + symbol);
      return false;
    }
    var cash = Number(state.cashUsdc || 0);
    if (cash - size < keep) {
      log("strategy: keep $" + keep + " in pool");
      return false;
    }
    COOL[key] = Date.now();
    return true;
  };
  function wrap() {
    var inner = window.deskBuy;
    if (!inner || inner._strat) return;
    var boxed = async function (mint, symbol, auto, chain) {
      if (auto && !passStrategy(mint, symbol, true)) return;
      return inner(mint, symbol, auto, chain);
    };
    boxed._strat = true;
    window.deskBuy = window.proposeBuy = boxed;
  }
  wrap();
  setTimeout(wrap, 800);
  var auto = document.getElementById("autoBuy");
  if (auto && !localStorage.getItem("buon_strategy_v1")) {
    auto.checked = false;
    localStorage.setItem("buon_strategy_v1", "1");
    if (typeof saveDesk === "function") saveDesk();
    var bot = document.getElementById("botStatus");
    if (bot) bot.textContent = "bot idle";
    if (typeof log === "function") log("Auto off — only crowded overlap, max 2 opens");
  }
})();
