# Dashboard Section Reference

This document walks through every section on the live dashboard at
[todayindefi.github.io/thbill-risk-info](https://todayindefi.github.io/thbill-risk-info/) —
what it shows, where the data comes from, and how to interpret it.

Read top-to-bottom for a tour; or use the index below to jump.

**Index**
- [Header](#header)
- [Executive Summary](#executive-summary)
- [Overall Risk Assessment](#overall-risk-assessment)
- [Live Metrics](#live-metrics)
- [Collateral & Backing](#collateral--backing)
- [Treasury Holdings](#treasury-holdings)
- [Redemption Mechanics](#redemption-mechanics)
- [Peg Performance](#peg-performance)
- [Secondary Market Liquidity](#secondary-market-liquidity)
- [Risk Analysis](#risk-analysis)
- [Where to Use thBILL (tab)](#where-to-use-thbill-tab)

---

## Header

Fixed at top. Three pieces of chrome:

- **Title**: "thBILL Risk Report"
- **Independence disclaimer** (subtitle): *"Independent third-party review — not operated by Theo Network"*. Present so a reader arriving from a link doesn't mistake this for Theo's own UI.
- **Last updated**: rendered from `timestamp` in `thbill_metrics.json`. Usually within 10 min of "now" when the cron is healthy.

---

## Executive Summary

Three bullets. First two are the most important:

1. **"Who this applies to"** — the retail vs institutional triage. Explicitly: if you don't have KYC with Theo + Libeara you **cannot primary-redeem at all** — your only exit is DEX, so Peg Performance and Secondary Market Liquidity are the sections that matter for you.
2. **"Backing has two transparency layers"** — NAV is strong (Libeara epoch-signs it on-chain) but custody is attested (not contract-enforced). Ties into the Wrapper Integrity finding: the tULTRA wrapper holds zero ULTRA; the backing ratio is a reconciliation against Theo's treasury disclosures, not a property enforced by the contract.
3. **"Main risk is centralization"** — minting, redemption, and treasury management are Theo-controlled.

Source: static HTML. Update: edit `index.html` directly.

---

## Overall Risk Assessment

Five star-rating cards:

| Card | Rating | Subtitle |
|---|---|---|
| Collateral Quality | 5/5 | US T-Bills |
| Liquidity & Peg | 4/5 | (dynamic note from `updateLiquidityPegRating`) |
| Issuer / Governance | 2/5 | Centralized |
| Operational | 3/5 | Standard RWA |
| Transparency | 3/5 | NAV on-chain (strong); custody attested (medium) |

Transparency is 3/5 because NAV is strong (epoch-signed on-chain) but custody is only attested (wrapper holds zero ULTRA, so coverage is a treasury-disclosure cross-check rather than a contract invariant).

Source: static HTML, except Liquidity & Peg subtitle which `js/app.js` computes from actual peg volatility and pool depth.

---

## Live Metrics

Four cards, all dynamic:

1. **Total Value Locked** — `tvl_usd.total` with per-chain breakdown underneath. Source: DefiLlama + on-chain checks.
2. **USD Backing Ratio** — `backing.usd_backing_ratio` as a percent with green/yellow/red color. Note line explains the methodology: *"Theo treasury custody + in-flight queue + USDC ÷ thBILL liability (reconciliation, not wrapper-held)"*.
3. **Peg Discount** — `peg.premium_discount_pct`. Color-coded (green ≤0.1%, yellow ≤0.5%, red >0.5%). Links to Peg Performance below. **This is the retail's actual exit cost when primary redemption is KYC-gated** — it's the single most important number on the page for non-KYC holders.
4. **Days Since Last Redemption** — `redemption_flow.days_since_last_redemption`. Green <7d, yellow <30d, red ≥30d. Subtitle shows last redemption date + Etherscan tx link when known, or a warning if no burns have been seen in the scan window. A peg-arb inactivity signal: when nobody's primary-redeeming, DEX discount can drift without correction.

---

## Collateral & Backing

Leads with a prose description and a **backing-model badge**:

- `synthetic · attested` (yellow) — tULTRA wrapper holds 0 ULTRA. Coverage is a reconciliation against Theo's treasury custody, not contract-enforced. (Current state.)
- `custodial` (green) — would flip here if `ultra_balance_of_wrapper` ever becomes non-zero.

Then a **USD backing summary panel** showing:
- thBILL NAV (USDC/share), thBILL supply
- USD liabilities = supply × NAV
- USD assets = Theo custody × NAV + in-flight queue × NAV + USDC
- tULTRA USD price + source (on-chain Libeara, Theo vault-implied, or CoinGecko)
- ULTRA NAV (from UltraManager.lastSetMintExchangeRate) + drift note
- USD backing ratio (the headline number)
- If in-flight redemption queue > 0: italic line *"↳ includes X ULTRA ($Y) in UltraManagerFiat redemption queue · ex-queue floor: Z%"* with an Etherscan link

Below the panel, a **table** showing the collateral composition in USD: thBILL supply (reference), tULTRA Supply (direct collateral), any DeFi USDC positions (e.g. Aave), USDC spot in treasury. Columns: Asset · Amount · Unit · USD Value.

Footer explains the trust assumption explicitly (treasury-disclosure cross-check, not contract-enforced) and quotes Theo's own docs: *"tULTRA is backed 1:1 by ULTRA shares or USDC reserved to mint ULTRA shares."*

---

## Treasury Holdings

Per-chain breakdown of Theo's ULTRA custody + in-flight queue + USDC cushion, all valued in USD.

**Rows (in order):**
1. **tULTRA wrapper contract** — yellow row, shows `ULTRA.balanceOf(tULTRA wrapper)` = 0 for the synthetic model. Subtitle: *"ERC-4626 declares asset() = ULTRA; wrapper holds none. See Technical Risk below."* Row auto-turns green if the wrapper ever starts holding ULTRA.
2. Ethereum treasury ULTRA
3. Arbitrum treasury ULTRA
4. Solana treasury ULTRA
5. USDC (treasury cash) — spot + any DeFi USDC positions summed
6. **Treasury subtotal (ex-queue floor)** — the `usd_backing_ratio_ex_queue` scenario. If the in-flight queue cleared to zero value instead of returning as USDC, this is what backing would look like.
7. **In-flight** — ULTRA sitting in `UltraManagerFiat` awaiting settlement (blue italic row)
8. **Total** — grand sum (should equal the headline `usd_backing_ratio` above, after the USDC hasn't been double-counted).

Columns: Chain / Contract · Amount · USD Value · % of thBILL Liability.

Avalanche is intentionally omitted — ULTRA there is held by FundBridge launch partners, not in Theo's treasury.

---

## Redemption Mechanics

Static prose description of the two exit paths:

- **Primary (NAV, gated)**: thBILL → tULTRA → ULTRA → USDC. 0% fees at every layer, KYC with Theo + Libeara, ≥$50K minimum, T+4 business days.
- **Secondary (DEX, instant)**: sell into Uniswap / Project X / Pancake at the prevailing discount. No KYC, no minimum, any size, but depth is thin.

Closing paragraph explains the peg discount as the *liquidity-access premium* — what a holder pays for instant permissionless exit vs the KYC-and-wait primary path.

Source: static HTML.

---

## Peg Performance

Three cards + a chart + a per-chain table.

**Cards:**
- **NAV per share** — `peg.nav_per_share` from ERC-4626 `convertToAssets(1 thBILL)`
- **Market Price (VWAP)** — `peg.vwap`, volume-weighted across all DEX pools
- **Premium / Discount** — `peg.premium_discount_pct` — same value and color as the Live Metrics Peg Discount card.

**Chart:** 7-day NAV vs VWAP history. Data source: `thbill_peg_history.json` (separate file, synced hourly). Outliers > 5% filtered as early-data artifacts.

**Per-chain table:** price + 24h volume + deviation vs NAV, per DEX chain (Arbitrum, HyperEVM, Ethereum). Rows with pool TVL < $50K get a gray *"(thin — not a practical exit route)"* tag — Ethereum currently flags this way (pool TVL ~$12K).

---

## Secondary Market Liquidity

Three summary cards (Total TVL, 24h Volume, Active Pools) then a per-pool table:

**Columns:** Chain · Market · TVL · 2% Depth · 24h Volume · Spread.

**2% Depth** has a plain-English tooltip: *"How much you can exit in one trade before price moves 2%"*. Source: on-chain Uniswap V3 QuoterV2 binary search for each pool.

Source: `secondary_liquidity.pools`.

---

## Risk Analysis

Five prose cards on the main tab. All static HTML (not dynamic):

1. **Issuer Risk** — Theo's centralized control, no on-chain governance, Panama domicile, non-licensed-entity, token holders' legal claim is against a Panama entity.
2. **Decentralization** — highly centralized, UUPS-upgradeable with no timelock (admin actions take effect immediately).
3. **Technical Risk** — ERC-4626 interface, tULTRA is synthetic (holds 0 ULTRA, MINTER-gated `depositOptimistic`, redemption pays USDC not ULTRA), multi-chain bridge risk.
4. **Minting & Redemption** — KYC required for all primary redemption regardless of size. Libeara's ≥$50K minimum on top. Non-KYC → DEX only.
5. **Operational Risk** — custodian failure (StanChart Singapore), fund administrator failure (Vistra), regulatory action, oracle failures. Backing ratio explicitly excludes Avalanche ULTRA (FundBridge custody, not Theo).

---

## Where to Use thBILL (tab)

Tab nav in the top bar. Data from `defi_markets` (populated from DefiLlama yields API).

Shows protocols where thBILL is deployable as collateral or yield source. Described as an "opportunity list, not a risk signal — integration breadth reflects partnership traction, not collateral quality."

---

## See also

- [`data-schema.md`](data-schema.md) — field-by-field reference for `thbill_metrics.json` and related files
- [`../README.md`](../README.md) — architecture, data flow, cron schedule, repo layout
