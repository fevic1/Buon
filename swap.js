import { Transaction } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm";
import { Buffer } from "https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ZERO = "0x0000000000000000000000000000000000000000";
const EXEC_EVM_DEFAULT = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
const EXEC_SOL_DEFAULT = "8ZGuiQZzb6BMDeWjzPzowr6B839ftaJS15ihoscfqEk4";
const SOL_RPCS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com"
];
const ROUTE_BLOCK_KEY = "buon_route_blocked_mints";
const PENDING_BRIDGE_KEY = "buon_pending_bridge";
const RPC = {
  8453: ["https://base.publicnode.com", "https://base.drpc.org", "https://mainnet.base.org"],
  1: ["https://cloudflare-eth.com"],
  56: ["https://bsc-dataseed.binance.org"],
  4663: ["https://rpc.mainnet.chain.robinhood.com"]
};
const CHAIN = {
  ethereum: 1, eth: 1, mainnet: 1,
  base: 8453,
  bsc: 56, bnb: 56, binance: 56, "bnb chain": 56,
  solana: 792703809, sol: 792703809, robinhood: 4663, rh: 4663,
  "robinhood chain": 4663,
  monad: 143, hyperliquid: 1337, hyperevm: 999
};

if (!window.Buffer) window.Buffer = Buffer;
if (!globalThis.Buffer) globalThis.Buffer = Buffer;

function execPools() {
  var pool = window.BUON_POOL || {};
  return {
    evm: pool.evm || EXEC_EVM_DEFAULT,
    sol: pool.sol || EXEC_SOL_DEFAULT
  };
}

function executionContext(chainId) {
  var pool = execPools();
  return {
    sourceChainId: 792703809,
    sourceToken: "USDC_SOL",
    sourceAddress: pool.sol,
    destinationChainId: Number(chainId),
    destinationAddress: Number(chainId) === 792703809 ? pool.sol : pool.evm,
    solExecutionAddress: pool.sol
  };
}

var evmQueue = Promise.resolve();
var evmNonce = {};
var blockedMints = new Set(JSON.parse(localStorage.getItem(ROUTE_BLOCK_KEY) || "[]"));
var primePromise = null;
var lastPrimeAt = 0;

