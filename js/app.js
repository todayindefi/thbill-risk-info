/**
 * thBILL Risk Dashboard - Main Application
 * Fetches metrics from thbill_metrics.json and updates the UI
 */

// Configuration
const METRICS_URL = 'data/thbill_metrics.json';
const PEG_HISTORY_URL = 'data/thbill_peg_history.json';
const SUPPLY_HISTORY_URL = 'data/thbill_history.json';
const FLOW_B_CYCLES_URL = 'data/thbill_flow_b_cycles.json';

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
    const receivable = backing.libeara_receivable_usd_estimate;
    // Amend the subtitle with "(+ Libeara receivable)" only while Stage B is
    // mid-cycle with an outstanding USDC payment. See detail panel for the
    // economic / on-chain / floor tier breakdown.
    const receivableAmend = (receivable && receivable > 0.01)
        ? ' <span class="text-blue-300">(+ Libeara receivable)</span>'
        : '';

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
                noteElem.innerHTML = '<span class="text-yellow-300">Theo-reported (circular)</span> <span class="text-gray-500">— tULTRA priced at vault-implied NAV, not independently verified</span>' + receivableAmend;
            } else if (isOnchain) {
                noteElem.innerHTML = `<span class="text-green-300">Libeara on-chain NAV</span> <span class="text-gray-500">— daily T-bill NAV published by Libeara${epoch ? ' (epoch ' + epoch + ')' : ''}</span>` + receivableAmend;
            } else {
                noteElem.innerHTML = `tULTRA price from ${priceSource}` + receivableAmend;
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
    const ratioOnChain = backing.usd_backing_ratio_on_chain;
    const ratioFloor = backing.usd_backing_ratio_floor;
    const ratioExQueue = backing.usd_backing_ratio_ex_queue;
    const queueUltra = backing.redemption_queue_ultra_total;
    const price = backing.tultra_usd_price;
    const priceSource = backing.tultra_usd_price_source || 'unavailable';
    const implied = backing.tultra_implied_price_from_vault;
    const onchainNav = backing.ultra_onchain_nav;
    const onchainEpoch = backing.ultra_onchain_nav_epoch;
    const drift = backing.theo_nav_drift_pct;
    const backingMode = backing.tultra_wrapper_backing_mode;

    // Backing model badge — auto-flips based on on-chain wrapper holdings.
    // synthetic_attested: wrapper holds 0 ULTRA, totalAssets is admin-attested
    // custodial: wrapper holds ULTRA directly, coverage is contract-enforced
    let modeBadgeLine = '';
    if (backingMode === 'synthetic_attested') {
        modeBadgeLine = `
            <div class="md:col-span-2 mb-3 pb-3 border-b border-gray-700">
                <span class="inline-block px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-300 border border-yellow-700/50 text-xs font-semibold">synthetic · attested</span>
                <span class="text-xs text-gray-400 ml-2">tULTRA wrapper holds 0 ULTRA. Coverage is a reconciliation against Theo's treasury custody, not contract-enforced.</span>
            </div>`;
    } else if (backingMode === 'custodial') {
        modeBadgeLine = `
            <div class="md:col-span-2 mb-3 pb-3 border-b border-gray-700">
                <span class="inline-block px-2 py-0.5 rounded bg-green-900/40 text-green-300 border border-green-700/50 text-xs font-semibold">custodial</span>
                <span class="text-xs text-gray-400 ml-2">tULTRA wrapper holds ULTRA directly; coverage is contract-enforced.</span>
            </div>`;
    }

    // Flow B (Libeara fund reconciliation) badge — appears only when Stage B
    // is mid-cycle. Phase 1: ULTRA still in queue. Phase 2: ULTRA burned,
    // waiting for Libeara USDC settlement to land at TREASURY (T+1 to T+7d
    // historically). Color: blue (normal), yellow (past T+7d expected window),
    // red (past T+14d, materially delayed).
    let flowBBadgeLine = '';
    const hoursSinceBurn = backing.hours_since_last_burn;
    const expectedByIso  = backing.settlement_expected_by_iso;
    const lastBurnIso    = backing.last_flow_b_burn_iso;
    const lastBurnAmt    = backing.last_flow_b_burn_amount_ultra;
    const SAFE_LINK   = '<a href="https://etherscan.io/address/0x7ee29373f075ee1d83b1b93b4fe94ae242df5178" target="_blank" class="hover:underline">0x7ee29373f0…</a>';
    const ULTRAMGR_LINK = '<a href="https://etherscan.io/address/0x9056777ad890ece386d646a5c698a9a6a779000b" target="_blank" class="hover:underline">0x9056777ad…</a>';

    if (queueUltra && queueUltra > 0.01) {
        // Phase 1 — queue active
        const queueM = (queueUltra / 1e6).toFixed(2);
        flowBBadgeLine = `
            <div class="md:col-span-2 mb-3 pb-3 border-b border-gray-700">
                <span class="inline-block px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/50 text-xs font-semibold">Flow B · queue phase</span>
                <div class="text-xs text-gray-400 mt-1">
                    Fund reconciliation in progress. Theo has moved <span class="text-white">${queueM}M ULTRA</span> into Libeara's UltraManagerFiat queue to settle a batch of user redemptions.
                    ULTRA typically burns within 5–27 hours; USDC then returns to Theo's treasury at T+1 to T+7 days. The
                    ex-queue backing ratio below reflects the post-burn state; the headline ratio includes the queue as Theo-custodied until burn.
                </div>
            </div>`;
    } else if (hoursSinceBurn !== null && hoursSinceBurn !== undefined && lastBurnIso && expectedByIso) {
        // Phase 2 — burn done, USDC pending
        const expectedTs = Date.parse(expectedByIso);
        const lastBurnTs = Date.parse(lastBurnIso);
        const nowTs      = Date.now();
        const hoursPastExpected = (nowTs - expectedTs) / (3600 * 1000);

        let badgeColor   = 'bg-blue-900/40 text-blue-300 border-blue-700/50';
        let badgeText    = 'Flow B · awaiting USDC settlement';
        let bodyTone     = 'text-gray-400';
        let extraNotice  = '';
        if (hoursPastExpected > 7 * 24) {
            // Past T+14d total — red alert
            badgeColor  = 'bg-red-900/40 text-red-300 border-red-700/50';
            badgeText   = 'Flow B · materially delayed';
            bodyTone    = 'text-red-300';
            extraNotice = `<br><strong>Settlement now &gt;T+14 days past burn.</strong> Potential operational or counterparty issue; warrants escalation.`;
        } else if (hoursPastExpected > 0) {
            // Past T+7d but within T+14 — yellow warning
            badgeColor  = 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50';
            badgeText   = 'Flow B · running long';
            bodyTone    = 'text-yellow-200';
            extraNotice = `<br><strong>Settlement running longer than the T+7d historical norm.</strong> Monitor; recovers when USDC lands.`;
        }

        const burnAmtM = lastBurnAmt ? (lastBurnAmt / 1e6).toFixed(1) : '?';
        const burnDate = lastBurnIso.slice(0, 10);
        const expectedDate = expectedByIso.slice(0, 10);
        const hoursSinceFmt = hoursSinceBurn.toFixed(1);

        flowBBadgeLine = `
            <div class="md:col-span-2 mb-3 pb-3 border-b border-gray-700">
                <span class="inline-block px-2 py-0.5 rounded ${badgeColor} border text-xs font-semibold">${badgeText}</span>
                <div class="text-xs ${bodyTone} mt-1">
                    Fund reconciliation in progress. <span class="text-white">${burnAmtM}M ULTRA</span>
                    was burned <span class="text-white">${hoursSinceFmt}h ago</span> (${burnDate});
                    USDC is expected to arrive at Theo's treasury by <span class="text-white">${expectedDate}</span>,
                    historically from a Libeara operational Safe (${SAFE_LINK}) or the UltraManager contract (${ULTRAMGR_LINK}).
                    The backing ratio dip is expected and time-bounded; it will recover when USDC lands.${extraNotice}
                </div>
            </div>`;
    }

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

    // Three-tier ratio detail — shown only when the values diverge (i.e. during
    // a Flow B cycle). Phase 1: queue active → on-chain > floor. Phase 2:
    // burned, USDC pending → economic > on-chain == floor. Steady state all
    // three collapse to one value; secondary lines suppressed.
    let ratioTierLines = '';
    const diverges = (ratio !== null && ratio !== undefined
        && ratioOnChain !== null && ratioOnChain !== undefined
        && ratioFloor !== null && ratioFloor !== undefined
        && (Math.abs(ratio - ratioOnChain) >= 0.001 || Math.abs(ratioOnChain - ratioFloor) >= 0.001));
    if (diverges) {
        ratioTierLines = `
            <div class="md:col-span-2 text-xs text-gray-400 italic">↳ on-chain verified: <span class="text-gray-300 not-italic">${formatPercent(ratioOnChain * 100)}</span> <span class="text-gray-500">(excludes in-flight Libeara receivable)</span></div>
            <div class="md:col-span-2 text-xs text-gray-400 italic">↳ post-settlement floor: <span class="text-gray-300 not-italic">${formatPercent(ratioFloor * 100)}</span> <span class="text-gray-500">(treasury custody + USDC only)</span></div>`;
    }

    // In-flight redemption queue: ULTRA in Libeara's UltraManagerFiat, waiting for
    // the next settlement epoch. Shown as supplementary context — already counted
    // in usd_assets/usd_backing_ratio. The ex-queue ratio is the post-settlement
    // floor, useful if the queue clears against a tULTRA burn rather than
    // returning as treasury USDC.
    let queueLine = '';
    if (queueUltra && queueUltra > 0.01 && price) {
        const queueUsd = queueUltra * price;
        const exQueueTxt = (ratioExQueue !== null && ratioExQueue !== undefined)
            ? ` · ex-queue floor: <span class="text-gray-300">${formatPercent(ratioExQueue * 100)}</span>`
            : '';
        queueLine = `<div class="md:col-span-2 text-xs text-gray-400 italic">↳ includes ${formatNumber(queueUltra, 0)} ULTRA ($${formatNumber(queueUsd, 0)}) in <a href="https://etherscan.io/address/0x257062cb4ca916299fc49cb8fde1e34b43033c93" target="_blank" class="text-blue-400 hover:underline">UltraManagerFiat</a> redemption queue${exQueueTxt}</div>`;
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-gray-300">
            ${modeBadgeLine}
            ${flowBBadgeLine}
            <div>thBILL NAV: <span class="text-white">${nav ? '$' + nav.toFixed(6) : '-'}</span> <span class="text-gray-500">(USDC/share)</span></div>
            <div>thBILL supply: <span class="text-white">${formatNumber(supply, 0)}</span></div>
            <div>USD liabilities: <span class="text-white">${liab ? '$' + formatNumber(liab, 0) : '-'}</span></div>
            <div>USD assets: ${assetsLine}</div>
            <div class="md:col-span-2 mt-1">tULTRA USD price: ${priceLine}</div>
            ${navDetailLine}
            <div class="md:col-span-2 mt-1">USD backing ratio: ${ratioLine}</div>
            ${ratioTierLines}
            ${queueLine}
        </div>
    `;
}

function updatePegDiscountCard(peg) {
    const elem = document.getElementById('peg-discount-card');
    if (!elem) return;
    const pd = peg ? peg.premium_discount_pct : null;

    elem.classList.remove('text-green-400', 'text-yellow-400', 'text-red-400');
    if (pd === null || pd === undefined) {
        elem.textContent = '-';
        return;
    }
    const sign = pd >= 0 ? '+' : '';
    elem.textContent = sign + pd.toFixed(2) + '%';
    // Thresholds match updatePegStatus() so the same value renders the same
    // color in Live Metrics and Peg Performance. A 0.5%+ discount on a T-bill
    // product is genuinely signal-worthy.
    const absPd = Math.abs(pd);
    if (absPd <= 0.1) {
        elem.classList.add('text-green-400');
    } else if (absPd <= 0.5) {
        elem.classList.add('text-yellow-400');
    } else {
        elem.classList.add('text-red-400');
    }
}

function updateNetFlow(flow, supplyHistory, currentSupply) {
    if (!flow) return;

    // The 7d Net Flow card was replaced by the Peg Discount card in Live
    // Metrics. Skip rendering the flow stat when those elements are absent.
    const elem = document.getElementById('net-flow');
    const noteElem = document.getElementById('flow-note');
    if (elem && noteElem) {
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
            insufficient = windowDays < 6.5;
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
    }

    // Days since last USER redemption (thBILL → operator) — the live pulse.
    // Distinct from batch burn, which can lag user activity by weeks because
    // Theo consolidates received thBILL into periodic burn transactions.
    const daysElem = document.getElementById('days-since-redemption');
    const daysNoteElem = document.getElementById('days-since-redemption-note');
    const batchNoteElem = document.getElementById('batch-burn-note');

    if (daysElem) {
        const userDays = flow.days_since_last_user_redemption;
        const userTs   = flow.last_user_redemption_timestamp;
        const userAmt  = flow.last_user_redemption_amount_thbill;
        const userTx   = flow.last_user_redemption_tx;
        const userFrom = flow.last_user_redemption_from;

        if (userDays !== undefined && userDays !== null) {
            const hasExact = userTs !== null && userTs !== undefined;
            daysElem.textContent = (hasExact ? '' : '≥') + userDays.toFixed(1) + 'd';
            daysElem.classList.remove('text-green-400', 'text-yellow-400', 'text-red-400', 'text-gray-400');
            if (userDays < 7) daysElem.classList.add('text-green-400');
            else if (userDays < 30) daysElem.classList.add('text-yellow-400');
            else daysElem.classList.add('text-red-400');

            if (daysNoteElem) {
                if (hasExact) {
                    const dateStr = userTs ? userTs.slice(0, 10) : '?';
                    const txShort = userTx ? userTx.slice(0, 10) + '…' : '';
                    const txLink = userTx
                        ? ` <a href="https://etherscan.io/tx/${userTx}" target="_blank" class="text-blue-400 hover:underline">${txShort}</a>`
                        : '';
                    const userShort = userFrom ? userFrom.slice(0, 10) + '…' : '';
                    daysNoteElem.innerHTML = `last: ${formatNumber(userAmt, 0)} thBILL from ${userShort} on ${dateStr}${txLink}`;
                } else {
                    daysNoteElem.innerHTML = '<span class="text-yellow-300">No user redemptions in scan window</span>';
                }
            }
        }

        // Supplementary line: batch-burn cadence (operator's consolidated burn,
        // which typically lags user activity by weeks). Same source fields as
        // before; the semantic meaning of the legacy fields shifted from "last
        // redemption" to "last batch burn".
        if (batchNoteElem && flow.days_since_last_redemption !== undefined && flow.days_since_last_redemption !== null) {
            const burnDays = flow.days_since_last_redemption;
            const burnTs   = flow.last_redemption_timestamp;
            const burnTx   = flow.last_redemption_tx;
            const hasExact = burnTs !== null && burnTs !== undefined;
            const txLink = hasExact && burnTx
                ? ` <a href="https://etherscan.io/tx/${burnTx}" target="_blank" class="text-blue-400 hover:underline">${burnTx.slice(0, 10)}…</a>`
                : '';
            const dateStr = hasExact ? burnTs.slice(0, 10) : `(>${burnDays.toFixed(1)}d ago)`;
            batchNoteElem.innerHTML = `<span class="text-gray-500">Batch burn (reconciliation cycle): ${burnDays.toFixed(1)}d ago — ${dateStr}${txLink}</span>`;
        }
    }
}

function updateBackingTable(backing) {
    if (!backing) return;

    const supply = backing.thbill_supply || 1;
    const nav = backing.thbill_nav_per_share;
    const tultraPrice = backing.tultra_usd_price;
    const hasTultra = backing.tultra_supply != null;

    const rows = [
        {
            asset: 'thBILL Supply',
            amount: supply,
            unit: 'shares',
            usd: nav ? supply * nav : null,
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
                usd: tultraPrice ? backing.tultra_supply * tultraPrice : null,
                pct: (backing.tultra_supply / supply) * 100
            });
        } else {
            rows.push({
                asset: 'tULTRA in Vault',
                amount: backing.tultra_vault_balance,
                unit: 'tULTRA',
                usd: tultraPrice ? backing.tultra_vault_balance * tultraPrice : null,
                pct: (backing.tultra_vault_balance / supply) * 100,
                isGap: true
            });
            rows.push({
                asset: 'tULTRA Supply',
                amount: backing.tultra_supply,
                unit: 'tULTRA',
                usd: tultraPrice ? backing.tultra_supply * tultraPrice : null,
                pct: (backing.tultra_supply / supply) * 100,
                isGap: true
            });
        }
    }

    let defiUsdc = 0;
    if (backing.treasury_defi_positions) {
        for (const pos of backing.treasury_defi_positions) {
            defiUsdc += pos.amount;
            rows.push({
                asset: `${pos.protocol} ${pos.token}`,
                note: `Treasury supply on ${pos.protocol}`,
                amount: pos.amount,
                unit: 'USDC',
                usd: pos.amount,
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
            usd: spotUsdc,
            pct: (spotUsdc / supply) * 100,
            isCurrency: true
        });
    }

    const tbody = document.getElementById('backing-table');
    tbody.innerHTML = rows.map(row => {
        let rowClass = '';
        if (row.isGap) rowClass = 'bg-yellow-900/20 text-yellow-400';
        if (row.isInFlight) rowClass = 'bg-blue-900/20 text-blue-300 italic';
        if (row.isSupply) rowClass = 'bg-gray-900 font-bold border-b border-gray-700';

        const amount = row.isCurrency ? formatCurrency(row.amount, 2) : formatNumber(row.amount, 2);
        const usdVal = row.usd !== null && row.usd !== undefined ? '$' + formatNumber(row.usd, 0) : '—';
        const noteSpan = row.note ? `<span class="text-xs text-gray-500 ml-2">(${row.note})</span>` : '';

        return `
            <tr class="${rowClass}">
                <td class="px-5 py-3">${row.asset}${noteSpan}</td>
                <td class="text-right px-5 py-3">${amount}</td>
                <td class="text-right px-5 py-3 text-gray-400 text-xs">${row.unit || ''}</td>
                <td class="text-right px-5 py-3">${usdVal}</td>
            </tr>
        `;
    }).join('');
}

function updateTreasuryTable(backing) {
    if (!backing) return;

    const price = backing.tultra_usd_price;
    const liab = backing.usd_liabilities;
    const usdFor = (ultra) => (price && ultra != null) ? ultra * price : null;
    const pctFor = (usd) => (liab && usd != null) ? (usd / liab) * 100 : null;

    const queueUltra = backing.redemption_queue_ultra_total || 0;
    const treasuryUsdc = backing.treasury_usdc || 0;
    const wrapperBal = backing.ultra_balance_of_wrapper;

    const rows = [];

    // tULTRA wrapper row — surface ULTRA.balanceOf(wrapper) as the first
    // line so the "synthetic / attested" framing is grounded in a live
    // data point. Non-zero would flip the whole backing model to custodial.
    rows.push({
        chain: 'tULTRA wrapper contract',
        note: 'ERC-4626 declares asset() = ULTRA; wrapper holds none. See Technical Risk below.',
        treasury: wrapperBal,
        usd: usdFor(wrapperBal),
        isWrapper: true
    });

    rows.push(
        {
            chain: 'Ethereum',
            treasury: backing.treasury_ultra_ethereum,
            usd: usdFor(backing.treasury_ultra_ethereum)
        },
        {
            chain: 'Arbitrum',
            treasury: backing.treasury_ultra_arbitrum,
            usd: usdFor(backing.treasury_ultra_arbitrum)
        },
        {
            chain: 'Solana',
            treasury: backing.treasury_ultra_solana,
            usd: usdFor(backing.treasury_ultra_solana)
        }
    );

    // Split the reported treasury_usdc total (spot + Aave eth + other DeFi)
    // into its components so readers can see where the USDC actually sits.
    const aaveEthUsdc = backing.treasury_aave_usdc_ethereum || 0;
    const debankDefiSum = (backing.treasury_defi_positions || [])
        .reduce((sum, pos) => sum + (pos.amount || 0), 0);
    const spotUsdc = treasuryUsdc - aaveEthUsdc - debankDefiSum;

    if (spotUsdc > 0.01) {
        rows.push({
            chain: 'USDC (treasury cash)',
            treasury: null,
            usd: spotUsdc
        });
    }
    if (aaveEthUsdc > 0.01) {
        rows.push({
            chain: 'USDC (Aave V3 Ethereum)',
            note: 'supplied for yield; aEthUSDC.balanceOf',
            treasury: null,
            usd: aaveEthUsdc
        });
    }
    // Any other DeFi USDC positions surfaced by DeBank (non-Aave-ETH)
    for (const pos of (backing.treasury_defi_positions || [])) {
        if ((pos.amount || 0) < 0.01) continue;
        rows.push({
            chain: `USDC (${pos.protocol})`,
            note: `${pos.chain} — via DeBank`,
            treasury: null,
            usd: pos.amount
        });
    }

    // Libeara USDC receivable (in-flight). Only appears when a Flow B burn
    // has occurred but Libeara's USDC payout hasn't yet landed at TREASURY.
    // Same blue italic treatment as the queue in-flight row, same
    // semantic: "value exists but not cash in hand yet."
    const receivableUsd = backing.libeara_receivable_usd_estimate;
    const flowBCurrent = backing.flow_b_current || {};
    if (receivableUsd && receivableUsd > 1) {
        const burnTsDate = flowBCurrent.burn_ts ? flowBCurrent.burn_ts.slice(0, 10) : '?';
        const expectedDate = flowBCurrent.settlement_expected_by ? flowBCurrent.settlement_expected_by.slice(0, 10) : '?';
        const burnAmtM = flowBCurrent.burn_ultra_amount ? (flowBCurrent.burn_ultra_amount / 1e6).toFixed(1) : '?';
        const senders = backing.libeara_payout_sources || [];
        const senderLinks = senders.slice(0, 2).map(s =>
            `<a href="https://etherscan.io/address/${s.address}" target="_blank" class="hover:underline">${s.address.slice(0,10)}…</a>`
        ).join(' or ');
        rows.push({
            chain: 'Libeara USDC receivable (in-flight)',
            note: `${burnAmtM}M ULTRA burned ${burnTsDate}; expected by ${expectedDate} from ${senderLinks || 'Safe / UltraManager'}`,
            treasury: null,
            usd: receivableUsd,
            pct: pctFor(receivableUsd),
            isInFlight: true
        });
    }

    rows.forEach(r => { if (r.pct === undefined) r.pct = pctFor(r.usd); });

    // Treasury subtotals. The "on-chain verified only" subtotal is the
    // post-settlement floor (TREASURY ULTRA + TREASURY USDC). The
    // "incl. in-flight receivable" subtotal adds the pending Libeara USDC
    // payment when a Stage B cycle is mid-flight. When nothing is in flight
    // the two values are identical — render only one row (the existing
    // single-subtotal behavior).
    const treasurySubtotalUsd = ((backing.treasury_ultra_total || 0) * (price || 0)) + treasuryUsdc;
    const hasReceivable = receivableUsd && receivableUsd > 1;
    if (hasReceivable) {
        rows.push({
            chain: 'Subtotal (on-chain verified only)',
            note: 'Excludes pending Libeara receivable',
            treasury: null,
            usd: treasurySubtotalUsd,
            pct: pctFor(treasurySubtotalUsd),
            isSubtotal: true
        });
        rows.push({
            chain: 'Subtotal (incl. in-flight receivable)',
            note: 'Full economic backing including Libeara IOU',
            treasury: null,
            usd: treasurySubtotalUsd + receivableUsd,
            pct: pctFor(treasurySubtotalUsd + receivableUsd),
            isSubtotal: true
        });
    } else {
        rows.push({
            chain: 'Treasury subtotal',
            note: 'ex-queue floor',
            treasury: null,
            usd: treasurySubtotalUsd,
            pct: pctFor(treasurySubtotalUsd),
            isSubtotal: true
        });
    }

    // In-flight ULTRA in Libeara's UltraManagerFiat redemption queue.
    if (queueUltra > 0.01) {
        rows.push({
            chain: 'In-flight',
            note: 'UltraManagerFiat redemption queue',
            treasury: queueUltra,
            usd: usdFor(queueUltra),
            pct: pctFor(usdFor(queueUltra)),
            isInFlight: true
        });
    }

    const totalUsd = treasurySubtotalUsd + (queueUltra * (price || 0)) + (hasReceivable ? receivableUsd : 0);
    rows.push({
        chain: 'Total',
        treasury: (backing.treasury_ultra_total || 0) + queueUltra,
        usd: totalUsd,
        pct: pctFor(totalUsd),
        isTotal: true
    });

    const tbody = document.getElementById('treasury-table');
    tbody.innerHTML = rows.map(row => {
        let rowClass = '';
        if (row.isWrapper) {
            // Yellow if 0 (synthetic/attested), green if non-zero (custodial)
            rowClass = (row.treasury && row.treasury > 0.01)
                ? 'bg-green-900/20 text-green-300'
                : 'bg-yellow-900/20 text-yellow-300';
        }
        if (row.isInFlight) rowClass = 'bg-blue-900/20 text-blue-300 italic';
        if (row.isSubtotal) rowClass = 'bg-gray-900/40 text-gray-300 border-t border-gray-700';
        if (row.isTotal) rowClass = 'bg-gray-900 font-medium border-t border-gray-700';
        const treasuryVal = row.treasury !== null && row.treasury !== undefined ? formatNumber(row.treasury, 2) : '—';
        const usdVal = row.usd !== null && row.usd !== undefined ? '$' + formatNumber(row.usd, 0) : '—';
        const pctVal = row.pct !== null && row.pct !== undefined ? formatPercent(row.pct, 2) : '—';

        const chainCell = row.note
            ? `${row.chain}<span class="block text-xs text-gray-500">${row.note}</span>`
            : row.chain;

        return `
            <tr class="${rowClass}">
                <td class="px-5 py-3">${chainCell}</td>
                <td class="text-right px-5 py-3">${treasuryVal}</td>
                <td class="text-right px-5 py-3">${usdVal}</td>
                <td class="text-right px-5 py-3">${pctVal}</td>
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

function updatePegStatus(peg, liquidity) {
    if (!peg) return;

    // Build max-TVL-per-chain lookup so we can flag thin pools in the
    // per-chain table. A chain with only a ~$12K pool isn't a practical
    // exit route, so surface that inline next to the price.
    const maxTvlByChain = {};
    if (liquidity && Array.isArray(liquidity.pools)) {
        for (const p of liquidity.pools) {
            const key = (p.chain || '').toLowerCase();
            const tvl = p.tvl_usd || 0;
            if (!(key in maxTvlByChain) || tvl > maxTvlByChain[key]) {
                maxTvlByChain[key] = tvl;
            }
        }
    }
    const THIN_TVL_THRESHOLD = 50_000;

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
        const chainTvl = maxTvlByChain[chain.toLowerCase()] || 0;
        const thinTag = (chainTvl > 0 && chainTvl < THIN_TVL_THRESHOLD)
            ? ` <span class="text-gray-500 text-xs">(thin — not a practical exit route)</span>`
            : '';
        return `
            <tr class="border-t border-gray-700/50">
                <td class="px-5 py-3">${chain}</td>
                <td class="text-right px-5 py-3">$${price.toFixed(4)}${thinTag}</td>
                <td class="text-right px-5 py-3 text-gray-400">${volStr}</td>
                <td class="text-right px-5 py-3 ${deviationClass}">${deviationText}</td>
            </tr>
        `;
    }).join('');
}

