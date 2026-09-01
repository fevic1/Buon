import { createElement as h, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, usePrivy, useWallets, useCreateWallet } from "@privy-io/react-auth";

const APP_ID = "cmtid3972041k0cl7b7xyt0xs";

function Desk() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const createWallet = useCreateWallet();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const email = user && user.email && user.email.address;
  const evm = (wallets || []).find(function (w) { return w.walletClientType === "privy"; }) || (wallets || [])[0];
  const linked = (user && user.linkedAccounts) || [];
  const sol = linked.find(function (a) { return a.type === "wallet" && (a.chainType === "solana" || a.chain === "solana"); });
  const solAddr = (sol && (sol.address || sol.publicKey)) || "";
  const ethAddr = (evm && evm.address) || "";

  async function makeWallets() {
    setBusy(true);
    setNote("Asking Privy to create embedded wallets");
    try {
      if (createWallet && createWallet.createWallet) {
        await createWallet.createWallet({ createAdditional: false });
      }
      if (createWallet && createWallet.createSolanaWallet) {
        await createWallet.createSolanaWallet();
      }
      setNote("Privy wallet request sent. If an address is still blank, create wallets is off in the dashboard.");
    } catch (e) {
      setNote(e.message || String(e));
    }
    setBusy(false);
  }

  function copy(v) {
    if (!v) return;
    navigator.clipboard.writeText(v);
    setNote("Copied " + v);
  }

  if (!ready) return h("p", { className: "muted" }, "Loading Privy SDK…");

  return h("div", null,
    h("header", { className: "nav" },
      h("div", { className: "brand" }, "buon ", h("span", { className: "badge" }, "privy")),
      h("div", { className: "nav-right" },
        authenticated
          ? h("span", null,
              h("span", { className: "pill" }, email || "signed in"),
              " ",
              h("button", { className: "ghost", onClick: logout }, "Log out")
            )
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
              h("p", { className: "fine" }, "This is the Privy Solana embedded wallet. Fund it with Solana USDC + SOL.")
            ),
            h("article", { className: "card" },
              h("h2", null, "Ethereum / EVM"),
              h("p", { className: "copy" }, ethAddr || "not created yet"),
              ethAddr ? h("button", { className: "ghost slim", onClick: function () { copy(ethAddr); } }, "Copy ETH") : null,
              h("p", { className: "fine" }, "Privy EVM embedded wallet. Same address on Ethereum, Base, and other EVM chains. Each chain needs its own USDC and gas.")
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
