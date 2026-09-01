const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUP_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";
const JUP_SWAP = "https://lite-api.jup.ag/swap/v1/swap";
const API = atob("aHR0cHM6Ly9hcGkuZm9tb2FwaS5pbw==");
const TAPE_WS = atob("d3NzOi8vYXBpLmZvbW9hcGkuaW8vd3MvYWxlcnRz");
const MARKET = atob("aHR0cHM6Ly9mb21vLmZhbWlseQ==");

const state = {
  leaders: new Map(),
  tokens: new Map(),
  wallet: null,
  busy: false,
  seen: new Set(),
};

const $ = (id) => document.getElementById(id);

function log(msg) {
  const el = $("log");
  const line = document.createElement("div");
  line.textContent = `${new Date().toLocaleTimeString()} · ${msg}`;
  el.prepend(line);
}

function tokenKey(symbol, address) {
  if (address) return address.startsWith("0x") ? address.toLowerCase() : address;
  return (symbol || "?").replace(/^\$/, "").toUpperCase();
}

function marketUrl(chain, address) {
  if (!address) return MARKET + "/";
  const map = { sol: "solana", eth: "ethereum", bnb: "bsc", binance: "bsc", rh: "robinhood" };
  const net = map[(chain || "solana").toLowerCase()] || (chain || "solana").toLowerCase();
  return `${MARKET}/tokens/${net}/${address}`;
}

