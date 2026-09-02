from __future__ import annotations

import json
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from loguru import logger

from src.config import settings
from src.risk_layer import HardRiskLayer
from src.tape import market_page


def _ts_now() -> float:
    return time.time()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _f(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def _alert_side(alert: dict[str, Any]) -> str:
    side = str(alert.get("type") or alert.get("alertType") or "").lower()
    if side in {"buy", "sell"}:
        return side
    text = str(alert.get("text") or "").lower()
    if " sell" in text or "sold" in text:
        return "sell"
    if " buy" in text or "bought" in text:
        return "buy"
    return "unknown"


def _token_symbol(alert: dict[str, Any]) -> str:
    return str(alert.get("token") or alert.get("symbol") or "?").lstrip("$").upper()


def _token_address(alert: dict[str, Any]) -> str:
    return str(alert.get("tokenAddress") or alert.get("address") or "").strip()


def _event_price(alert: dict[str, Any], usd_value: float) -> float:
    for key in ("priceUsd", "tokenPriceUsd", "price"):
        price = _f(alert.get(key), 0.0)
        if price > 0:
            return price
    amount = _f(alert.get("amount"), 0.0)
    if amount > 0 and usd_value > 0:
        return usd_value / amount
    return 0.0


@dataclass
class TraderStats:
    rank: int = 999
    pnl_usd: float = 0.0
    trades: int = 0
    wins: int = 0
    losses: int = 0
    total_entry_lag: float = 0.0
    lag_count: int = 0

    @property
    def weight(self) -> float:
        rank_score = 1.0 / max(1, self.rank)
        pnl_score = _clamp(self.pnl_usd / 500000.0)
        winrate = self.wins / max(1, self.wins + self.losses)
        timing = 1.0 - _clamp((self.total_entry_lag / max(1, self.lag_count)) / 120.0)
        return (rank_score * 0.35) + (pnl_score * 0.25) + (winrate * 0.25) + (timing * 0.15)


@dataclass
class TokenState:
    symbol: str
    address: str
    chain: str
    last_price: float = 0.0
    last_price_ts: float = 0.0
    events: deque[dict[str, Any]] = field(default_factory=deque)
    unique_buyers: set[str] = field(default_factory=set)
    unique_sellers: set[str] = field(default_factory=set)


@dataclass
class Position:
    key: str
    symbol: str
    address: str
    chain: str
    entry_price: float
    entry_ts: float
    notional_usd: float
    qty: float
    opportunity_score: float
    safety_score: float
    trailing_stop: float
    peak_price: float
    fill_price: float
    entry_latency_ms: float
    remaining_qty: float
    took_tp1: bool = False


class TradeRecorder:
    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, event: dict[str, Any]) -> None:
        payload = dict(event)
        payload.setdefault("ts", _iso_now())
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, separators=(",", ":")) + "\n")


