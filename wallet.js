(function () {
  var CHAINS = [
    { id: "solana", name: "Solana", kind: "sol", send: "Solana USDC", gas: "SOL" },
    { id: "base", name: "Base", kind: "evm", send: "Base USDC", gas: "ETH" },
    { id: "ethereum", name: "Ethereum", kind: "evm", send: "Ethereum USDC", gas: "ETH" },
    { id: "bsc", name: "BNB Chain", kind: "evm", send: "BSC USDC", gas: "BNB" },
    { id: "monad", name: "Monad", kind: "evm", send: "Monad USDC", gas: "MON" },
    { id: "robinhood", name: "Robinhood Chain", kind: "evm", send: "USDC or USDG", gas: "ETH" }
  ];

  function addrFor(kind) {
    return kind === "sol" ? (state.wallet || "") : (state.evm || "");
  }

  function draw() {
    var list = document.getElementById("addrList");
    if (list) {
      list.innerHTML = (state.wallet || state.evm)
        ? "<div class=\"meta\">Deposit on any of the six networks. Mother cash is Base USDC.</div>"
        : "<div class=\"meta\">Sign in to deposit</div>";
    }
    var btn = document.getElementById("connectBtn");
    if (btn) btn.textContent = state.email || (state.wallet || state.evm ? "Account" : "Sign in");
    var d = document.getElementById("disconnectBtn");
    if (d) d.hidden = !(state.wallet || state.evm);
    var st = document.getElementById("walletStatus");
    if (st) st.textContent = (state.wallet || state.evm) ? "privy on" : "wallet off";
    var wa = document.getElementById("walletAddr");
    if (wa) wa.textContent = (state.wallet || state.evm) ? "signed in" : "not signed in";
  }

  function chainRows(mode) {
    return CHAINS.map(function (c) {
      var a = addrFor(c.kind);
      var short = a ? a.slice(0, 6) + "…" + a.slice(-4) : "sign in first";
      return "<div class=\"hold\">" +
        "<div><b>" + c.name + "</b><div class=\"meta\">" + c.send + " · gas " + c.gas + "</div><div class=\"copy\">" + short + "</div></div>" +
        (a ? "<button class=\"ghost\" data-copy=\"" + a + "\" type=\"button\">Copy</button>" : "") +
        "</div>";
    }).join("");
  }

  window.openDeposit = function () {
    if (typeof openSheet !== "function") return;
    openSheet(
      "<div class=\"sheet-h\"><div class=\"grow\"><div class=\"who\">Deposit</div><div class=\"meta\">Same two keys. Six networks.</div></div><button class=\"ghost slim\" data-close type=\"button\">Close</button></div>" +
      "<p class=\"fine\">Solana uses the Solana key. Base, Ethereum, BNB, Monad, and Robinhood use the EVM key. Sweep lands as Base USDC.</p>" +
      chainRows("in")
    );
  };

  window.openWithdraw = function () {
    if (typeof openSheet !== "function") return;
    openSheet(
      "<div class=\"sheet-h\"><div class=\"grow\"><div class=\"who\">Withdraw</div><div class=\"meta\">Pick the network the destination uses</div></div><button class=\"ghost slim\" data-close type=\"button\">Close</button></div>" +
      "<p class=\"fine\">Withdraw sends from the same key that received on that chain. Paste a destination after the route is signed.</p>" +
      chainRows("out") +
      "<label>Destination<input id=\"wdDest\" placeholder=\"address on the chosen chain\" autocomplete=\"off\" /></label>" +
      "<label>Amount USDC<input id=\"wdAmt\" type=\"number\" min=\"1\" value=\"10\" /></label>" +
      "<button class=\"primary slim\" type=\"button\" id=\"wdGo\">Request withdraw</button>"
    );
    var go = document.getElementById("wdGo");
    if (go) go.onclick = function () {
      log("Withdraw queued for signing — destination " + ((document.getElementById("wdDest") || {}).value || ""));
    };
  };

  window.drawPrivyAccount = function (info) {
    info = info || {};
    state.wallet = info.sol || "";
    state.evm = info.evm || "";
    state.email = info.email || "";
    state.kp = null;
    draw();
    if (typeof refreshBalance === "function" && state.wallet) refreshBalance();
  };
  window.openCashAccount = function () {
    if (typeof window.buonLogin === "function") window.buonLogin();
  };
  window.ensureWallet = async function () {
    if (state.wallet || state.evm) return state.wallet || state.evm;
    throw new Error("Sign in first");
  };
  window.signAndSend = async function () {
    throw new Error("Signing uses the Privy embedded wallet");
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
