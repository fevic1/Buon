(function () {
  function paint() {
    var box = document.getElementById("potentialList");
    if (!box) return;
    [].forEach.call(box.querySelectorAll(".mini .meta"), function (meta) {
      var t = meta.textContent || "";
      if (/HOLD FOR PROFIT/i.test(t)) return;
      meta.textContent = "HOLD FOR PROFIT · " + t;
    });
  }
  setInterval(paint, 2500);
  setTimeout(paint, 800);
})();
