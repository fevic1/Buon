# Buon

Social leader tape in the browser. No terminal.

**https://fevic1.github.io/Buon/**

Connect Phantom. Watch ranked wallets. Cluster identical coins. Sign your own Jupiter swap. Buon never logs into a custodial trading app and never holds your keys.

## Use it

1. Open the Pages URL.
2. Connect Phantom.
3. Read the 24h leaderboard, live feed, identical-coin book, and potential book.
4. Hit **Buy** on a Solana mint — Phantom pops, you sign.
5. Optional: toggle “Propose Solana buys on crowded / potential”. Still requires a wallet popup each time.

## Standalone SNATCH Runtime

The Python runtime in src now includes a standalone SNATCH meme profit-snatcher pipeline:

- live SNATCH event feed ingestion
- does-this-matter hard gate (fast discard)
- pluggable hard-risk layer before scoring (token age, liquidity lock, honeypot flags)
- profitable trader tracking and weighting
- token discovery via buy-flow acceleration
- instant safety/slippage gates
- separate fast momentum gate before execute
- entry intent generation with notional caps
- micro-scalp exits: TP1 +2.5%, TP2 +4.0%, emergency -1.5%
- rapid take-profit and trailing protection
- emergency exit intents on flow/liquidity/momentum failure
- position limits and cooldown controls
- capital recycling after partial/full exits
- trade telemetry recorder

This runtime emits ENTRY_INTENT and EXIT_INTENT events only and does not execute custodial trades.
Events are written to data/snatch_trades.jsonl.

Execution routing for desk trades:

- unified source hub is Solana USDC on the execution SOL wallet
- if Solana USDC is short, the flow tops up by bridging Base USDC reserve -> Solana USDC
- Solana buys execute on Jupiter from SOL wallet; EVM buys route from Solana USDC hub through Relay
- destination signer is execution SOL address for Solana routes, execution EVM address for EVM routes

Run locally:

1. python3 -m venv .venv
2. source .venv/bin/activate
3. pip install -r requirements.txt
4. cp .env.example .env
5. python -m src

SNATCH tuning env vars include:

- SNATCH_ENABLED=true
- SNATCH_MAX_POSITIONS=4
- SNATCH_CAPITAL_PER_TRADE_USD=300
- SNATCH_EVENT_MIN_USD=220
- SNATCH_FAST_MIN_BUY_COUNT=2
- SNATCH_FAST_MIN_UNIQUE_BUYERS=2
- SNATCH_FAST_MIN_WEIGHTED_BUYERS=0.22
- SNATCH_FAST_MIN_FLOW_RATIO=0.58
- SNATCH_MOMENTUM_MIN_SCORE=0.40
- SNATCH_MIN_OPPORTUNITY_SCORE=72
- SNATCH_HOLD_MAX_SECONDS=180
- SNATCH_TP1_PCT=2.5
- SNATCH_TP1_FRACTION=0.60
- SNATCH_TP2_PCT=4.0
- SNATCH_EMERGENCY_STOP_PCT=1.5
- SNATCH_HARD_LOSS_LIMIT_PCT=1.5
- SNATCH_RISK_PROVIDER=placeholder (or module:your_package.your_module:YourRiskProvider)
- SNATCH_RISK_ENABLED=true
- SNATCH_RISK_STRICT_UNKNOWN=false
- SNATCH_MIN_TOKEN_AGE_MINUTES=10
- SNATCH_REQUIRE_LIQUIDITY_LOCK=false
- SNATCH_MIN_LIQUIDITY_LOCK_PCT=70
- SNATCH_BLOCK_HONEYPOT=true

## GitHub Pages

Settings → Pages → Deploy from a branch → `main` / `/ (root)` → Save.

The desk is `index.html` at the repo root. Wait a minute after each push, then hard-refresh the site.
