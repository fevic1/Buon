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

    @property
    def has_key(self) -> bool:
        return bool(self.api_key)


settings = Settings()
