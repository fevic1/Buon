import { createElement as h, useEffect, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { PrivyProvider, usePrivy, useWallets, useLoginWithEmail } from "https://esm.sh/@privy-io/react-auth@3.39.0?deps=react@18.3.1,react-dom@18.3.1";

const APP_ID = "cmtid3972041k0cl7b7xyt0xs";
const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const API = "https://api.fomoapi.io";

function rpcUrl() {
  return localStorage.getItem("buon_rpc") || "";
}
async function solRpc(method, params) {
  var url = rpcUrl();
  if (!url) throw new Error("Add a Helius RPC in cash to read balances");
  var res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params })
  });
  var data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}
async function solUsdc(owner) {
  if (!window.solanaWeb3) return 0;
  var PK = window.solanaWeb3.PublicKey;
  var found = await PK.findProgramAddress([new PK(owner).toBuffer(), new PK(TOKEN).toBuffer(), new PK(USDC_SOL).toBuffer()], new PK(ASSOC));
  var acc = await solRpc("getAccountInfo", [found[0].toString(), { encoding: "jsonParsed" }]);
  var ta = acc && acc.value && acc.value.data && acc.value.data.parsed && acc.value.data.parsed.info && acc.value.data.parsed.info.tokenAmount;
  return Number((ta && ta.uiAmount) || 0);
}
function ago(ts) {
  if (!ts) return "";
  var ms = ts > 1e12 ? ts : ts * 1000;
  var s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  return Math.floor(s / 3600) + "h";
}
function usd(n) {
  n = Number(n || 0);
  if (!n) return "";
  if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
  return "$" + n.toFixed(0);
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
  const [rpcDraft, setRpcDraft] = useState(rpcUrl());

  const label = (user && user.email && user.email.address) || (user && user.google && user.google.email) || "account";
  const evm = (wallets || []).find(function (w) { return w.walletClientType === "privy"; }) || (wallets || [])[0];
  const linked = (user && user.linkedAccounts) || [];
  const sol = linked.find(function (a) {
    return a.type === "wallet" && String(a.chainType || a.chain || "").toLowerCase().indexOf("sol") >= 0;
  });
  const solAddr = (sol && (sol.address || sol.publicKey)) || "";
  const ethAddr = (evm && evm.address) || "";

  useEffect(function () {
    fetch(API + "/v2/alerts?limit=40").then(function (r) { return r.json(); }).then(function (data) {
      setTape(data.alerts || []);
    }).catch(function () {});
  }, []);

  useEffect(function () {
    if (!authenticated || !solAddr || !rpcUrl()) return;
    (async function () {
      try {
        var bal = await solRpc("getBalance", [solAddr]);
        setSolLamports(Number((bal && bal.value) || 0) / 1e9);
        setSolUsdcAmt(await solUsdc(solAddr));
      } catch (e) {
        setNote(e.message || String(e));
      }
    })();
  }, [authenticated, solAddr, rpcDraft]);

  function saveRpc() {
    var v = rpcDraft.trim();
    if (/^[0-9a-f-]{8,}$/i.test(v)) v = "https://mainnet.helius-rpc.com/?api-key=" + v;
    if (v) {
      localStorage.setItem("buon_rpc", v);
      setRpcDraft(v);
    }
  }

  async function send() {
    setBusy(true);
    try { await emailLogin.sendCode({ email: email.trim() }); setSent(true); setNote("Code sent"); }
    catch (e) { setNote(e.message || String(e)); }
    setBusy(false);
  }
  async function verify() {
    setBusy(true);
    try { await emailLogin.loginWithCode({ code: code.trim(), email: email.trim() }); }
    catch (e) { setNote(e.message || String(e)); }
    setBusy(false);
  }

  function header(right) {
    return h("header", { className: "nav" },
      h("div", { className: "brand" }, h("span", { className: "word" }, "buon"), h("span", { className: "badge" }, "desk")),
      h("nav", { className: "tabs" },
        h("button", { className: "tab on" }, "feed"),
        h("button", { className: "tab" }, "leaderboard"),
        h("button", { className: "tab" }, "overlap")
      ),
      h("div", { className: "nav-right" }, right)
    );
  }

  function ticker() {
    var bits = tape.slice(0, 14).map(function (a) {
      return "@" + (a.trader || "?") + " " + String(a.type || "tape").toUpperCase() + " $" + (a.token || "?") + " " + usd(a.usdValue);
    }).join("   ·   ");
    return h("div", { className: "ticker-wrap" }, h("div", { className: "ticker" }, bits || "waiting on live tape…"));
  }

  function feed() {
    return h("section", { className: "stage" },
      h("div", { className: "card-h tight" }, h("h2", null, "live feed"), h("span", { className: "quiet" }, tape.length + " on tape")),
      h("div", { className: "feed" },
        tape.slice(0, 24).map(function (a, i) {
          return h("article", { className: "row", key: i },
            h("div", { className: "avatar" }, String(a.trader || "?").slice(0, 2).toUpperCase()),
            h("div", null,
              h("div", { className: "who" }, "@" + (a.trader || "unknown"), " ", h("span", { className: "tag " + (a.type || "") }, a.type || "tape")),
              h("div", { className: "meta" }, "$" + (a.token || "?") + " · " + (a.chain || "") + " · " + usd(a.usdValue) + " · " + ago(a.ts))
            )
          );
        })
      )
    );
  }

  if (!ready) return h("main", { className: "shell" }, h("p", { className: "muted" }, "Starting…"));

  if (!authenticated) {
    return h("div", null,
      header(h("button", { className: "primary", onClick: function () { login(); } }, "Sign in")),
      ticker(),
      h("main", { className: "shell" },
        h("section", { className: "hero-strip" },
          h("div", null,
            h("p", { className: "kicker" }, "cash account"),
            h("h1", null, "where the tape is ranked, not guessed."),
            h("p", { className: "sub" }, "Sign in with email, Google, Apple, or X. Your wallets are created on login.")
          )
        ),
        h("section", { className: "grid" },
          h("aside", { className: "rail" },
            h("div", { className: "card" },
              h("h2", null, "open account"),
              h("p", { className: "fine" }, "Google / Apple / X use the Sign in button. Those providers must be enabled in the project auth settings or they return Not allowed."),
              h("label", null, "Email", h("input", { value: email, onChange: function (e) { setEmail(e.target.value); }, placeholder: "you@email.com" })),
              h("button", { className: "ghost slim", disabled: busy || !email, onClick: send }, "Send code"),
              sent ? h("div", null,
                h("label", null, "Code", h("input", { value: code, onChange: function (e) { setCode(e.target.value); } })),
                h("button", { className: "primary", disabled: busy || !code, onClick: verify }, "Open desk")
              ) : null
            )
          ),
          feed()
        )
      ),
      note ? h("div", { className: "toast show", id: "toast" }, note) : null
    );
  }

  return h("div", null,
    header(h("span", null,
      h("span", { className: "pill" }, label),
      " ",
      h("button", { className: "ghost", onClick: logout }, "Log out")
    )),
    ticker(),
    h("main", { className: "shell" },
      h("section", { className: "cash-bar card" },
        h("div", null,
          h("p", { className: "kicker" }, "cash account"),
          h("div", { className: "cash-amt" }, solUsdcAmt == null ? "— USDC" : solUsdcAmt.toFixed(2) + " USDC"),
          h("div", { className: "meta" }, "SOL gas " + (solLamports == null ? "—" : solLamports.toFixed(4)))
        ),
        h("div", { className: "addr-list" },
          h("div", { className: "addr-row" }, h("span", { className: "meta" }, "SOL"), h("code", null, solAddr || "—"), solAddr ? h("button", { className: "ghost", onClick: function () { navigator.clipboard.writeText(solAddr); } }, "Copy") : null),
          h("div", { className: "addr-row" }, h("span", { className: "meta" }, "EVM"), h("code", null, ethAddr || "—"), ethAddr ? h("button", { className: "ghost", onClick: function () { navigator.clipboard.writeText(ethAddr); } }, "Copy") : null),
          h("label", null, "Solana RPC", h("input", { value: rpcDraft, onChange: function (e) { setRpcDraft(e.target.value); }, onBlur: saveRpc, placeholder: "Helius RPC URL" }))
        )
      ),
      h("section", { className: "grid" },
        h("aside", { className: "rail" },
          h("div", { className: "card" },
            h("h2", null, "desk"),
            h("p", { className: "fine" }, "This Solana wallet is empty until you send Solana USDC and a little SOL to the SOL line above.")
          )
        ),
        feed()
      )
    ),
    note ? h("div", { className: "toast show" }, note) : null
  );
}

function Root() {
  return h(PrivyProvider, {
    appId: APP_ID,
    config: {
      loginMethods: ["email", "google", "apple", "twitter"],
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
