#!/usr/bin/env python3
import json, urllib.request
from pathlib import Path

OUT = Path("data/graduates.json")
MIN_MC = 50_000
HEADERS = {
    "user-agent": "BuonDesk/1.0 (+https://fevic1.github.io/Buon/)",
    "accept": "application/json",
}

PUMP = (
    "https://frontend-api-v3.pump.fun/coins"
    "?limit=50&offset=0&sort=market_cap&searchTerm=&order=DESC"
    "&includeNsfw=false&creator=&complete=true&meta="
)
DEX = "https://api.dexscreener.com/latest/dex/search?q=pumpswap"


def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode())


def from_pump(data):
    rows = data if isinstance(data, list) else (data.get("data") or data.get("coins") or [])
    out = []
    for c in rows:
        if not c or c.get("complete") is False:
            continue
        symbol = str(c.get("symbol") or "").lstrip("$").strip()
        mint = c.get("mint")
        if not symbol or not mint or len(symbol) > 16:
            continue
        mc = float(c.get("usd_market_cap") or c.get("market_cap") or 0)
        if mc and mc < MIN_MC:
            continue
        out.append({
            "symbol": symbol,
            "name": c.get("name") or symbol,
            "mint": mint,
            "chain": "solana",
            "mc": mc,
            "source": "pump",
        })
    return out


def from_dex(data):
    seen, out = set(), []
    for p in data.get("pairs") or []:
        if not p or p.get("chainId") != "solana":
            continue
        if str(p.get("dexId") or "").lower() not in ("pumpswap", "pumpfun"):
            continue
        base = p.get("baseToken") or {}
        mint, symbol = base.get("address"), base.get("symbol")
        if not mint or not symbol or mint in seen:
            continue
        mc = float(p.get("marketCap") or p.get("fdv") or 0)
        if mc and mc < MIN_MC:
            continue
        seen.add(mint)
        out.append({
            "symbol": symbol,
            "name": base.get("name") or symbol,
            "mint": mint,
            "chain": "solana",
            "mc": mc,
            "source": "pumpswap",
        })
    return out


def main():
    source, err, list_ = "none", "", []
    try:
        list_ = from_pump(get(PUMP))
        source = "pump"
    except Exception as e:
        err = f"pump {e}"
    if not list_:
        try:
            list_ = from_dex(get(DEX))
            source = "pumpswap" if list_ else source
        except Exception as e:
            err = (err + " · " if err else "") + f"dex {e}"
    list_.sort(key=lambda x: x.get("mc") or 0, reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": source,
        "error": err,
        "count": len(list_),
        "coins": list_[:30],
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(json.dumps({"source": source, "count": len(list_), "error": err}))


if __name__ == "__main__":
    main()