function logLine(m) { if (typeof log === "function") log(m); }
function routeKey(mint) { return String(mint || "").trim(); }
function saveBlockedMints() { localStorage.setItem(ROUTE_BLOCK_KEY, JSON.stringify(Array.from(blockedMints).slice(0, 200))); }
function loadPendingBridge() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_BRIDGE_KEY) || "null");
  } catch (_) {
    return null;
  }
}
function savePendingBridge(pending) {
  if (!pending) {
    localStorage.removeItem(PENDING_BRIDGE_KEY);
    return;
  }
  localStorage.setItem(PENDING_BRIDGE_KEY, JSON.stringify(pending));
}
function blockRouteMint(mint, symbol, reason) {
  var key = routeKey(mint);
  if (!key) return;
  if (!blockedMints.has(key)) {
    blockedMints.add(key);
    saveBlockedMints();
  }
  logLine("skip $" + (symbol || mint || "?") + " route blocked" + (reason ? " · " + reason : ""));
}
function isRouteBlocked(mint) { return blockedMints.has(routeKey(mint)); }
function destChain(chain, mint) {
  var c = String(chain || "").toLowerCase();
  if (CHAIN[c]) return CHAIN[c];
  if (String(mint || "").indexOf("0x") === 0) return 4663;
  return 792703809;
}
function toNum(hex) { return Number(BigInt(hex || "0x0")); }
async function rpc(chainId, method, params) {
  var urls = RPC[chainId] || RPC[8453];
  var last = "rpc";
  for (var i = 0; i < urls.length; i++) {
    try {
      var res = await fetch(urls[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
      var data = await res.json();
      if (data.error) { last = data.error.message; continue; }
      return data.result;
    } catch (e) { last = e.message || String(e); }
  }
  throw new Error(last);
}
async function solRpc(method, params) {
  var last = "sol rpc";
  for (var i = 0; i < SOL_RPCS.length; i++) {
    try {
      var res = await fetch(SOL_RPCS[i], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
      if (!res.ok) { last = "http " + res.status; continue; }
      var data = await res.json();
      if (data.error) { last = data.error.message || "sol rpc"; continue; }
      return data.result;
    } catch (e) { last = e.message || String(e); }
  }
  throw new Error(last);
}
function b64ToHex(b64) {
  var raw = atob(b64);
  var hex = "";
  for (var i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, "0");
  return hex;
}
function hexToBytes(hex) {
  var raw = String(hex || "").replace(/^0x/, "");
  if (!raw.length) return new Uint8Array([]);
  var out = new Uint8Array(raw.length / 2);
  for (var i = 0; i < raw.length; i += 2) out[i / 2] = parseInt(raw.slice(i, i + 2), 16);
  return out;
}
function bytesToHex(bytes) {
  var out = "";
  for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
async function nextNonce(chainId) {
  var source = execPools().evm;
  var pending = toNum(await rpc(chainId, "eth_getTransactionCount", [source, "pending"]));
  var latest = toNum(await rpc(chainId, "eth_getTransactionCount", [source, "latest"]));
  var local = evmNonce[chainId] || 0;
  var n = Math.max(pending, latest, local);
  evmNonce[chainId] = n + 1;
  return n;
}
async function signSendOnce(chainId, to, data, value, nonce) {
  var tk = window.BUON_TK;
  if (!tk || !tk.client) throw new Error("Turnkey not ready");
  var gasPrice = BigInt(await rpc(chainId, "eth_gasPrice", []));
  gasPrice = (gasPrice * 12n) / 10n;
  var tx = Transaction.from({
    to: to,
    data: data || "0x",
    value: value || 0,
    gasLimit: 450000n,
    gasPrice: gasPrice,
    nonce: nonce,
    chainId: chainId,
    type: 0
  });
  var raw = tx.unsignedSerialized.replace(/^0x/, "");
  var act = await tk.client.signTransaction({
    type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
    timestampMs: String(Date.now()),
    organizationId: tk.org,
    parameters: { signWith: execPools().evm, unsignedTransaction: raw, type: "TRANSACTION_TYPE_ETHEREUM" }
  });
  var signed = (act && act.activity && act.activity.result && act.activity.result.signTransactionResult && act.activity.result.signTransactionResult.signedTransaction) || (act && act.signedTransaction);
  if (!signed) throw new Error("no signed tx");
  if (signed.indexOf("0x") !== 0) signed = "0x" + signed;
  var hash = await rpc(chainId, "eth_sendRawTransaction", [signed]);
  logLine("sent nonce " + nonce + " " + hash);
  return hash;
}
async function signSend(chainId, to, data, value) {
  var run = evmQueue.then(async function () {
    var nonce = await nextNonce(chainId);
    try {
      return await signSendOnce(chainId, to, data, value, nonce);
    } catch (err) {
      var msg = String(err.message || err);
      if (/nonce too low|already known|replacement/i.test(msg)) {
        evmNonce[chainId] = 0;
        nonce = await nextNonce(chainId);
        logLine("retry nonce " + nonce);
        return await signSendOnce(chainId, to, data, value, nonce);
      }
      throw err;
    }
  });
  evmQueue = run.catch(function () {});
  return run;
}
async function signSendSol(unsignedHex) {
  var tk = window.BUON_TK;
  if (!tk || !tk.client) throw new Error("Turnkey not ready");
  var act = await tk.client.signTransaction({
    type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
    timestampMs: String(Date.now()),
    organizationId: tk.org,
    parameters: { signWith: execPools().sol, unsignedTransaction: unsignedHex.replace(/^0x/, ""), type: "TRANSACTION_TYPE_SOLANA" }
  });
  var signed = (act && act.activity && act.activity.result && act.activity.result.signTransactionResult && act.activity.result.signTransactionResult.signedTransaction) || (act && act.signedTransaction);
  if (!signed) throw new Error("no signed sol tx");
  var bytes = signed.replace(/^0x/, "");
  var bin = new Uint8Array(bytes.match(/.{1,2}/g).map(function (b) { return parseInt(b, 16); }));
  var b64 = btoa(String.fromCharCode.apply(null, bin));
  var last = "sol send";
  for (var i = 0; i < SOL_RPCS.length; i++) {
    try {
      var conn = new window.solanaWeb3.Connection(SOL_RPCS[i], "confirmed");
      var tx = window.solanaWeb3.VersionedTransaction.deserialize(bin);
      var sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false });
      if (sim && sim.value && sim.value.err) {
        throw new Error("Simulation failed: " + JSON.stringify(sim.value.err));
      }
      var sig = await conn.sendRawTransaction(bin, { skipPreflight: false, maxRetries: 3 });
      logLine("sol sent " + sig);
      return sig;
    } catch (e) {
      last = e.message || String(e);
      if (/Simulation failed:/i.test(last)) throw new Error(last);
    }
  }
  throw new Error(last);
}
function isRouteSimulationError(err) {
  var msg = String((err && err.message) || err || "");
  return /0x1789|6025|SharedAccountsRoute|Simulation failed/i.test(msg);
}
async function allowance(token, spender, chainId) {
  var owner = execPools().evm.slice(2).toLowerCase().padStart(64, "0");
  var sp = spender.slice(2).toLowerCase().padStart(64, "0");
  var raw = await rpc(chainId || 8453, "eth_call", [{ to: token, data: "0xdd62ed3e" + owner + sp }, "latest"]);
  return BigInt(raw || "0x0");
}
async function evmTokenAtoms(mint, chainId) {
  var data = "0x70a08231" + execPools().evm.slice(2).toLowerCase().padStart(64, "0");
  var raw = await rpc(chainId, "eth_call", [{ to: mint, data: data }, "latest"]);
  return BigInt(raw || "0x0");
}
async function baseUsdcAtoms() {
  var owner = execPools().evm;
  var data = "0x70a08231" + owner.slice(2).toLowerCase().padStart(64, "0");
  var raw = await rpc(8453, "eth_call", [{ to: USDC, data: data }, "latest"]);
  return BigInt(raw || "0x0");
}
async function unifiedUsdcAtoms() {
  var values = await Promise.all([
    solTokenAtoms(USDC_SOL).then(function (v) { return BigInt(v || "0"); }),
    baseUsdcAtoms()
  ]);
  return {
    sol: values[0],
    base: values[1],
    total: values[0] + values[1]
  };
}
async function relayQuote(body) {
  var res = await fetch("https://api.relay.link/quote/v2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) res = await fetch("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  var q = await res.json();
  if (q.message || q.error) throw new Error(q.message || q.error);
  var txs = [];
  (q.steps || []).forEach(function (s) {
    (s.items || []).forEach(function (it) {
      if (it.data) txs.push(it.data);
    });
  });
  if (!txs.length) throw new Error("Relay returned no tx");
  return {
    tool: "relay",
    txs: txs,
    requestId: q.requestId || (((q.steps || [])[0] || {}).requestId) || "",
    checkEndpoint: ((((q.steps || [])[0] || {}).items || [])[0] || {}).check ? ((((q.steps || [])[0] || {}).items || [])[0] || {}).check.endpoint : ""
  };
}
async function relayStatus(requestId, checkEndpoint) {
  var endpoint = checkEndpoint || (requestId ? "/intents/status?requestId=" + encodeURIComponent(requestId) : "");
  if (!endpoint) throw new Error("missing relay request id");
  var url = endpoint.indexOf("http") === 0 ? endpoint : "https://api.relay.link" + endpoint;
  var res = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
  var data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || ("relay status http " + res.status));
  return data;
}
async function waitForRelayCompletion(requestId, checkEndpoint, maxWaitMs) {
  var until = Date.now() + Math.max(0, Number(maxWaitMs || 0));
  var last = null;
  while (Date.now() <= until) {
    last = await relayStatus(requestId, checkEndpoint);
    if (last && last.status === "success") {
      savePendingBridge(null);
      return last;
    }
    if (last && (last.status === "failure" || last.status === "refund" || last.status === "cancelled")) {
      savePendingBridge(null);
      throw new Error("Relay bridge " + last.status);
    }
    await delay(1250);
  }
  return last;
}
async function signSendRelaySol(data) {
  if (!window.solanaWeb3) throw new Error("solana web3 missing");
  var web3 = window.solanaWeb3;
  var payer = new web3.PublicKey(execPools().sol);
  var conn = new web3.Connection(SOL_RPCS[0], "confirmed");
  var bh = await conn.getLatestBlockhash("confirmed");
  var instructions = (data.instructions || []).map(function (ix) {
    return new web3.TransactionInstruction({
      programId: new web3.PublicKey(ix.programId),
      keys: (ix.keys || []).map(function (k) {
        return {
          pubkey: new web3.PublicKey(k.pubkey),
          isSigner: !!k.isSigner,
          isWritable: !!k.isWritable
        };
      }),
      data: hexToBytes(ix.data || "")
    });
  });
  var tables = [];
  for (var i = 0; i < (data.addressLookupTableAddresses || []).length; i++) {
    var key = new web3.PublicKey(data.addressLookupTableAddresses[i]);
    var resp = await conn.getAddressLookupTable(key);
    if (resp && resp.value) tables.push(resp.value);
  }
  var msg = new web3.TransactionMessage({
    payerKey: payer,
    recentBlockhash: bh.blockhash,
    instructions: instructions
  }).compileToV0Message(tables);
  var tx = new web3.VersionedTransaction(msg);
  var unsignedHex = bytesToHex(tx.serialize());
  return signSendSol(unsignedHex);
}
async function runSteps(q, amountHint) {
  var lastHash = "";
  for (var i = 0; i < q.txs.length; i++) {
    var tx = q.txs[i];
    if (tx && tx.to && tx.chainId != null) {
      var chainId = Number(tx.chainId || 8453);
      if (tx.data && String(tx.data).indexOf("0x095ea7b3") === 0) {
        var spender = "0x" + String(tx.data).slice(34, 74);
        var have = await allowance(tx.to, spender, chainId);
        if (amountHint && have >= BigInt(amountHint)) { logLine("allowance ok"); continue; }
      }
      lastHash = await signSend(chainId, tx.to, tx.data || "0x", tx.value || 0);
      continue;
    }

    if (tx && Array.isArray(tx.instructions)) {
      lastHash = await signSendRelaySol(tx);
      continue;
    }

    throw new Error("Unsupported relay step payload");
  }
  return lastHash;
}
async function topUpRhGas() {
  var source = execPools().evm;
  var raw = await rpc(4663, "eth_getBalance", [source, "latest"]);
  if (BigInt(raw || "0x0") > 0n) { logLine("RH gas ok"); return true; }
  logLine("Robinhood gas is 0 — hopping 0.0002 ETH from Base");
  var q = await relayQuote({
    user: source,
    originChainId: 8453,
    originCurrency: ZERO,
    destinationChainId: 4663,
    destinationCurrency: ZERO,
    amount: "200000000000000",
    tradeType: "EXACT_INPUT",
    recipient: source
  });
  await runSteps(q);
  logLine("RH gas hop submitted");
  return false;
}
async function solLamports() {
  var bal = await solRpc("getBalance", [execPools().sol]);
  return Number((bal && bal.value) || bal || 0);
}
async function solTokenAtoms(mint) {
  var source = execPools().sol;
  var res = await solRpc("getTokenAccountsByOwner", [source, { mint: mint }, { encoding: "jsonParsed" }]);
  var rows = (res && res.value) || [];
  if (!rows.length) {
    var programs = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
    for (var i = 0; i < programs.length; i++) {
      res = await solRpc("getTokenAccountsByOwner", [source, { programId: programs[i] }, { encoding: "jsonParsed" }]);
      rows = ((res && res.value) || []).filter(function (row) {
        var info = (((row.account || {}).data || {}).parsed || {}).info || {};
        return info.mint === mint;
      });
      if (rows.length) break;
    }
  }
  if (!rows.length) return "0";
  var info = (((rows[0].account || {}).data || {}).parsed || {}).info || {};
  return String((info.tokenAmount || {}).amount || "0");
}
function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}
async function waitForSolUsdc(minAtoms, maxWaitMs) {
  var until = Date.now() + Math.max(0, Number(maxWaitMs || 0));
  while (Date.now() <= until) {
    var have = BigInt(await solTokenAtoms(USDC_SOL));
    if (have >= BigInt(minAtoms)) return have;
    await delay(1500);
  }
  return BigInt(await solTokenAtoms(USDC_SOL));
}
async function bridgeBaseUsdcToSolUsdc(amountAtoms) {
  var ctx = executionContext(792703809);
  logLine("bridge Base USDC -> Solana USDC for unified SOL execution");
  var q = await relayQuote({
    user: ctx.sourceAddress,
    originChainId: 8453,
    originCurrency: USDC,
    destinationChainId: 792703809,
    destinationCurrency: USDC_SOL,
    amount: String(amountAtoms),
    tradeType: "EXACT_INPUT",
    recipient: ctx.destinationAddress
  });
  var hash = await runSteps(q, String(amountAtoms));
  if (q.requestId) {
    savePendingBridge({
      requestId: q.requestId,
      checkEndpoint: q.checkEndpoint || "",
      direction: "base_to_sol",
      amountAtoms: String(amountAtoms),
      createdAt: Date.now()
    });
  }
  logLine("bridge submitted " + hash);
  return { hash: hash, requestId: q.requestId || "", checkEndpoint: q.checkEndpoint || "" };
}
async function bridgeSolUsdcToBaseUsdc(amountAtoms) {
  logLine("bridge Solana USDC -> Base USDC to recycle reserve");
  var q = await relayQuote({
    user: execPools().sol,
    originChainId: 792703809,
    originCurrency: USDC_SOL,
    destinationChainId: 8453,
    destinationCurrency: USDC,
    amount: String(amountAtoms),
    tradeType: "EXACT_INPUT",
    recipient: execPools().evm
  });
  var hash = await runSteps(q, String(amountAtoms));
  if (q.requestId) {
    savePendingBridge({
      requestId: q.requestId,
      checkEndpoint: q.checkEndpoint || "",
      direction: "sol_to_base",
      amountAtoms: String(amountAtoms),
      createdAt: Date.now()
    });
  }
  logLine("reverse bridge submitted " + hash);
  return { hash: hash, requestId: q.requestId || "", checkEndpoint: q.checkEndpoint || "" };
}
async function ensureSolUsdcLiquidity(amountAtoms, reserveAtoms) {
  var need = BigInt(amountAtoms || "0");
  var reserve = BigInt(reserveAtoms || "0");
  var have = await unifiedUsdcAtoms();
  if (have.total < need) {
    throw new Error("Insufficient USDC total (Sol+Base) for this buy");
  }
  var target = need + reserve;
  if (have.sol >= target) return have.sol;
  var shortfall = target - have.sol;
  if (have.base < shortfall) shortfall = have.base;
  if (shortfall > 0n) {
    var bridge = await bridgeBaseUsdcToSolUsdc(shortfall.toString());
    if (bridge.requestId) {
      var settled = await waitForRelayCompletion(bridge.requestId, bridge.checkEndpoint, 45000);
      if (!settled || settled.status !== "success") {
        throw new Error("Bridge pending: Relay has not settled Base->Sol yet.");
      }
    }
  }
  var minNeed = need;
  var haveAfter = await waitForSolUsdc(minNeed.toString(), 15000);
  if (haveAfter < minNeed) {
    throw new Error("Bridge pending: Solana USDC not ready on " + execPools().sol + ". Retry in a few seconds.");
  }
  return haveAfter;
}
function hotReserveAtoms() {
  var keepUsd = Number((document.getElementById("keepUsd") || {}).value || 0);
  var sizeUsd = Number((document.getElementById("sizeUsd") || {}).value || 0);
  return BigInt(Math.max(0, Math.floor((keepUsd + sizeUsd) * 1e6)));
}
async function buyViaSolanaUsdcUnified(mint, symbol, amountAtoms) {
  var solExec = execPools().sol;
  var keepUsd = Number((document.getElementById("keepUsd") || {}).value || 0);
  var reserveAtoms = String(Math.max(0, Math.floor(keepUsd * 1e6)));
  await ensureSolUsdcLiquidity(amountAtoms, reserveAtoms);

  if ((await solLamports()) < 500000) {
    throw new Error("No SOL gas on " + solExec + " — Solana buy blocked");
  }

  logLine("Jupiter buy unified SOL wallet $" + symbol);
  var quote = await fetch(
    "https://lite-api.jup.ag/swap/v1/quote?inputMint=" + USDC_SOL + "&outputMint=" + mint + "&amount=" + amountAtoms + "&slippageBps=150"
  ).then(function (r) { return r.json(); });
  if (!quote || !quote.outAmount) throw new Error(quote.error || "no Jupiter route");

  var swap = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: solExec, wrapAndUnwrapSol: false, dynamicComputeUnitLimit: true })
  }).then(function (r) { return r.json(); });
  if (!swap.swapTransaction) throw new Error(swap.error || "no swap tx");
  try {
    return await signSendSol(b64ToHex(swap.swapTransaction));
  } catch (err) {
    blockRouteMint(mint, symbol, isRouteSimulationError(err) ? "solana route simulation" : (err && err.message ? err.message : "solana buy failed"));
    return null;
  }
}
async function buyViaRelayFromSolUsdc(mint, symbol, toChain, amountAtoms) {
  var ctx = executionContext(toChain);
  var keepUsd = Number((document.getElementById("keepUsd") || {}).value || 0);
  var reserveAtoms = String(Math.max(0, Math.floor(keepUsd * 1e6)));
  await ensureSolUsdcLiquidity(amountAtoms, reserveAtoms);
  if ((await solLamports()) < 500000) {
    throw new Error("No SOL gas on " + ctx.sourceAddress + " — cross-chain buy blocked");
  }
  var q = await relayQuote({
    user: ctx.sourceAddress,
    originChainId: 792703809,
    originCurrency: USDC_SOL,
    destinationChainId: Number(toChain),
    destinationCurrency: mint,
    amount: String(amountAtoms),
    tradeType: "EXACT_INPUT",
    recipient: ctx.destinationAddress
  });
  try {
    return await runSteps(q, String(amountAtoms));
  } catch (err) {
    blockRouteMint(mint, symbol, isRouteSimulationError(err) ? "relay route simulation" : (err && err.message ? err.message : "relay buy failed"));
    return null;
  }
}
async function sellSolana(pos) {
  var atoms = await solTokenAtoms(pos.mint);
  if (atoms === "0") throw new Error("No $" + (pos.symbol || "token") + " in the Solana pool");
  var lamports = await solLamports();
  if (lamports < 500000) throw new Error("Need SOL gas on " + execPools().sol);
  logLine("Jupiter sell $" + (pos.symbol || "") + " " + atoms);
  var quote = await fetch("https://lite-api.jup.ag/swap/v1/quote?inputMint=" + pos.mint + "&outputMint=" + USDC_SOL + "&amount=" + atoms + "&slippageBps=150").then(function (r) { return r.json(); });
  if (!quote || !quote.outAmount) throw new Error(quote.error || "no Jupiter route");
  var swap = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: execPools().sol, wrapAndUnwrapSol: false, dynamicComputeUnitLimit: true })
  }).then(function (r) { return r.json(); });
  if (!swap.swapTransaction) throw new Error(swap.error || "no swap tx");
  var sig = await signSendSol(b64ToHex(swap.swapTransaction));
  if (typeof recordHistory === "function") recordHistory({ type: "sell", usd: Number(quote.outAmount || 0) / 1e6, net: "solana", dest: pos.mint, note: pos.symbol });
  logLine("sold $" + (pos.symbol || "") + " → " + (Number(quote.outAmount) / 1e6).toFixed(2) + " USDC on Solana");
  return sig;
}
window.getRelayStatus = relayStatus;
window.waitForRelayCompletion = waitForRelayCompletion;
window.primeExecutionHub = async function (opts) {
  opts = opts || {};
  var now = Date.now();
  if (primePromise) return primePromise;
  if (!opts.force && now - lastPrimeAt < 8000) return null;
  primePromise = (async function () {
    var target = hotReserveAtoms();
    if (target <= 0n) return { status: "idle", reason: "no-target" };
    var pending = loadPendingBridge();
    if (pending && pending.direction === "base_to_sol" && pending.requestId) {
      var pendingStatus = await relayStatus(pending.requestId, pending.checkEndpoint || "");
      if (pendingStatus && pendingStatus.status === "success") {
        savePendingBridge(null);
      } else {
        return pendingStatus;
      }
    }
    var balances = await unifiedUsdcAtoms();
    if (balances.sol >= target || balances.base <= 0n) return { status: "ready", sol: balances.sol.toString(), base: balances.base.toString() };
    var shortfall = target - balances.sol;
    if (shortfall > balances.base) shortfall = balances.base;
    if (shortfall <= 0n) return { status: "ready", sol: balances.sol.toString(), base: balances.base.toString() };
    var bridge = await bridgeBaseUsdcToSolUsdc(shortfall.toString());
    if (opts.wait && bridge.requestId) return await waitForRelayCompletion(bridge.requestId, bridge.checkEndpoint, 45000);
    return { status: bridge.requestId ? "pending" : "submitted", requestId: bridge.requestId || "", hash: bridge.hash };
  })();
  try {
    return await primePromise;
  } finally {
    lastPrimeAt = Date.now();
    primePromise = null;
  }
};
window.reverseExecutionBridge = async function (amountUsd) {
  if (!window.BUON_TK) throw new Error("Turnkey not ready");
  var amountAtoms;
  if (amountUsd == null || amountUsd === "") {
    amountAtoms = await solTokenAtoms(USDC_SOL);
  } else {
    amountAtoms = String(Math.max(0, Math.floor(Number(amountUsd) * 1e6)));
  }
  if (!amountAtoms || amountAtoms === "0") throw new Error("No Solana USDC to bridge back");
  var bridge = await bridgeSolUsdcToBaseUsdc(amountAtoms);
  if (bridge.requestId) return await waitForRelayCompletion(bridge.requestId, bridge.checkEndpoint, 45000);
  return bridge;
};

