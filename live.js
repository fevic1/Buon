(function () {
  var fails = 0;
  function tick() {
    if (!window.state || !state.wallet || typeof refreshBalance !== "function") return;
    if (fails > 3) return;
    refreshBalance().then(function () { fails = 0; }).catch(function () { fails += 1; });
  }
  function hookPhantom() {
    var p = window.solana;
    if (!p || p.__buonLive) return p;
    p.__buonLive = true;
    if (typeof p.on === "function") {
      p.on("accountChanged", function (pk) {
        if (!pk) {
          if (typeof disconnectWallet === "function") disconnectWallet();
          return;
        }
        state.wallet = pk.toString();
        document.getElementById("connectBtn").textContent = "Connected";
        fails = 0;
        tick();
      });
      p.on("disconnect", function () {
        if (typeof disconnectWallet === "function") disconnectWallet();
      });
    }
    return p;
  }
  function boot() {
    var p = hookPhantom();
    if (!p || !p.isPhantom) return;
    if (state.wallet) { tick(); return; }
    p.connect({ onlyIfTrusted: true }).then(function (res) {
      state.wallet = res.publicKey.toString();
      document.getElementById("connectBtn").textContent = "Connected";
      fails = 0;
      return refreshBalance();
    }).catch(function () {});
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { fails = 0; tick(); }
  });
  window.addEventListener("focus", function () { fails = 0; tick(); });
  setInterval(tick, 20000);
  window.addEventListener("load", boot);
  setTimeout(boot, 400);
  setTimeout(boot, 1600);
})();
