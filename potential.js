(function () {
  function chip(action) {
    var a = String(action || "").toUpperCase();
    if (a === "POTENTIAL") return "<span class=\"tag POTENTIAL\">early</span>";
    if (a === "CROWDED_BID") return "<span class=\"tag CROWDED_BID\">crowd</span>";
    if (a === "DISTRIBUTION") return "<span class=\"tag DISTRIBUTION\">distrib</span>";
    if (a === "WATCH") return "<span class=\"tag WATCH\">watch</span>";
    return "";
  }
  function dress(box) {
    if (!box) return;
    [].forEach.call(box.querySelectorAll(".mini"), function (el) {
      var meta = el.querySelector(".meta");
      if (!meta) return;
      var raw = (meta.getAttribute("data-raw") || meta.textContent || "").replace(/HOLD FOR PROFIT\s*·\s*/gi, "");
      meta.setAttribute("data-raw", raw);
      var parts = raw.split("·").map(function (s) { return s.trim(); }).filter(Boolean);
      var action = parts[0] || "";
      var rest = parts.slice(1).join(" · ");
      meta.innerHTML = chip(action) + (rest ? "<span class=\"rail-n\">" + rest + "</span>" : "");
    });
  }
  function tick() {
    dress(document.getElementById("potentialList"));
    dress(document.getElementById("crowdedList"));
    dress(document.getElementById("gradList"));
  }
  setTimeout(tick, 400);
  setInterval(tick, 2000);
})();
