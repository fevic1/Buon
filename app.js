const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const JUP_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";
const JUP_SWAP = "https://lite-api.jup.ag/swap/v1/swap";
const RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
const API = atob("aHR0cHM6Ly9hcGkuZm9tb2FwaS5pbw==");
const TAPE_WS = atob("d3NzOi8vYXBpLmZvbW9hcGkuaW8vd3MvYWxlcnRz");
const DEX = "https://api.dexscreener.com/latest/dex/tokens/";
const RELAY = "https://api.relay.link/quote";
const RELAY_CHAIN = { solana: 792703809, sol: 792703809, ethereum: 1, eth: 1, base: 8453, bsc: 56, bnb: 56, binance: 56, monad: 143, robinhood: 4663, rh: 4663, hyperliquid: 1337, hyperevm: 999 };

const state = { leaders: new Map(), tokens: new Map(), traderTape: new Map(), wallet: null, evm: null, cashUsdc: 0, busy: false, seen: new Set(), solPrice: 0, key: localStorage.getItem("buon_key") || "" };
const $ = (id) => document.getElementById(id);
function log(msg) { const el = $("log"); const line = document.createElement("div"); line.textContent = `${new Date().toLocaleTimeString()} · ${msg}`; el.prepend(line); }
function tokenKey(symbol, address) { if (address) return address.startsWith("0x") ? address.toLowerCase() : address; return (symbol || "?").replace(/^\$/, "").toUpperCase(); }
function chainSlug(chain) { const map = { sol: "solana", eth: "ethereum", bnb: "bsc", binance: "bsc", rh: "robinhood" }; return map[(chain || "solana").toLowerCase()] || (chain || "solana").toLowerCase(); }
function coinSrc(chain, address) { if (!address) return ""; return `https://dd.dexscreener.com/ds-data/tokens/${chainSlug(chain)}/${address}.png`; }
function initials(handle) { return (handle || "?").replace(/^@/, "").slice(0, 2).toUpperCase(); }
function usd(n) { const v = Number(n || 0); if (!v) return ""; if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}K`; return `$${v.toFixed(0)}`; }
function ago(ts) { if (!ts) return ""; const ms = ts > 1e12 ? ts : ts * 1000; const s = Math.max(0, Math.floor((Date.now() - ms) / 1000)); if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`; return `${Math.floor(s / 3600)}h`; }
function authHeaders() { return state.key ? { authorization: `Bearer ${state.key}` } : {}; }
function face(handle) { const src = state.leaders.get(handle)?.avatar; const ini = initials(handle); if (src) return `<div class="face-wrap"><img class="face" src="${src}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><div class="avatar" style="display:none">${ini}</div></div>`; return `<div class="avatar">${ini}</div>`; }
function coin(chain, address, symbol) { const src = coinSrc(chain, address); const label = (symbol || "?").replace(/^\$/, ""); if (!src) return `$${label}`; return `<span class="sym"><img class="coin" src="${src}" alt="" onerror="this.style.display='none'">$${label}</span>`; }
function bookOf(symbol, address, chain) { const key = tokenKey(symbol, address); if (!state.tokens.has(key)) state.tokens.set(key, { key, symbol: (symbol || "?").replace(/^\$/, ""), address, chain, holders: new Set(), buyUsd: 0, sellUsd: 0, buys: 0, sells: 0, last: "" }); const book = state.tokens.get(key); if (address && !book.address) book.address = address; if (chain && !book.chain) book.chain = chain; if (symbol && book.symbol === "?") book.symbol = symbol.replace(/^\$/, ""); return book; }
function findBook(symbol, address) { if (address && state.tokens.has(tokenKey(symbol, address))) return state.tokens.get(tokenKey(symbol, address)); const want = (symbol || "").replace(/^\$/, "").toUpperCase(); for (const book of state.tokens.values()) if (book.symbol.toUpperCase() === want) return book; return bookOf(symbol, address); }
function score(book) { let rankW = 0; for (const handle of book.holders) { const leader = state.leaders.get(handle); if (leader) rankW += 1 / leader.rank; } return book.holders.size * 8 + rankW + Math.log1p(book.buyUsd) - 0.7 * Math.log1p(book.sellUsd); }
function actionOf(book) { const min = Number($("minOverlap").value || 3); if (book.sells > book.buys && book.buyUsd < book.sellUsd) return "DISTRIBUTION"; if (book.holders.size >= min && book.buyUsd >= book.sellUsd) return "CROWDED_BID"; if (book.buys >= 2 && book.holders.size < min && book.buyUsd > book.sellUsd) return "POTENTIAL"; if (book.buys) return "WATCH"; return "HOLD"; }
function ranked(limit = 20) { return [...state.tokens.values()].filter((b) => b.holders.size || b.buys).map((b) => ({ ...b, action: actionOf(b), score: score(b), leaders: [...b.holders] })).sort((a, b) => b.score - a.score).slice(0, limit); }
function rememberTrader(alert) { const handle = String(alert.trader || "").replace(/^@/, ""); if (!handle) return; if (!state.traderTape.has(handle)) state.traderTape.set(handle, []); const list = state.traderTape.get(handle); list.unshift({ type: (alert.type || "").toLowerCase(), token: (alert.token || "").replace(/^\$/, ""), address: alert.tokenAddress, chain: alert.chain, usd: Number(alert.usdValue || 0), ts: alert.ts }); if (list.length > 40) list.length = 40; }
function buyBtn(mint, symbol, chain) { return mint ? `<button class="buy" data-mint="${mint}" data-symbol="${symbol || ""}" data-chain="${chain || ""}">Buy</button>` : `<button class="ghost buy" data-token="${symbol || ""}" data-chain="${chain || ""}">Open</button>`; }
function renderFeed(alert, prepend = true) { const feed = $("feed"); const row = document.createElement("article"); row.className = "row clickable"; row.dataset.trader = alert.trader || ""; const type = (alert.type || "trade").toLowerCase(); row.innerHTML = `${face(alert.trader)}<div><div class="who">@${alert.trader || "unknown"} <span class="tag ${type}">${type}</span></div><div class="meta">${coin(alert.chain, alert.tokenAddress, alert.token)} · ${alert.chain || ""} · ${usd(alert.usdValue)} · ${ago(alert.ts)}</div></div><div>${buyBtn(alert.tokenAddress, alert.token, alert.chain)}</div>`; if (prepend) feed.prepend(row); else feed.append(row); while (feed.children.length > 80) feed.lastChild.remove(); }
function renderLeaders() { $("leaders").innerHTML = [...state.leaders.values()].sort((a, b) => a.rank - b.rank).map((l) => `<article class="row clickable" data-trader="${l.handle}">${face(l.handle)}<div><div class="who">#${l.rank} @${l.handle} <span class="meta">${l.name && l.name !== l.handle ? l.name : ""}</span></div><div class="meta">PnL ${usd(l.pnl)} · vol ${usd(l.volume)} · ${l.trades} trades · ${Number(l.followers || 0).toLocaleString()} follows</div></div><div class="meta">${(l.wallets.solana || "").slice(0, 4)}…</div></article>`).join(""); }
function tokenCard(r) { return `<div class="mini clickable" data-token="${r.symbol || ""}" data-address="${r.address || ""}" data-chain="${r.chain || ""}"><b>${coin(r.chain, r.address, r.symbol)}</b><span class="meta">${r.action} · overlap ${r.holders?.size || 0} · net ${usd((r.buyUsd || 0) - (r.sellUsd || 0))}</span></div>`; }
function renderBooks() { const rows = ranked(30); const min = Number($("minOverlap").value || 3); const crowded = rows.filter((r) => (r.holders?.size || 0) >= min); const potential = rows.filter((r) => r.action === "POTENTIAL"); const list = (items, empty) => items.length ? items.slice(0, 8).map(tokenCard).join("") : `<div class="muted">${empty}</div>`; $("crowdedList").innerHTML = list(crowded, "No identical-coin cluster yet"); $("potentialList").innerHTML = list(potential, "No early leader flow yet"); $("book").innerHTML = rows.map((r) => `<article class="row clickable" data-token="${r.symbol || ""}" data-address="${r.address || ""}" data-chain="${r.chain || ""}"><img class="face" src="${coinSrc(r.chain, r.address)}" alt="" onerror="this.style.display='none'"><div><div class="who">${coin(r.chain, r.address, r.symbol)} <span class="tag ${r.action}">${r.action}</span></div><div class="meta">score ${r.score.toFixed(2)} · ${r.leaders.slice(0, 4).map((h) => "@" + h).join(" ")}</div></div><div>${buyBtn(r.address, r.symbol, r.chain)}</div></article>`).join("") || `<div class="muted">Waiting for overlapping flow…</div>`; }
function renderTicker(alerts) { const bits = (alerts || []).slice(0, 16).map((a) => `@${a.trader} ${(a.type || "tape").toUpperCase()} $${a.token || "?"} ${usd(a.usdValue)}`); if (bits.length) $("ticker").textContent = bits.join("   ·   ") + "   ·   " + bits.join("   ·   "); }
function closeSheet() { $("shade").hidden = true; $("sheet").innerHTML = ""; }
function openSheet(html) { $("sheet").innerHTML = html; $("shade").hidden = false; }
async function openTrader(handle) {
  handle = String(handle || "").replace(/^@/, ""); if (!handle) return;
  const leader = state.leaders.get(handle) || { handle, wallets: {}, name: handle };
  const tape = state.traderTape.get(handle) || [];
  const byToken = new Map();
  for (const row of tape) { const key = tokenKey(row.token, row.address); if (!byToken.has(key)) byToken.set(key, { ...row, buys: 0, sells: 0, buyUsd: 0, sellUsd: 0 }); const t = byToken.get(key); if (row.type === "buy") { t.buys += 1; t.buyUsd += row.usd; } if (row.type === "sell") { t.sells += 1; t.sellUsd += row.usd; } }
  for (const book of state.tokens.values()) if (book.holders.has(handle) && !byToken.has(book.key)) byToken.set(book.key, { token: book.symbol, address: book.address, chain: book.chain, buyUsd: 0, sellUsd: 0 });
  openSheet(`<div class="sheet-h">${face(handle)}<div class="grow"><div class="who">@${handle}</div><div class="meta">${leader.name || ""} · rank ${leader.rank || "—"} · PnL ${usd(leader.pnl)}</div></div><button class="ghost slim" data-close type="button">Close</button></div><div class="meta">vol ${usd(leader.volume)} · ${leader.trades || 0} trades · ${Number(leader.followers || 0).toLocaleString()} follows</div><p class="copy">sol ${leader.wallets?.solana || "—"}</p><p class="copy">evm ${leader.wallets?.evm || "—"}</p><div class="acts">${leader.wallets?.solana ? `<button class="ghost" data-copy="${leader.wallets.solana}">Copy SOL</button>` : ""}${leader.wallets?.evm ? `<button class="ghost" data-copy="${leader.wallets.evm}">Copy EVM</button>` : ""}</div><h2>coins on this desk</h2><div id="sheetHolds">${[...byToken.values()].map((t) => `<div class="hold clickable" data-token="${t.token || ""}" data-address="${t.address || ""}" data-chain="${t.chain || ""}"><div>${coin(t.chain, t.address, t.token)}<div class="meta">buy ${usd(t.buyUsd)} · sell ${usd(t.sellUsd)}</div></div>${buyBtn(t.address, t.token, t.chain)}</div>`).join("") || `<div class="muted">No tape prints for this wallet yet.</div>`}</div><h2>recent prints</h2><div>${tape.slice(0, 12).map((t) => `<div class="meta">${ago(t.ts)} · ${t.type} ${coin(t.chain, t.address, t.token)} ${usd(t.usd)}</div>`).join("") || `<div class="muted">Waiting on live prints.</div>`}</div><p class="fine" id="sheetNote">${state.key ? "Loading official book…" : "Public tape only. Paste a tape key in Desk for official holdings."}</p>`);
  if (!state.key) return;
  try {
    const res = await fetch(`${API}/v2/users/${encodeURIComponent(handle)}/balances`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`book ${res.status}`);
    const data = await res.json();
    const holds = data.holdings || data.balances || (Array.isArray(data) ? data : []);
    if (!holds.length) return;
    $("sheetHolds").innerHTML = holds.slice(0, 20).map((h) => { const token = h.token || {}; const symbol = token.symbol || h.symbol || "?"; const address = token.address || h.address || h.tokenAddress; const chain = h.chain || token.network || "solana"; return `<div class="hold clickable" data-token="${symbol}" data-address="${address || ""}" data-chain="${chain}"><div>${coin(chain, address, symbol)}<div class="meta">${usd(h.valueUsd || h.value || 0)}</div></div>${buyBtn(address, symbol, chain)}</div>`; }).join("");
    $("sheetNote").textContent = "Official book loaded.";
  } catch (err) { $("sheetNote").textContent = `Official book blocked: ${err.message}`; }
}
async function openToken(symbol, address, chain) {
  const book = findBook(symbol, address);
  chain = chain || book.chain || "solana"; address = address || book.address; symbol = (symbol || book.symbol || "?").replace(/^\$/, "");
  const holders = [...(book.holders || [])];
  openSheet(`<div class="sheet-h"><img class="face" src="${coinSrc(chain, address)}" alt="" onerror="this.style.display='none'"><div class="grow"><div class="who">$${symbol}</div><div class="meta">${actionOf(book)} · ${chain} · overlap ${holders.length}</div></div><button class="ghost slim" data-close type="button">Close</button></div><p class="copy">${address || "no mint yet"}</p><div class="acts">${address ? `<button class="buy" data-mint="${address}" data-symbol="${symbol}" data-chain="${chain}">Buy with USDC</button><button class="ghost" data-copy="${address}">Copy address</button>` : ""}</div><div class="meta">buy flow ${usd(book.buyUsd)} · sell flow ${usd(book.sellUsd)}</div><div id="sheetPairs"></div><h2>leaders on it</h2><div>${holders.map((h) => `<div class="hold clickable" data-trader="${h}">${face(h)}<div class="grow">@${h}</div></div>`).join("") || `<div class="muted">No ranked wallet clustered on this mint yet.</div>`}</div><p class="fine" id="sheetNote">Loading market card on desk…</p>`);
  if (!address) { $("sheetNote").textContent = "No contract on the tape yet."; return; }
  try {
    const res = await fetch(DEX + address); const data = await res.json(); const pairs = (data.pairs || []).slice(0, 4);
    if (pairs.length) { const pair = pairs[0]; $("sheetNote").textContent = `${pair.dexId} · ${pair.chainId} · px $${Number(pair.priceUsd || 0).toPrecision(4)}`; $("sheetPairs").innerHTML = pairs.map((p) => `<div class="hold"><div><b>${p.baseToken?.symbol}/${p.quoteToken?.symbol}</b><div class="meta">${p.dexId} · px $${Number(p.priceUsd || 0).toPrecision(4)} · ${Number(p.priceChange?.h24 || 0).toFixed(1)}% 24h</div><div class="meta">liq ${usd(p.liquidity?.usd)} · vol ${usd(p.volume?.h24)}</div></div></div>`).join(""); }
    else $("sheetNote").textContent = "No market card for this mint yet.";
  } catch { $("sheetNote").textContent = "Market card unavailable."; }
}
async function loadLeaders() { const res = await fetch(`${API}/v2/leaderboard/24h?limit=25`, { headers: authHeaders() }); const data = await res.json(); state.leaders.clear(); for (const row of data.traders || []) state.leaders.set(row.handle, { handle: row.handle, name: row.displayName, rank: row.rank, pnl: row.pnlUsd, volume: row.volumeUsd, trades: row.trades, followers: row.followers, avatar: row.avatar || "", wallets: row.wallets || {} }); renderLeaders(); $("apiStatus").textContent = `tape live · ${state.leaders.size} leaders`; }
async function loadAlerts(seed) { const res = await fetch(`${API}/v2/alerts?limit=50`, { headers: authHeaders() }); const data = await res.json(); const alerts = data.alerts || []; renderTicker(alerts); let added = 0; const ordered = seed ? alerts.slice().reverse() : alerts; for (const a of ordered) { const before = state.seen.size; ingest(a, !seed); if (state.seen.size > before) { renderFeed(a, !seed); added += 1; } } $("feedMeta").textContent = seed ? `${alerts.length} live prints` : `${added} new · ${alerts.length} on tape`; }
function ingest(alert, maybeTrade) { const id = alert.id || `${alert.ts}-${alert.trader}-${alert.token}`; if (state.seen.has(id)) return null; state.seen.add(id); rememberTrader(alert); const min = Number($("minAlert").value || 0); if (alert.usdValue && Number(alert.usdValue) < min && alert.type !== "thesis") return null; const book = bookOf(alert.token, alert.tokenAddress, alert.chain); const side = (alert.type || "").toLowerCase(); const usdValue = Number(alert.usdValue || 0); const tracked = state.leaders.has(alert.trader); if (side === "buy") { book.buys += 1; book.buyUsd += usdValue; if (tracked) book.holders.add(alert.trader); } else if (side === "sell") { book.sells += 1; book.sellUsd += usdValue; if (tracked) book.holders.delete(alert.trader); } renderBooks(); if (maybeTrade && $("autoBuy").checked && (actionOf(book) === "CROWDED_BID" || actionOf(book) === "POTENTIAL") && book.address) proposeBuy(book.address, book.symbol, true, book.chain); return book; }
function connectWs() { const ws = new WebSocket(TAPE_WS); ws.onopen = () => { $("liveDot").classList.add("on"); log("Live tape connected"); }; ws.onmessage = (ev) => { try { const msg = JSON.parse(ev.data); if (msg.type === "welcome") return; const alert = msg.alert || msg; if (!alert || !alert.trader) return; const before = state.seen.size; ingest(alert, true); if (state.seen.size > before) renderFeed(alert, true); } catch (_) {} }; ws.onclose = () => { $("liveDot").classList.remove("on"); setTimeout(connectWs, 4000); }; }
async function connection() { if (!window.solanaWeb3) throw new Error("web3 missing"); let last; for (const url of RPCS) { try { const conn = new window.solanaWeb3.Connection(url, "confirmed"); await conn.getEpochInfo(); return conn; } catch (err) { last = err; } } throw last || new Error("no rpc"); }
async function refreshBalance() {
  if (!state.wallet || !window.solanaWeb3) return;
  const box = $("walletBals"); box.innerHTML = `<div class="meta">reading cash…</div>`;
  try {
    const conn = await connection(); const pk = new window.solanaWeb3.PublicKey(state.wallet);
    const sol = (await conn.getBalance(pk)) / 1e9;
    const rows = [`<div class="bal-row"><span>SOL gas</span><span class="amt">${sol.toFixed(4)}</span></div>`];
    try {
      const parsed = await conn.getParsedTokenAccountsByOwner(pk, { programId: new window.solanaWeb3.PublicKey(TOKEN_PROGRAM) });
      const tokens = parsed.value.map((acc) => acc.account.data.parsed?.info).filter((info) => info && Number(info.tokenAmount?.uiAmount || 0) > 0).sort((a, b) => Number(b.tokenAmount.uiAmount) - Number(a.tokenAmount.uiAmount)).slice(0, 6);
      for (const info of tokens) {
        const mint = info.mint; const amt = Number(info.tokenAmount.uiAmount);
        if (mint === USDC) { state.cashUsdc = amt; rows.unshift(`<div class="bal-row"><span>cash</span><span><span class="amt">${amt.toFixed(2)} USDC</span></span></div>`); }
        else rows.push(`<div class="bal-row"><span>${mint.slice(0, 4)}</span><span class="amt">${amt >= 1 ? amt.toFixed(2) : amt.toPrecision(3)}</span></div>`);
      }
    } catch (_) { rows.push(`<div class="meta">token list blocked by rpc</div>`); }
    box.innerHTML = rows.join("");
    $("walletStatus").textContent = state.cashUsdc ? `cash ${state.cashUsdc.toFixed(2)} USDC` : `wallet ${sol.toFixed(2)} SOL`;
  } catch (err) { box.innerHTML = `<div class="meta">balance error: ${err.message || err}</div>`; }
}
async function connectWallet() {
  const provider = window.solana; if (!provider?.isPhantom) { window.open("https://phantom.app/", "_blank"); log("Phantom not found"); return; }
  const res = await provider.connect(); state.wallet = res.publicKey.toString();
  try { const eth = window.phantom?.ethereum || window.ethereum; if (eth?.request) { const acc = await eth.request({ method: "eth_requestAccounts" }); state.evm = acc?.[0] || null; } } catch (_) {}
  $("walletAddr").textContent = state.evm ? `${state.wallet}\n${state.evm}` : state.wallet;
  $("connectBtn").textContent = "Connected"; log(state.evm ? "Phantom connected · fund USDC cash" : "Phantom connected · fund USDC to trade");
  await refreshBalance();
}
function usdcAtoms(n) { return Math.max(1, Math.floor(Number(n) * 1e6)); }
function isSolMint(chain, mint) { const c = (chain || "").toLowerCase(); return (!c || c === "solana" || c === "sol") && mint && !String(mint).startsWith("0x"); }
async function proposeBuy(mint, symbol, fromAuto, chain) {
  if (state.busy) return; if (!state.wallet) { log("Connect Phantom first"); return; }
  const size = Number($("sizeUsd").value || 20); if (size <= 0 || size > 500) { log("Size must be 1–500 USDC"); return; }
  if (isSolMint(chain, mint)) return proposeJupUsdc(mint, symbol, fromAuto, size);
  return proposeRelay(mint, symbol, size, chain);
}
async function proposeJupUsdc(mint, symbol, fromAuto, size) {
  if (!window.solanaWeb3) { log("Solana web3 failed to load"); return; }
  state.busy = true; $("botStatus").textContent = fromAuto ? "bot proposing" : "quoting USDC";
  try {
    const quote = await fetch(`${JUP_QUOTE}?inputMint=${USDC}&outputMint=${mint}&amount=${usdcAtoms(size)}&slippageBps=150`).then((r) => r.json());
    if (quote.error || quote.errorCode) throw new Error(quote.error || quote.errorCode);
    const swap = await fetch(JUP_SWAP, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: state.wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true }) }).then((r) => r.json());
    if (!swap.swapTransaction) throw new Error(swap.error || "No swap tx");
    const raw = Uint8Array.from(atob(swap.swapTransaction), (c) => c.charCodeAt(0));
    const tx = window.solanaWeb3.VersionedTransaction.deserialize(raw);
    const signed = await window.solana.signAndSendTransaction(tx);
    log(`Signed $${symbol} with ${size} USDC · ${signed.signature || signed}`); $("botStatus").textContent = "filled / sent"; refreshBalance();
  } catch (err) { log(`USDC swap blocked: ${err.message || err}`); $("botStatus").textContent = "idle"; }
  finally { state.busy = false; }
}
async function proposeRelay(mint, symbol, size, chain) {
  state.busy = true; $("botStatus").textContent = "quoting cash route";
  try {
    if (!state.evm) { try { const eth = window.phantom?.ethereum || window.ethereum; if (eth?.request) { const acc = await eth.request({ method: "eth_requestAccounts" }); state.evm = acc?.[0] || null; } } catch (_) {} }
    const dest = RELAY_CHAIN[(chain || "").toLowerCase()];
    if (!dest) throw new Error(`no cash route id for ${chain}`);
    const quote = await fetch(RELAY, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: state.wallet, recipient: state.evm || state.wallet, originChainId: RELAY_CHAIN.solana, destinationChainId: dest, originCurrency: USDC, destinationCurrency: mint, amount: String(usdcAtoms(size)), tradeType: "EXACT_INPUT" }) }).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.message || data.errorCode || `route ${r.status}`); return data; });
    const step = (quote.steps || []).find((s) => s.kind === "transaction" || s.id === "deposit") || (quote.steps || [])[0];
    const raw = step?.items?.[0]?.data?.data || step?.items?.[0]?.data;
    if (typeof raw === "string" && raw.length > 80 && !raw.startsWith("0x") && window.solanaWeb3) {
      const tx = window.solanaWeb3.VersionedTransaction.deserialize(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)));
      const signed = await window.solana.signAndSendTransaction(tx);
      log(`Routed $${symbol} on ${chain} with ${size} USDC · ${signed.signature || signed}`); $("botStatus").textContent = "filled / sent"; refreshBalance(); return;
    }
    throw new Error("no public signable cash route yet");
  } catch (err) { log(`Keep USDC as cash. ${chain}: ${err.message || err}`); $("botStatus").textContent = "idle"; }
  finally { state.busy = false; }
}
function saveDesk() { localStorage.setItem("buon_desk", JSON.stringify({ sizeUsd: $("sizeUsd").value, minAlert: $("minAlert").value, minOverlap: $("minOverlap").value, autoBuy: $("autoBuy").checked })); }
function loadDesk() { try { const raw = JSON.parse(localStorage.getItem("buon_desk") || "{}"); if (raw.sizeUsd) $("sizeUsd").value = raw.sizeUsd; if (raw.minAlert) $("minAlert").value = raw.minAlert; if (raw.minOverlap) $("minOverlap").value = raw.minOverlap; if (raw.autoBuy) $("autoBuy").checked = raw.autoBuy; } catch (_) {} $("tapeKey").value = state.key; }
document.addEventListener("click", (ev) => { const btn = ev.target.closest("button"); if (btn?.dataset.close != null) { closeSheet(); return; } if (btn?.dataset.mint) { ev.stopPropagation(); proposeBuy(btn.dataset.mint, btn.dataset.symbol, false, btn.dataset.chain); return; } if (btn?.dataset.copy) { navigator.clipboard?.writeText(btn.dataset.copy); log("Copied"); return; } const hit = ev.target.closest("[data-trader], [data-token]"); if (!hit) return; if (hit.dataset.trader) openTrader(hit.dataset.trader); else openToken(hit.dataset.token, hit.dataset.address, hit.dataset.chain); });
$("shade").addEventListener("click", (ev) => { if (ev.target.id === "shade") closeSheet(); });
$("connectBtn").onclick = () => connectWallet().catch((e) => log(e.message));
$("refreshBal").onclick = () => refreshBalance().catch((e) => log(e.message));
$("autoBuy").onchange = () => { $("botStatus").textContent = $("autoBuy").checked ? "proposing on signals" : "bot idle"; saveDesk(); };
["sizeUsd", "minAlert", "minOverlap"].forEach((id) => { $(id).onchange = saveDesk; });
$("tapeKey").onchange = () => { state.key = $("tapeKey").value.trim(); if (state.key) localStorage.setItem("buon_key", state.key); else localStorage.removeItem("buon_key"); log(state.key ? "Tape key saved on this browser" : "Tape key cleared"); };
document.querySelectorAll(".tab").forEach((tab) => { tab.onclick = () => { document.querySelectorAll(".tab").forEach((t) => t.classList.remove("on")); document.querySelectorAll(".view").forEach((v) => v.classList.remove("on")); tab.classList.add("on"); $(`view-${tab.dataset.view}`).classList.add("on"); }; });
setInterval(() => { $("clock").textContent = new Date().toLocaleTimeString(); }, 1000);
(async function boot() { loadDesk(); try { await loadLeaders(); await loadAlerts(true); connectWs(); setInterval(loadLeaders, 45_000); setInterval(() => loadAlerts(false).catch(() => {}), 12_000); setInterval(() => { if (state.wallet) refreshBalance(); }, 30_000); } catch (err) { $("apiStatus").textContent = "tape error"; log(err.message || String(err)); } })();
