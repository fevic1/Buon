(function () {
  var STORE = "buon_positions_v2";
  function empty() {
    var box = document.getElementById("posList");
    if (box) box.innerHTML = "<div class=\"pos-empty\"><div class=\"who\">Flat</div><div class=\"meta\">No open book · bot paused</div></div>";
  }
  window.clearPositions = function () {
    localStorage.removeItem(STORE);
    localStorage.removeItem("buon_holds_v1");
    empty();
  };
  window.recordPosition = function () {};
  window.sellPosition = async function () { empty(); return true; };
  clearPositions();
})();