// Recent user redemptions table (shown below the peg chart so viewers can
// line up the overlay markers with deeper time context: 10 events ≈ ~7 weeks).
function renderRecentRedemptionsTable(redemptions) {
    const tbody = document.getElementById('recent-redemptions-tbody');
    if (!tbody) return;
    if (!redemptions || redemptions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-5 py-4 text-gray-500 italic">No recent user redemptions found.</td></tr>';
        return;
    }
    const rows = redemptions.slice(0, 10).map(r => {
        const ts = new Date(r.iso);
        const tsLabel = ts.toISOString().replace('T', ' ').slice(0, 16);
        const amt = (r.amount_thbill || 0).toLocaleString(undefined, {maximumFractionDigits: 0});
        const fromShort = (r.from || '').slice(0, 6) + '…' + (r.from || '').slice(-4);
        const txShort = (r.tx || '').slice(0, 8) + '…' + (r.tx || '').slice(-4);
        return `
            <tr>
                <td class="px-5 py-3 text-gray-300 whitespace-nowrap">${tsLabel}</td>
                <td class="px-5 py-3 text-right text-white font-medium">${amt}</td>
                <td class="px-5 py-3"><a href="https://etherscan.io/address/${r.from}" target="_blank" class="text-blue-400 hover:underline font-mono text-xs">${fromShort}</a></td>
                <td class="px-5 py-3 text-right"><a href="https://etherscan.io/tx/${r.tx}" target="_blank" class="text-blue-400 hover:underline font-mono text-xs">${txShort}</a></td>
            </tr>
        `;
    }).join('');
    tbody.innerHTML = rows;
}

