from __future__ import annotations

from base64 import b64decode
from typing import Any

import httpx

from src.config import settings


def _host(token: str) -> str:
    return b64decode(token).decode("ascii")


API_BASE = _host("aHR0cHM6Ly9hcGkuZm9tb2FwaS5pbw==")
ALERT_WS = _host("d3NzOi8vYXBpLmZvbW9hcGkuaW8vd3MvYWxlcnRz")
MARKET_SITE = _host("aHR0cHM6Ly9mb21vLmZhbWlseQ==")


class TapeClient:
    """Read-only social + on-chain tape. Cannot place trades."""

    def __init__(self) -> None:
        headers = {"accept": "application/json"}
        if settings.api_key:
            headers["authorization"] = f"Bearer {settings.api_key}"
        self._http = httpx.Client(base_url=API_BASE, headers=headers, timeout=20.0)

    def close(self) -> None:
        self._http.close()

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        response = self._http.get(path, params=params)
        if response.status_code == 401:
            raise PermissionError(f"{path} needs BUON_API_KEY")
        if response.status_code == 429:
            retry = response.headers.get("retry-after", "?")
            raise RuntimeError(f"Rate limited on {path}. retry-after={retry}")
        response.raise_for_status()
        return response.json()

    def health(self) -> dict:
        return self._get("/health")

    def leaderboard(self, window: str | None = None, limit: int | None = None) -> list[dict]:
        window = window or settings.leader_window
        limit = limit or settings.leader_limit
        data = self._get(f"/v2/leaderboard/{window}", {"limit": limit})
        return data.get("traders") or []

    def alerts(self, limit: int = 50, alert_type: str | None = None) -> list[dict]:
        params: dict[str, Any] = {"limit": limit}
        if alert_type:
            params["type"] = alert_type
        data = self._get("/v2/alerts", params)
        if isinstance(data, list):
            return data
        return data.get("alerts") or []

    def user(self, handle: str) -> dict:
        return self._get(f"/v2/users/{handle.lstrip('@')}")

    def balances(self, handle: str) -> dict:
        return self._get(f"/v2/users/{handle.lstrip('@')}/balances")

    def trades(self, handle: str, limit: int = 25) -> list[dict]:
        data = self._get(f"/v2/users/{handle.lstrip('@')}/trades", {"limit": limit})
        if isinstance(data, list):
            return data
        return data.get("trades") or []

    def token_holders(self, address: str, limit: int = 50) -> list[dict]:
        data = self._get(f"/token/{address}/holders", {"limit": limit})
        if isinstance(data, list):
            return data
        return data.get("holders") or []

    def trending_tokens(self, limit: int = 25) -> list[dict]:
        data = self._get("/v2/leaderboard/tokens/trending", {"limit": limit})
        return data.get("tokens") or []

    def websocket_url(self) -> str:
        return ALERT_WS


def market_page(chain: str | None, address: str | None) -> str | None:
    if not address:
        return None
    network = (chain or "solana").lower()
    aliases = {
        "sol": "solana",
        "eth": "ethereum",
        "bnb": "bsc",
        "binance": "bsc",
        "rh": "robinhood",
    }
    network = aliases.get(network, network)
    return f"{MARKET_SITE}/tokens/{network}/{address}"


def parse_holding(raw: dict) -> dict | None:
    token = raw.get("token") if isinstance(raw.get("token"), dict) else {}
    symbol = token.get("symbol") or raw.get("symbol")
    address = token.get("address") or raw.get("address") or raw.get("tokenAddress")
    value = raw.get("valueUsd") or raw.get("value") or 0
    try:
        value = float(value or 0)
    except (TypeError, ValueError):
        value = 0.0
    if not symbol and not address:
        return None
    return {
        "symbol": str(symbol or "?").lstrip("$"),
        "address": address,
        "amount": raw.get("amount"),
        "price_usd": raw.get("priceUsd"),
        "value_usd": value,
        "change_24h": raw.get("change24h"),
    }
