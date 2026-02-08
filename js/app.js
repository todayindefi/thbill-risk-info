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
    const date = new Date(isoString);
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

    // Use Theo-reported cash if available, otherwise calculate gap
    const cashAmount = theoReported?.cash_usd || (supply - backing.ultra_total - (backing.treasury_usdc || 0));
    const cashPct = theoReported?.cash_pct || ((supply - backing.ultra_total - (backing.treasury_usdc || 0)) / supply) * 100;
    const cashLabel = theoReported?.cash_usd ? 'Cash (Theo reported)' : 'Unverified "Cash"';

    const rows = [
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
            asset: 'Treasury USDC',
            amount: backing.treasury_usdc,
            pct: (backing.treasury_usdc / supply) * 100,
            isCurrency: true
        },
        {
            asset: 'ULTRA Total',
            amount: backing.ultra_total,
            pct: (backing.ultra_total / supply) * 100,
            isTotal: true
        },
        {
            asset: cashLabel,
            amount: cashAmount,
            pct: cashPct,
            isGap: true,
            isCurrency: true
        },
        {
            asset: 'thBILL Supply',
            amount: supply,
            pct: 100,
            isSupply: true
        }
    ];

    const tbody = document.getElementById('backing-table');
    tbody.innerHTML = rows.map(row => {
        let rowClass = '';
        if (row.isTotal) rowClass = 'bg-gray-900/50 font-medium';
        if (row.isGap) rowClass = 'bg-yellow-900/20 text-yellow-400';
        if (row.isSupply) rowClass = 'bg-gray-900 font-bold border-t border-gray-700';

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

function updateLiquidityTable(liquidity) {
    if (!liquidity) return;

    document.getElementById('dex-volume').textContent = formatCurrency(liquidity.total_volume_24h);
    document.getElementById('pool-count').textContent = (liquidity.pools || []).length;

    const pools = liquidity.pools || [];
    const tbody = document.getElementById('liquidity-table');

    if (pools.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="px-5 py-3 text-gray-500">No pools found</td></tr>';
        return;
    }

    tbody.innerHTML = pools.map(pool => `
        <tr class="border-t border-gray-700/50">
            <td class="px-5 py-3">
                <div class="font-medium">${pool.market}</div>
                <div class="text-xs text-gray-500">${pool.pair}</div>
            </td>
            <td class="text-right px-5 py-3">${formatCurrency(pool.volume_24h)}</td>
            <td class="text-right px-5 py-3">${pool.spread ? formatPercent(pool.spread) : '-'}</td>
        </tr>
    `).join('');
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
