/**
 * thBILL Risk Dashboard - Main Application
 * Fetches metrics from thbill_metrics.json and updates the UI
 */

// Configuration
const METRICS_URL = 'data/thbill_metrics.json';

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

    const ratio = backing.backing_ratio_ultra_only;
    const elem = document.getElementById('backing-ratio');
    elem.textContent = formatPercent(ratio * 100);

    // Color based on ratio
    if (ratio >= 0.95) {
        elem.classList.add('text-green-400');
    } else if (ratio >= 0.8) {
        elem.classList.add('text-yellow-400');
    } else {
        elem.classList.add('text-red-400');
    }
}

function updateNetFlow(flow) {
    if (!flow) return;

    const elem = document.getElementById('net-flow');
    const noteElem = document.getElementById('flow-note');

    if (flow.net_flow_24h !== null) {
        const net = flow.net_flow_24h;
        const pct = flow.net_flow_percentage || 0;
        const direction = net >= 0 ? '+' : '';
        elem.textContent = direction + formatNumber(net, 0) + ' thBILL';
        elem.classList.add(net >= 0 ? 'text-green-400' : 'text-red-400');
        noteElem.textContent = `${direction}${formatPercent(pct, 4)} change`;
    } else {
        elem.textContent = 'Calculating...';
        elem.classList.add('text-gray-400');
        noteElem.textContent = flow.note || '';
    }
}

