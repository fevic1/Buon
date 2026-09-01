from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from math import log1p
from typing import Iterable

from src.config import settings
from src.tape import market_page


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _norm_addr(address: str | None) -> str:
    if not address:
        return ""
    addr = str(address).strip()
    if addr.startswith("0x"):
        return addr.lower()
    return addr


def token_key(symbol: str | None, address: str | None) -> str:
    addr = _norm_addr(address)
    if addr:
        return addr
    return (symbol or "?").lstrip("$").upper()


@dataclass
class Leader:
    handle: str
    rank: int
    pnl_usd: float = 0.0
    volume_usd: float = 0.0
    trades: int = 0
    followers: int = 0
    wallets: dict = field(default_factory=dict)
    weight: float = 0.0


@dataclass
class TokenBook:
    key: str
    symbol: str
    address: str | None = None
    chain: str | None = None
    holders: set[str] = field(default_factory=set)
    holder_value: dict[str, float] = field(default_factory=dict)
    buy_flow_usd: float = 0.0
    sell_flow_usd: float = 0.0
    buy_count: int = 0
    sell_count: int = 0
    last_action: str = ""
    last_trader: str = ""
    last_text: str = ""

    @property
    def overlap(self) -> int:
        return len(self.holders)

    @property
    def net_flow(self) -> float:
        return self.buy_flow_usd - self.sell_flow_usd

    def score(self, leaders: dict[str, Leader]) -> float:
        rank_weight = 0.0
        for handle in self.holders:
            leader = leaders.get(handle)
            if leader:
                rank_weight += leader.weight * log1p(self.holder_value.get(handle, 0))
        flow = log1p(max(self.buy_flow_usd, 0)) - 0.7 * log1p(max(self.sell_flow_usd, 0))
        crowd = self.overlap * 8
        return crowd + rank_weight + flow

    def action(self) -> str:
        if self.sell_count > self.buy_count and self.net_flow < 0:
            return "DISTRIBUTION"
        if self.overlap >= settings.min_overlap and self.net_flow > 0:
            return "CROWDED_BID"
        if self.buy_count >= 2 and self.overlap < settings.min_overlap and self.net_flow > 0:
            return "POTENTIAL"
        if self.buy_count:
            return "WATCH"
        return "HOLD"


class OverlapEngine:
    """Ranks coins by how many top leaders share them, plus live tape."""

    def __init__(self) -> None:
        self.leaders: dict[str, Leader] = {}
        self.tokens: dict[str, TokenBook] = {}
        self.updated_at = ""

    def set_leaders(self, rows: Iterable[dict]) -> None:
        leaders: dict[str, Leader] = {}
        for row in rows:
            handle = (row.get("handle") or "").lstrip("@")
            if not handle:
                continue
            rank = int(row.get("rank") or 999)
            leader = Leader(
                handle=handle,
                rank=rank,
                pnl_usd=float(row.get("pnlUsd") or 0),
                volume_usd=float(row.get("volumeUsd") or 0),
                trades=int(row.get("trades") or 0),
                followers=int(row.get("followers") or 0),
                wallets=row.get("wallets") or {},
                weight=1.0 / max(rank, 1),
            )
            leaders[handle] = leader
            for token in row.get("topTokens") or []:
                if isinstance(token, str) and token.startswith("0x"):
                    self._book(symbol=token[:8], address=token).holders.add(handle)
                elif isinstance(token, str):
                    self._book(symbol=token, address=None).holders.add(handle)
        self.leaders = leaders
        self.updated_at = _now()

    def ingest_holdings(self, handle: str, holdings: Iterable[dict]) -> None:
        if handle not in self.leaders:
            return
        for item in holdings:
            if item["value_usd"] < settings.min_holding_usd:
                continue
            book = self._book(item["symbol"], item.get("address"))
            book.holders.add(handle)
            book.holder_value[handle] = item["value_usd"]

    def ingest_alert(self, alert: dict) -> TokenBook | None:
        trader = (alert.get("trader") or "").lstrip("@")
        symbol = (alert.get("token") or "").lstrip("$")
        address = alert.get("tokenAddress")
        if not symbol and not address:
            return None
        usd = alert.get("usdValue")
        try:
            usd = float(usd) if usd is not None else 0.0
        except (TypeError, ValueError):
            usd = 0.0
        if usd and usd < settings.min_alert_usd:
            return None

        book = self._book(symbol or "?", address, chain=alert.get("chain"))
        side = (alert.get("type") or alert.get("alertType") or "").lower()
        text = alert.get("text") or ""
        if not side:
            lowered = text.lower()
            if "sold" in lowered or "sell" in lowered:
                side = "sell"
            elif "bought" in lowered or "buy" in lowered:
                side = "buy"

        tracked = trader in self.leaders
        if side == "buy":
            book.buy_count += 1
            book.buy_flow_usd += usd
            if tracked:
                book.holders.add(trader)
                book.holder_value[trader] = book.holder_value.get(trader, 0) + usd
        elif side == "sell":
            book.sell_count += 1
            book.sell_flow_usd += usd
            if tracked:
                book.holders.discard(trader)

        book.last_action = side or "alert"
        book.last_trader = trader
        book.last_text = text
        self.updated_at = _now()
        return book

    def ranked(self, limit: int = 20) -> list[dict]:
        rows = []
        for book in self.tokens.values():
            if book.overlap == 0 and book.buy_count == 0:
                continue
            rows.append(
                {
                    "action": book.action(),
                    "score": round(book.score(self.leaders), 3),
                    "symbol": book.symbol,
                    "address": book.address,
                    "chain": book.chain,
                    "overlap": book.overlap,
                    "leaders": sorted(
                        book.holders,
                        key=lambda h: self.leaders[h].rank if h in self.leaders else 999,
                    ),
                    "buy_usd": round(book.buy_flow_usd, 2),
                    "sell_usd": round(book.sell_flow_usd, 2),
                    "net_usd": round(book.net_flow, 2),
                    "last": book.last_text,
                    "market_url": market_page(book.chain, book.address),
                }
            )
        rows.sort(key=lambda r: r["score"], reverse=True)
        return rows[:limit]

    def crowded(self) -> list[dict]:
        return [row for row in self.ranked(50) if row["overlap"] >= settings.min_overlap]

    def potentials(self) -> list[dict]:
        return [row for row in self.ranked(50) if row["action"] == "POTENTIAL"]

    def _book(self, symbol: str, address: str | None, chain: str | None = None) -> TokenBook:
        key = token_key(symbol, address)
        book = self.tokens.get(key)
        if book is None:
            book = TokenBook(key=key, symbol=symbol.lstrip("$") or "?", address=address, chain=chain)
            self.tokens[key] = book
        else:
            if address and not book.address:
                book.address = address
            if chain and not book.chain:
                book.chain = chain
            if symbol and book.symbol in {"?", ""}:
                book.symbol = symbol.lstrip("$")
        return book
