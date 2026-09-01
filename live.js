(function () {
  function tick() {
    if (window.state && state.wallet && typeof refreshBalance === "function") {
      refreshBalance().catch(function () {});
    }
  }
  function hookPhantom() {
    var p = window.solana;
    if (!p || p.__buonLive) return p;
    p.__buonLive = true;
    if (typeof p.on === "function") {
      p.on("accountChanged", function (pk) {
        if (!pk) {
          state.wallet = null;
          document.getElementById("connectBtn").textContent = "Connect wallet";
          document.getElementById("cashAmt").textContent = "— USDC";
          return;
        }
        state.wallet = pk.toString();
        document.getElementById("connectBtn").textContent = "Connected";
        tick();
      });
      p.on("connect", function () { tick(); });
      p.on("disconnect", function () {
        state.wallet = null;
        document.getElementById("connectBtn").textContent = "Connect wallet";
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
      return refreshBalance();
    }).catch(function () {});
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) tick();
  });
  window.addEventListener("focus", tick);
  setInterval(tick, 12000);
  window.addEventListener("load", boot);
  setTimeout(boot, 300);
  setTimeout(boot, 1200);
  setTimeout(boot, 3000);
})();
