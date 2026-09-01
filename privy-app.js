import { createElement as h, useEffect, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { PrivyProvider, usePrivy, useWallets, useLoginWithEmail } from "https://esm.sh/@privy-io/react-auth@3.39.0?deps=react@18.3.1,react-dom@18.3.1";

const APP_ID = "cmtid3972041k0cl7b7xyt0xs";
const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const API = "https://api.fomoapi.io";
const RPCS = [
  localStorage.getItem("buon_rpc") || "",
  "https://api.mainnet-beta.solana.com",
  "https://solana.drpc.org"
].filter(Boolean);

function fieldStyle() {
  return { display: "block", width: "100%", margin: "8px 0 12px", padding: "10px", borderRadius: "10px", border: "1px solid rgba(203,208,235,.2)", background: "#0b0a14", color: "#eaedff" };
}

async function solRpc(method, params) {
  var last;
  for (var i = 0; i < RPCS.length; i++) {
    try {
      var res = await fetch(RPCS[i], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params })
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    } catch (e) { last = e; }
  }
  throw last || new Error("rpc blocked");
}

async function solUsdc(owner) {
  if (!window.solanaWeb3) return 0;
  var PK = window.solanaWeb3.PublicKey;
  var found = await PK.findProgramAddress([new PK(owner).toBuffer(), new PK(TOKEN).toBuffer(), new PK(USDC_SOL).toBuffer()], new PK(ASSOC));
  var acc = await solRpc("getAccountInfo", [found[0].toString(), { encoding: "jsonParsed" }]);
  var ta = acc && acc.value && acc.value.data && acc.value.data.parsed && acc.value.data.parsed.info && acc.value.data.parsed.info.tokenAmount;
  return Number((ta && ta.uiAmount) || 0);
}

