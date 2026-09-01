import { createElement as h, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { PrivyProvider, usePrivy, useWallets, useCreateWallet, useLoginWithEmail } from "https://esm.sh/@privy-io/react-auth@3.39.0?deps=react@18.3.1,react-dom@18.3.1";

const APP_ID = "cmtid3972041k0cl7b7xyt0xs";

function Desk() {
  const { ready, authenticated, user, logout } = usePrivy();
  const walletState = useWallets();
  const wallets = walletState.wallets || [];
  const creator = useCreateWallet();
  const emailLogin = useLoginWithEmail();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const userEmail = user && user.email && user.email.address;
  const evm = wallets.find(function (w) { return w.walletClientType === "privy"; }) || wallets[0];
  const linked = (user && user.linkedAccounts) || [];
  const sol = linked.find(function (a) {
    return a.type === "wallet" && String(a.chainType || a.chain || "").toLowerCase().indexOf("sol") >= 0;
  });
  const solAddr = (sol && (sol.address || sol.publicKey)) || "";
  const ethAddr = (evm && evm.address) || "";

  async function send() {
    setBusy(true);
    setNote("Sending code");
    try {
      if (!emailLogin || !emailLogin.sendCode) throw new Error("Email login hook missing");
      await emailLogin.sendCode({ email: email.trim() });
      setSent(true);
      setNote("Code sent to " + email.trim());
    } catch (e) {
      setNote(e.message || String(e));
    }
    setBusy(false);
  }

  async function verify() {
    setBusy(true);
    setNote("Checking code");
    try {
      if (!emailLogin || !emailLogin.loginWithCode) throw new Error("loginWithCode missing");
      await emailLogin.loginWithCode({ code: code.trim(), email: email.trim() });
      setNote("Signed in");
    } catch (e) {
      setNote(e.message || String(e));
    }
    setBusy(false);
  }

  async function makeWallets() {
    setBusy(true);
    setNote("Creating embedded wallets");
    try {
      if (creator && creator.createWallet) await creator.createWallet();
      setNote("Wallet request sent");
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

  if (!authenticated) {
    return h("div", null,
      h("header", { className: "nav" },
        h("div", { className: "brand" }, "buon ", h("span", { className: "badge" }, "privy"))
      ),
      h("section", { className: "card" },
        h("p", { className: "kicker" }, "Privy email login"),
        h("h1", null, "Enter email, then the code."),
        h("label", { className: "fine" }, "Email",
          h("input", {
            value: email,
            onChange: function (e) { setEmail(e.target.value); },
            placeholder: "you@email.com",
            type: "email",
            style: { display: "block", width: "100%", margin: "8px 0 12px", padding: "10px", borderRadius: "10px", border: "1px solid rgba(203,208,235,.2)", background: "#0b0a14", color: "#eaedff" }
          })
        ),
        h("button", { className: "primary", disabled: busy || !email, onClick: send }, busy && !sent ? "Sending…" : "Send code"),
        sent ? h("div", { style: { marginTop: "16px" } },
          h("label", { className: "fine" }, "Code from email",
            h("input", {
              value: code,
              onChange: function (e) { setCode(e.target.value); },
              placeholder: "6-digit code",
              inputMode: "numeric",
              style: { display: "block", width: "100%", margin: "8px 0 12px", padding: "10px", borderRadius: "10px", border: "1px solid rgba(203,208,235,.2)", background: "#0b0a14", color: "#eaedff" }
            })
          ),
          h("button", { className: "primary", disabled: busy || !code, onClick: verify }, busy ? "Checking…" : "Sign in")
        ) : null
      ),
      note ? h("div", { className: "toast" }, note) : null
    );
  }

  return h("div", null,
    h("header", { className: "nav" },
      h("div", { className: "brand" }, "buon ", h("span", { className: "badge" }, "privy")),
      h("div", { className: "nav-right" },
        h("span", { className: "pill" }, userEmail || "signed in"),
        h("button", { className: "ghost", onClick: logout }, "Log out")
      )
    ),
    h("section", { className: "card" },
      h("p", { className: "kicker" }, "Privy user"),
      h("div", { className: "cash-amt" }, userEmail || user.id),
      h("p", { className: "meta" }, user.id),
      h("button", { className: "ghost slim", disabled: busy, onClick: makeWallets }, busy ? "Working…" : "Create missing wallets")
    ),
    h("section", { className: "grid2" },
      h("article", { className: "card" },
        h("h2", null, "Solana"),
        h("p", { className: "copy" }, solAddr || "not created yet"),
        solAddr ? h("button", { className: "ghost slim", onClick: function () { copy(solAddr); } }, "Copy SOL") : null
      ),
      h("article", { className: "card" },
        h("h2", null, "Ethereum / EVM"),
        h("p", { className: "copy" }, ethAddr || "not created yet"),
        ethAddr ? h("button", { className: "ghost slim", onClick: function () { copy(ethAddr); } }, "Copy ETH") : null
      )
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
