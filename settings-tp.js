(function () {
  var pct = document.getElementById("tpPct");
  if (!pct || document.getElementById("tpUsd")) return;
  var lab = document.createElement("label");
  lab.appendChild(document.createTextNode("Take profit $"));
  var inp = document.createElement("input");
  inp.type = "number";
  inp.id = "tpUsd";
  inp.min = "10";
  inp.max = "500";
  inp.value = localStorage.getItem("buon_tp_usd") || "50";
  lab.appendChild(inp);
  pct.closest("label").insertAdjacentElement("afterend", lab);
  inp.onchange = function () { localStorage.setItem("buon_tp_usd", inp.value); };
})();
