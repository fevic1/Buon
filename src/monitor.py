from __future__ import annotations

import asyncio
import json
from typing import Any

import websockets
from loguru import logger

from src.config import settings
from src.ranker import OverlapEngine
from src.tape import TapeClient, parse_holding


def _print_table(title: str, rows: list[dict], limit: int = 8) -> None:
    logger.info(f"--- {title} ({len(rows)}) ---")
    for row in rows[:limit]:
        leaders = ",".join(f"@{h}" for h in row["leaders"][:6])
        logger.info(
            f"{row['action']:13} {row['symbol']:12} score={row['score']:<7} "
            f"overlap={row['overlap']} net=${row['net_usd']:<10} {leaders}"
        )
        if row.get("market_url"):
            logger.info(f"              {row['market_url']}")


class BuonMonitor:
    def __init__(self) -> None:
        self.client = TapeClient()
        self.engine = OverlapEngine()

    def bootstrap(self) -> None:
        health = self.client.health()
        logger.info(f"Tape health={health}")
        leaders = self.client.leaderboard()
        if not leaders:
            raise RuntimeError("Leaderboard returned no traders")
        self.engine.set_leaders(leaders)
        logger.success(
            f"Tracking {len(self.engine.leaders)} leaders from {settings.leader_window} board"
        )
        for leader in list(self.engine.leaders.values())[:10]:
            sol = (leader.wallets or {}).get("solana") or "-"
            evm = (leader.wallets or {}).get("evm") or "-"
            logger.info(
                f"#{leader.rank:<3} @{leader.handle:<22} pnl=${leader.pnl_usd:,.0f} "
                f"sol={sol[:6]}… evm={str(evm)[:8]}…"
            )
        self._refresh_portfolios()
        self._seed_alerts()
        self._emit_books()

    def _refresh_portfolios(self) -> None:
        if not settings.has_key:
            logger.warning(
                "No BUON_API_KEY — overlap book uses live alerts + leaderboard only."
            )
            return
        loaded = 0
        for handle in self.engine.leaders:
            try:
                payload = self.client.balances(handle)
            except Exception as exc:
                logger.debug(f"balances @{handle} failed: {exc}")
                continue
            raw_holdings = payload.get("holdings") or []
            parsed = [item for item in (parse_holding(row) for row in raw_holdings) if item]
            self.engine.ingest_holdings(handle, parsed)
            loaded += 1
        logger.success(f"Loaded live holdings for {loaded} leaders")

    def _seed_alerts(self) -> None:
        try:
            alerts = self.client.alerts(limit=80)
        except Exception as exc:
            logger.warning(f"Could not seed alerts: {exc}")
            return
        for alert in alerts:
            self.engine.ingest_alert(alert)
        logger.info(f"Seeded {len(alerts)} recent alerts")

    def _emit_books(self) -> None:
        _print_table("CROWDED / IDENTICAL COINS", self.engine.crowded())
        _print_table("POTENTIAL (early leader flow)", self.engine.potentials())
        _print_table("TOP RANKED ACTIONS", self.engine.ranked())

    async def stream(self) -> None:
        url = self.client.websocket_url()
        logger.info("Connecting live tape")
        if not settings.has_key:
            logger.warning("Keyless websocket is delayed ~60s")
        while True:
            try:
                async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                    async for raw in ws:
                        self._on_message(raw)
            except Exception as exc:
                logger.error(f"Websocket dropped: {exc}")
                await asyncio.sleep(5)

    def _on_message(self, raw: str | bytes) -> None:
        try:
            message: Any = json.loads(raw)
        except json.JSONDecodeError:
            return
        if isinstance(message, dict) and message.get("type") == "welcome":
            logger.info(f"Tape connected realtime={message.get('realtime')} delay={message.get('delaySeconds')}")
            return
        alert = message.get("alert") if isinstance(message, dict) and "alert" in message else message
        if not isinstance(alert, dict):
            return
        if alert.get("type") in {"welcome", "ping"}:
            return
        book = self.engine.ingest_alert(alert)
        if not book:
            return
        tracked = alert.get("trader") in self.engine.leaders
        if not tracked and book.overlap < 2:
            return
        ranked = next(
            (
                row
                for row in self.engine.ranked(30)
                if row["address"] == book.address or row["symbol"] == book.symbol
            ),
            None,
        )
        if not ranked:
            return
        logger.success(
            f"{ranked['action']} ${book.symbol} via @{alert.get('trader')} "
            f"overlap={ranked['overlap']} score={ranked['score']} | {alert.get('text')}"
        )
        if ranked.get("market_url"):
            logger.info(f"Open (manual): {ranked['market_url']}")

    async def snapshot_loop(self) -> None:
        while True:
            await asyncio.sleep(settings.snapshot_every)
            try:
                leaders = self.client.leaderboard()
                self.engine.set_leaders(leaders)
                self._refresh_portfolios()
                self._emit_books()
            except Exception as exc:
                logger.error(f"Snapshot refresh failed: {exc}")

    async def run(self) -> None:
        self.bootstrap()
        await asyncio.gather(self.stream(), self.snapshot_loop())


def main() -> None:
    logger.info("Buon overlap monitor — read-only. Does not place custodial trades.")
    monitor = BuonMonitor()
    try:
        asyncio.run(monitor.run())
    finally:
        monitor.client.close()


if __name__ == "__main__":
    main()
