(function () {
  function draw() {
    var list = document.getElementById("addrList");
    if (!list) return;
    if (!state.wallet && !state.evm) {
      list.innerHTML = "<div class=\"meta\">Sign in with Google, X, Apple, or email</div>";
      return;
    }
    var sol = state.wallet
      ? "<div class=\"addr-row\"><span class=\"meta\">SOL</span><code>" + state.wallet + "</code><button class=\"ghost\" data-copy=\"" + state.wallet + "\" type=\"button\">Copy</button></div>"
      : "";
    var evm = state.evm
      ? "<div class=\"addr-row\"><span class=\"meta\">EVM</span><code>" + state.evm + "</code><button class=\"ghost\" data-copy=\"" + state.evm + "\" type=\"button\">Copy</button></div>"
      : "";
    list.innerHTML = sol + evm;
    var btn = document.getElementById("connectBtn");
    if (btn) btn.textContent = state.email || "Account";
    var d = document.getElementById("disconnectBtn");
    if (d) d.hidden = false;
    var st = document.getElementById("walletStatus");
    if (st) st.textContent = "privy on";
    var wa = document.getElementById("walletAddr");
    if (wa) wa.textContent = state.wallet || state.evm || "";
  }
  window.drawPrivyAccount = function (info) {
    info = info || {};
    state.wallet = info.sol || "";
    state.evm = info.evm || "";
    state.email = info.email || "";
    state.kp = null;
    draw();
    log("Privy " + (state.email || state.wallet || state.evm));
    if (typeof refreshBalance === "function" && state.wallet) refreshBalance();
  };
  window.openCashAccount = function () {
    if (typeof window.buonLogin === "function") window.buonLogin();
    else log("Privy sign-in is loading");
  };
  window.ensureWallet = async function () {
    if (state.wallet || state.evm) return state.wallet || state.evm;
    throw new Error("Sign in first");
  };
  window.signAndSend = async function () {
    throw new Error("Solana buys sign with the Privy embedded wallet — not the old local key");
  };
  window.disconnectWallet = function () {
    if (typeof window.buonLogout === "function") window.buonLogout();
    state.wallet = null;
    state.evm = null;
    state.email = "";
    state.cashUsdc = 0;
    var btn = document.getElementById("connectBtn");
    if (btn) btn.textContent = "Sign in";
    var d = document.getElementById("disconnectBtn");
    if (d) d.hidden = true;
    draw();
    log("Signed out");
  };
  var c = document.getElementById("connectBtn");
  if (c) c.onclick = function () { openCashAccount(); };
  var d = document.getElementById("disconnectBtn");
  if (d) d.onclick = function () { disconnectWallet(); };
  draw();
})();
