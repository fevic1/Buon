(function () {
  var toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.textContent = "Desk ready. Clicks show here.";
    document.body.appendChild(toast);
  }
  function flash(msg, kind) {
    toast.textContent = msg;
    toast.className = "toast show " + (kind || "");
    toast.hidden = false;
  }
  var prev = window.log;
  window.log = function (msg) {
    if (typeof prev === "function") prev(msg);
    else {
      var box = document.getElementById("log");
      if (box) {
        var line = document.createElement("div");
        line.textContent = new Date().toLocaleTimeString() + " \u00b7 " + msg;
        box.prepend(line);
      }
    }
    flash(String(msg), /fail|error|blocked|need /i.test(String(msg)) ? "bad" : "ok");
  };
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("button");
    if (!btn) return;
    btn.classList.add("busy");
    var old = btn.getAttribute("data-label") || btn.textContent;
    btn.setAttribute("data-label", old);
    if (!/working/i.test(btn.textContent)) btn.textContent = old + " \u2026";
    setTimeout(function () {
      btn.classList.remove("busy");
      if (btn.getAttribute("data-label")) btn.textContent = btn.getAttribute("data-label");
    }, 1600);
    flash("Clicked \u00b7 " + old, "ok");
  }, true);
  flash("Buttons are live. Click Send code.", "ok");
})();
