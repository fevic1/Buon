(function () {
  function rebuild() {
    var feed = document.getElementById("feed");
    var ticker = document.getElementById("ticker");
    if (!feed || !ticker) return;
    var rows = [].slice.call(feed.querySelectorAll("article.row")).slice(0, 16);
    if (!rows.length) return;
    var html = rows.map(function (r) {
      var trader = r.dataset.trader || "";
      var tokenBtn = r.querySelector("[data-mint], [data-token]");
      var token = (tokenBtn && (tokenBtn.dataset.symbol || tokenBtn.dataset.token)) || "";
      var addr = (tokenBtn && tokenBtn.dataset.mint) || "";
      var chain = (tokenBtn && tokenBtn.dataset.chain) || "";
      var who = (r.querySelector(".who") || {}).textContent || ("@" + trader);
      var meta = (r.querySelector(".meta") || {}).textContent || "";
      return '<button type="button" class="tick" data-trader="' + trader + '" data-token="' + token + '" data-address="' + addr + '" data-chain="' + chain + '">' +
        '<span class="tick-who">' + who.replace(/</g, "") + '</span> ' + meta.replace(/</g, "") + '</button>';
    }).join("");
    ticker.innerHTML = html + html;
  }
  setInterval(rebuild, 5000);
  setTimeout(rebuild, 1200);
})();
