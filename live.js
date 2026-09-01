(function () {
  var fails = 0;
  function tick() {
    if (!window.state || !state.wallet || typeof refreshBalance !== "function") return;
    if (fails > 3) return;
    refreshBalance().then(function () { fails = 0; }).catch(function () { fails += 1; });
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { fails = 0; tick(); }
  });
  window.addEventListener("focus", function () { fails = 0; tick(); });
  setInterval(tick, 20000);
})();
