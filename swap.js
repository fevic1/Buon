import { Transaction } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ZERO = "0x0000000000000000000000000000000000000000";
const EXEC_EVM_DEFAULT = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
const EXEC_SOL_DEFAULT = "8ZGuiQZzb6BMDeWjzPzowr6B839ftaJS15ihoscfqEk4";
const SOL_RPC = "https://api.mainnet-beta.solana.com";
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

function logLine(m) { if (typeof log === "function") log(m); }
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
  var sig = await solRpc("sendTransaction", [b64, { encoding: "base64", skipPreflight: false }]);
  logLine("sol sent " + sig);
  return sig;
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
async function relayQuote(body) {
  var res = await fetch("https://api.relay.link/quote/v2", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  var q = await res.json();
  if (q.message || q.error) throw new Error(q.message || q.error);
  var txs = [];
  (q.steps || []).forEach(function (s) {
    (s.items || []).forEach(function (it) {
      if (it.data) txs.push(it.data);
    });
  });
  if (!txs.length) throw new Error("Relay returned no tx");
  return { tool: "relay", txs: txs };
}
async function signSendRelaySol(data) {
  if (!window.solanaWeb3) throw new Error("solana web3 missing");
  var web3 = window.solanaWeb3;
  var payer = new web3.PublicKey(execPools().sol);
  var conn = new web3.Connection(SOL_RPC, "confirmed");
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
  logLine("bridge submitted " + hash);
  return hash;
}
async function buyViaSolanaUsdcUnified(mint, symbol, amountAtoms) {
  var solExec = execPools().sol;
  var haveBefore = BigInt(await solTokenAtoms(USDC_SOL));
  if (haveBefore < BigInt(amountAtoms)) {
    await bridgeBaseUsdcToSolUsdc(amountAtoms);
    var haveAfter = await waitForSolUsdc(amountAtoms, 45000);
    if (haveAfter < BigInt(amountAtoms)) {
      throw new Error("Bridge pending: Solana USDC not ready on " + solExec + ". Retry in a few seconds.");
    }
  }

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
  return signSendSol(b64ToHex(swap.swapTransaction));
}
async function buyViaRelayFromSolUsdc(mint, symbol, toChain, amountAtoms) {
  var ctx = executionContext(toChain);
  var haveSolUsdc = BigInt(await solTokenAtoms(USDC_SOL));
  if (haveSolUsdc < BigInt(amountAtoms)) {
    await bridgeBaseUsdcToSolUsdc(amountAtoms);
    var topped = await waitForSolUsdc(amountAtoms, 45000);
    if (topped < BigInt(amountAtoms)) {
      throw new Error("Bridge pending: Solana USDC not ready on " + ctx.sourceAddress + ". Retry in a few seconds.");
    }
  }
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
  return runSteps(q, String(amountAtoms));
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

window.deskBuy = window.proposeBuy = async function (mint, symbol, _auto, chain) {
  try {
    if (!window.BUON_TK) throw new Error("Turnkey not ready");
    var toChain = destChain(chain, mint);
    var ctx = executionContext(toChain);
    if (!mint) throw new Error("no mint");
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
  return executionContext(792703809);
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
