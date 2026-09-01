# Buon

Social leader tape in the browser. No terminal.

**https://fevic1.github.io/Buon/**

Connect Phantom. Watch ranked wallets. Cluster identical coins. Sign your own Jupiter swap. Buon never logs into a custodial trading app and never holds your keys.

## Use it

1. Open the Pages URL (or `docs/index.html`).
2. Connect Phantom.
3. Read the 24h leaderboard, live feed, identical-coin book, and potential book.
4. Hit **Buy** on a Solana mint — Phantom pops, you sign.
5. Optional: toggle “Propose Solana buys on crowded / potential”. Still requires a wallet popup each time.

## GitHub Pages (one-time click)

Repo Settings → Pages → Source: **GitHub Actions**.

Or: Settings → Pages → Deploy from branch → `main` / `/docs`.

## Tree

```
Buon/
├── README.md
├── .env.example
├── .gitignore
├── requirements.txt
├── .github/
│   └── workflows/
│       └── pages.yml
├── docs/
│   ├── index.html      # desk UI
│   ├── styles.css
│   └── app.js          # tape + wallet
└── src/
    ├── __init__.py
    ├── __main__.py
    ├── config.py
    ├── tape.py         # read-only market tape
    ├── ranker.py
    └── monitor.py
```

Optional local monitor:

```
PYTHONPATH=. python -m src
```
