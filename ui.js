(function () {
  var toast = document.getElementById("toast");
  if (!toast) return;
  window.flash = function (msg) {
    toast.textContent = msg;
    toast.className = "toast show";
    toast.hidden = false;
    setTimeout(function () { toast.className = "toast"; }, 2600);
  };
})();