function Desk() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const emailLogin = useLoginWithEmail();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [solLamports, setSolLamports] = useState(null);
  const [solUsdcAmt, setSolUsdcAmt] = useState(null);
  const [tape, setTape] = useState([]);

  const label = (user && user.email && user.email.address) || (user && user.google && user.google.email) || (user && user.twitter && user.twitter.username) || "signed in";
  const evm = (wallets || []).find(function (w) { return w.walletClientType === "privy"; }) || (wallets || [])[0];
  const linked = (user && user.linkedAccounts) || [];
  const sol = linked.find(function (a) {
    return a.type === "wallet" && String(a.chainType || a.chain || "").toLowerCase().indexOf("sol") >= 0;
  });
  const solAddr = (sol && (sol.address || sol.publicKey)) || "";
  const ethAddr = (evm && evm.address) || "";

  useEffect(function () {
    if (!solAddr) return;
    (async function () {
      try {
        var bal = await solRpc("getBalance", [solAddr]);
        setSolLamports(Number((bal && bal.value) || 0) / 1e9);
        setSolUsdcAmt(await solUsdc(solAddr));
      } catch (e) {
        setSolLamports(0);
        setSolUsdcAmt(0);
        setNote("Balance RPC blocked from this browser. Paste a Helius URL once if you have one.");
      }
    })();
  }, [solAddr]);

  useEffect(function () {
    fetch(API + "/v2/alerts?limit=20").then(function (r) { return r.json(); }).then(function (data) {
      setTape(data.alerts || []);
    }).catch(function () {});
  }, [authenticated]);

  async function send() {
    setBusy(true);
    try {
      await emailLogin.sendCode({ email: email.trim() });
      setSent(true);
      setNote("Code sent");
    } catch (e) { setNote(e.message || String(e)); }
    setBusy(false);
  }
  async function verify() {
    setBusy(true);
    try {
      await emailLogin.loginWithCode({ code: code.trim(), email: email.trim() });
    } catch (e) { setNote(e.message || String(e)); }
    setBusy(false);
  }
  function copy(v) {
    navigator.clipboard.writeText(v);
    setNote("Copied");
  }
  function saveRpc(v) {
    v = String(v || "").trim();
    if (/^[0-9a-f-]{8,}$/i.test(v)) v = "https://mainnet.helius-rpc.com/?api-key=" + v;
    if (v) localStorage.setItem("buon_rpc", v);
  }

  if (!ready) return h("p", { className: "muted" }, "Starting…");

  if (!authenticated) {
    return h("div", null,
      h("header", { className: "nav" }, h("div", { className: "brand" }, "buon ", h("span", { className: "badge" }, "desk"))),
      h("section", { className: "card" },
        h("p", { className: "kicker" }, "where the tape is ranked"),
        h("h1", null, "Sign in to open your cash account."),
        h("p", { className: "sub" }, "Google, Apple, X, or email. Wallets are created for you. Leader tape stays public."),
        h("div", { className: "acts" },
          h("button", { className: "primary", onClick: function () { login({ loginMethods: ["google", "email", "apple", "twitter"] }); } }, "Continue with Google / Apple / X"),
        ),
        h("p", { className: "fine", style: { marginTop: "18px" } }, "Or email code"),
        h("input", { value: email, onChange: function (e) { setEmail(e.target.value); }, placeholder: "email", type: "email", style: fieldStyle() }),
        h("button", { className: "ghost", disabled: busy || !email, onClick: send }, "Send code"),
        sent ? h("div", null,
          h("input", { value: code, onChange: function (e) { setCode(e.target.value); }, placeholder: "6-digit code", style: fieldStyle() }),
          h("button", { className: "primary", disabled: busy || !code, onClick: verify }, "Open desk")
        ) : null
      ),
      h("section", { className: "card" },
        h("div", { className: "kicker" }, "live tape"),
        tape.slice(0, 10).map(function (a, i) {
          return h("div", { className: "meta", key: i }, "@" + (a.trader || "?") + " " + (a.type || "") + " $" + (a.token || "?") + " · " + (a.chain || ""));
        })
      ),
      note ? h("div", { className: "toast" }, note) : null
    );
  }

  return h("div", null,
    h("header", { className: "nav" },
      h("div", { className: "brand" }, "buon ", h("span", { className: "badge" }, "desk")),
      h("div", { className: "nav-right" },
        h("span", { className: "pill" }, label),
        h("button", { className: "ghost", onClick: logout }, "Log out")
      )
    ),
    h("section", { className: "card" },
      h("p", { className: "kicker" }, "cash"),
      h("div", { className: "cash-amt" }, solUsdcAmt == null ? "— USDC" : solUsdcAmt.toFixed(2) + " USDC"),
      h("p", { className: "meta" }, "SOL gas " + (solLamports == null ? "—" : solLamports.toFixed(4))),
      h("label", { className: "fine" }, "Solana RPC (saved in this browser)",
        h("input", {
          defaultValue: localStorage.getItem("buon_rpc") || "",
          placeholder: "https://mainnet.helius-rpc.com/?api-key=…",
          style: fieldStyle(),
          onBlur: function (e) { saveRpc(e.target.value); }
        })
      )
    ),
    h("section", { className: "grid2" },
      h("article", { className: "card" },
        h("h2", null, "Solana"),
        h("p", { className: "copy" }, solAddr || "—"),
        solAddr ? h("button", { className: "ghost slim", onClick: function () { copy(solAddr); } }, "Copy") : null
      ),
      h("article", { className: "card" },
        h("h2", null, "EVM"),
        h("p", { className: "copy" }, ethAddr || "—"),
        ethAddr ? h("button", { className: "ghost slim", onClick: function () { copy(ethAddr); } }, "Copy") : null
      )
    ),
    h("section", { className: "card" },
      h("div", { className: "kicker" }, "live tape"),
      tape.slice(0, 16).map(function (a, i) {
        return h("div", { className: "meta", key: i }, "@" + (a.trader || "?") + " " + (a.type || "") + " $" + (a.token || "?") + " · " + (a.chain || "") + " · $" + Number(a.usdValue || 0).toFixed(0));
      })
    ),
    note ? h("div", { className: "toast" }, note) : null
  );
}

function Root() {
  return h(PrivyProvider, {
    appId: APP_ID,
    config: {
      loginMethods: ["google", "email", "apple", "twitter"],
      appearance: {
        theme: "dark",
        accentColor: "#6b63f6",
        landingHeader: "Open Buon",
        loginMessage: "Continue"
      },
      embeddedWallets: {
        ethereum: { createOnLogin: "all-users" },
        solana: { createOnLogin: "all-users" },
        createOnLogin: "all-users"
      }
    }
  }, h(Desk));
}

createRoot(document.getElementById("root")).render(h(Root));