// Peg history chart
let pegChartInstance = null;

function renderPegChart(history, redemptions) {
    try {
        // Filter outliers (early data has 10.6% artifacts)
        const filtered = history.filter(d => Math.abs(d.premium_discount_pct) <= 5);
        if (filtered.length === 0) return;

        const labels = filtered.map(d => {
            const ts = d.timestamp.endsWith('Z') ? d.timestamp : d.timestamp + 'Z';
            return new Date(ts);
        });
        const values = filtered.map(d => d.premium_discount_pct);

        // Build redemption overlay points within the chart's time window.
        // Each marker is placed on the peg line at its timestamp (linear-
        // interpolating between adjacent peg samples), so viewers can read
        // the peg level at the moment of redemption directly off the chart.
        const minTs = labels[0].getTime();
        const maxTs = labels[labels.length - 1].getTime();
        const sampleTimes = labels.map(l => l.getTime());
        function pegAt(t) {
            // Binary-search-ish: assume sampleTimes is monotonic ascending.
            if (t <= sampleTimes[0]) return values[0];
            if (t >= sampleTimes[sampleTimes.length - 1]) return values[values.length - 1];
            for (let i = 1; i < sampleTimes.length; i++) {
                if (sampleTimes[i] >= t) {
                    const t0 = sampleTimes[i - 1], t1 = sampleTimes[i];
                    const v0 = values[i - 1], v1 = values[i];
                    const frac = (t - t0) / (t1 - t0);
                    return v0 + (v1 - v0) * frac;
                }
            }
            return values[values.length - 1];
        }
        const redemptionPoints = (redemptions || [])
            .map(r => {
                const t = new Date(r.iso).getTime();
                return { ...r, t };
            })
            .filter(r => r.t >= minTs && r.t <= maxTs)
            .map(r => ({
                x: r.t,
                y: pegAt(r.t),
                amount: r.amount_thbill,
                from: r.from,
                tx: r.tx,
                iso: r.iso,
            }));

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
                    // No fill — segment-based fills overlap at adjacent x's,
                    // compounding their alpha into darker vertical bands around
                    // sharp spikes. Line + segment borderColor convey the
                    // sign well enough on their own.
                    fill: false,
                    segment: {
                        borderColor: function(ctx) {
                            const y = ctx.p1.parsed.y;
                            return y >= 0 ? '#4ade80' : '#f87171';
                        }
                    },
                    tension: 0
                }, {
                    type: 'scatter',
                    label: 'User redemption',
                    data: redemptionPoints,
                    parsing: false,
                    showLine: false,
                    fill: false,
                    backgroundColor: 'rgba(251, 191, 36, 0.55)',
                    borderColor: '#f59e0b',
                    borderWidth: 1.5,
                    pointStyle: 'circle',
                    pointRadius: function(ctx) {
                        const a = ctx.raw && ctx.raw.amount;
                        if (!a || a <= 0) return 4;
                        return Math.min(14, 4 + Math.log10(a) * 1.6);
                    },
                    pointHoverRadius: function(ctx) {
                        const a = ctx.raw && ctx.raw.amount;
                        if (!a || a <= 0) return 6;
                        return Math.min(16, 6 + Math.log10(a) * 1.6);
                    },
                    order: 0
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
                                if (item.dataset.label === 'User redemption' && item.raw) {
                                    const amt = item.raw.amount || 0;
                                    const from = (item.raw.from || '').slice(0, 10) + '…';
                                    const peg = item.parsed.y;
                                    const pegSign = peg >= 0 ? '+' : '';
                                    return `Redemption: ${amt.toLocaleString(undefined, {maximumFractionDigits: 0})} thBILL from ${from} (peg ${pegSign}${peg.toFixed(3)}%)`;
                                }
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
// Block B1: Current-cycle widget — renders a four-checkpoint progress strip
// for the live Stage B cycle plus a compact details list. Only rendered
// when backing.flow_b_current is non-null.
function updateFlowBCurrent(backing) {
    const container = document.getElementById('flow-b-current-widget');
    if (!container) return;
    const fbc = backing && backing.flow_b_current;
    if (!fbc) { container.innerHTML = ''; return; }

    const hasQueue = !!fbc.queue_entry_ts;
    const hasBurn  = !!fbc.burn_ts;
    const isSettlementPending = fbc.status === 'settlement_pending';
    const nowMs = Date.now();
    const burnMs = fbc.burn_ts ? Date.parse(fbc.burn_ts) : null;
    const expMs  = fbc.settlement_expected_by ? Date.parse(fbc.settlement_expected_by) : null;

    // Settlement-checkpoint status color
    let settlementIcon = '⏸', settlementColor = 'text-gray-500';
    if (isSettlementPending) {
        settlementIcon = '⏳';
        if (expMs && nowMs > expMs + 7 * 24 * 3600 * 1000) {
            settlementColor = 'text-red-300';  // past T+14d
        } else if (expMs && nowMs > expMs) {
            settlementColor = 'text-yellow-300'; // past T+7d
        } else {
            settlementColor = 'text-blue-300';
        }
    }

    const queueIcon = hasQueue ? '<span class="text-green-400">✓</span>' : '<span class="text-gray-500">⏸</span>';
    const burnIcon  = hasBurn  ? '<span class="text-green-400">✓</span>' : '<span class="text-gray-500">⏸</span>';
    const settlemIcon = `<span class="${settlementColor}">${settlementIcon}</span>`;
    const completeIcon = '<span class="text-gray-500">⏸</span>';

    const queueDate = fbc.queue_entry_ts ? fbc.queue_entry_ts.slice(0, 19).replace('T', ' ') + ' UTC' : '—';
    const burnDate  = fbc.burn_ts ? fbc.burn_ts.slice(0, 19).replace('T', ' ') + ' UTC' : '—';
    const expectedDate = fbc.settlement_expected_by ? fbc.settlement_expected_by.slice(0, 10) : '—';
    const receivableUsd = fbc.receivable_usd_estimate;

    const queueAmt = fbc.queue_entry_ultra_amount
        ? formatNumber(fbc.queue_entry_ultra_amount, 0) + ' ULTRA'
        : '—';
    const burnAmt  = fbc.burn_ultra_amount
        ? formatNumber(fbc.burn_ultra_amount, 0) + ' ULTRA'
        : '—';
    const receivableAmt = receivableUsd ? '≈ $' + formatNumber(receivableUsd, 0) : '—';

    const queueTxLink = fbc.queue_entry_tx
        ? `<a href="https://etherscan.io/tx/${fbc.queue_entry_tx}" target="_blank" class="text-blue-400 hover:underline">[↗ etherscan]</a>`
        : '';
    const burnTxLink = fbc.burn_tx
        ? `<a href="https://etherscan.io/tx/${fbc.burn_tx}" target="_blank" class="text-blue-400 hover:underline">[↗ etherscan]</a>`
        : '';
    const sendersArr = (backing.libeara_payout_sources || []).slice(0, 2);
    const senderText = sendersArr.length
        ? sendersArr.map(s => {
            const short = s.address.slice(0, 10) + '…';
            return `<a href="https://etherscan.io/address/${s.address}" target="_blank" class="text-blue-400 hover:underline">${short}</a>`;
          }).join(' / ')
        : '—';

    let elapsedText = '';
    if (burnMs) {
        const elapsedHours = (nowMs - burnMs) / 3600 / 1000;
        elapsedText = `${elapsedHours.toFixed(1)}h since burn (historical max: ~155h = T+6.4d)`;
    } else if (hasQueue && !hasBurn) {
        elapsedText = 'awaiting burn (typically 5–27h after queue entry)';
    }

    container.innerHTML = `
        <div class="bg-gray-900/40 border border-gray-700 rounded p-4">
            <div class="text-sm text-white font-semibold mb-3">
                Stage B reconciliation — in progress
            </div>
            <div class="flex items-center justify-between text-xs text-gray-300 font-mono mb-4 overflow-x-auto">
                <div class="flex items-center whitespace-nowrap">
                    <span class="text-white">[Queue]</span>
                    <span class="mx-2 text-gray-600">──</span>
                    ${queueIcon}
                    <span class="mx-2 text-gray-600">──▶</span>
                </div>
                <div class="flex items-center whitespace-nowrap">
                    <span class="text-white">[Burn]</span>
                    <span class="mx-2 text-gray-600">──</span>
                    ${burnIcon}
                    <span class="mx-2 text-gray-600">──▶</span>
                </div>
                <div class="flex items-center whitespace-nowrap">
                    <span class="text-white">[USDC Settlement]</span>
                    <span class="mx-2 text-gray-600">──</span>
                    ${settlemIcon}
                    <span class="mx-2 text-gray-600">──▶</span>
                </div>
                <div class="flex items-center whitespace-nowrap">
                    <span class="text-white">[Complete]</span>
                    <span class="mx-2 text-gray-600">──</span>
                    ${completeIcon}
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-400">
                <div><span class="text-gray-500">Queue entry:</span> <span class="text-white">${queueAmt}</span> · ${queueDate} ${queueTxLink}</div>
                <div><span class="text-gray-500">Burn:</span> <span class="text-white">${burnAmt}</span> · ${burnDate} ${burnTxLink}</div>
                <div><span class="text-gray-500">USDC expected:</span> <span class="text-white">${receivableAmt}</span> · by ${expectedDate} from ${senderText}</div>
                <div><span class="text-gray-500">Elapsed:</span> <span class="text-white">${elapsedText}</span></div>
            </div>
        </div>
    `;
}

// Block B2: Historical cycles table — renders from data/thbill_flow_b_cycles.json.
// Includes an "in progress" row pinned to top if backing.flow_b_current is set.
function updateFlowBCyclesTable(cyclesDoc, backing) {
    const tbody = document.getElementById('flow-b-cycles-table');
    const footer = document.getElementById('flow-b-cycles-footer');
    if (!tbody) return;

    const cycles = (cyclesDoc && cyclesDoc.cycles) || [];
    // Descending by burn date, in-progress pinned first
    const completed = cycles.filter(c => c.status === 'complete')
        .sort((a, b) => (b.burn_ts || '').localeCompare(a.burn_ts || ''));
    const pending = cycles.filter(c => c.status !== 'complete')
        .sort((a, b) => (b.burn_ts || '').localeCompare(a.burn_ts || ''));
    const ordered = [...pending, ...completed];

    if (!ordered.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-3 text-gray-500">No cycles recorded yet.</td></tr>';
        if (footer) footer.textContent = '';
        return;
    }

    const fmtUltra = amt => amt != null ? formatNumber(amt, 0) : '—';
    const txLink = (hash) => hash
        ? ` <a href="https://etherscan.io/tx/${hash}" target="_blank" class="text-blue-400 hover:underline text-xs">↗</a>`
        : '';
    const addrLink = (addr) => addr
        ? `<a href="https://etherscan.io/address/${addr}" target="_blank" class="text-blue-400 hover:underline">${addr.slice(0, 10)}…</a>`
        : 'TBD';

    tbody.innerHTML = ordered.map(c => {
        const isPending = c.status !== 'complete';
        const rowCls = isPending ? 'border-t border-gray-700/50 bg-blue-900/10 italic' : 'border-t border-gray-700/50';
        const label = isPending ? 'In progress' : c.cycle_label;
        const burnDate = c.burn_ts ? c.burn_ts.slice(0, 10) : '—';
        const settlementDate = c.settlement_ts ? c.settlement_ts.slice(0, 10) : '—';
        const tDays = isPending
            ? '≤T+7'
            : (c.settlement_days_after_burn != null ? `T+${c.settlement_days_after_burn.toFixed(1)}d` : '—');
        const senderCell = isPending
            ? '<span class="text-gray-500 italic">TBD</span>'
            : addrLink(c.settlement_sender);
        return `
            <tr class="${rowCls}">
                <td class="px-5 py-3">${label}</td>
                <td class="text-right px-5 py-3">${fmtUltra(c.burn_ultra_amount)}${txLink(c.burn_tx)}</td>
                <td class="text-right px-5 py-3 text-gray-400">${burnDate}</td>
                <td class="text-right px-5 py-3">${settlementDate}${txLink(c.settlement_tx)}</td>
                <td class="text-right px-5 py-3">${tDays}</td>
                <td class="px-5 py-3">${senderCell}</td>
            </tr>
        `;
    }).join('');

    if (footer) {
        const completeCount = completed.length;
        const tDaysList = completed.filter(c => c.settlement_days_after_burn != null).map(c => c.settlement_days_after_burn);
        if (completeCount && tDaysList.length) {
            const min = Math.min(...tDaysList);
            const max = Math.max(...tDaysList);
            footer.textContent = `Historical data from ${completeCount} completed cycle${completeCount === 1 ? '' : 's'}. Settlement window ranged T+${min.toFixed(1)} to T+${max.toFixed(1)} days. T+7 is the conservative upper bound; beyond that is out-of-envelope.`;
        } else {
            footer.textContent = `${ordered.length} cycle${ordered.length === 1 ? '' : 's'} recorded.`;
        }
    }
}

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
        updatePegDiscountCard(data.peg);
        updateUsdBackingSummary(data.backing);
        updateBackingTable(data.backing);
        updateTreasuryTable(data.backing);
        updatePegStatus(data.peg, data.secondary_liquidity);

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

        // Flow B current-cycle widget + historical cycles table
        updateFlowBCurrent(data.backing);
        let flowBCyclesDoc = null;
        try {
            const cyclesResp = await fetch(FLOW_B_CYCLES_URL);
            if (cyclesResp.ok) flowBCyclesDoc = await cyclesResp.json();
        } catch (e) { /* section just shows history-missing state */ }
        updateFlowBCyclesTable(flowBCyclesDoc, data.backing);

        const recentRedemptions = (data.redemption_flow && data.redemption_flow.recent_user_redemptions) || [];
        renderPegChart(pegHistory, recentRedemptions);
        renderRecentRedemptionsTable(recentRedemptions);
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
