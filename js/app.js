/**
 * thBILL Risk Dashboard - Main Application
 * Fetches metrics from thbill_metrics.json and updates the UI
 */

// Configuration
const METRICS_URL = 'data/thbill_metrics.json';
const PEG_HISTORY_URL = 'data/thbill_peg_history.json';

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

    const ratio = backing.backing_ratio_with_usdc;
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

function updateBackingTable(backing) {
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

    // tULTRA: single line unless vault != supply
    if (hasTultra) {
        const vaultMatch = backing.tultra_vault_balance != null &&
            Math.abs(backing.tultra_vault_balance - backing.tultra_supply) < 0.01;
        if (vaultMatch) {
            rows.push({
                asset: 'tULTRA Supply',
                note: '100% in vault',
                amount: backing.tultra_supply,
                pct: (backing.tultra_supply / supply) * 100
            });
        } else {
            rows.push({
                asset: 'tULTRA in Vault',
                amount: backing.tultra_vault_balance,
                pct: (backing.tultra_vault_balance / supply) * 100,
                isGap: true
            });
            rows.push({
                asset: 'tULTRA Supply',
                amount: backing.tultra_supply,
                pct: (backing.tultra_supply / supply) * 100,
                isGap: true
            });
        }
    }

    // ULTRA total (T-bills)
    rows.push({
        asset: 'ULTRA Total',
        note: 'T-bills',
        amount: backing.ultra_total,
        pct: (backing.ultra_total / supply) * 100
    });

    // DeFi USDC positions (e.g. Aave)
    let defiUsdc = 0;
    if (backing.treasury_defi_positions) {
        for (const pos of backing.treasury_defi_positions) {
            defiUsdc += pos.amount;
            rows.push({
                asset: `${pos.protocol} ${pos.token}`,
                note: `Treasury supply on ${pos.protocol}`,
                amount: pos.amount,
                pct: (pos.amount / supply) * 100,
                isCurrency: true
            });
        }
    }

    // Spot USDC
    const spotUsdc = (backing.treasury_usdc || 0) - defiUsdc;
    if (spotUsdc > 0.01 || defiUsdc === 0) {
        rows.push({
            asset: 'USDC (spot)',
            note: 'Treasury wallet',
            amount: spotUsdc,
            pct: (spotUsdc / supply) * 100,
            isCurrency: true
        });
    }

    // Total backing
    const totalBacking = (backing.ultra_total || 0) + (backing.treasury_usdc || 0);
    const backingPct = (totalBacking / supply) * 100;
    rows.push({
        asset: 'Total Backing',
        amount: totalBacking,
        pct: backingPct,
        isTotal: true,
        isCurrency: true
    });

    const tbody = document.getElementById('backing-table');
    tbody.innerHTML = rows.map(row => {
        let rowClass = '';
        if (row.isTotal) rowClass = 'bg-gray-900/50 font-medium border-t border-gray-600';
        if (row.isGap) rowClass = 'bg-yellow-900/20 text-yellow-400';
        if (row.isSupply) rowClass = 'bg-gray-900 font-bold border-b border-gray-700';

        const amount = row.isCurrency ? formatCurrency(row.amount, 2) : formatNumber(row.amount, 2);
        const noteSpan = row.note ? `<span class="text-xs text-gray-500 ml-2">(${row.note})</span>` : '';

        return `
            <tr class="${rowClass}">
                <td class="px-5 py-3">${row.asset}${noteSpan}</td>
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
        updateNetFlow(data.redemption_flow);
        updateBackingTable(data.backing);
        updateTreasuryTable(data.backing);
        updatePegStatus(data.peg);

        let pegHistory = [];
        try {
            const histResp = await fetch(PEG_HISTORY_URL);
            if (histResp.ok) pegHistory = await histResp.json();
        } catch (e) { /* use empty array fallback */ }

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
