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
  window.openDeposit = function () {
    if (typeof openSheet !== "function") return;
    openSheet(
      "<div class=\"sheet-h\"><div class=\"grow\"><div class=\"who\">Deposit</div><div class=\"meta\">One pool. Prefer Base USDC.</div></div><button class=\"ghost slim\" data-close type=\"button\">Close</button></div>" +
      "<p class=\"fine\">Test pool is the Turnkey Base wallet. Send USDC only. Do not send SOL or ETH as cash.</p>" +
      chainRows()
    );
  };
  window.openWithdraw = function () {
    if (typeof openSheet !== "function") return;
    openSheet(
      "<div class=\"sheet-h\"><div class=\"grow\"><div class=\"who\">Withdraw</div><div class=\"meta\">Out of the Base pool</div></div><button class=\"ghost slim\" data-close type=\"button\">Close</button></div>" +
      "<label>Destination<input id=\"wdDest\" placeholder=\"your address\" autocomplete=\"off\" /></label>" +
      "<label>Amount USDC<input id=\"wdAmt\" type=\"number\" min=\"1\" value=\"10\" /></label>" +
      "<button class=\"primary slim\" type=\"button\" id=\"wdGo\">Request withdraw</button>"
    );
    var go = document.getElementById("wdGo");
    if (go) go.onclick = function () { log("Withdraw from pool queued"); };
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
  var dep = document.getElementById("depositBtn");
  if (dep) dep.onclick = function () { openDeposit(); };
  var wd = document.getElementById("withdrawBtn");
  if (wd) wd.onclick = function () { openWithdraw(); };
  draw();
})();
