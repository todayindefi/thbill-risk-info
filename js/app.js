/**
 * thBILL Risk Dashboard - Main Application
 * Fetches metrics from thbill_metrics.json and updates the UI
 */

// Configuration
const METRICS_URL = 'data/thbill_metrics.json';
const PEG_HISTORY_URL = 'data/thbill_peg_history.json';
const SUPPLY_HISTORY_URL = 'data/thbill_history.json';

// Utility functions
function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined) return '-';
    return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatCurrency(num, decimals = 0) {
    if (num === null || num === undefined) return '-';
    return '$' + formatNumber(num, decimals);
}

function formatPercent(num, decimals = 2) {
    if (num === null || num === undefined) return '-';
    return num.toFixed(decimals) + '%';
}

function formatDate(isoString) {
    if (!isoString) return '-';
    // Append 'Z' if no timezone indicator - timestamps from the API are UTC
    const utcString = isoString.endsWith('Z') ? isoString : isoString + 'Z';
    const date = new Date(utcString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });
}

// Update functions
function updateLastUpdated(timestamp) {
    document.getElementById('last-updated').textContent = formatDate(timestamp);
}

function updateTVL(tvlData) {
    if (!tvlData) return;

    document.getElementById('tvl-total').textContent = formatCurrency(tvlData.total);

    const breakdown = Object.entries(tvlData.by_chain || {})
        .map(([chain, val]) => `${chain}: ${formatCurrency(val)}`)
        .join(' | ');
    document.getElementById('tvl-breakdown').textContent = breakdown;
}

function updateBackingRatio(backing) {
    if (!backing) return;

    const elem = document.getElementById('backing-ratio');
    const noteElem = document.getElementById('backing-ratio-note');
    elem.classList.remove('text-green-400', 'text-yellow-400', 'text-red-400', 'text-gray-400');

    const ratio = backing.usd_backing_ratio;
    const priceSource = backing.tultra_usd_price_source || 'unavailable';
    const isCircular = priceSource === 'vault_implied_circular';
    const isOnchain = priceSource === 'onchain_ultramanager';
    const epoch = backing.ultra_onchain_nav_epoch;

    if (ratio !== null && ratio !== undefined) {
        elem.textContent = formatPercent(ratio * 100);
        if (isCircular) {
            // Theo-reported, not independently verified — always warn, regardless of value
            elem.classList.add('text-yellow-400');
        } else if (ratio >= 0.98) elem.classList.add('text-green-400');
        else if (ratio >= 0.90) elem.classList.add('text-yellow-400');
        else elem.classList.add('text-red-400');
        if (noteElem) {
            if (isCircular) {
                noteElem.innerHTML = '<span class="text-yellow-300">Theo-reported (circular)</span> <span class="text-gray-500">— tULTRA priced at vault-implied NAV, not independently verified</span>';
            } else if (isOnchain) {
                noteElem.innerHTML = `<span class="text-green-300">Libeara on-chain NAV</span> <span class="text-gray-500">— daily T-bill NAV published by Libeara${epoch ? ' (epoch ' + epoch + ')' : ''}</span>`;
            } else {
                noteElem.innerHTML = `tULTRA price from ${priceSource}`;
            }
        }
    } else {
        elem.textContent = 'indeterminate';
        elem.classList.add('text-gray-400');
        if (noteElem) {
            noteElem.innerHTML = '<span class="inline-block px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-300 border border-yellow-700/50">tULTRA USD price unavailable</span>';
        }
    }
}

