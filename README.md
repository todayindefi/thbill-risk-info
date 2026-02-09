# thBILL Risk Report

Independent risk assessment dashboard for Theo Network's thBILL (Short Duration US Treasury Fund).

**Live:** [todayindefi.github.io/thbill-risk-info](https://todayindefi.github.io/thbill-risk-info/)

## Data Flow

```
On-chain RPCs + APIs          PegTracker (this server)         GitHub Pages
─────────────────────          ────────────────────────         ────────────

Ethereum RPC ──┐
Arbitrum RPC ──┤               thbill_metrics.py
Solana RPC ────┤    ──►        (cron: every hour at :20)
DefiLlama API ─┤               │
CoinGecko API ─┤               ├─► data/thbill_metrics.json
Theo dashboard ┘               └─► data/thbill_peg_history.json
                                         │
                                         │  sync_and_push.sh
                                         │  (cron: every hour at :25)
                                         ▼
                                thbill-risk-info/data/
                                    │
                                    │  git push → GitHub Actions
                                    │  (deploys on push + hourly at :30)
                                    ▼
                                Live dashboard
```

Total latency from on-chain → live dashboard: ~10 minutes.

## Cross-Repo Architecture

This dashboard spans two repos on the same server:

### `~/PegTracker/` — Data pipeline (private)

| File | Purpose |
|------|---------|
| `thbill_metrics.py` | Fetches all thBILL data from on-chain + APIs, writes JSON |
| `data/thbill_metrics.json` | Full metrics snapshot (synced to dashboard) |
| `data/thbill_peg_history.json` | 7-day rolling NAV/VWAP history (synced to dashboard) |
| `data/thbill_history.json` | Supply history for 24h flow calc (not synced) |

**What `thbill_metrics.py` collects:**

- **Backing ratio** — On-chain RPC: ULTRA supply (Ethereum/Arbitrum/Solana), tULTRA supply, Treasury ULTRA + USDC balances, implied cash (tULTRA − ULTRA)
- **TVL** — DefiLlama `/protocol/theo-network-thbill`
- **Liquidity** — CoinGecko tickers + on-chain 2% depth (Uniswap V3 QuoterV2 binary search)
- **Peg** — ERC-4626 `convertToAssets()` for NAV, volume-weighted DEX price for VWAP
- **DeFi markets** — DefiLlama yields API (Pendle, Morpho, Euler, etc.)
- **Theo reported** — Playwright headless scrape of `app.theo.xyz/dashboard`
- **Redemption flow** — 24h supply delta from `thbill_history.json`

### `~/thbill-risk-info/` — Dashboard (this repo, public)

```
thbill-risk-info/
├── index.html              Main dashboard page
├── js/app.js               Fetches data/thbill_metrics.json, updates all UI sections
├── css/custom.css           Star ratings, table hover, loading pulse, responsive grid
├── data/
│   ├── thbill_metrics.json      Synced from PegTracker hourly
│   └── thbill_peg_history.json  Synced from PegTracker hourly
├── sync_data.sh            Manual sync: copies JSON from PegTracker
├── sync_and_push.sh        Cron sync: copies JSON + git commit + push
├── sync.log                Output log from sync_and_push.sh
├── .github/workflows/
│   └── deploy.yml          GitHub Pages deployment (on push + hourly)
└── README.md               This file
```

## Cron Schedule

All times are server-local. Staggered to avoid API rate limits.

| Time | Script | What it does |
|------|--------|-------------|
| `:20` | `thbill_metrics.py` | Fetches all on-chain + API data, writes JSON to PegTracker/data/ |
| `:25` | `sync_and_push.sh` | Copies JSON to this repo, commits + pushes if changed |
| `:30` | GitHub Actions | Deploys updated site to GitHub Pages |

## Dashboard Sections

| Section | Data source | Key fields |
|---------|-------------|------------|
| Live Metrics | `tvl_usd`, `backing`, `redemption_flow` | TVL, backing ratio, 24h flow |
| Collateral & Backing | `backing` | thBILL → tULTRA → ULTRA waterfall, implied cash |
| Treasury Holdings | `backing.treasury_ultra_*` | Per-chain Treasury ULTRA vs ULTRA supply |
| Theo Reported | `theo_reported`, `backing.implied_cash` | Money market %, cash %, implied vs reported comparison |
| Peg Performance | `peg` | NAV, VWAP, premium/discount, per-chain prices |
| Secondary Liquidity | `secondary_liquidity.pools` | DEX pools: TVL, 2% depth, volume, spread |
| DeFi Integrations | `defi_markets` | Protocol, chain, TVL, APY |

## Local Development

```bash
# Sync latest data from PegTracker
./sync_data.sh

# Serve locally
python3 -m http.server 8080
# Open http://localhost:8080
```

## Disclaimer

This report is for informational purposes only and does not constitute financial advice. Always DYOR.
