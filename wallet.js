(function () {
  var POOL_EVM = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
  var POOL_SOL = "8ZGuiQZzb6BMDeWjzPzowr6B839ftaJS15ihoscfqEk4";
  window.BUON_POOL = { evm: POOL_EVM, sol: POOL_SOL };
  var CHAINS = [
    { id: "base", name: "Base", kind: "evm", send: "Mother pool — send Base USDC here" },
    { id: "ethereum", name: "Ethereum", kind: "evm", send: "Sweeps to Base pool" },
    { id: "bsc", name: "BNB Chain", kind: "evm", send: "Sweeps to Base pool" },
    { id: "monad", name: "Monad", kind: "evm", send: "Sweeps to Base pool" },
    { id: "robinhood", name: "Robinhood Chain", kind: "evm", send: "Sweeps to Base pool" },
    { id: "solana", name: "Solana", kind: "sol", send: "Sweeps to Base pool" }
  ];
  function addrFor(kind) {
    return kind === "sol" ? POOL_SOL : POOL_EVM;
  }
  function draw() {
    var btn = document.getElementById("connectBtn");
    if (btn) btn.textContent = state.email || (state.wallet || state.evm ? "Account" : "Sign in");
    var d = document.getElementById("disconnectBtn");
    if (d) d.hidden = !(state.wallet || state.evm);
    var st = document.getElementById("walletStatus");
    if (st) st.textContent = (state.wallet || state.evm) ? "privy on" : "wallet off";
    var wa = document.getElementById("walletAddr");
    if (wa) wa.textContent = (state.wallet || state.evm) ? "signed in" : "not signed in";
  }
  function chainRows() {
    return CHAINS.map(function (c) {
      var a = addrFor(c.kind);
      var short = a.slice(0, 6) + "…" + a.slice(-4);
      return "<div class=\"hold\">" +
        "<div><b>" + c.name + "</b><div class=\"meta\">" + c.send + "</div><div class=\"copy\">" + short + "</div></div>" +
        "<button class=\"ghost\" data-copy=\"" + a + "\" type=\"button\">Copy</button>" +
        "</div>";
    }).join("");
  }
  function netSelect(id) {
    return "<label>Network<select id=\"" + id + "\">" +
      CHAINS.map(function (c) {
        var sel = c.id === "base" ? " selected" : "";
        return "<option value=\"" + c.id + "\"" + sel + ">" + c.name + " USDC</option>";
      }).join("") +
      "</select></label>";
  }
  window.openCashMenu = function () {
    if (typeof openSheet !== "function") return;
    openSheet(
      "<div class=\"sheet-h\"><div class=\"grow\"><div class=\"who\">Cash</div><div class=\"meta\">Pool actions</div></div><button class=\"ghost slim\" data-close type=\"button\">Close</button></div>" +
      "<button class=\"ghost cash-action\" type=\"button\" id=\"menuDeposit\">Deposit</button>" +
      "<button class=\"ghost cash-action\" type=\"button\" id=\"menuWithdraw\">Withdraw</button>" +
      "<button class=\"ghost cash-action\" type=\"button\" id=\"menuRefresh\">Refresh</button>"
    );
    var d = document.getElementById("menuDeposit");
    var w = document.getElementById("menuWithdraw");
    var r = document.getElementById("menuRefresh");
    if (d) d.onclick = function () { openDeposit(); };
    if (w) w.onclick = function () { openWithdraw(); };
    if (r) r.onclick = function () { if (typeof refreshBalance === "function") refreshBalance(); };
  };
  window.openDeposit = function () {
    if (typeof openSheet !== "function") return;
    openSheet(
      "<div class=\"sheet-h\"><div class=\"grow\"><div class=\"who\">Deposit</div><div class=\"meta\">Pick the network you send from</div></div><button class=\"ghost slim\" data-close type=\"button\">Close</button></div>" +
      "<p class=\"fine\">USDC only. Base lands in the pool immediately. Other networks wait on a sweep.</p>" +
      chainRows()
    );
  };
  window.openWithdraw = function () {
    if (typeof openSheet !== "function") return;
    openSheet(
      "<div class=\"sheet-h\"><div class=\"grow\"><div class=\"who\">Withdraw</div><div class=\"meta\">From the Base pool to the network you pick</div></div><button class=\"ghost slim\" data-close type=\"button\">Close</button></div>" +
      netSelect("wdNet") +
      "<label>Destination<input id=\"wdDest\" placeholder=\"address on that network\" autocomplete=\"off\" /></label>" +
      "<label>Amount USDC<input id=\"wdAmt\" type=\"number\" min=\"1\" step=\"0.01\" value=\"10\" /></label>" +
      "<p class=\"fine\">Base is a USDC transfer. Any other network is a hop out of the pool.</p>" +
      "<button class=\"primary slim\" type=\"button\" id=\"wdGo\">Request withdraw</button>"
    );
    var go = document.getElementById("wdGo");
    if (go) go.onclick = function () {
      var net = ((document.getElementById("wdNet") || {}).value || "base");
      var dest = ((document.getElementById("wdDest") || {}).value || "").trim();
      var amt = ((document.getElementById("wdAmt") || {}).value || "");
      if (!dest) { log("Withdraw needs a destination"); return; }
      log("Withdraw " + amt + " USDC to " + net + " → " + dest);
    };
  };
  window.drawPrivyAccount = function (info) {
    info = info || {};
    state.wallet = info.sol || "";
    state.evm = info.evm || "";
    state.email = info.email || "";
    draw();
    if (typeof refreshBalance === "function") refreshBalance();
  };
  window.openCashAccount = function () {
    if (typeof window.buonLogin === "function") window.buonLogin();
  };
  window.ensureWallet = async function () {
    if (state.wallet || state.evm) return state.wallet || state.evm;
    throw new Error("Sign in first");
  };
  window.disconnectWallet = function () {
    if (typeof window.buonLogout === "function") window.buonLogout();
    state.wallet = null;
    state.evm = null;
    state.email = "";
    var btn = document.getElementById("connectBtn");
    if (btn) btn.textContent = "Sign in";
    var d = document.getElementById("disconnectBtn");
    if (d) d.hidden = true;
    draw();
  };
  var c = document.getElementById("connectBtn");
  if (c) c.onclick = function () { openCashAccount(); };
  var out = document.getElementById("disconnectBtn");
  if (out) out.onclick = function () { disconnectWallet(); };
  var plus = document.getElementById("plusBtn");
  if (plus) plus.onclick = function () { openCashMenu(); };
  draw();
})();
