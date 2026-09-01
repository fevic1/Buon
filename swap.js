import { Transaction } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const POOL = "0xB1ACDaF72cA6648DdD54F5dB85B9Cf75d58f82b8";
const RPC = {
  8453: ["https://mainnet.base.org", "https://base.llamarpc.com", "https://base.publicnode.com"],
  1: ["https://cloudflare-eth.com"],
  56: ["https://bsc-dataseed.binance.org"]
};
const CHAIN = { ethereum: 1, eth: 1, base: 8453, bsc: 56, bnb: 56 };

function logLine(m) { if (typeof log === "function") log(m); }

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

async function allowance(spender) {
  var owner = POOL.slice(2).toLowerCase().padStart(64, "0");
  var sp = spender.slice(2).toLowerCase().padStart(64, "0");
  var raw = await rpc(8453, "eth_call", [{ to: USDC, data: "0xdd62ed3e" + owner + sp }, "latest"]);
  return BigInt(raw || "0x0");
}

async function approve(spender, amount) {
  var sp = spender.slice(2).toLowerCase().padStart(64, "0");
  var amt = BigInt(amount).toString(16).padStart(64, "0");
  logLine("approve USDC");
  return signSend(8453, USDC, "0x095ea7b3" + sp + amt, 0);
}

async function lifiQuote(fromChain, toChain, toToken, amount, fromAddress) {
  var url = "https://li.quest/v1/quote?fromChain=" + fromChain +
    "&toChain=" + toChain +
    "&fromToken=" + USDC +
    "&toToken=" + encodeURIComponent(toToken) +
    "&fromAmount=" + amount +
    "&fromAddress=" + fromAddress +
    "&slippage=0.03";
  var q = await fetch(url).then(function (r) { return r.json(); });
  if (q.message || q.error) throw new Error(q.message || q.error);
  return q;
}

window.deskBuy = window.proposeBuy = async function (mint, symbol, _auto, chain) {
  try {
    if (!window.BUON_TK) throw new Error("Turnkey not ready");
    var size = Number((document.getElementById("sizeUsd") || {}).value || 10);
    var amount = String(Math.floor(size * 1e6));
    var c = String(chain || "base").toLowerCase();
    var toChain = CHAIN[c] || (String(mint || "").indexOf("0x") === 0 ? 8453 : 1151111081153331201);
    var fromChain = 8453;
    var toToken = mint;
    if (!toToken) throw new Error("no mint");
    logLine("quoting $" + symbol + " for " + size + " USDC");
    var q = await lifiQuote(fromChain, toChain, toToken, amount, POOL);
    var tx = q.transactionRequest;
    if (!tx || !tx.to || !tx.data) throw new Error("no executable route");
    var spend = q.estimate && q.estimate.approvalAddress;
    if (spend) {
      var have = await allowance(spend);
      if (have < BigInt(amount)) await approve(spend, amount);
    }
    var hash = await signSend(Number(tx.chainId || 8453), tx.to, tx.data, tx.value || 0);
    if (typeof recordHistory === "function") recordHistory({ type: "buy", usd: size, net: c, dest: mint, note: symbol });
    logLine("buy $" + symbol + " " + hash);
  } catch (err) {
    logLine("swap: " + (err.message || err));
  }
};