function initials(handle) {
  return (handle || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
}

function usd(n) {
  const v = Number(n || 0);
  if (!v) return "";
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function bookOf(symbol, address, chain) {
  const key = tokenKey(symbol, address);
  if (!state.tokens.has(key)) {
    state.tokens.set(key, {
      key, symbol: (symbol || "?").replace(/^\$/, ""), address, chain,
      holders: new Set(), buyUsd: 0, sellUsd: 0, buys: 0, sells: 0, last: "",
    });
  }
  const book = state.tokens.get(key);
  if (address && !book.address) book.address = address;
  if (chain && !book.chain) book.chain = chain;
  if (symbol && book.symbol === "?") book.symbol = symbol.replace(/^\$/, "");
  return book;
}

function score(book) {
  let rankW = 0;
  for (const handle of book.holders) {
    const leader = state.leaders.get(handle);
    if (leader) rankW += (1 / leader.rank) * Math.log1p(1);
  }
  const flow = Math.log1p(book.buyUsd) - 0.7 * Math.log1p(book.sellUsd);
  return book.holders.size * 8 + rankW + flow;
}

function actionOf(book) {
  const min = Number($("minOverlap").value || 3);
  if (book.sells > book.buys && book.buyUsd < book.sellUsd) return "DISTRIBUTION";
  if (book.holders.size >= min && book.buyUsd >= book.sellUsd) return "CROWDED_BID";
  if (book.buys >= 2 && book.holders.size < min && book.buyUsd > book.sellUsd) return "POTENTIAL";
  if (book.buys) return "WATCH";
  return "HOLD";
}

function ranked(limit = 20) {
  return [...state.tokens.values()]
    .filter((b) => b.holders.size || b.buys)
    .map((b) => ({ ...b, action: actionOf(b), score: score(b), leaders: [...b.holders] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function renderFeed(alert, prepend = true) {
  const feed = $("feed");
  const row = document.createElement("article");
  row.className = "row";
  const type = (alert.type || "trade").toLowerCase();
  const canSwap = (alert.chain || "").toLowerCase() === "solana" && alert.tokenAddress && !alert.tokenAddress.startsWith("0x");
  row.innerHTML = `
    <div class="avatar">${initials(alert.trader)}</div>
    <div>
      <div class="who">@${alert.trader || "unknown"} <span class="tag ${type}">${type}</span></div>
      <div class="meta">${alert.text || `$${alert.token}`} · ${alert.chain || ""} · ${usd(alert.usdValue)}</div>
    </div>
    <div>
      ${canSwap ? `<button class="buy" data-mint="${alert.tokenAddress}" data-symbol="${alert.token || ""}">Buy</button>` : `<button class="ghost buy" data-open="${marketUrl(alert.chain, alert.tokenAddress)}">Open</button>`}
    </div>`;
  if (prepend) feed.prepend(row);
  else feed.append(row);
  while (feed.children.length > 80) feed.lastChild.remove();
}

function renderLeaders() {
  $("leaders").innerHTML = [...state.leaders.values()]
    .sort((a, b) => a.rank - b.rank)
    .map((l) => `
      <article class="row">
        <div class="avatar">${l.rank}</div>
        <div>
          <div class="who">@${l.handle}</div>
          <div class="meta">PnL ${usd(l.pnl)} · vol ${usd(l.volume)} · ${l.trades} trades</div>
        </div>
        <div class="meta">${(l.wallets.solana || "").slice(0, 4)}…</div>
      </article>`)
    .join("");
}

function renderBooks() {
  const rows = ranked(30);
  const min = Number($("minOverlap").value || 3);
  const crowded = rows.filter((r) => r.holders.size >= min);
  const potential = rows.filter((r) => r.action === "POTENTIAL");
  const list = (items, empty) => items.length
    ? items.slice(0, 8).map((r) => `<div class="mini"><b>$${r.symbol}</b><span class="meta">${r.action} · overlap ${r.holders.size} · net ${usd(r.buyUsd - r.sellUsd)}</span></div>`).join("")
    : `<div class="muted">${empty}</div>`;
  $("crowdedList").innerHTML = list(crowded, "No identical-coin cluster yet");
  $("potentialList").innerHTML = list(potential, "No early leader flow yet");
  $("book").innerHTML = rows.map((r) => `
    <article class="row">
      <div class="avatar">${r.holders.size}</div>
      <div>
        <div class="who">$${r.symbol} <span class="tag ${r.action}">${r.action}</span></div>
        <div class="meta">score ${r.score.toFixed(2)} · ${r.leaders.slice(0, 4).map((h) => "@" + h).join(" ")}</div>
      </div>
      <div>
        ${r.chain === "solana" && r.address
          ? `<button class="buy" data-mint="${r.address}" data-symbol="${r.symbol}">Buy</button>`
          : `<button class="ghost buy" data-open="${marketUrl(r.chain, r.address)}">Open</button>`}
      </div>
    </article>`).join("") || `<div class="muted">Waiting for overlapping flow…</div>`;
}

async function loadLeaders() {
  const res = await fetch(`${API}/v2/leaderboard/24h?limit=25`);
  const data = await res.json();
  state.leaders.clear();
  for (const row of data.traders || []) {
    state.leaders.set(row.handle, {
      handle: row.handle,
      rank: row.rank,
      pnl: row.pnlUsd,
      volume: row.volumeUsd,
      trades: row.trades,
      wallets: row.wallets || {},
    });
  }
  renderLeaders();
  $("apiStatus").textContent = `tape live · ${state.leaders.size} leaders`;
}

async function loadAlerts() {
  const res = await fetch(`${API}/v2/alerts?limit=50`);
  const data = await res.json();
  const alerts = data.alerts || [];
  alerts.reverse().forEach((a) => {
    ingest(a, false);
    renderFeed(a, false);
  });
  $("feedMeta").textContent = `${alerts.length} seeded`;
}

function ingest(alert, maybeTrade) {
  const id = alert.id || `${alert.ts}-${alert.trader}-${alert.token}`;
  if (state.seen.has(id)) return null;
  state.seen.add(id);
  const min = Number($("minAlert").value || 0);
  if (alert.usdValue && Number(alert.usdValue) < min && alert.type !== "thesis") return null;
  const book = bookOf(alert.token, alert.tokenAddress, alert.chain);
  const side = (alert.type || "").toLowerCase();
  const usdValue = Number(alert.usdValue || 0);
  const tracked = state.leaders.has(alert.trader);
  if (side === "buy") {
    book.buys += 1;
    book.buyUsd += usdValue;
    if (tracked) book.holders.add(alert.trader);
  } else if (side === "sell") {
    book.sells += 1;
    book.sellUsd += usdValue;
    if (tracked) book.holders.delete(alert.trader);
  }
  book.last = alert.text || "";
  renderBooks();
  if (maybeTrade && $("autoBuy").checked && (actionOf(book) === "CROWDED_BID" || actionOf(book) === "POTENTIAL")) {
    if ((book.chain || "").toLowerCase() === "solana" && book.address) {
      proposeBuy(book.address, book.symbol, true);
    }
  }
  return book;
}

function connectWs() {
  const ws = new WebSocket(TAPE_WS);
  ws.onopen = () => {
    $("liveDot").classList.add("on");
    $("feedMeta").textContent = "live · keyless delay ~60s";
    log("Live tape connected");
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "welcome") return;
      const alert = msg.alert || msg;
      if (!alert || !alert.trader) return;
      ingest(alert, true);
      renderFeed(alert, true);
    } catch (_) { /* ignore */ }
  };
  ws.onclose = () => {
    $("liveDot").classList.remove("on");
    setTimeout(connectWs, 4000);
  };
}

async function connectWallet() {
  const provider = window.solana;
  if (!provider?.isPhantom) {
    window.open("https://phantom.app/", "_blank");
    log("Phantom not found");
    return;
  }
  const res = await provider.connect();
  state.wallet = res.publicKey.toString();
  $("walletStatus").textContent = `wallet ${state.wallet.slice(0, 4)}…${state.wallet.slice(-4)}`;
  $("walletBox").textContent = state.wallet;
  $("connectBtn").textContent = "Connected";
  log("Phantom connected");
}

async function solLamportsForUsd(usdAmount) {
  const amount = 1_000_000_000;
  const url = `${JUP_QUOTE}?inputMint=${SOL}&outputMint=${USDC}&amount=${amount}&slippageBps=50`;
  const quote = await fetch(url).then((r) => r.json());
  const usdcOut = Number(quote.outAmount || 0) / 1e6;
  if (!usdcOut) throw new Error("No SOL price");
  return Math.max(1, Math.floor((usdAmount / usdcOut) * 1e9));
}

async function proposeBuy(mint, symbol, fromAuto) {
  if (state.busy) return;
  if (!state.wallet) {
    log("Connect Phantom first");
    return;
  }
  if (!window.solanaWeb3) {
    log("Solana web3 failed to load");
    return;
  }
  const size = Number($("sizeUsd").value || 20);
  if (size <= 0 || size > 500) {
    log("Size must be 1–500 USD");
    return;
  }
  state.busy = true;
  $("botStatus").textContent = fromAuto ? "bot proposing" : "quoting";
  try {
    const lamports = await solLamportsForUsd(size);
    const quoteUrl = `${JUP_QUOTE}?inputMint=${SOL}&outputMint=${mint}&amount=${lamports}&slippageBps=150`;
    const quote = await fetch(quoteUrl).then((r) => r.json());
    if (quote.error || quote.errorCode) throw new Error(quote.error || quote.errorCode);
    const swap = await fetch(JUP_SWAP, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: state.wallet,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      }),
    }).then((r) => r.json());
    if (!swap.swapTransaction) throw new Error(swap.error || "No swap tx");
    const raw = Uint8Array.from(atob(swap.swapTransaction), (c) => c.charCodeAt(0));
    const tx = window.solanaWeb3.VersionedTransaction.deserialize(raw);
    const signed = await window.solana.signAndSendTransaction(tx);
    log(`Signed $${symbol} ~$${size} · ${signed.signature || signed}`);
    $("botStatus").textContent = "filled / sent";
  } catch (err) {
    log(`Swap blocked: ${err.message || err}`);
    $("botStatus").textContent = "idle";
  } finally {
    state.busy = false;
  }
}

document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  if (btn.dataset.mint) proposeBuy(btn.dataset.mint, btn.dataset.symbol, false);
  if (btn.dataset.open) window.open(btn.dataset.open, "_blank");
});

$("connectBtn").onclick = () => connectWallet().catch((e) => log(e.message));
$("autoBuy").onchange = () => {
  $("botStatus").textContent = $("autoBuy").checked ? "proposing on signals" : "bot idle";
};

document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("on"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("on"));
    tab.classList.add("on");
    $(`view-${tab.dataset.view}`).classList.add("on");
  };
});

(async function boot() {
  try {
    await loadLeaders();
    await loadAlerts();
    connectWs();
    setInterval(loadLeaders, 90_000);
  } catch (err) {
    $("apiStatus").textContent = "tape error";
    log(err.message || String(err));
  }
})();
