import { createElement as h, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { PrivyProvider, usePrivy, useWallets, useCreateWallet } from "https://esm.sh/@privy-io/react-auth@3.39.0?deps=react@18.3.1,react-dom@18.3.1";

const APP_ID = "cmtid3972041k0cl7b7xyt0xs";

function Desk() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const walletState = useWallets();
  const wallets = walletState.wallets || [];
  const creator = useCreateWallet();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const email = user && user.email && user.email.address;
  const evm = wallets.find(function (w) { return w.walletClientType === "privy"; }) || wallets[0];
  const linked = (user && user.linkedAccounts) || [];
  const sol = linked.find(function (a) {
    return a.type === "wallet" && String(a.chainType || a.chain || "").toLowerCase().indexOf("sol") >= 0;
  });
  const solAddr = (sol && (sol.address || sol.publicKey)) || "";
  const ethAddr = (evm && evm.address) || "";

  async function makeWallets() {
    setBusy(true);
    setNote("Asking Privy to create embedded wallets");
    try {
      if (creator && creator.createWallet) await creator.createWallet();
      setNote("Privy wallet request sent.");
    } catch (e) {
      setNote(e.message || String(e));
    }
    setBusy(false);
  }

  function copy(v) {
    navigator.clipboard.writeText(v);
    setNote("Copied");
  }

  if (!ready) return h("p", { className: "muted" }, "Privy session starting…");

  return h("div", null,
    h("header", { className: "nav" },
      h("div", { className: "brand" }, "buon ", h("span", { className: "badge" }, "privy")),
      h("div", { className: "nav-right" },
        authenticated
          ? h("span", null,
              h("span", { className: "pill" }, email || "signed in"),
              " ",
              h("button", { className: "ghost", onClick: logout }, "Log out"))
          : h("button", { className: "primary", onClick: login }, "Sign in with Privy")
      )
    ),
    authenticated
      ? h("div", null,
          h("section", { className: "card" },
            h("p", { className: "kicker" }, "Privy user"),
            h("div", { className: "cash-amt" }, email || user.id),
            h("p", { className: "meta" }, user.id),
            h("button", { className: "ghost slim", disabled: busy, onClick: makeWallets }, busy ? "Working…" : "Create missing wallets")
          ),
          h("section", { className: "grid2" },
            h("article", { className: "card" },
              h("h2", null, "Solana"),
              h("p", { className: "copy" }, solAddr || "not created yet"),
              solAddr ? h("button", { className: "ghost slim", onClick: function () { copy(solAddr); } }, "Copy SOL") : null,
              h("p", { className: "fine" }, "Privy Solana embedded wallet.")
            ),
            h("article", { className: "card" },
              h("h2", null, "Ethereum / EVM"),
              h("p", { className: "copy" }, ethAddr || "not created yet"),
              ethAddr ? h("button", { className: "ghost slim", onClick: function () { copy(ethAddr); } }, "Copy ETH") : null,
              h("p", { className: "fine" }, "Privy EVM embedded wallet. Same address on Ethereum and L2s.")
            )
          )
        )
      : h("section", { className: "card" },
          h("p", { className: "kicker" }, "Privy embedded wallets"),
          h("h1", null, "Sign in. Privy creates ETH + Solana wallets."),
          h("p", { className: "sub" }, "App ID from your dashboard. No local keypair.")
        ),
    note ? h("div", { className: "toast" }, note) : null
  );
}

function Root() {
  return h(PrivyProvider, {
    appId: APP_ID,
    config: {
      loginMethods: ["email"],
      appearance: { theme: "dark", accentColor: "#6b63f6" },
      embeddedWallets: {
        ethereum: { createOnLogin: "all-users" },
        solana: { createOnLogin: "all-users" },
        createOnLogin: "all-users"
      }
    }
  }, h(Desk));
}

createRoot(document.getElementById("root")).render(h(Root));
