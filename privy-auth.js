import { createElement as h, useEffect } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { PrivyProvider, usePrivy, useWallets } from "https://esm.sh/@privy-io/react-auth@3.39.0?deps=react@18.3.1,react-dom@18.3.1";

const APP_ID = "cmtid3972041k0cl7b7xyt0xs";

function pick(user, wallets) {
  var email = (user && user.email && user.email.address) || (user && user.google && user.google.email) || "";
  var evm = "";
  var sol = "";
  (wallets || []).forEach(function (w) {
    var addr = w.address || "";
    if (addr.indexOf("0x") === 0) evm = addr;
  });
  ((user && user.linkedAccounts) || []).forEach(function (a) {
    var t = String(a.chainType || a.chain || "").toLowerCase();
    var addr = a.address || a.publicKey || "";
    if (t.indexOf("sol") >= 0) sol = addr;
    if (t.indexOf("eth") >= 0 || t.indexOf("evm") >= 0) evm = evm || addr;
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
      h("p", { className: "fine" }, "Google, X, Apple, or email. Wallets are created by Privy. The tape stays on this desk."),
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
        ethereum: { createOnLogin: "all-users" },
        solana: { createOnLogin: "all-users" },
        createOnLogin: "all-users"
      }
    }
  }, h(Gate));
}

var mount = document.getElementById("auth-root");
if (mount) createRoot(mount).render(h(Root));