window.deskBuy = window.proposeBuy = async function (mint, symbol, _auto, chain) {
  try {
    if (!window.BUON_TK) throw new Error("Turnkey not ready");
    var toChain = destChain(chain, mint);
    var ctx = executionContext(toChain);
    if (!mint) throw new Error("no mint");
    if (isRouteBlocked(mint)) {
      logLine("skip $" + (symbol || "?") + " known-bad route");
      return null;
    }
    var size = Number((document.getElementById("sizeUsd") || {}).value || 10);
    var amount = String(Math.floor(size * 1e6));
    logLine("exec " + ctx.sourceAddress.slice(0, 8) + "... Solana USDC hub → chain " + toChain + " token $" + symbol);
    var lastHash = "";
    if (Number(toChain) === 792703809) {
      lastHash = await buyViaSolanaUsdcUnified(mint, symbol, amount);
    } else {
      lastHash = await buyViaRelayFromSolUsdc(mint, symbol, toChain, amount);
    }
    if (typeof recordHistory === "function") recordHistory({ type: "buy", usd: size, net: String(chain || toChain), dest: mint, note: symbol });
    if (typeof recordPosition === "function" && lastHash) recordPosition({ mint: mint, symbol: symbol, usdIn: size, chain: String(chain || ""), sig: lastHash });
    logLine("buy $" + symbol + " submitted");
    if (typeof window.primeExecutionHub === "function") window.primeExecutionHub({ wait: false }).catch(function (err) { logLine("hub prime: " + (err.message || err)); });
    if (typeof refreshBalance === "function") refreshBalance();
  } catch (err) {
    logLine("swap: " + (err.message || err));
  }
};

