import { Transaction } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ZERO = "0x0000000000000000000000000000000000000000";
const POOL = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
const POOL_SOL = "8ZGuiQZzb6BMDeWjzPzowr6B839ftaJS15ihoscfqEk4";
const SOL_RPC = "https://api.mainnet-beta.solana.com";
const RPC = {
  8453: ["https://base.publicnode.com", "https://base.drpc.org", "https://mainnet.base.org"],
  1: ["https://cloudflare-eth.com"],
  56: ["https://bsc-dataseed.binance.org"],
  4663: ["https://rpc.mainnet.chain.robinhood.com"]
};
const CHAIN = {
  ethereum: 1, eth: 1, base: 8453, bsc: 56, bnb: 56, binance: 56,
  solana: 792703809, sol: 792703809, robinhood: 4663, rh: 4663
};

function logLine(m) { if (typeof log === "function") log(m); }
function destChain(chain, mint) {
  var c = String(chain || "").toLowerCase();
  if (CHAIN[c]) return CHAIN[c];
  if (String(mint || "").indexOf("0x") === 0) return 4663;
  return 792703809;
}
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
  var res = await fetch(SOL_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) });
  var data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}
function b64ToHex(b64) {
  var raw = atob(b64);
  var hex = "";
  for (var i = 0; i < raw.length; i++) hex += raw.charCodeAt(i).toString(16).padStart(2, "0");
  return hex;
}
async function signSend(chainId, to, data, value) {
  var tk = window.BUON_TK;
  if (!tk || !tk.client) throw new Error("Turnkey not ready");
  var nonceHex = await rpc(chainId, "eth_getTransactionCount", [POOL, "pending"]);
  var gasPrice = await rpc(chainId, "eth_gasPrice", []);
  var tx = Transaction.from({
    to: to,
    data: data || "0x",
    value: value || 0,
    gasLimit: 400000n,
    gasPrice: BigInt(gasPrice),
    nonce: Number(nonceHex),
    chainId: chainId,
    type: 0
  });
  var raw = tx.unsignedSerialized.replace(/^0x/, "");
  var act = await tk.client.signTransaction({
    type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
    timestampMs: String(Date.now()),
    organizationId: tk.org,
    parameters: { signWith: POOL, unsignedTransaction: raw, type: "TRANSACTION_TYPE_ETHEREUM" }
  });
  var signed = (act && act.activity && act.activity.result && act.activity.result.signTransactionResult && act.activity.result.signTransactionResult.signedTransaction) || (act && act.signedTransaction);
  if (!signed) throw new Error("no signed tx");
  if (signed.indexOf("0x") !== 0) signed = "0x" + signed;
  var hash = await rpc(chainId, "eth_sendRawTransaction", [signed]);
  logLine("sent " + hash);
  return hash;
}
async function signSendSol(unsignedHex) {
  var tk = window.BUON_TK;
  if (!tk || !tk.client) throw new Error("Turnkey not ready");
  var act = await tk.client.signTransaction({
    type: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
    timestampMs: String(Date.now()),
    organizationId: tk.org,
    parameters: { signWith: POOL_SOL, unsignedTransaction: unsignedHex.replace(/^0x/, ""), type: "TRANSACTION_TYPE_SOLANA" }
  });
  var signed = (act && act.activity && act.activity.result && act.activity.result.signTransactionResult && act.activity.result.signTransactionResult.signedTransaction) || (act && act.signedTransaction);
  if (!signed) throw new Error("no signed sol tx");
  var bytes = signed.replace(/^0x/, "");
  var bin = new Uint8Array(bytes.match(/.{1,2}/g).map(function (b) { return parseInt(b, 16); }));
  var b64 = btoa(String.fromCharCode.apply(null, bin));
  var sig = await solRpc("sendTransaction", [b64, { encoding: "base64", skipPreflight: false }]);
  logLine("sol sent " + sig);
  return sig;
}
async function allowance(token, spender, chainId) {
  var owner = POOL.slice(2).toLowerCase().padStart(64, "0");
  var sp = spender.slice(2).toLowerCase().padStart(64, "0");
  var raw = await rpc(chainId || 8453, "eth_call", [{ to: token, data: "0xdd62ed3e" + owner + sp }, "latest"]);
  return BigInt(raw || "0x0");
}
async function evmTokenAtoms(mint, chainId) {
  var data = "0x70a08231" + POOL.slice(2).toLowerCase().padStart(64, "0");
  var raw = await rpc(chainId, "eth_call", [{ to: mint, data: data }, "latest"]);
  return BigInt(raw || "0x0");
}
async function relayQuote(body) {
  var res = await fetch("https://api.relay.link/quote/v2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  var q = await res.json();
  if (q.message || q.error) throw new Error(q.message || q.error);
  var txs = [];
  (q.steps || []).forEach(function (s) {
    (s.items || []).forEach(function (it) {
      if (it.data && it.data.to) txs.push(it.data);
    });
  });
  if (!txs.length) throw new Error("Relay returned no tx");
  return { tool: "relay", txs: txs };
}
async function runSteps(q, amountHint) {
  var lastHash = "";
  for (var i = 0; i < q.txs.length; i++) {
    var tx = q.txs[i];
    var chainId = Number(tx.chainId || 8453);
    if (tx.data && String(tx.data).indexOf("0x095ea7b3") === 0) {
      var spender = "0x" + String(tx.data).slice(34, 74);
      var have = await allowance(tx.to, spender, chainId);
      if (amountHint && have >= BigInt(amountHint)) { logLine("allowance ok"); continue; }
    }
    lastHash = await signSend(chainId, tx.to, tx.data || "0x", tx.value || 0);
  }
  return lastHash;
}
async function topUpRhGas() {
  var raw = await rpc(4663, "eth_getBalance", [POOL, "latest"]);
  if (BigInt(raw || "0x0") > 0n) { logLine("RH gas ok"); return true; }
  logLine("Robinhood gas is 0 — hopping 0.0002 ETH from Base");
  var q = await relayQuote({
    user: POOL,
    originChainId: 8453,
    originCurrency: ZERO,
    destinationChainId: 4663,
    destinationCurrency: ZERO,
    amount: "200000000000000",
    tradeType: "EXACT_INPUT",
    recipient: POOL
  });
  await runSteps(q);
  logLine("RH gas hop submitted");
  return false;
}
async function solLamports() {
  var bal = await solRpc("getBalance", [POOL_SOL]);
  return Number((bal && bal.value) || bal || 0);
}
async function solTokenAtoms(mint) {
  var res = await solRpc("getTokenAccountsByOwner", [POOL_SOL, { mint: mint }, { encoding: "jsonParsed" }]);
  var rows = (res && res.value) || [];
  if (!rows.length) {
    var programs = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
    for (var i = 0; i < programs.length; i++) {
      res = await solRpc("getTokenAccountsByOwner", [POOL_SOL, { programId: programs[i] }, { encoding: "jsonParsed" }]);
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
async function sellSolana(pos) {
  var atoms = await solTokenAtoms(pos.mint);
  if (atoms === "0") throw new Error("No $" + (pos.symbol || "token") + " in the Solana pool");
  var lamports = await solLamports();
  if (lamports < 500000) {
    throw new Error("MARKET is in 8ZGuiQ… but that address has 0 SOL. Send 0.01 SOL there, then Take profit.");
  }
  logLine("Jupiter sell $" + (pos.symbol || "") + " " + atoms);
  var quote = await fetch("https://lite-api.jup.ag/swap/v1/quote?inputMint=" + pos.mint + "&outputMint=" + USDC_SOL + "&amount=" + atoms + "&slippageBps=150").then(function (r) { return r.json(); });
  if (!quote || !quote.outAmount) throw new Error(quote.error || "no Jupiter route");
  var swap = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: POOL_SOL, wrapAndUnwrapSol: false, dynamicComputeUnitLimit: true })
  }).then(function (r) { return r.json(); });
  if (!swap.swapTransaction) throw new Error(swap.error || "no swap tx");
  var sig = await signSendSol(b64ToHex(swap.swapTransaction));
  if (typeof recordHistory === "function") recordHistory({ type: "sell", usd: Number(quote.outAmount || 0) / 1e6, net: "solana", dest: pos.mint, note: pos.symbol });
  logLine("sold $" + (pos.symbol || "") + " → " + (Number(quote.outAmount) / 1e6).toFixed(2) + " USDC on Solana");
  return sig;
}

