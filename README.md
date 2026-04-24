# thBILL Risk Report

Independent risk assessment dashboard for Theo Network's thBILL (Short Duration US Treasury Fund).

**Live:** [todayindefi.github.io/thbill-risk-info](https://todayindefi.github.io/thbill-risk-info/)

## Data Flow

```
On-chain RPCs + APIs          PegTracker (this server)         GitHub Pages
─────────────────────          ────────────────────────         ────────────

Ethereum RPC ──┐
Arbitrum RPC ──┤               thbill_metrics.py
Avalanche RPC ─┤               (cron: every hour at :20)
Solana RPC ────┤    ──►        │
DefiLlama API ─┤               ├─► data/thbill_metrics.json
CoinGecko API ─┤               └─► data/thbill_peg_history.json
DeBank API ────┘                         │
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

See [`docs/`](docs/) for dashboard section reference and JSON schema.

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

- **Backing ratio (USD-denominated, authoritative)** — On-chain RPC: ULTRA supply across ETH/ARB/AVAX/SOL, tULTRA supply, `balanceOf(thBILL vault)`, Theo TREASURY custody per chain, treasury USDC, UltraManagerFiat in-flight queue, `ULTRA.balanceOf(tULTRA wrapper)` (expected 0 — synthetic/attested model probe)
- **NAV** — Libeara-attested ULTRA NAV from `UltraManager.lastSetMintExchangeRate()` (primary), with `tULTRA.convertToAssets(1)` wrapper rate and Theo vault-implied price as cross-checks (drift tagged as `theo_nav_drift_pct`)
- **TVL** — DefiLlama `/protocol/theo-network-thbill`
- **Liquidity** — CoinGecko tickers + on-chain 2% depth via Uniswap V3 QuoterV2 binary search; per-pool TVL & volume
- **Peg** — ERC-4626 `convertToAssets()` for share NAV, volume-weighted DEX price for VWAP, per-chain price/volume/premium
- **DeFi markets** — DefiLlama yields API (Pendle, Morpho, Euler, etc.)
- **Treasury DeFi positions** — DeBank API on the TREASURY wallet (catches e.g. Aave USDC supply if present)
- **Redemption flow** — 24h supply delta + "days since last redemption" scanner over ERC-20 Transfer-to-zero events on the thBILL vault, with lifetime backfill available via `backfill_thbill_history.py`

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

Full section-by-section reference in [`docs/dashboard.md`](docs/dashboard.md). Quick index:

| Section | Data source | What it shows |
|---------|-------------|------------|
| Executive Summary | static HTML | Who can primary-redeem vs DEX-only; two-layer transparency framing |
| Overall Risk Assessment | static HTML | 5-star rating cards (Collateral, Liquidity, Issuer, Operational, Transparency) |
| Live Metrics | `tvl_usd`, `backing`, `peg`, `redemption_flow` | TVL · USD backing ratio · Peg Discount (color-coded) · Days Since Last Redemption |
| Collateral & Backing | `backing` | thBILL liability + tULTRA collateral + USDC cushion (USD values). Headline USD backing ratio + synthetic/attested badge |
| Treasury Holdings | `backing.treasury_ultra_*`, `backing.redemption_queue_ultra_*`, `backing.ultra_balance_of_wrapper`, `backing.treasury_usdc` | tULTRA wrapper row + per-chain custody + USDC + in-flight queue. Columns: Amount, USD Value, % of thBILL Liability |
| Redemption Mechanics | static HTML | Primary path (KYC, 4-business-day, $50K min) vs DEX path |
| Peg Performance | `peg` | NAV · VWAP · premium/discount · 7d history chart · per-chain table with thin-pool flags |
| Secondary Market Liquidity | `secondary_liquidity.pools` | Per-pool TVL, 2% depth, volume, spread |
| Risk Analysis | static HTML | Issuer, Decentralization, Technical, Minting & Redemption, Operational |
| Where to Use thBILL (tab) | `defi_markets` | Integration breadth (Pendle, Morpho, Euler, etc.) |

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