window.deskSell = async function (pos) {
  if (!pos || !pos.mint) throw new Error("no position");
  if (!window.BUON_TK) throw new Error("Turnkey not ready");
  if (String(pos.mint).indexOf("0x") !== 0) return sellSolana(pos);
  var fromChain = destChain(pos.chain, pos.mint);
  if (fromChain === 4663) {
    var rh = BigInt(await rpc(4663, "eth_getBalance", [execPools().evm, "latest"]) || "0x0");
    if (rh === 0n) {
      await topUpRhGas();
      throw new Error("RH gas hop sent. Wait 20s, flatten runs again.");
    }
  }
  var atoms = await evmTokenAtoms(pos.mint, fromChain);
  if (atoms === 0n) throw new Error("No $" + (pos.symbol || "token") + " in the EVM pool");
  logLine("selling $" + (pos.symbol || "") + " → Base USDC");
  var q = await relayQuote({
    user: execPools().evm,
    originChainId: fromChain,
    originCurrency: pos.mint,
    destinationChainId: 8453,
    destinationCurrency: USDC,
    amount: atoms.toString(),
    tradeType: "EXACT_INPUT",
    recipient: execPools().evm
  });
  var hash = await runSteps(q, atoms.toString());
  if (typeof recordHistory === "function") recordHistory({ type: "sell", usd: Number(pos.valueUsd || pos.usdIn || 0), net: String(pos.chain || fromChain), dest: pos.mint, note: pos.symbol });
  if (typeof refreshBalance === "function") setTimeout(refreshBalance, 4000);
  logLine("sell $" + (pos.symbol || "") + " submitted " + hash);
  return hash;
};

