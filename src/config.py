import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _env(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


def _env_int(key: str, default: int) -> int:
    raw = os.getenv(key)
    return int(raw) if raw else default


def _env_float(key: str, default: float) -> float:
    raw = os.getenv(key)
    return float(raw) if raw else default


@dataclass(frozen=True)
class Settings:
    api_key: str = _env("BUON_API_KEY")
    leader_window: str = _env("LEADER_WINDOW", "24h")
    leader_limit: int = _env_int("LEADER_LIMIT", 25)
    min_overlap: int = _env_int("MIN_OVERLAP", 3)
    min_holding_usd: float = _env_float("MIN_HOLDING_USD", 50)
    min_alert_usd: float = _env_float("MIN_ALERT_USD", 250)
    snapshot_every: int = _env_int("SNAPSHOT_EVERY", 90)
    snatch_enabled: bool = _env("SNATCH_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    snatch_max_positions: int = _env_int("SNATCH_MAX_POSITIONS", 4)
    snatch_capital_per_trade_usd: float = _env_float("SNATCH_CAPITAL_PER_TRADE_USD", 300)
    snatch_event_min_usd: float = _env_float("SNATCH_EVENT_MIN_USD", 220)
    snatch_fast_min_buy_count: int = _env_int("SNATCH_FAST_MIN_BUY_COUNT", 2)
    snatch_fast_min_unique_buyers: int = _env_int("SNATCH_FAST_MIN_UNIQUE_BUYERS", 2)
    snatch_fast_min_weighted_buyers: float = _env_float("SNATCH_FAST_MIN_WEIGHTED_BUYERS", 0.22)
    snatch_fast_min_flow_ratio: float = _env_float("SNATCH_FAST_MIN_FLOW_RATIO", 0.58)
    snatch_momentum_min_score: float = _env_float("SNATCH_MOMENTUM_MIN_SCORE", 0.40)
    snatch_min_opportunity_score: float = _env_float("SNATCH_MIN_OPPORTUNITY_SCORE", 72.0)
    snatch_min_safety_score: float = _env_float("SNATCH_MIN_SAFETY_SCORE", 0.60)
    snatch_hold_max_seconds: int = _env_int("SNATCH_HOLD_MAX_SECONDS", 180)
    snatch_tp1_pct: float = _env_float("SNATCH_TP1_PCT", 2.5)
    snatch_tp1_fraction: float = _env_float("SNATCH_TP1_FRACTION", 0.60)
    snatch_tp2_pct: float = _env_float("SNATCH_TP2_PCT", 4.0)
    snatch_rapid_take_profit_pct: float = _env_float("SNATCH_RAPID_TAKE_PROFIT_PCT", 2.2)
    snatch_trailing_offset_pct: float = _env_float("SNATCH_TRAILING_OFFSET_PCT", 0.6)
    snatch_trailing_activation_pct: float = _env_float("SNATCH_TRAILING_ACTIVATION_PCT", 1.0)
    snatch_emergency_stop_pct: float = _env_float("SNATCH_EMERGENCY_STOP_PCT", 1.5)
    snatch_hard_loss_limit_pct: float = _env_float("SNATCH_HARD_LOSS_LIMIT_PCT", 1.5)
    snatch_slippage_limit_pct: float = _env_float("SNATCH_SLIPPAGE_LIMIT_PCT", 1.1)
    snatch_cooldown_seconds: int = _env_int("SNATCH_COOLDOWN_SECONDS", 45)
    snatch_flow_window_seconds: int = _env_int("SNATCH_FLOW_WINDOW_SECONDS", 120)
    snatch_state_file: str = _env("SNATCH_STATE_FILE", "data/snatch_trades.jsonl")
    snatch_risk_provider: str = _env("SNATCH_RISK_PROVIDER", "placeholder")
    snatch_risk_enabled: bool = _env("SNATCH_RISK_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    snatch_risk_strict_unknown: bool = _env("SNATCH_RISK_STRICT_UNKNOWN", "false").lower() in {"1", "true", "yes", "on"}
    snatch_min_token_age_minutes: int = _env_int("SNATCH_MIN_TOKEN_AGE_MINUTES", 10)
    snatch_require_liquidity_lock: bool = _env("SNATCH_REQUIRE_LIQUIDITY_LOCK", "false").lower() in {"1", "true", "yes", "on"}
    snatch_min_liquidity_lock_pct: float = _env_float("SNATCH_MIN_LIQUIDITY_LOCK_PCT", 70.0)
    snatch_block_honeypot: bool = _env("SNATCH_BLOCK_HONEYPOT", "true").lower() in {"1", "true", "yes", "on"}

    @property
    def has_key(self) -> bool:
        return bool(self.api_key)


settings = Settings()