function updateBackingTable(backing, theoReported) {
    if (!backing) return;

    const supply = backing.thbill_supply || 1;
    const hasTultra = backing.tultra_supply != null;

    const rows = [
        {
            asset: 'thBILL Supply',
            amount: supply,
            pct: 100,
            isSupply: true
        }
    ];

    // tULTRA rows (only if data available)
    if (hasTultra) {
        rows.push({
            asset: 'tULTRA in Vault',
            amount: backing.tultra_vault_balance,
            pct: (backing.tultra_vault_balance / supply) * 100
        });
        rows.push({
            asset: 'tULTRA Supply',
            amount: backing.tultra_supply,
            pct: (backing.tultra_supply / supply) * 100
        });
    }

    // ULTRA chain breakdown
    rows.push(
        {
            asset: 'ULTRA (Ethereum)',
            amount: backing.ultra_ethereum,
            pct: (backing.ultra_ethereum / supply) * 100
        },
        {
            asset: 'ULTRA (Arbitrum)',
            amount: backing.ultra_arbitrum,
            pct: (backing.ultra_arbitrum / supply) * 100
        },
        {
            asset: 'ULTRA (Solana)',
            amount: backing.ultra_solana,
            pct: (backing.ultra_solana / supply) * 100
        },
        {
            asset: 'ULTRA Total',
            amount: backing.ultra_total,
            pct: (backing.ultra_total / supply) * 100,
            isTotal: true
        }
    );

    // Implied cash from on-chain data (tULTRA - ULTRA)
    if (hasTultra && backing.implied_cash != null) {
        rows.push({
            asset: 'Implied Cash',
            amount: backing.implied_cash,
            pct: (backing.implied_cash / supply) * 100,
            isGap: true,
            isCurrency: true
        });
    }

    // Treasury USDC
    rows.push({
        asset: 'Treasury USDC',
        amount: backing.treasury_usdc,
        pct: (backing.treasury_usdc / supply) * 100,
        isCurrency: true
    });

    const tbody = document.getElementById('backing-table');
    tbody.innerHTML = rows.map(row => {
        let rowClass = '';
        if (row.isTotal) rowClass = 'bg-gray-900/50 font-medium';
        if (row.isGap) rowClass = 'bg-yellow-900/20 text-yellow-400';
        if (row.isSupply) rowClass = 'bg-gray-900 font-bold border-b border-gray-700';

        const amount = row.isCurrency ? formatCurrency(row.amount, 2) : formatNumber(row.amount, 2);

        return `
            <tr class="${rowClass}">
                <td class="px-5 py-3">${row.asset}</td>
                <td class="text-right px-5 py-3">${amount}</td>
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

        return `
            <tr class="${rowClass}">
                <td class="px-5 py-3">${row.chain}</td>
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

function updateTheoReported(theo, backing) {
    const container = document.getElementById('theo-reported');
    if (!container) return;

    if (!theo || !theo.cash_pct) {
        container.innerHTML = '<p class="text-gray-500">Theo dashboard data unavailable</p>';
        return;
    }

    const onChainPct = backing ? (backing.backing_ratio_ultra_only * 100) : 0;
    const discrepancy = theo.money_market_pct - onChainPct;

    container.innerHTML = `
        <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="bg-gray-900 rounded p-4">
                <div class="text-sm text-gray-400">Money Market</div>
                <div class="text-xl font-bold text-green-400">${formatPercent(theo.money_market_pct)}</div>
                <div class="text-xs text-gray-500">${formatCurrency(theo.money_market_usd)}</div>
            </div>
            <div class="bg-gray-900 rounded p-4">
                <div class="text-sm text-gray-400">Cash (Off-chain)</div>
                <div class="text-xl font-bold text-yellow-400">${formatPercent(theo.cash_pct)}</div>
                <div class="text-xs text-gray-500">${formatCurrency(theo.cash_usd)}</div>
            </div>
        </div>
        <div class="text-xs text-gray-500">
            <p>On-chain verified: ${formatPercent(onChainPct)} | Theo reported: ${formatPercent(theo.money_market_pct)}</p>
            <p class="mt-1">Discrepancy: ${discrepancy > 0 ? '+' : ''}${formatPercent(discrepancy, 2)} (within rounding)</p>
            <p class="mt-1 text-gray-600">Source: ${theo.source}</p>
        </div>
        ${backing && backing.implied_cash != null && theo.cash_usd != null ? `
        <div class="mt-4 pt-4 border-t border-gray-700">
            <div class="text-sm font-medium text-gray-300 mb-2">Implied vs Reported Cash</div>
            <div class="text-xs text-gray-400 space-y-1">
                <p>Implied cash (tULTRA − ULTRA): <span class="text-yellow-400">${formatCurrency(backing.implied_cash, 2)}</span></p>
                <p>Theo reported cash: <span class="text-white">${formatCurrency(theo.cash_usd, 2)}</span></p>
                <p>Discrepancy: <span class="${Math.abs(theo.cash_usd - backing.implied_cash) > 1000000 ? 'text-yellow-400' : 'text-green-400'}">${formatCurrency(theo.cash_usd - backing.implied_cash, 2)}</span></p>
            </div>
        </div>
        ` : ''}
    `;
}

function updateDefiTable(markets) {
    if (!markets) return;

    const tbody = document.getElementById('defi-table');

    if (markets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-3 text-gray-500">No markets found</td></tr>';
        return;
    }

    // Sort by TVL descending
    const sorted = [...markets].sort((a, b) => (b.tvl_usd || 0) - (a.tvl_usd || 0));

    tbody.innerHTML = sorted.slice(0, 10).map(market => `
        <tr class="border-t border-gray-700/50">
            <td class="px-5 py-3 capitalize">${market.protocol || '-'}</td>
            <td class="px-5 py-3">${market.chain || '-'}</td>
            <td class="px-5 py-3">${market.pool || '-'}</td>
            <td class="text-right px-5 py-3">${formatCurrency(market.tvl_usd)}</td>
            <td class="text-right px-5 py-3">${market.apy ? formatPercent(market.apy) : '-'}</td>
        </tr>
    `).join('');
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

// Main fetch and update
async function fetchAndUpdate() {
    try {
        const response = await fetch(METRICS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        updateLastUpdated(data.timestamp);
        updateTVL(data.tvl_usd);
        updateBackingRatio(data.backing);
        updateNetFlow(data.redemption_flow);
        updateBackingTable(data.backing, data.theo_reported);
        updateTreasuryTable(data.backing);
        updateTheoReported(data.theo_reported, data.backing);
        updatePegStatus(data.peg);
        updateLiquidityTable(data.secondary_liquidity);
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