window.executionWalletContext = function () {
  var ctx = executionContext(792703809);
  return {
    sourceChainId: ctx.sourceChainId,
    sourceToken: ctx.sourceToken,
    sourceAddress: ctx.sourceAddress,
    destinationChainId: ctx.destinationChainId,
    destinationAddress: ctx.destinationAddress,
    solExecutionAddress: ctx.solExecutionAddress,
    unifiedSource: "All deposited USDC is normalized to Solana USDC via Base->Sol bridge when needed"
  };
};

window.checkExecutionRoutes = async function (mintByChain) {
  var defaults = {
    ethereum: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    robinhood: ZERO,
    solana: USDC_SOL,
    bnb: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    base: USDC,
    monad: ZERO
  };
  var plan = mintByChain || defaults;
  var amount = "1000000";
  var out = [];
  for (var key in plan) {
    if (!Object.prototype.hasOwnProperty.call(plan, key)) continue;
    try {
      var chainId = destChain(key, plan[key]);
      if (chainId === 792703809) {
        out.push({ chain: key, chainId: chainId, ok: true, mode: "jupiter" });
        continue;
      }
      await relayQuote({
        user: execPools().sol,
        originChainId: 792703809,
        originCurrency: USDC_SOL,
        destinationChainId: chainId,
        destinationCurrency: plan[key],
        amount: amount,
        tradeType: "EXACT_INPUT",
        recipient: chainId === 792703809 ? execPools().sol : execPools().evm
      });
      out.push({ chain: key, chainId: chainId, ok: true, mode: "relay-from-sol-usdc" });
    } catch (err) {
      out.push({ chain: key, chainId: destChain(key, plan[key]), ok: false, error: err.message || String(err) });
    }
  }
  return out;
};
