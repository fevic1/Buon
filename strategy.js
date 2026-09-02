(function () {
  window.passStrategy = function (mint, symbol, auto) {
    if (auto) {
      log("bot off — execution paused");
      return false;
    }
    return true;
  };
  var auto = document.getElementById("autoBuy");
  if (auto) auto.checked = false;
  var bot = document.getElementById("botStatus");
  if (bot) bot.textContent = "bot off";
})();