window.deskBuy = window.proposeBuy = async function (mint, symbol, _auto, chain) {
  try {
    if (!window.BUON_TK) throw new Error("Turnkey not ready");
    var toChain = destChain(chain, mint);
    if (!mint) throw new Error("no mint");
    if (Number(toChain) === 792703809 && (await solLamports()) < 500000) {
      throw new Error("No SOL gas on 8ZGuiQ… — will not buy another Solana token until 0.01 SOL is there");
    }
    if (Number(toChain) === 4663) {
      var rh = BigInt(await rpc(4663, "eth_getBalance", [POOL, "latest"]) || "0x0");
      if (rh === 0n) {
        logLine("RH gas missing — topping up before buy");
        var ready = await topUpRhGas();
        if (!ready) throw new Error("RH gas hop sent. Wait 30s, then buy again.");
      }
    }
    var size = Number((document.getElementById("sizeUsd") || {}).value || 10);
    var amount = String(Math.floor(size * 1e6));
    logLine("quoting $" + symbol + " Base USDC → " + toChain);
    var q = await relayQuote({
      user: POOL,
      originChainId: 8453,
      originCurrency: USDC,
      destinationChainId: toChain,
      destinationCurrency: mint,
      amount: amount,
      tradeType: "EXACT_INPUT",
      recipient: Number(toChain) === 792703809 ? POOL_SOL : POOL
    });
    logLine(q.tool + " buy · " + q.txs.length + " step(s)");
    var lastHash = await runSteps(q, amount);
    if (typeof recordHistory === "function") recordHistory({ type: "buy", usd: size, net: String(chain || toChain), dest: mint, note: symbol });
    if (typeof recordPosition === "function" && lastHash) recordPosition({ mint: mint, symbol: symbol, usdIn: size, chain: String(chain || ""), sig: lastHash });
    logLine("buy $" + symbol + " submitted");
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
    var ready = await topUpRhGas();
    var rh = BigInt(await rpc(4663, "eth_getBalance", [POOL, "latest"]) || "0x0");
    if (!ready || rh === 0n) throw new Error("RH gas hop sent. Wait 30s, then Take profit again.");
  }
  var atoms = await evmTokenAtoms(pos.mint, fromChain);
  if (atoms === 0n) throw new Error("No $" + (pos.symbol || "token") + " in the EVM pool");
  logLine("selling $" + (pos.symbol || "") + " → Base USDC");
  var q = await relayQuote({
    user: POOL,
    originChainId: fromChain,
    originCurrency: pos.mint,
    destinationChainId: 8453,
    destinationCurrency: USDC,
    amount: atoms.toString(),
    tradeType: "EXACT_INPUT",
    recipient: POOL
  });
  var hash = await runSteps(q, atoms.toString());
  if (typeof recordHistory === "function") recordHistory({ type: "sell", usd: Number(pos.valueUsd || pos.usdIn || 0), net: String(pos.chain || fromChain), dest: pos.mint, note: pos.symbol });
  if (typeof refreshBalance === "function") setTimeout(refreshBalance, 4000);
  logLine("sell $" + (pos.symbol || "") + " submitted " + hash);
  return hash;
};
