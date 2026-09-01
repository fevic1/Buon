(function () {
  var FIELDS = ["tkOrg", "tkPub", "tkPriv", "tkWallet"];
  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }
  function load() {
    FIELDS.forEach(function (id) {
      var el = document.getElementById(id);
      var v = localStorage.getItem("buon_" + id) || "";
      if (el) el.value = v;
    });
    window.BUON_KEYS = {
      org: localStorage.getItem("buon_tkOrg") || "",
      pub: localStorage.getItem("buon_tkPub") || "",
      priv: localStorage.getItem("buon_tkPriv") || "",
      wallet: localStorage.getItem("buon_tkWallet") || ""
    };
    var saved = !!(window.BUON_KEYS.org && window.BUON_KEYS.pub && window.BUON_KEYS.priv);
    var btn = document.getElementById("saveKeysBtn");
    if (btn) btn.hidden = saved;
  }
  function save() {
    FIELDS.forEach(function (id) {
      localStorage.setItem("buon_" + id, val(id));
    });
    window.BUON_KEYS = { org: val("tkOrg"), pub: val("tkPub"), priv: val("tkPriv"), wallet: val("tkWallet") };
    var btn = document.getElementById("saveKeysBtn");
    if (btn) btn.hidden = true;
    if (typeof log === "function") log("API keys saved on this browser");
  }
  window.saveApiKeys = save;
  load();
  var btn = document.getElementById("saveKeysBtn");
  if (btn) btn.onclick = function () { save(); };
  FIELDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", function () {
      var b = document.getElementById("saveKeysBtn");
      if (b) b.hidden = false;
    });
  });
})();