function updateUsdBackingSummary(backing) {
    const container = document.getElementById('usd-backing-summary');
    if (!container || !backing) return;

    const nav = backing.thbill_nav_per_share;
    const supply = backing.thbill_supply;
    const liab = backing.usd_liabilities;
    const assets = backing.usd_assets;
    const ratio = backing.usd_backing_ratio;
    const price = backing.tultra_usd_price;
    const priceSource = backing.tultra_usd_price_source || 'unavailable';
    const implied = backing.tultra_implied_price_from_vault;
    const onchainNav = backing.ultra_onchain_nav;
    const onchainEpoch = backing.ultra_onchain_nav_epoch;
    const drift = backing.theo_nav_drift_pct;

    const isCircular = priceSource === 'vault_implied_circular';
    const isOnchain = priceSource === 'onchain_ultramanager';

    let sourceLabel;
    if (isCircular) {
        sourceLabel = '<span class="text-yellow-300">Theo-reported (vault-implied, circular)</span>';
    } else if (isOnchain) {
        sourceLabel = `<span class="text-green-300">Libeara on-chain, epoch ${onchainEpoch}</span>`;
    } else {
        sourceLabel = `<span class="text-gray-500">(source: ${priceSource})</span>`;
    }

    const priceColor = isCircular ? 'text-yellow-300' : (isOnchain ? 'text-green-300' : 'text-white');
    const priceLine = price !== null && price !== undefined
        ? `<span class="${priceColor}">$${price.toFixed(6)}</span> ${sourceLabel}`
        : `<span class="text-yellow-300">unavailable</span> <span class="text-gray-500">(source: ${priceSource})</span>`;

    // On-chain NAV is attested by Libeara; show the drift between it and Theo's vault-implied price
    // as a lag/accuracy signal when both are available.
    let navDetailLine = '';
    if (isOnchain && onchainNav !== null && onchainNav !== undefined) {
        const driftTxt = (drift !== null && drift !== undefined)
            ? ` <span class="text-xs ${Math.abs(drift) > 0.5 ? 'text-yellow-300' : 'text-gray-500'}">(Theo vault-implied $${implied?.toFixed(6) ?? '-'} → ${drift >= 0 ? '+' : ''}${drift.toFixed(3)}% drift)</span>`
            : '';
        navDetailLine = `<div class="md:col-span-2"><span class="italic text-gray-400">↳ ULTRA NAV (UltraManager.lastSetMintExchangeRate, epoch ${onchainEpoch}): $${onchainNav.toFixed(6)}</span>${driftTxt}</div>`;
    } else if (implied !== null && implied !== undefined && !isCircular) {
        navDetailLine = `<div class="md:col-span-2"><span class="italic text-gray-400">↳ implied from vault NAV: $${implied.toFixed(6)} — circular, not an independent check</span></div>`;
    }

    const assetsLine = assets !== null && assets !== undefined
        ? `$${formatNumber(assets, 0)}`
        : '<span class="text-gray-500">— (needs tULTRA USD price)</span>';

    const ratioLine = ratio !== null && ratio !== undefined
        ? `<span class="${isCircular ? 'text-yellow-300' : 'text-white'} font-semibold">${formatPercent(ratio * 100)}</span>${isCircular ? ' <span class="text-gray-500 text-xs">(Theo-reported, not independently verified)</span>' : ''}`
        : '<span class="text-yellow-300 font-semibold">indeterminate</span>';

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-gray-300">
            <div>thBILL NAV: <span class="text-white">${nav ? '$' + nav.toFixed(6) : '-'}</span> <span class="text-gray-500">(USDC/share)</span></div>
            <div>thBILL supply: <span class="text-white">${formatNumber(supply, 0)}</span></div>
            <div>USD liabilities: <span class="text-white">${liab ? '$' + formatNumber(liab, 0) : '-'}</span></div>
            <div>USD assets: ${assetsLine}</div>
            <div class="md:col-span-2 mt-1">tULTRA USD price: ${priceLine}</div>
            ${navDetailLine}
            <div class="md:col-span-2 mt-1">USD backing ratio: ${ratioLine}</div>
        </div>
    `;
}

function updateNetFlow(flow, supplyHistory, currentSupply) {
    if (!flow) return;

    const elem = document.getElementById('net-flow');
    const noteElem = document.getElementById('flow-note');

    // Compute 7d net flow from supply history. History is a sorted array of
    // { timestamp, thbill_supply } hourly snapshots. We pick the entry closest
    // to (now - 7d); if history is too short, fall back to the oldest entry
    // and label the window accordingly.
    let net7d = null;
    let pct7d = null;
    let windowDays = 7;
    let insufficient = false;

    if (Array.isArray(supplyHistory) && supplyHistory.length > 0 && currentSupply != null) {
        const nowMs = Date.now();
        const targetMs = nowMs - 7 * 24 * 60 * 60 * 1000;
        let closest = supplyHistory[0];
        let closestDelta = Math.abs(new Date(
            closest.timestamp.endsWith('Z') ? closest.timestamp : closest.timestamp + 'Z'
        ).getTime() - targetMs);
        for (const entry of supplyHistory) {
            const ts = entry.timestamp.endsWith('Z') ? entry.timestamp : entry.timestamp + 'Z';
            const delta = Math.abs(new Date(ts).getTime() - targetMs);
            if (delta < closestDelta) {
                closest = entry;
                closestDelta = delta;
            }
        }
        const oldTs = closest.timestamp.endsWith('Z') ? closest.timestamp : closest.timestamp + 'Z';
        const actualWindowMs = nowMs - new Date(oldTs).getTime();
        windowDays = actualWindowMs / (24 * 60 * 60 * 1000);
        insufficient = windowDays < 6.5; // history doesn't span a full week yet
        net7d = currentSupply - closest.thbill_supply;
        pct7d = closest.thbill_supply ? (net7d / closest.thbill_supply) * 100 : 0;
    }

    if (net7d !== null) {
        const direction = net7d >= 0 ? '+' : '';
        elem.textContent = direction + formatNumber(net7d, 0) + ' thBILL';
        elem.classList.add(net7d >= 0 ? 'text-green-400' : 'text-red-400');
        if (insufficient) {
            noteElem.textContent = `${direction}${formatPercent(pct7d, 4)} over ${windowDays.toFixed(1)}d (history < 7d)`;
        } else {
            noteElem.textContent = `${direction}${formatPercent(pct7d, 4)} change`;
        }
    } else {
        elem.textContent = 'Calculating...';
        elem.classList.add('text-gray-400');
        noteElem.textContent = flow.note || '';
    }

    // Days since last redemption — peg-mechanism health signal. thBILL's peg
    // is maintained by redemption arb; if no one's redeeming, the discount
    // can drift without correction.
    const daysElem = document.getElementById('days-since-redemption');
    const daysNoteElem = document.getElementById('days-since-redemption-note');
    if (daysElem && flow.days_since_last_redemption !== undefined && flow.days_since_last_redemption !== null) {
        const days = flow.days_since_last_redemption;
        const hasExact = flow.last_redemption_timestamp !== null && flow.last_redemption_timestamp !== undefined;
        daysElem.textContent = (hasExact ? '' : '≥') + days.toFixed(1) + 'd';
        daysElem.classList.remove('text-green-400', 'text-yellow-400', 'text-red-400', 'text-gray-400');
        if (days < 7) daysElem.classList.add('text-green-400');
        else if (days < 30) daysElem.classList.add('text-yellow-400');
        else daysElem.classList.add('text-red-400');

        if (daysNoteElem) {
            if (hasExact) {
                const amt = flow.last_redemption_amount_thbill;
                const ts = flow.last_redemption_timestamp ? flow.last_redemption_timestamp.slice(0, 10) : '?';
                const txShort = flow.last_redemption_tx ? flow.last_redemption_tx.slice(0, 10) + '…' : '';
                const txLink = flow.last_redemption_tx
                    ? ` <a href="https://etherscan.io/tx/${flow.last_redemption_tx}" target="_blank" class="text-blue-400 hover:underline">${txShort}</a>`
                    : '';
                daysNoteElem.innerHTML = `last: ${formatNumber(amt, 0)} thBILL on ${ts}${txLink}`;
            } else {
                daysNoteElem.innerHTML = '<span class="text-yellow-300">No burns in ~35d scan window</span> <span class="text-gray-500">— peg arb inactive</span>';
            }
        }
    }
}

function updateBackingTable(backing) {
    if (!backing) return;

    const supply = backing.thbill_supply || 1;
    const hasTultra = backing.tultra_supply != null;

    // Token-level accounting only. This table shows *token counts* and USDC
    // balances — not USD-denominated backing. USD backing lives in the
    // banner + USD summary panel above.
    const rows = [
        {
            asset: 'thBILL Supply',
            amount: supply,
            unit: 'shares',
            pct: 100,
            isSupply: true
        }
    ];

    if (hasTultra) {
        const vaultMatch = backing.tultra_vault_balance != null &&
            Math.abs(backing.tultra_vault_balance - backing.tultra_supply) < 0.01;
        if (vaultMatch) {
            rows.push({
                asset: 'tULTRA Supply',
                note: '100% in vault',
                amount: backing.tultra_supply,
                unit: 'tULTRA',
                pct: (backing.tultra_supply / supply) * 100
            });
        } else {
            rows.push({
                asset: 'tULTRA in Vault',
                amount: backing.tultra_vault_balance,
                unit: 'tULTRA',
                pct: (backing.tultra_vault_balance / supply) * 100,
                isGap: true
            });
            rows.push({
                asset: 'tULTRA Supply',
                amount: backing.tultra_supply,
                unit: 'tULTRA',
                pct: (backing.tultra_supply / supply) * 100,
                isGap: true
            });
        }
    }

    rows.push({
        asset: 'ULTRA Total',
        note: 'T-bills across all chains',
        amount: backing.ultra_total,
        unit: 'ULTRA',
        pct: (backing.ultra_total / supply) * 100
    });

    let defiUsdc = 0;
    if (backing.treasury_defi_positions) {
        for (const pos of backing.treasury_defi_positions) {
            defiUsdc += pos.amount;
            rows.push({
                asset: `${pos.protocol} ${pos.token}`,
                note: `Treasury supply on ${pos.protocol}`,
                amount: pos.amount,
                unit: 'USDC',
                pct: (pos.amount / supply) * 100,
                isCurrency: true
            });
        }
    }

    const spotUsdc = (backing.treasury_usdc || 0) - defiUsdc;
    if (spotUsdc > 0.01 || defiUsdc === 0) {
        rows.push({
            asset: 'USDC (spot)',
            note: 'Treasury wallet',
            amount: spotUsdc,
            unit: 'USDC',
            pct: (spotUsdc / supply) * 100,
            isCurrency: true
        });
    }

    const tbody = document.getElementById('backing-table');
    tbody.innerHTML = rows.map(row => {
        let rowClass = '';
        if (row.isGap) rowClass = 'bg-yellow-900/20 text-yellow-400';
        if (row.isSupply) rowClass = 'bg-gray-900 font-bold border-b border-gray-700';

        const amount = row.isCurrency ? formatCurrency(row.amount, 2) : formatNumber(row.amount, 2);
        const noteSpan = row.note ? `<span class="text-xs text-gray-500 ml-2">(${row.note})</span>` : '';

        return `
            <tr class="${rowClass}">
                <td class="px-5 py-3">${row.asset}${noteSpan}</td>
                <td class="text-right px-5 py-3">${amount}</td>
                <td class="text-right px-5 py-3 text-gray-400 text-xs">${row.unit || ''}</td>
                <td class="text-right px-5 py-3">${formatPercent(row.pct)}</td>
            </tr>
        `;
    }).join('');
}

function updateTreasuryTable(backing) {
    if (!backing) return;

    const rows = [
        {
            chain: 'Ethereum',
            treasury: backing.treasury_ultra_ethereum,
            supply: backing.ultra_ethereum,
            coverage: backing.ultra_ethereum ? (backing.treasury_ultra_ethereum / backing.ultra_ethereum) * 100 : 0
        },
        {
            chain: 'Arbitrum',
            treasury: backing.treasury_ultra_arbitrum,
            supply: backing.ultra_arbitrum,
            coverage: backing.ultra_arbitrum ? (backing.treasury_ultra_arbitrum / backing.ultra_arbitrum) * 100 : 0
        },
        {
            chain: 'Avalanche',
            treasury: backing.treasury_ultra_avalanche,
            supply: backing.ultra_avalanche,
            coverage: backing.ultra_avalanche ? (backing.treasury_ultra_avalanche / backing.ultra_avalanche) * 100 : 0,
            note: backing.treasury_ultra_avalanche === 0 ? 'FundBridge deployment, not in Theo custody' : null
        },
        {
            chain: 'Solana',
            treasury: backing.treasury_ultra_solana,
            supply: backing.ultra_solana,
            coverage: backing.ultra_solana ? (backing.treasury_ultra_solana / backing.ultra_solana) * 100 : 0
        },
        {
            chain: 'Total',
            treasury: backing.treasury_ultra_total,
            supply: backing.ultra_total,
            coverage: backing.ultra_total ? (backing.treasury_ultra_total / backing.ultra_total) * 100 : 0,
            isTotal: true
        }
    ];

    const tbody = document.getElementById('treasury-table');
    tbody.innerHTML = rows.map(row => {
        const rowClass = row.isTotal ? 'bg-gray-900 font-medium border-t border-gray-700' : '';
        const treasuryVal = row.treasury !== null ? formatNumber(row.treasury, 2) : (row.note || '-');
        const coverageVal = row.coverage !== null ? formatPercent(row.coverage, 1) : '-';

        const chainCell = row.note
            ? `${row.chain}<span class="block text-xs text-gray-500">${row.note}</span>`
            : row.chain;

        return `
            <tr class="${rowClass}">
                <td class="px-5 py-3">${chainCell}</td>
                <td class="text-right px-5 py-3">${treasuryVal}</td>
                <td class="text-right px-5 py-3">${formatNumber(row.supply, 2)}</td>
                <td class="text-right px-5 py-3">${coverageVal}</td>
            </tr>
        `;
    }).join('');
}

function formatDepth(buy, sell) {
    // Format 2% depth as buy/sell or average
    if (buy === null && sell === null) return '-';
    if (buy !== null && sell !== null) {
        // Show average for compact display
        const avg = (buy + sell) / 2;
        return formatCurrency(avg, 0);
    }
    return formatCurrency(buy || sell, 0);
}

// Token address to symbol mapping
const TOKEN_SYMBOLS = {
    // thBILL
    '0xfdd22ce6d1f66bc0ec89b20bf16ccb6670f55a5a': 'thBILL',
    '0x5fa487bca6158c64046b2813623e20755091da0b': 'thBILL',
    // HyperEVM tokens
    '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb': 'USDT0',
    '0x5555555555555555555555555555555555555555': 'WHYPE',
    '0xfd739d4e423301ce9385c1fb8850539d657c296d': 'kHYPE',
    '0x111111a1a0667d36bd57c0a9f569b98057111111': 'USDH',
    '0xb88339cb7199b77e23db6e890353e22632ba630f': 'USDC',
    // Arbitrum/Ethereum tokens
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
};

function formatPairName(pair) {
    // Convert address pair to symbol pair (e.g., "0xABC.../0xDEF..." -> "thBILL/USDC")
    const parts = pair.split('/');
    const symbols = parts.map(addr => {
        const lower = addr.toLowerCase();
        return TOKEN_SYMBOLS[lower] || addr.slice(0, 8) + '...';
    });
    return symbols.join('/');
}

function updateLiquidityTable(liquidity) {
    if (!liquidity) return;

    const allPools = liquidity.pools || [];

    // Filter out pools with TVL < $5000
    const MIN_TVL = 5000;
    const pools = allPools.filter(p => (p.tvl_usd || 0) >= MIN_TVL);

    // Update totals based on filtered pools
    const filteredTvl = pools.reduce((sum, p) => sum + (p.tvl_usd || 0), 0);
    const filteredVolume = pools.reduce((sum, p) => sum + (p.volume_24h || 0), 0);

    document.getElementById('dex-volume').textContent = formatCurrency(filteredVolume);
    document.getElementById('dex-tvl').textContent = formatCurrency(filteredTvl);
    document.getElementById('pool-count').textContent = pools.length;

    const tbody = document.getElementById('liquidity-table');

    if (pools.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-3 text-gray-500">No pools found</td></tr>';
        return;
    }

    // Sort by TVL descending
    pools.sort((a, b) => (b.tvl_usd || 0) - (a.tvl_usd || 0));

    // Chain display names
    const chainNames = {
        'hyperevm': 'HyperEVM',
        'arbitrum': 'Arbitrum',
        'ethereum': 'Ethereum',
        'base': 'Base',
    };

    tbody.innerHTML = pools.map(pool => {
        const depthBuy = pool.depth_2pct_buy;
        const depthSell = pool.depth_2pct_sell;
        const depthDisplay = formatDepth(depthBuy, depthSell);
        const depthTitle = (depthBuy !== null && depthSell !== null)
            ? `Buy: ${formatCurrency(depthBuy, 0)} / Sell: ${formatCurrency(depthSell, 0)}`
            : '';

        const pairDisplay = formatPairName(pool.pair);
        const chainDisplay = chainNames[pool.chain] || pool.chain || '-';

        return `
            <tr class="border-t border-gray-700/50">
                <td class="px-5 py-3 text-gray-400">${chainDisplay}</td>
                <td class="px-5 py-3">
                    <div class="font-medium">${pool.market}</div>
                    <div class="text-xs text-gray-500">${pairDisplay}</div>
                </td>
                <td class="text-right px-5 py-3">${formatCurrency(pool.tvl_usd)}</td>
                <td class="text-right px-5 py-3" title="${depthTitle}">${depthDisplay}</td>
                <td class="text-right px-5 py-3">${formatCurrency(pool.volume_24h)}</td>
                <td class="text-right px-5 py-3">${pool.spread ? formatPercent(pool.spread) : '-'}</td>
            </tr>
        `;
    }).join('');
}

function updateDefiTable(markets) {
    if (!markets) return;

    const PROTOCOL_CATEGORY = {
        'pendle': 'pendle',
        'uniswap-v3': 'dex',
        'project-x': 'dex',
    };

    const mmMarkets = [];
    const dexMarkets = [];
    const pendleMarkets = [];

    for (const m of markets) {
        const cat = PROTOCOL_CATEGORY[m.protocol] || 'mm';
        if (cat === 'pendle') pendleMarkets.push(m);
        else if (cat === 'dex') dexMarkets.push(m);
        else mmMarkets.push(m);
    }

    const sortByTvl = (a, b) => (b.tvl_usd || 0) - (a.tvl_usd || 0);
    const emptyRow = '<tr><td colspan="5" class="px-5 py-3 text-gray-500">No markets found</td></tr>';

    // Render Money Markets
    const mmTbody = document.getElementById('defi-mm-table');
    if (mmMarkets.length === 0) {
        mmTbody.innerHTML = emptyRow;
    } else {
        mmTbody.innerHTML = mmMarkets.sort(sortByTvl).map(market => `
            <tr class="border-t border-gray-700/50">
                <td class="px-5 py-3 capitalize">${market.protocol || '-'}</td>
                <td class="px-5 py-3">${market.chain || '-'}</td>
                <td class="px-5 py-3">${market.pool || '-'}</td>
                <td class="text-right px-5 py-3">${formatCurrency(market.tvl_usd)}</td>
                <td class="text-right px-5 py-3">${market.apy ? formatPercent(market.apy) : '-'}</td>
            </tr>
        `).join('');
    }

    // Render DEXs
    const dexTbody = document.getElementById('defi-dex-table');
    if (dexMarkets.length === 0) {
        dexTbody.innerHTML = emptyRow;
    } else {
        dexTbody.innerHTML = dexMarkets.sort(sortByTvl).map(market => `
            <tr class="border-t border-gray-700/50">
                <td class="px-5 py-3 capitalize">${market.protocol || '-'}</td>
                <td class="px-5 py-3">${market.chain || '-'}</td>
                <td class="px-5 py-3">${market.pool || '-'}</td>
                <td class="text-right px-5 py-3">${formatCurrency(market.tvl_usd)}</td>
                <td class="text-right px-5 py-3">${market.apy ? formatPercent(market.apy) : '-'}</td>
            </tr>
        `).join('');
    }

    // Render Pendle
    const pendleTbody = document.getElementById('defi-pendle-table');
    if (pendleMarkets.length === 0) {
        pendleTbody.innerHTML = emptyRow;
    } else {
        pendleTbody.innerHTML = pendleMarkets.sort(sortByTvl).map(market => {
            const meta = market.pool_meta || '';

            // Parse pool type
            let poolType = '-';
            if (/buying\s*PT/i.test(meta)) poolType = 'PT (Fixed Yield)';
            else if (/For\s*LP/i.test(meta)) poolType = 'LP';

            // Parse maturity date from format like "19FEB2026"
            let maturity = '-';
            const dateMatch = meta.match(/(\d{1,2})([A-Z]{3})(\d{4})/);
            if (dateMatch) {
                const months = { JAN: 'Jan', FEB: 'Feb', MAR: 'Mar', APR: 'Apr', MAY: 'May', JUN: 'Jun',
                                 JUL: 'Jul', AUG: 'Aug', SEP: 'Sep', OCT: 'Oct', NOV: 'Nov', DEC: 'Dec' };
                const day = dateMatch[1];
                const mon = months[dateMatch[2]] || dateMatch[2];
                const year = dateMatch[3];
                maturity = `${day} ${mon} ${year}`;
            }

            return `
                <tr class="border-t border-gray-700/50">
                    <td class="px-5 py-3">${poolType}</td>
                    <td class="px-5 py-3">${market.chain || '-'}</td>
                    <td class="px-5 py-3">${maturity}</td>
                    <td class="text-right px-5 py-3">${formatCurrency(market.tvl_usd)}</td>
                    <td class="text-right px-5 py-3">${market.apy ? formatPercent(market.apy) : '-'}</td>
                </tr>
            `;
        }).join('');
    }
}

function updatePegStatus(peg) {
    if (!peg) return;

    const navElem = document.getElementById('peg-nav');
    const vwapElem = document.getElementById('peg-vwap');
    const pdElem = document.getElementById('peg-premium-discount');

    if (peg.nav_per_share) {
        navElem.textContent = '$' + peg.nav_per_share.toFixed(6);
    }
    if (peg.vwap) {
        vwapElem.textContent = '$' + peg.vwap.toFixed(6);
    }

    if (peg.premium_discount_pct !== null && peg.premium_discount_pct !== undefined) {
        const pd = peg.premium_discount_pct;
        const sign = pd >= 0 ? '+' : '';
        pdElem.textContent = sign + pd.toFixed(4) + '%';

        // Color thresholds: green (within 0.1%), yellow (0.1-0.5%), red (>0.5%)
        const absPd = Math.abs(pd);
        if (absPd <= 0.1) {
            pdElem.classList.add('text-green-400');
        } else if (absPd <= 0.5) {
            pdElem.classList.add('text-yellow-400');
        } else {
            pdElem.classList.add('text-red-400');
        }
    }

    // Per-chain price table
    const tbody = document.getElementById('peg-pool-table');
    const chainPrices = peg.per_chain_prices || {};
    const entries = Object.entries(chainPrices);

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-5 py-3 text-gray-500">No chain prices available</td></tr>';
        return;
    }

    const nav = peg.nav_per_share;
    tbody.innerHTML = entries.map(([chain, data]) => {
        const price = data.vwap;
        const volume = data.volume_24h;
        let deviationText = '-';
        let deviationClass = '';
        if (nav && price) {
            const dev = ((price - nav) / nav) * 100;
            const sign = dev >= 0 ? '+' : '';
            deviationText = sign + dev.toFixed(4) + '%';
            const absDev = Math.abs(dev);
            if (absDev <= 0.1) {
                deviationClass = 'text-green-400';
            } else if (absDev <= 0.5) {
                deviationClass = 'text-yellow-400';
            } else {
                deviationClass = 'text-red-400';
            }
        }
        const volStr = volume >= 1000000 ? '$' + (volume / 1000000).toFixed(2) + 'M'
            : volume >= 1000 ? '$' + (volume / 1000).toFixed(1) + 'K'
            : '$' + volume.toFixed(0);
        return `
            <tr class="border-t border-gray-700/50">
                <td class="px-5 py-3">${chain}</td>
                <td class="text-right px-5 py-3">$${price.toFixed(4)}</td>
                <td class="text-right px-5 py-3 text-gray-400">${volStr}</td>
                <td class="text-right px-5 py-3 ${deviationClass}">${deviationText}</td>
            </tr>
        `;
    }).join('');
}

// Peg history chart
let pegChartInstance = null;

function renderPegChart(history) {
    try {
        // Filter outliers (early data has 10.6% artifacts)
        const filtered = history.filter(d => Math.abs(d.premium_discount_pct) <= 5);
        if (filtered.length === 0) return;

        const labels = filtered.map(d => {
            const ts = d.timestamp.endsWith('Z') ? d.timestamp : d.timestamp + 'Z';
            return new Date(ts);
        });
        const values = filtered.map(d => d.premium_discount_pct);

        const canvas = document.getElementById('peg-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (pegChartInstance) {
            pegChartInstance.destroy();
        }

        pegChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Premium/Discount %',
                    data: values,
                    borderColor: '#9ca3af',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHitRadius: 8,
                    fill: {
                        target: 'origin'
                    },
                    segment: {
                        borderColor: function(ctx) {
                            const y = ctx.p1.parsed.y;
                            return y >= 0 ? '#4ade80' : '#f87171';
                        },
                        backgroundColor: function(ctx) {
                            const y = ctx.p1.parsed.y;
                            return y >= 0 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)';
                        }
                    },
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1f2937',
                        titleColor: '#d1d5db',
                        bodyColor: '#f3f4f6',
                        borderColor: '#374151',
                        borderWidth: 1,
                        callbacks: {
                            title: function(items) {
                                const date = new Date(items[0].parsed.x);
                                return date.toLocaleString('en-US', {
                                    month: 'short', day: 'numeric',
                                    hour: '2-digit', minute: '2-digit',
                                    timeZoneName: 'short'
                                });
                            },
                            label: function(item) {
                                const val = item.parsed.y;
                                const sign = val >= 0 ? '+' : '';
                                return sign + val.toFixed(4) + '%';
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            zeroLine: {
                                type: 'line',
                                yMin: 0,
                                yMax: 0,
                                borderColor: '#6b7280',
                                borderWidth: 2
                            },
                            upperBand: {
                                type: 'line',
                                yMin: 0.5,
                                yMax: 0.5,
                                borderColor: '#374151',
                                borderWidth: 1,
                                borderDash: [6, 4],
                                label: {
                                    display: true,
                                    content: '+0.5%',
                                    position: 'start',
                                    backgroundColor: 'transparent',
                                    color: '#6b7280',
                                    font: { size: 10 }
                                }
                            },
                            lowerBand: {
                                type: 'line',
                                yMin: -0.5,
                                yMax: -0.5,
                                borderColor: '#374151',
                                borderWidth: 1,
                                borderDash: [6, 4],
                                label: {
                                    display: true,
                                    content: '-0.5%',
                                    position: 'start',
                                    backgroundColor: 'transparent',
                                    color: '#6b7280',
                                    font: { size: 10 }
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            tooltipFormat: 'MMM d, HH:mm',
                            displayFormats: {
                                hour: 'MMM d HH:mm',
                                day: 'MMM d'
                            }
                        },
                        grid: { color: '#1f2937' },
                        ticks: { color: '#6b7280', maxTicksLimit: 8 }
                    },
                    y: {
                        grid: { color: '#1f2937' },
                        ticks: {
                            color: '#6b7280',
                            callback: function(value) {
                                return value.toFixed(2) + '%';
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Failed to render peg chart:', error);
    }
}

// Dynamic Liquidity & Peg star rating
function updateLiquidityPegRating(peg, liquidity, pegHistory) {
    const starsEl = document.getElementById('rating-liquidity-stars');
    const noteEl = document.getElementById('rating-liquidity-note');
    if (!starsEl || !noteEl) return;
    if (!peg && !liquidity) return;

    // --- Peg score (7-day avg absolute deviation) ---
    let pegScore = 3;
    const validHistory = (pegHistory || []).filter(d =>
        d.premium_discount_pct !== null &&
        d.premium_discount_pct !== undefined &&
        Math.abs(d.premium_discount_pct) <= 5
    );
    if (validHistory.length > 0) {
        const avgAbsDev = validHistory.reduce((sum, d) => sum + Math.abs(d.premium_discount_pct), 0) / validHistory.length;
        if (avgAbsDev < 0.15)      pegScore = 5;   // Very tight
        else if (avgAbsDev < 0.30) pegScore = 4;   // Tight
        else if (avgAbsDev < 0.50) pegScore = 3;   // Acceptable
        else if (avgAbsDev < 1.00) pegScore = 2;   // Loose
        else                       pegScore = 1;   // Significant depeg
    }

    // --- Depth score (sum of average 2% depth across pools) ---
    let depthScore = 3;
    if (liquidity && liquidity.pools) {
        let totalDepth = 0;
        for (const pool of liquidity.pools) {
            const buy = pool.depth_2pct_buy;
            const sell = pool.depth_2pct_sell;
            if (buy !== null && sell !== null) {
                totalDepth += (buy + sell) / 2;
            } else if (buy !== null) {
                totalDepth += buy;
            } else if (sell !== null) {
                totalDepth += sell;
            }
        }
        if (totalDepth > 2000000) depthScore = 5;
        else if (totalDepth > 1000000) depthScore = 4;
        else if (totalDepth > 500000) depthScore = 3;
        else if (totalDepth > 100000) depthScore = 2;
        else depthScore = 1;
    }

    // --- Volume score ---
    let volumeScore = 3;
    if (liquidity && liquidity.total_volume_24h !== null && liquidity.total_volume_24h !== undefined) {
        const vol = liquidity.total_volume_24h;
        if (vol > 5000000) volumeScore = 5;
        else if (vol > 1000000) volumeScore = 4;
        else if (vol > 500000) volumeScore = 3;
        else if (vol > 100000) volumeScore = 2;
        else volumeScore = 1;
    }

    // --- Final rating ---
    const avg = (pegScore + depthScore + volumeScore) / 3;
    const finalStars = Math.round(avg);

    const filled = '\u2605'.repeat(finalStars);
    const empty = '\u2606'.repeat(5 - finalStars);
    starsEl.textContent = filled + empty;
    starsEl.title = `${finalStars}/5 stars (peg ${pegScore}, depth ${depthScore}, volume ${volumeScore})`;

    // --- Dynamic subtitle based on weakest factor ---
    const scores = { peg: pegScore, depth: depthScore, volume: volumeScore };
    const minScore = Math.min(pegScore, depthScore, volumeScore);
    let subtitle;
    if (minScore >= 4) {
        subtitle = 'Strong liquidity & peg';
    } else if (scores.peg === minScore) {
        subtitle = pegScore <= 2 ? 'Significant depeg' : 'Minor peg deviation';
    } else if (scores.depth === minScore) {
        subtitle = 'Thin DEX depth';
    } else {
        subtitle = 'Low trading volume';
    }
    noteEl.textContent = subtitle;
}

// Main fetch and update
async function fetchAndUpdate() {
    try {
        const response = await fetch(METRICS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        updateLastUpdated(data.timestamp);
        updateTVL(data.tvl_usd);
        updateBackingRatio(data.backing);
        updateUsdBackingSummary(data.backing);
        updateBackingTable(data.backing);
        updateTreasuryTable(data.backing);
        updatePegStatus(data.peg);

        let pegHistory = [];
        try {
            const histResp = await fetch(PEG_HISTORY_URL);
            if (histResp.ok) pegHistory = await histResp.json();
        } catch (e) { /* use empty array fallback */ }

        let supplyHistory = [];
        try {
            const supplyResp = await fetch(SUPPLY_HISTORY_URL);
            if (supplyResp.ok) supplyHistory = await supplyResp.json();
        } catch (e) { /* use empty array fallback */ }

        updateNetFlow(data.redemption_flow, supplyHistory, data.backing ? data.backing.thbill_supply : null);

        renderPegChart(pegHistory);
        updateLiquidityTable(data.secondary_liquidity);
        updateLiquidityPegRating(data.peg, data.secondary_liquidity, pegHistory);
        updateDefiTable(data.defi_markets);

    } catch (error) {
        console.error('Failed to fetch metrics:', error);
        document.getElementById('last-updated').textContent = 'Error loading data';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', fetchAndUpdate);

// Refresh every 5 minutes
setInterval(fetchAndUpdate, 5 * 60 * 1000);
