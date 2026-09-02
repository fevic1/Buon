from __future__ import annotations

import importlib
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from src.config import settings


def _f(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _ts_now() -> float:
    return datetime.now(timezone.utc).timestamp()


def _parse_ts(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        ts = float(value)
        if ts > 1e12:
            ts /= 1000.0
        return ts if ts > 0 else None
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            ts = float(raw)
            if ts > 1e12:
                ts /= 1000.0
            return ts if ts > 0 else None
        except ValueError:
            pass
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return dt.timestamp()
        except ValueError:
            return None
    return None


@dataclass(frozen=True)
class RiskDecision:
    blocked: bool
    reason: str = ""
    details: dict[str, Any] | None = None


class RiskProvider:
    def assess(
        self,
        *,
        alert: dict[str, Any],
        token_symbol: str,
        token_address: str,
        chain: str,
        flow_metrics: dict[str, float],
    ) -> RiskDecision:
        raise NotImplementedError


class PlaceholderRiskProvider(RiskProvider):
    """Hard-risk placeholders that can be replaced by a real risk API adapter."""

    def _extract_honeypot(self, alert: dict[str, Any]) -> bool | None:
        risk = alert.get("risk") if isinstance(alert.get("risk"), dict) else {}
        for key in ("isHoneypot", "honeypot", "honeypotFlag"):
            if key in alert:
                return bool(alert.get(key))
            if key in risk:
                return bool(risk.get(key))
        return None

    def _extract_lock_pct(self, alert: dict[str, Any]) -> float | None:
        risk = alert.get("risk") if isinstance(alert.get("risk"), dict) else {}
        for key in ("liquidityLockedPct", "lpLockedPct", "lockedLiquidityPct"):
            if key in alert:
                return _f(alert.get(key), -1.0)
            if key in risk:
                return _f(risk.get(key), -1.0)
        return None

    def _extract_age_minutes(self, alert: dict[str, Any]) -> float | None:
        risk = alert.get("risk") if isinstance(alert.get("risk"), dict) else {}
        for key in ("tokenAgeMinutes", "ageMinutes"):
            if key in alert:
                return _f(alert.get(key), -1.0)
            if key in risk:
                return _f(risk.get(key), -1.0)

        created = (
            alert.get("tokenCreatedAt")
            or alert.get("createdAt")
            or alert.get("pairCreatedAt")
            or risk.get("tokenCreatedAt")
            or risk.get("createdAt")
        )
        ts = _parse_ts(created)
        if ts is None:
            return None
        return max(0.0, (_ts_now() - ts) / 60.0)

    def assess(
        self,
        *,
        alert: dict[str, Any],
        token_symbol: str,
        token_address: str,
        chain: str,
        flow_metrics: dict[str, float],
    ) -> RiskDecision:
        if not settings.snatch_risk_enabled:
            return RiskDecision(blocked=False)

        honeypot = self._extract_honeypot(alert)
        lock_pct = self._extract_lock_pct(alert)
        age_minutes = self._extract_age_minutes(alert)

        if settings.snatch_block_honeypot:
            if honeypot is True:
                return RiskDecision(True, "honeypot_flag", {"honeypot": True})
            if honeypot is None and settings.snatch_risk_strict_unknown:
                return RiskDecision(True, "honeypot_unknown", {"honeypot": None})

        if settings.snatch_require_liquidity_lock:
            if lock_pct is None and settings.snatch_risk_strict_unknown:
                return RiskDecision(True, "liquidity_lock_unknown", {"lock_pct": None})
            if lock_pct is not None and lock_pct >= 0 and lock_pct < settings.snatch_min_liquidity_lock_pct:
                return RiskDecision(
                    True,
                    "liquidity_lock_low",
                    {"lock_pct": lock_pct, "min_lock_pct": settings.snatch_min_liquidity_lock_pct},
                )

        if settings.snatch_min_token_age_minutes > 0:
            if age_minutes is None and settings.snatch_risk_strict_unknown:
                return RiskDecision(True, "token_age_unknown", {"age_minutes": None})
            if age_minutes is not None and age_minutes >= 0 and age_minutes < settings.snatch_min_token_age_minutes:
                return RiskDecision(
                    True,
                    "token_age_too_new",
                    {"age_minutes": age_minutes, "min_age_minutes": settings.snatch_min_token_age_minutes},
                )

        return RiskDecision(
            blocked=False,
            details={
                "symbol": token_symbol,
                "address": token_address,
                "chain": chain,
                "honeypot": honeypot,
                "lock_pct": lock_pct,
                "age_minutes": age_minutes,
            },
        )


class HardRiskLayer:
    def __init__(self) -> None:
        provider = (settings.snatch_risk_provider or "placeholder").lower()
        if provider in {"off", "none", "disabled"}:
            self.provider: RiskProvider | None = None
        elif provider.startswith("module:"):
            self.provider = self._load_external_provider(provider[len("module:") :])
        else:
            self.provider = PlaceholderRiskProvider()

    def _load_external_provider(self, target: str) -> RiskProvider:
        module_name, _, class_name = target.partition(":")
        if not module_name or not class_name:
            raise ValueError(
                "SNATCH_RISK_PROVIDER module target must be module:path.to.module:ClassName"
            )
        mod = importlib.import_module(module_name)
        cls = getattr(mod, class_name)
        inst = cls()
        if not hasattr(inst, "assess"):
            raise TypeError("External risk provider must implement assess(...) method")
        return inst

    def assess(
        self,
        *,
        alert: dict[str, Any],
        token_symbol: str,
        token_address: str,
        chain: str,
        flow_metrics: dict[str, float],
    ) -> RiskDecision:
        if self.provider is None:
            return RiskDecision(blocked=False)
        return self.provider.assess(
            alert=alert,
            token_symbol=token_symbol,
            token_address=token_address,
            chain=chain,
            flow_metrics=flow_metrics,
        )