class SnatchBot:
    """Standalone SNATCH meme profit-snatcher strategy core.

    This runtime is execution-intent driven. It does not custody keys or submit
    wallet transactions directly. It emits entry/exit intents with strict
    safety and short-hold profit protection.
    """

    def __init__(self) -> None:
        self.traders: dict[str, TraderStats] = {}
        self.tokens: dict[str, TokenState] = {}
        self.positions: dict[str, Position] = {}
        self.cooldown_until: dict[str, float] = defaultdict(float)
        self.discard_counts: dict[str, int] = defaultdict(int)
        self.risk = HardRiskLayer()
        self.recorder = TradeRecorder(settings.snatch_state_file)
        self._capital_ceiling = max(0.0, settings.snatch_capital_per_trade_usd * settings.snatch_max_positions)
        self._capital_available = self._capital_ceiling

    def _release_capital(self, pos: Position, exit_price: float, qty_sold: float) -> tuple[float, float]:
        if qty_sold <= 0 or pos.qty <= 0:
            return 0.0, 0.0
        sold = min(qty_sold, pos.remaining_qty)
        principal = pos.notional_usd * (sold / pos.qty)
        pnl = (exit_price - pos.entry_price) * sold
        self._capital_available = min(self._capital_ceiling, max(0.0, self._capital_available + principal + pnl))
        return principal, pnl

    def _discard(self, reason: str) -> None:
        self.discard_counts[reason] += 1

    def set_leaders(self, rows: list[dict[str, Any]]) -> None:
        next_map: dict[str, TraderStats] = {}
        for row in rows:
            handle = str(row.get("handle") or "").lstrip("@")
            if not handle:
                continue
            prior = self.traders.get(handle, TraderStats())
            next_map[handle] = TraderStats(
                rank=int(row.get("rank") or 999),
                pnl_usd=_f(row.get("pnlUsd"), prior.pnl_usd),
                trades=int(row.get("trades") or prior.trades),
                wins=prior.wins,
                losses=prior.losses,
                total_entry_lag=prior.total_entry_lag,
                lag_count=prior.lag_count,
            )
        self.traders = next_map

    def on_alert(self, alert: dict[str, Any]) -> list[dict[str, Any]]:
        if not settings.snatch_enabled:
            return []

        event_ts = _f(alert.get("timestamp") or alert.get("ts") or alert.get("createdAt"), _ts_now())
        if event_ts > 1e12:
            event_ts = event_ts / 1000.0
        side = _alert_side(alert)
        if side not in {"buy", "sell"}:
            return []

        trader = str(alert.get("trader") or "").lstrip("@")
        symbol = _token_symbol(alert)
        address = _token_address(alert)
        chain = str(alert.get("chain") or "solana").lower()
        usd_value = _f(alert.get("usdValue"), 0.0)
        price = _event_price(alert, usd_value)

        if not address and symbol == "?":
            return []

        key = f"{chain}:{address or symbol}"
        token = self.tokens.get(key)
        if token is None:
            token = TokenState(symbol=symbol, address=address, chain=chain)
            self.tokens[key] = token

        if price > 0:
            token.last_price = price
            token.last_price_ts = event_ts

        token.events.append(
            {
                "ts": event_ts,
                "side": side,
                "trader": trader,
                "usd": usd_value,
                "price": price,
            }
        )
        self._prune(token)

        if side == "buy":
            if trader:
                token.unique_buyers.add(trader)
        else:
            if trader:
                token.unique_sellers.add(trader)

        outputs: list[dict[str, Any]] = []

        if key in self.positions:
            decision = self._profit_and_emergency(key, token)
            if decision is not None:
                outputs.append(decision)
            return outputs

        decision = self._entry_decision(key, token, alert)
        if decision is not None:
            outputs.append(decision)

        return outputs

    def _prune(self, token: TokenState) -> None:
        horizon = settings.snatch_flow_window_seconds
        cutoff = _ts_now() - horizon
        while token.events and token.events[0]["ts"] < cutoff:
            token.events.popleft()

    def _flow_metrics(self, token: TokenState) -> dict[str, float]:
        buy_usd = 0.0
        sell_usd = 0.0
        buy_count = 0
        sell_count = 0
        weighted_buyers = 0.0

        for event in token.events:
            side = event["side"]
            usd = max(0.0, _f(event.get("usd"), 0.0))
            trader = str(event.get("trader") or "")
            weight = self.traders.get(trader, TraderStats()).weight if trader else 0.0
            if side == "buy":
                buy_usd += usd
                buy_count += 1
                weighted_buyers += weight
            elif side == "sell":
                sell_usd += usd
                sell_count += 1

        total = buy_usd + sell_usd
        flow_ratio = (buy_usd / total) if total > 0 else 0.5

        if len(token.events) >= 4:
            half = max(1, len(token.events) // 2)
            first = list(token.events)[:half]
            second = list(token.events)[half:]
            first_buy = sum(_f(x.get("usd"), 0.0) for x in first if x.get("side") == "buy")
            second_buy = sum(_f(x.get("usd"), 0.0) for x in second if x.get("side") == "buy")
            buy_velocity = _clamp((second_buy - first_buy) / max(1.0, first_buy + second_buy))
        else:
            buy_velocity = 0.0

        price_accel = 0.0
        if len(token.events) >= 3:
            priced = [x for x in token.events if _f(x.get("price"), 0.0) > 0]
            if len(priced) >= 3:
                p1 = priced[-3]["price"]
                p2 = priced[-2]["price"]
                p3 = priced[-1]["price"]
                if p1 > 0 and p2 > 0 and p3 > 0:
                    r1 = (p2 - p1) / p1
                    r2 = (p3 - p2) / p2
                    price_accel = _clamp((r2 - r1) * 8 + 0.5)

        liquidity_score = _clamp(total / 20000.0)
        slippage_est = max(0.05, 1.2 - liquidity_score)

        return {
            "buy_usd": buy_usd,
            "sell_usd": sell_usd,
            "buy_count": float(buy_count),
            "sell_count": float(sell_count),
            "flow_ratio": flow_ratio,
            "buy_velocity": buy_velocity,
            "price_accel": price_accel,
            "weighted_buyers": weighted_buyers,
            "liquidity_score": liquidity_score,
            "slippage_est": slippage_est,
            "net_flow": buy_usd - sell_usd,
        }

    def _safety(self, token: TokenState, m: dict[str, float]) -> float:
        known_address = 1.0 if token.address else 0.65
        sellability = _clamp(m["flow_ratio"] + (m["buy_count"] / max(1.0, m["buy_count"] + m["sell_count"])) * 0.3)
        holder_concentration_risk = _clamp((len(token.unique_buyers) <= 2) * 0.6 + (len(token.unique_buyers) <= 1) * 0.4)
        slippage_penalty = _clamp(m["slippage_est"] / max(0.1, settings.snatch_slippage_limit_pct))

        return _clamp(
            (known_address * 0.20)
            + (m["liquidity_score"] * 0.35)
            + (sellability * 0.30)
            + ((1.0 - holder_concentration_risk) * 0.15)
            - (slippage_penalty * 0.10)
        )

    def _opportunity(self, token: TokenState, m: dict[str, float], safety: float) -> tuple[float, dict[str, float]]:
        profitable_weight = _clamp(m["weighted_buyers"] / 5.0)
        trader_score = _clamp(profitable_weight)
        token_discovery = _clamp((m["buy_count"] / 8.0) * 0.5 + m["buy_velocity"] * 0.5)
        momentum = _clamp(m["buy_velocity"] * 0.45 + m["price_accel"] * 0.35 + m["liquidity_score"] * 0.2)
        flow = _clamp(m["flow_ratio"] * 0.55 + _clamp(m["net_flow"] / 20000.0) * 0.45)

        score = (
            trader_score * 0.24
            + token_discovery * 0.18
            + flow * 0.23
            + momentum * 0.25
            + safety * 0.10
        ) * 100.0

        return round(score, 2), {
            "trader": trader_score,
            "token": token_discovery,
            "flow": flow,
            "momentum": momentum,
            "safety": safety,
        }

    def _entry_decision(self, key: str, token: TokenState, alert: dict[str, Any]) -> dict[str, Any] | None:
        now = _ts_now()
        if now < self.cooldown_until.get(key, 0.0):
            self._discard("cooldown")
            return None

        if len(self.positions) >= settings.snatch_max_positions:
            self._discard("max_positions")
            return None

        m = self._flow_metrics(token)
        if m["buy_usd"] < settings.snatch_event_min_usd:
            self._discard("matter_min_buy_usd")
            return None
        if m["buy_count"] < settings.snatch_fast_min_buy_count:
            self._discard("matter_min_buy_count")
            return None
        if len(token.unique_buyers) < settings.snatch_fast_min_unique_buyers:
            self._discard("matter_unique_buyers")
            return None
        if m["weighted_buyers"] < settings.snatch_fast_min_weighted_buyers:
            self._discard("matter_weighted_buyers")
            return None
        if m["flow_ratio"] < settings.snatch_fast_min_flow_ratio:
            self._discard("matter_flow_ratio")
            return None

        risk = self.risk.assess(
            alert=alert,
            token_symbol=token.symbol,
            token_address=token.address,
            chain=token.chain,
            flow_metrics=m,
        )
        if risk.blocked:
            self._discard(f"hard_risk_{risk.reason}")
            self.recorder.record(
                {
                    "event": "DISCARD_INTENT",
                    "symbol": token.symbol,
                    "address": token.address,
                    "chain": token.chain,
                    "reason": f"hard_risk:{risk.reason}",
                    "details": risk.details or {},
                }
            )
            return None

        safety = self._safety(token, m)
        if safety < settings.snatch_min_safety_score:
            self._discard("safety_score")
            return None

        if m["slippage_est"] > settings.snatch_slippage_limit_pct:
            self._discard("safety_slippage")
            return None

        momentum_score = _clamp(m["buy_velocity"] * 0.65 + m["price_accel"] * 0.35)
        if momentum_score < settings.snatch_momentum_min_score:
            self._discard("momentum_gate")
            return None

        score, diag = self._opportunity(token, m, safety)
        if score < settings.snatch_min_opportunity_score:
            self._discard("opportunity_score")
            return None

        price = token.last_price
        if price <= 0:
            self._discard("missing_price")
            return None

        max_liquidity_notional = max(10.0, m["liquidity_score"] * 4000.0)
        notional = min(settings.snatch_capital_per_trade_usd, self._capital_available, max_liquidity_notional)
        if notional <= 0:
            self._discard("no_available_capital")
            return None

        self._capital_available -= notional

        qty = notional / price
        entry_ts = _ts_now()
        trailing_stop = price * (1.0 - settings.snatch_trailing_offset_pct / 100.0)

        pos = Position(
            key=key,
            symbol=token.symbol,
            address=token.address,
            chain=token.chain,
            entry_price=price,
            entry_ts=entry_ts,
            notional_usd=notional,
            qty=qty,
            opportunity_score=score,
            safety_score=safety,
            trailing_stop=trailing_stop,
            peak_price=price,
            fill_price=price,
            entry_latency_ms=max(0.0, (_ts_now() - token.last_price_ts) * 1000.0),
            remaining_qty=qty,
        )
        self.positions[key] = pos

        event = {
            "event": "ENTRY_INTENT",
            "symbol": token.symbol,
            "address": token.address,
            "chain": token.chain,
            "price": round(price, 8),
            "qty": round(qty, 8),
            "notional_usd": round(notional, 2),
            "opportunity_score": score,
            "safety_score": round(safety, 4),
            "entry_latency_ms": round(pos.entry_latency_ms, 1),
            "momentum_score": round(momentum_score, 4),
            "diag": diag,
            "capital_available_after": round(self._capital_available, 2),
            "market_url": market_page(token.chain, token.address),
        }
        self.recorder.record(event)
        logger.success(
            "ENTRY_INTENT {} score={} notional=${} price={} sl={}",
            token.symbol,
            score,
            round(notional, 2),
            round(price, 8),
            round(trailing_stop, 8),
        )
        return event

    def _profit_and_emergency(self, key: str, token: TokenState) -> dict[str, Any] | None:
        pos = self.positions.get(key)
        if pos is None:
            return None

        current = token.last_price
        if current <= 0:
            return None

        pos.peak_price = max(pos.peak_price, current)
        hold_secs = _ts_now() - pos.entry_ts
        pnl_pct = ((current - pos.entry_price) / pos.entry_price) * 100.0

        m = self._flow_metrics(token)
        momentum = _clamp(m["buy_velocity"] * 0.6 + m["price_accel"] * 0.4)

        if (not pos.took_tp1) and pnl_pct >= settings.snatch_tp1_pct:
            tp1_fraction = _clamp(settings.snatch_tp1_fraction, 0.05, 0.95)
            qty_to_sell = min(pos.remaining_qty, pos.qty * tp1_fraction)
            principal, pnl = self._release_capital(pos, current, qty_to_sell)
            pos.remaining_qty -= qty_to_sell
            pos.took_tp1 = True
            pos.trailing_stop = max(pos.trailing_stop, pos.entry_price)
            event = {
                "event": "PARTIAL_EXIT_INTENT",
                "symbol": pos.symbol,
                "address": pos.address,
                "chain": pos.chain,
                "reason": "TP1_SCALP",
                "entry_price": round(pos.entry_price, 8),
                "exit_price": round(current, 8),
                "qty": round(qty_to_sell, 8),
                "remaining_qty": round(pos.remaining_qty, 8),
                "hold_seconds": int(hold_secs),
                "pnl_pct": round(pnl_pct, 4),
                "released_principal_usd": round(principal, 4),
                "realized_pnl_usd": round(pnl, 4),
                "capital_available_after": round(self._capital_available, 2),
            }
            self.recorder.record(event)
            logger.info(
                "PARTIAL_EXIT_INTENT {} reason={} qty={} rem={} pnl={}",
                pos.symbol,
                event["reason"],
                round(qty_to_sell, 6),
                round(pos.remaining_qty, 6),
                round(pnl_pct, 3),
            )
            return event

        reason = None

        if pnl_pct <= -abs(settings.snatch_emergency_stop_pct):
            reason = "EMERGENCY_STOP"
        elif pnl_pct <= -abs(settings.snatch_hard_loss_limit_pct):
            reason = "HARD_LOSS_LIMIT"
        elif pnl_pct >= settings.snatch_tp2_pct:
            reason = "TP2_SCALP"
        elif hold_secs >= settings.snatch_hold_max_seconds:
            reason = "MAX_HOLD_TIMEOUT"
        elif m["flow_ratio"] < 0.48 and m["net_flow"] < 0:
            reason = "BUY_FLOW_REVERSED"
        elif momentum < 0.30:
            reason = "MOMENTUM_DISAPPEARED"
        elif m["liquidity_score"] < 0.28:
            reason = "LIQUIDITY_COLLAPSE"
        elif m["slippage_est"] > settings.snatch_slippage_limit_pct:
            reason = "SLIPPAGE_SPIKE"
        elif pnl_pct >= settings.snatch_rapid_take_profit_pct:
            reason = "RAPID_TAKE_PROFIT"

        if reason is None:
            if pnl_pct >= settings.snatch_trailing_activation_pct:
                trailing = current * (1.0 - settings.snatch_trailing_offset_pct / 100.0)
                if trailing > pos.trailing_stop:
                    pos.trailing_stop = trailing
            if current <= pos.trailing_stop:
                reason = "TRAILING_PROTECT"

        if reason is None:
            return None

        event = {
            "event": "EXIT_INTENT",
            "symbol": pos.symbol,
            "address": pos.address,
            "chain": pos.chain,
            "entry_price": round(pos.entry_price, 8),
            "exit_price": round(current, 8),
            "qty": round(pos.remaining_qty, 8),
            "hold_seconds": int(hold_secs),
            "reason": reason,
            "pnl_pct": round(pnl_pct, 4),
            "gross_pnl_usd": round((current - pos.entry_price) * pos.remaining_qty, 4),
            "entry_latency_ms": round(pos.entry_latency_ms, 1),
            "opportunity_score": pos.opportunity_score,
            "slippage_estimate_pct": round(m["slippage_est"], 4),
        }
        principal, pnl = self._release_capital(pos, current, pos.remaining_qty)
        event["released_principal_usd"] = round(principal, 4)
        event["realized_pnl_usd"] = round(pnl, 4)
        event["capital_available_after"] = round(self._capital_available, 2)
        self.recorder.record(event)
        logger.info(
            "EXIT_INTENT {} reason={} pnl={} hold={}s",
            pos.symbol,
            reason,
            round(pnl_pct, 3),
            int(hold_secs),
        )

        trader = token.events[-1].get("trader") if token.events else ""
        if trader and trader in self.traders:
            stats = self.traders[trader]
            if pnl_pct > 0:
                stats.wins += 1
            else:
                stats.losses += 1
            stats.total_entry_lag += hold_secs
            stats.lag_count += 1

        self.cooldown_until[key] = _ts_now() + settings.snatch_cooldown_seconds
        del self.positions[key]
        return event

    def snapshot(self) -> dict[str, Any]:
        return {
            "ts": _iso_now(),
            "positions": [
                {
                    "symbol": p.symbol,
                    "address": p.address,
                    "entry_price": p.entry_price,
                    "entry_ts": p.entry_ts,
                    "notional_usd": p.notional_usd,
                    "qty": p.qty,
                    "opportunity_score": p.opportunity_score,
                    "safety_score": p.safety_score,
                    "trailing_stop": p.trailing_stop,
                    "peak_price": p.peak_price,
                }
                for p in self.positions.values()
            ],
            "token_count": len(self.tokens),
            "tracked_traders": len(self.traders),
            "discard_counts": dict(self.discard_counts),
            "capital_available": round(self._capital_available, 4),
        }
