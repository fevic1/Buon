import { createElement as h, useEffect } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { PrivyProvider, usePrivy, useWallets } from "https://esm.sh/@privy-io/react-auth@3.39.0?deps=react@18.3.1,react-dom@18.3.1";

const APP_ID = "cmtid3972041k0cl7b7xyt0xs";

function pick(user, wallets) {
  var email = (user && user.email && user.email.address) || (user && user.google && user.google.email) || "";
  var evm = "";
  var sol = "";
  ((user && user.linkedAccounts) || []).forEach(function (a) {
    var t = String(a.chainType || a.chain || a.type || "").toLowerCase();
    var addr = a.address || a.publicKey || "";
    var embedded = String(a.walletClientType || a.connectorType || "").toLowerCase().indexOf("privy") >= 0 || a.type === "wallet";
    if (!addr) return;
    if (t.indexOf("sol") >= 0) sol = addr;
    if ((t.indexOf("eth") >= 0 || t.indexOf("evm") >= 0 || addr.indexOf("0x") === 0) && embedded) evm = evm || addr;
  });
  (wallets || []).forEach(function (w) {
    var addr = w.address || "";
    var embedded = String(w.walletClientType || "").toLowerCase() === "privy";
    if (embedded && addr.indexOf("0x") === 0) evm = evm || addr;
  });
  return { email: email, evm: evm, sol: sol };
}

function Gate() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  useEffect(function () {
    window.buonLogin = function () { login(); };
    window.buonLogout = function () { logout(); };
  }, [login, logout]);

  useEffect(function () {
    if (!ready || !authenticated) return;
    var info = pick(user, wallets);
    if (typeof window.drawPrivyAccount === "function") window.drawPrivyAccount(info);
  }, [ready, authenticated, user, wallets]);

  if (!ready) return null;
  if (authenticated) return null;

  return h("div", { className: "shade", style: { justifyContent: "center", alignItems: "center" } },
    h("div", { className: "card", style: { width: "min(420px, 92vw)", margin: 0 } },
      h("p", { className: "kicker" }, "cash account"),
      h("h2", null, "Sign in"),
      h("p", { className: "fine" }, "Google, X, Apple, or email."),
      h("button", { className: "primary slim", onClick: function () { login(); } }, "Continue with Google / X / email")
    )
  );
}

function Root() {
  return h(PrivyProvider, {
    appId: APP_ID,
    config: {
      loginMethods: ["google", "twitter", "apple", "email"],
      appearance: { theme: "dark", accentColor: "#6b63f6" },
      embeddedWallets: {
        ethereum: { createOnLogin: "users-without-wallets" },
        solana: { createOnLogin: "users-without-wallets" },
        createOnLogin: "users-without-wallets"
      }
    }
  }, h(Gate));
}

var mount = document.getElementById("auth-root");
if (mount) createRoot(mount).render(h(Root));
