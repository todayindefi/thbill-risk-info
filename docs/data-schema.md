# Data File Schema Reference

Reference for the JSON artifacts this dashboard consumes and the PegTracker
upstream files that produce them.

**Files covered**
- [`data/thbill_metrics.json`](#thbill_metricsjson) — hot snapshot, refreshed hourly, the main feed the dashboard reads
- [`data/thbill_peg_history.json`](#thbill_peg_historyjson) — 7-day NAV/VWAP history for the peg chart
- [PegTracker-side files (not in this repo)](#pegtracker-side-files) — `thbill_history.json`, `thbill_redemption_cache.json`, `thbill_redemption_history.{md,json}`

Paths are relative to the `thbill-risk-info/` repo unless noted. All files use UTF-8 JSON unless otherwise marked.

---

## `thbill_metrics.json`

The primary data feed. Regenerated every hour at :20 by `~/PegTracker/thbill_metrics.py`, synced into this repo at :25 by `sync_and_push.sh`.

### Top-level structure

```json
{
  "asset": "thBILL",
  "vault_address": "0x5fa487bca6158c64046b2813623e20755091da0b",
  "treasury_address": "0xAECCa546baFB16735b273702632C8Cbb83509d8F",
  "timestamp": "2026-04-24T03:09:04.123456Z",
  "tvl_usd": { ... },
  "backing": { ... },
  "theo_reported": null,
  "redemption_flow": { ... },
  "secondary_liquidity": { ... },
  "peg": { ... },
  "defi_markets": [ ... ]
}
```

`theo_reported` is retained as a null placeholder — it held scraped data when the Theo dashboard Playwright scraper was active. All backing is now verified on-chain, so the field is not populated. Do not treat a missing/null value here as a data gap.

---

### `tvl_usd`

```json
{
  "total": 135000000,
  "by_chain": {"Ethereum": 56789591, "Arbitrum": 36725596, "Solana": 26074800}
}
```

Source: DefiLlama `/protocol/theo-network-thbill`. Dollars.

---

### `backing`

The largest and most important block. Logical groupings:

#### thBILL layer
| Field | Type | Meaning |
|---|---|---|
| `thbill_supply` | float | ERC-20 `totalSupply()` of the thBILL vault. Shares. |
| `thbill_nav_per_share` | float | ERC-4626 `convertToAssets(1 thBILL) / 1e6`. USDC/share. |
| `usd_liabilities` | float | `thbill_supply × thbill_nav_per_share`. USD claims outstanding. |

#### tULTRA wrapper layer
| Field | Type | Meaning |
|---|---|---|
| `tultra_supply` | float | tULTRA `totalSupply()`. |
| `tultra_vault_balance` | float | tULTRA held by the thBILL vault contract. Direct collateral for thBILL shares. |
| `tultra_usd_price` | float | USD value of one tULTRA token, resolved per `tultra_usd_price_source`. |
| `tultra_usd_price_source` | string | Where the price came from. One of: `onchain_ultramanager` (Libeara-attested, primary), `coingecko_tultra`, `coingecko_ultra`, `vault_implied_circular` (fallback), `unavailable`. |
| `tultra_implied_price_from_vault` | float | Circular internal price Theo uses: `usd_liabilities / tultra_vault_balance`. Used only as a fallback or a drift cross-check. |
| `ultra_onchain_nav` | float | ULTRA NAV from `UltraManager.lastSetMintExchangeRate()` (Libeara-attested, epoch-signed). USDC per ULTRA. |
| `ultra_onchain_nav_epoch` | int | Epoch number the above NAV was written in. |
| `theo_nav_drift_pct` | float | Drift between Theo's vault-implied price and Libeara-attested NAV (× wrapper rate). Flags Theo accounting lag. |

#### Wrapper integrity probe
| Field | Type | Meaning |
|---|---|---|
| `ultra_balance_of_wrapper` | float | **`ULTRA.balanceOf(tULTRA wrapper)`** — expected `0` under the synthetic-attested model. If ever > 0, the backing model has shifted (wrapper became custodial) and all reconciliation assumptions need revisiting. |
| `tultra_wrapper_backing_mode` | string | `"synthetic_attested"` or `"custodial"` — auto-derived from the wrapper balance. The dashboard's yellow/green badge keys off this. |

#### Theo custody (per chain)
| Field | Type | Meaning |
|---|---|---|
| `treasury_ultra_ethereum` | float | ULTRA held by the TREASURY wallet on Ethereum. |
| `treasury_ultra_arbitrum` | float | Same, on Arbitrum. |
| `treasury_ultra_avalanche` | float | Same, on Avalanche. Currently 0 — FundBridge launch partners hold the Avalanche ULTRA, not Theo. |
| `treasury_ultra_solana` | float | Same, on Solana. |
| `treasury_ultra_total` | float | Sum of all four. Excludes in-flight queue. |
| `treasury_usdc` | float | TREASURY wallet USDC total (Ethereum spot + Arbitrum spot + any DeFi supply positions detected via DeBank). |
| `treasury_defi_positions` | array | Individual DeFi supply positions (e.g. Aave USDC), each `{protocol, chain, type, token, amount}`. `[]` when DeBank returns nothing; `null` if not queried. |

#### ULTRA supply (per chain, for context/transparency)
| Field | Type | Meaning |
|---|---|---|
| `ultra_ethereum` | float | ULTRA token `totalSupply()` on Ethereum. |
| `ultra_arbitrum` | float | Same, Arbitrum. |
| `ultra_avalanche` | float | Same, Avalanche. |
| `ultra_solana` | float | Same, Solana. |
| `ultra_total` | float | Sum across all chains. |

#### Redemption queue (UltraManagerFiat)
| Field | Type | Meaning |
|---|---|---|
| `redemption_queue_ultra_ethereum` | float | ULTRA held by Libeara's `UltraManagerFiat` on Ethereum (the fiat-redemption queue). In-flight — either Theo redeeming their own ULTRA for USDC or processing a user's redemption. |
| `redemption_queue_ultra_total` | float | Sum across chains (currently ETH-only). Included in `usd_assets`. |

#### Authoritative USD-denominated backing
| Field | Type | Meaning |
|---|---|---|
| `usd_assets` | float | `(treasury_ultra_total + redemption_queue_ultra_total) × tultra_usd_price + treasury_usdc`. |
| `usd_assets_provenance` | string | `"treasury_custody_cross_check"` — explicit tag that `usd_assets` is a reconciliation against Theo's custody (verified via on-chain `balanceOf` calls), NOT a tally of tokens locked inside the tULTRA wrapper (which holds 0 — see `ultra_balance_of_wrapper`). |
| `usd_backing_ratio` | float | `usd_assets / usd_liabilities`. The headline backing number. |
| `usd_backing_ratio_ex_queue` | float | Same ratio computed with the in-flight queue excluded. The "post-settlement floor" — what the ratio would be if queue cleared to zero value instead of returning as USDC. |

#### Deprecated / legacy token-count figures
These predate the USD-denominated framing and are retained for dashboard backward-compatibility. Do **not** use them for new consumers.

| Field | Type | Meaning |
|---|---|---|
| `token_ratio_ultra_to_thbill` | float | `ultra_total / thbill_supply`. Raw token-count ratio. Misleading: ignores NAV differences + includes ULTRA held by third parties. |
| `ultra_wrapper_delta` | float | `ultra_total − tultra_supply`. Signed: positive = unwrapped ULTRA buffer exists. |
| `implied_cash` | float | `tultra_supply − ultra_total` (legacy sign). Superseded by `usd_backing_ratio`. |
| `backing_ratio_ultra_only` | float | Alias for `token_ratio_ultra_to_thbill`. |
| `backing_ratio_with_usdc` | float | `(ultra_total + treasury_usdc) / thbill_supply`. Token-count + dollars mixing, misleading. |

#### Self-documenting
| Field | Type | Meaning |
|---|---|---|
| `note` | string | Inline note: "Treasury USDC = spot balance + any DeFi supply positions detected via DeBank (see `treasury_defi_positions`)". |

---

### `peg`

```json
{
  "nav_per_share": 1.023985,
  "vwap": 1.019616,
  "premium_discount_pct": -0.4267,
  "per_chain_prices": {
    "Arbitrum": {"vwap": 1.02019, "volume_24h": 323242.78},
    "HyperEVM": {"vwap": 1.019964, "volume_24h": 173671.26},
    "Ethereum": {"vwap": 1.014885, "volume_24h": 212.30}
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `nav_per_share` | float | Same as `backing.thbill_nav_per_share`. Redundant — makes `peg` self-contained for the chart renderer. |
| `vwap` | float | Volume-weighted price across all DEX pools (USDC per thBILL). |
| `premium_discount_pct` | float | `(vwap − nav_per_share) / nav_per_share × 100`. Negative = discount, positive = premium. The color-coded "Peg Discount" card reads this. |
| `per_chain_prices` | dict | Per-chain `{vwap, volume_24h}`. Drives the per-chain table in Peg Performance. |

---

### `redemption_flow`

```json
{
  "net_flow_24h": 0.0,
  "net_flow_percentage": 0.0,
  "supply_24h_ago": 131668780.86,
  "current_supply": 131668780.86,
  "note": null,
  "days_since_last_redemption": 43.89,
  "last_redemption_timestamp": "2026-03-10T13:45:23Z",
  "last_redemption_amount_thbill": 3023351.607901,
  "last_redemption_tx": "0x88bbac5e..."
}
```

| Field | Type | Meaning |
|---|---|---|
| `net_flow_24h` | float | thBILL minted − burned in the last 24h. Positive = net inflow. |
| `net_flow_percentage` | float | `net_flow_24h / supply_24h_ago × 100`. |
| `supply_24h_ago` / `current_supply` | float | Inputs used to compute the delta. |
| `days_since_last_redemption` | float | Days since the most recent Transfer-to-zero on the thBILL vault. Defaults to a lower bound (≥X) if no burn found in the scan window. |
| `last_redemption_timestamp` | ISO 8601 string \| null | Timestamp of the most recent burn. `null` if no burns found in the scan window. Populated from the full-lifetime backfill (see [PegTracker-side files](#pegtracker-side-files)). |
| `last_redemption_amount_thbill` | float \| null | Shares burned in the most recent event. |
| `last_redemption_tx` | string \| null | Transaction hash of the most recent burn. The dashboard renders this as an Etherscan link. |
| `note` | string \| null | Explanatory note when a field is unavailable. |

---

### `secondary_liquidity`

```json
{
  "total_volume_24h": 516543,
  "total_tvl_usd": 1172249,
  "phantom_volume_24h": 0,
  "pools": [
    {
      "market": "Project X",
      "chain": "arbitrum",
      "pair": "thBILL/USDC",
      "volume_24h": 323243,
      "tvl_usd": 1154514,
      "depth_2pct_buy": 205000,
      "depth_2pct_sell": 211000,
      "spread": 0.0012,
      "last_price": 1.02019,
      "trust_score": "high",
      "aggregators": ["cowswap"],
      "is_phantom": false
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `total_volume_24h` / `total_tvl_usd` | float | Aggregated across all pools. |
| `phantom_volume_24h` | float | Excluded from totals — aggregator pools that would double-count. |
| `pools[].market` | string | Venue (Uniswap V3, Project X, Pancake, etc.). |
| `pools[].chain` | string | `ethereum`, `arbitrum`, `hyperevm`, etc. Lowercase. |
| `pools[].pair` | string | Trading pair as displayed. |
| `pools[].volume_24h` | float | 24h volume, USD. |
| `pools[].tvl_usd` | float | Pool TVL, USD. Pools < $50K TVL get a "thin" flag in the peg per-chain table. |
| `pools[].depth_2pct_buy` / `depth_2pct_sell` | float \| null | USD amount to move price 2%. Uniswap V3 QuoterV2 binary search on-chain. |
| `pools[].spread` | float | Bid/ask spread fraction. |
| `pools[].last_price` | float | Latest trade price (USDC/thBILL). |
| `pools[].trust_score` | string | CoinGecko's trust score. |
| `pools[].aggregators` | array | Aggregators surfacing this pool. Used for phantom detection. |
| `pools[].is_phantom` | bool | True for deduped aggregator pools; excluded from volume totals. |

---

### `defi_markets`

Array of DeFi pools/markets where thBILL is deployable.

```json
[
  {
    "protocol": "Morpho Blue",
    "chain": "Arbitrum",
    "pool": "thbill-usdc",
    "tvl_usd": 1234567,
    "apy": 5.12,
    "apy_base": 4.8,
    "apy_reward": 0.32,
    "pool_meta": "Maturity 2026-06-30"
  }
]
```

| Field | Type | Meaning |
|---|---|---|
| `protocol` | string | Pendle, Morpho, Euler, Aave, etc. |
| `chain` | string | Display name of the chain. |
| `pool` | string | DefiLlama pool slug. |
| `tvl_usd` | float | USD TVL in that pool. |
| `apy` / `apy_base` / `apy_reward` | float | Annualized yield components. |
| `pool_meta` | string | Free-form metadata (e.g. Pendle maturity date). |

Source: DefiLlama yields API filtered to thBILL markets.

---

### `theo_reported`

Always `null` in current builds. The scraper was removed in [commit 7de5e17](https://github.com/Today-in-DeFi/PegTracker/commit/7de5e17) — all backing is now verified on-chain.

---

## `thbill_peg_history.json`

Time-series NAV + VWAP for the 7-day peg chart. Array of hourly snapshots:

```json
[
  {
    "timestamp": "2026-04-17T09:20:02.548Z",
    "nav_per_share": 1.023472,
    "vwap": 1.019843,
    "premium_discount_pct": -0.3547
  }
]
```

Produced by `thbill_metrics.py`, capped at ~168 entries (7 days × 24 hours). Client-side filter in `renderPegChart()` drops outliers > 5% absolute as early-data artifacts.

---

## PegTracker-side files

These live at `~/PegTracker/data/` on the server. Not synced to this repo. Referenced here for debugging and for agents that have filesystem access to the PegTracker workspace.

### `thbill_history.json`
Rolling supply history used to compute `redemption_flow.net_flow_24h`. Array of `{timestamp, thbill_supply}` entries. Not synced to the dashboard directly; the deltas it yields flow through `thbill_metrics.json.redemption_flow`.

### `thbill_redemption_cache.json`
State for the Transfer-to-zero scanner in `thbill_metrics.py::_fetch_last_redemption`.

```json
{
  "scan_start_block": 22976986,
  "scanned_through_block": 24944332,
  "last_burn_block": 24627452,
  "last_burn_timestamp": 1773150323,
  "last_burn_amount": 3023351.607901,
  "last_burn_tx": "0x88bbac5e..."
}
```

After the one-time backfill, `scan_start_block` is set to the thBILL deployment block (22,976,986). The hourly runner only scans the gap since the last run, making the live cost ~10k blocks/hour.

### `thbill_redemption_history.md` and `.json`
One-shot full-lifetime backfill artifacts. Produced by `~/PegTracker/backfill_thbill_history.py`. See the [wrapper integrity](../../../../.claude/projects/-home-danger-PegTracker/memory/thbill_wrapper_integrity.md) and [backfill notes](../../../../.claude/projects/-home-danger-PegTracker/memory/thbill_redemption_backfill.md) for context.

- `.md` (human-readable, ~313 KB) — chronological sections per contract (thBILL / tULTRA / UltraManagerFiat + ULTRA flow to/from UltraManagerFiat) and summary stats.
- `.json` (~4.9 MB) — every decoded event with `{contract, block, ts, iso, tx, event, ...typed fields}`. Top-level keys: `scan_range`, `generated_at`, `thbill_events`, `tultra_events`, `ufiat_events`, `ultra_fiat_flow`, `summary`.

To regenerate: `python3 ~/PegTracker/backfill_thbill_history.py`. Takes ~10 min.

---

## See also

- [`dashboard.md`](dashboard.md) — how each UI section reads from these fields
- [`../README.md`](../README.md) — architecture, cron schedule, repo layout
