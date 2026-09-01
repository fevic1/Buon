import { Transaction } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const POOL = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
const POOL_SOL = "8ZGuiQZzb6BMDeWjzPzowr6B839ftaJS15ihoscfqEk4";
const RPC = {
  8453: ["https://mainnet.base.org", "https://base.llamarpc.com", "https://base.publicnode.com"],
  1: ["https://cloudflare-eth.com"],
  56: ["https://bsc-dataseed.binance.org"],
  4663: ["https://rpc.mainnet.chain.robinhood.com"]
};
const CHAIN = {
  ethereum: 1, eth: 1,
  base: 8453,
  bsc: 56, bnb: 56, binance: 56,
  solana: 792703809, sol: 792703809,
  robinhood: 4663, rh: 4663
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
      var res = await fetch(urls[i], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params })
      });
      var data = await res.json();
      if (data.error) { last = data.error.message; continue; }
      return data.result;
    } catch (e) { last = e.message || String(e); }
  }
  throw new Error(last);
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
    parameters: {
      signWith: POOL,
      unsignedTransaction: raw,
      type: "TRANSACTION_TYPE_ETHEREUM"
    }
  });
  var signed =
    (act && act.activity && act.activity.result && act.activity.result.signTransactionResult && act.activity.result.signTransactionResult.signedTransaction) ||
    (act && act.signedTransaction);
  if (!signed) throw new Error("no signed tx");
  if (signed.indexOf("0x") !== 0) signed = "0x" + signed;
  var hash = await rpc(chainId, "eth_sendRawTransaction", [signed]);
  logLine("sent " + hash);
  return hash;
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
  var res = await fetch("https://api.relay.link/quote/v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  var q = await res.json();
  if (q.message || q.error) throw new Error(q.message || q.error);
  var txs = [];
  (q.steps || []).forEach(function (s) {
    (s.items || []).forEach(function (it) {
      if (it.data && it.data.to && it.data.data) txs.push(it.data);
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
    if (String(tx.data || "").indexOf("0x095ea7b3") === 0) {
      var spender = "0x" + String(tx.data).slice(34, 74);
      var token = tx.to;
      var have = await allowance(token, spender, chainId);
      if (amountHint && have >= BigInt(amountHint)) { logLine("allowance ok"); continue; }
    }
    lastHash = await signSend(chainId, tx.to, tx.data, tx.value || 0);
  }
  return lastHash;
}

window.deskBuy = window.proposeBuy = async function (mint, symbol, _auto, chain) {
  try {
    if (!window.BUON_TK) throw new Error("Turnkey not ready");
    var eth = BigInt(await rpc(8453, "eth_getBalance", [POOL, "latest"]));
    if (eth === 0n) throw new Error("Pool has 0 ETH on Base. Send a little ETH to 0xB1AC… for gas.");
    var size = Number((document.getElementById("sizeUsd") || {}).value || 10);
    var amount = String(Math.floor(size * 1e6));
    var toChain = destChain(chain, mint);
    if (!mint) throw new Error("no mint");
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
    if (typeof recordPosition === "function" && lastHash) {
      recordPosition({ mint: mint, symbol: symbol, usdIn: size, chain: String(chain || ""), sig: lastHash });
    }
    logLine("buy $" + symbol + " submitted");
    if (typeof refreshBalance === "function") refreshBalance();
  } catch (err) {
    logLine("swap: " + (err.message || err));
  }
};

window.deskSell = async function (pos) {
  if (!pos || !pos.mint) throw new Error("no position");
  if (!window.BUON_TK) throw new Error("Turnkey not ready");
  var fromChain = destChain(pos.chain, pos.mint);
  if (Number(fromChain) === 792703809 || String(pos.mint).indexOf("0x") !== 0) {
    throw new Error("Solana close is not signed yet — USDC is still in $" + (pos.symbol || "token"));
  }
  var atoms = await evmTokenAtoms(pos.mint, fromChain);
  if (atoms === 0n) throw new Error("No $" + (pos.symbol || "token") + " in the pool to return");
  logLine("selling $" + (pos.symbol || "") + " " + atoms.toString() + " → Base USDC");
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
