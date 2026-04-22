/**
 * v3.0 Step 7 — SEC EDGAR builder benchmarks test harness
 *
 * competition.js transitively requires express, which isn't installed in the
 * sandbox. We textually extract extractEdgarMetrics + buildEmptyBuilderProfile
 * + PUBLIC_BUILDERS from the route source and exercise them via new Function().
 */
'use strict';

const fs = require('fs');
const path = require('path');

const COMP = path.resolve(__dirname, '..', 'routes', 'competition.js');
const src = fs.readFileSync(COMP, 'utf8');

function cut(label, re) {
  const m = src.match(re);
  if (!m) { console.error('[extract-fail]', label); process.exit(2); }
  return m[0];
}

const pubBuildersSrc = cut('PUBLIC_BUILDERS', /const PUBLIC_BUILDERS = \[[\s\S]*?\];/);
const extractSrc     = cut('extractEdgarMetrics', /function extractEdgarMetrics\(data, b\)[\s\S]*?\n\}\n/);
const buildEmptySrc  = cut('buildEmptyBuilderProfile', /function buildEmptyBuilderProfile\(b\)[\s\S]*?\n\}\n/);

const factory = new Function(
  pubBuildersSrc + '\n' +
  extractSrc + '\n' +
  buildEmptySrc + '\n' +
  'return { extractEdgarMetrics, buildEmptyBuilderProfile, PUBLIC_BUILDERS };'
);
const { extractEdgarMetrics, buildEmptyBuilderProfile, PUBLIC_BUILDERS } = factory();

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.error('  FAIL:', m); } }
function approx(a, b, eps, m) { assert(Math.abs(a - b) <= eps, m + ' got=' + a + ' exp=' + b); }

console.log('\n== EDGAR benchmarks harness ==');

// PUBLIC_BUILDERS sanity
assert(Array.isArray(PUBLIC_BUILDERS), 'PUBLIC_BUILDERS is array');
assert(PUBLIC_BUILDERS.length === 5, 'exactly 5 public builders');
const tickers = PUBLIC_BUILDERS.map(b => b.ticker);
for (const t of ['NVR','LEN','DHI','PHM','TOL']) {
  assert(tickers.includes(t), 'PUBLIC_BUILDERS includes ' + t);
}
for (const b of PUBLIC_BUILDERS) {
  assert(/^\d{10}$/.test(b.cik), 'CIK is 10 digits for ' + b.ticker);
}

// Empty profile scaffold
const empty = buildEmptyBuilderProfile(PUBLIC_BUILDERS[0]);
assert(empty.ticker === 'NVR', 'empty profile has ticker');
assert(empty.cik === '0000906163', 'empty profile has CIK');
for (const k of ['revenueUsd','grossProfitUsd','grossMarginPct','netIncomeUsd',
                 'homesDelivered','asp','cancelRate','backlogUnits','backlogValueUsd',
                 'filingPeriodEnd','filingForm','sourceUrl','_stepTag','_error']) {
  assert(k in empty, 'empty profile has field: ' + k);
  assert(empty[k] === null, 'empty profile null for: ' + k);
}

// Build a synthetic EDGAR companyfacts payload
const payload = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { val: 4500000000, end: '2022-12-31', form: '10-K' },
        { val: 5200000000, end: '2023-12-31', form: '10-K' },
        { val: 5800000000, end: '2024-12-31', form: '10-K' },
        { val: 1400000000, end: '2025-03-31', form: '10-Q' },
      ]}},
      GrossProfit: { units: { USD: [
        { val: 1400000000, end: '2024-12-31', form: '10-K' },
      ]}},
      NetIncomeLoss: { units: { USD: [
        { val: 760000000, end: '2024-12-31', form: '10-K' },
      ]}},
      ContractWithCustomerLiability: { units: { USD: [
        { val: 2100000000, end: '2024-12-31', form: '10-K' },
      ]}},
      HomesDelivered: { units: { shares: [
        { val: 23400, end: '2024-12-31', form: '10-K' },
        { val: 20800, end: '2023-12-31', form: '10-K' },
      ]}},
      HomesInBacklog: { units: { shares: [
        { val: 8900, end: '2024-12-31', form: '10-K' },
      ]}},
      CancellationRate: { units: { pure: [
        { val: 0.142, end: '2024-12-31', form: '10-K' },
      ]}},
    },
  },
};
const m = extractEdgarMetrics(payload, PUBLIC_BUILDERS[0]);
assert(m.revenueUsd === 5800000000, 'latest 10-K revenue picked (2024)');
assert(m.grossProfitUsd === 1400000000, 'gross profit picked');
approx(m.grossMarginPct, 24.1, 0.1, 'gross margin ~24.1%');
assert(m.grossMargin === m.grossMarginPct, 'legacy grossMargin alias');
assert(m.netIncomeUsd === 760000000, 'net income picked');
assert(m.backlogValueUsd === 2100000000, 'backlog value USD picked');
assert(m.homesDelivered === 23400, 'homes delivered picked (latest 10-K)');
approx(m.asp, 247863, 10, 'ASP ~= revenue / homes delivered');
approx(m.cancelRate, 14.2, 0.1, 'cancel rate normalized to percent');
assert(m.backlogUnits === 8900, 'backlog units picked (shares unit)');
assert(m.filingPeriodEnd === '2024-12-31', 'filing period end matches latest 10-K');
assert(m.filingForm === '10-K', 'filing form stamped');

// Alt revenue concepts fallback
const alt = {
  facts: { 'us-gaap': {
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
      { val: 9900000000, end: '2024-12-31', form: '10-K' },
    ]}},
    GrossProfit: { units: { USD: [{ val: 2300000000, end: '2024-12-31', form: '10-K' }]}},
  }}
};
const altM = extractEdgarMetrics(alt, PUBLIC_BUILDERS[1]);
assert(altM.revenueUsd === 9900000000, 'falls back to RevenueFromContract concept');
approx(altM.grossMarginPct, 23.2, 0.1, 'alt gross margin');
assert(altM.homesDelivered === null, 'homesDelivered null when not tagged');
assert(altM.asp === null, 'ASP null when homesDelivered null');

// SalesRevenueNet fallback
const salesRev = {
  facts: { 'us-gaap': {
    SalesRevenueNet: { units: { USD: [{ val: 3300000000, end: '2024-12-31', form: '10-K' }]}},
  }}
};
const srM = extractEdgarMetrics(salesRev, PUBLIC_BUILDERS[2]);
assert(srM.revenueUsd === 3300000000, 'SalesRevenueNet fallback works');
assert(srM.grossMarginPct === null, 'null GP -> null margin');

// Empty / malformed
const empty1 = extractEdgarMetrics({}, PUBLIC_BUILDERS[0]);
assert(empty1.revenueUsd === null, 'empty payload -> null revenue');
assert(empty1.grossMarginPct === null, 'empty payload -> null margin');

const empty2 = extractEdgarMetrics({ facts: {} }, PUBLIC_BUILDERS[0]);
assert(empty2.revenueUsd === null, 'empty facts -> null');

const empty3 = extractEdgarMetrics(null, PUBLIC_BUILDERS[0]);
assert(empty3.revenueUsd === null, 'null payload -> null');

// Cancel rate already in percent form
const pctCancel = {
  facts: { 'us-gaap': {
    Revenues: { units: { USD: [{ val: 1000000, end: '2024-12-31', form: '10-K' }]}},
    HomeCancellationRate: { units: { pure: [{ val: 19.5, end: '2024-12-31', form: '10-K' }]}},
  }}
};
const pcM = extractEdgarMetrics(pctCancel, PUBLIC_BUILDERS[3]);
approx(pcM.cancelRate, 19.5, 0.1, 'cancel rate already-pct preserved');

// Revenue zero guard
const zeroRev = {
  facts: { 'us-gaap': {
    Revenues: { units: { USD: [{ val: 0, end: '2024-12-31', form: '10-K' }]}},
    GrossProfit: { units: { USD: [{ val: 0, end: '2024-12-31', form: '10-K' }]}},
  }}
};
const zM = extractEdgarMetrics(zeroRev, PUBLIC_BUILDERS[4]);
assert(zM.grossMarginPct === null, 'zero revenue -> null margin (no div-by-zero)');

// Only 10-Q present (filter picks any available)
const qOnly = {
  facts: { 'us-gaap': {
    Revenues: { units: { USD: [
      { val: 1100000000, end: '2024-09-30', form: '10-Q' },
      { val: 1200000000, end: '2024-12-31', form: '10-Q' },
    ]}}
  }}
};
const qM = extractEdgarMetrics(qOnly, PUBLIC_BUILDERS[0]);
assert(qM.revenueUsd === 1200000000, 'no-10-K fallback picks latest filing');

// Exotic: homes-deliver concept in non-us-gaap namespace
const exotic = {
  facts: {
    'us-gaap': { Revenues: { units: { USD: [{ val: 5000000000, end: '2024-12-31', form: '10-K' }]}}},
    'nvr': { HomesSettled: { units: { shares: [{ val: 25000, end: '2024-12-31', form: '10-K' }]}}},
  }
};
const exM = extractEdgarMetrics(exotic, PUBLIC_BUILDERS[0]);
assert(exM.homesDelivered === 25000, 'non-us-gaap namespace walker finds homes-settled');
assert(exM.asp === 200000, 'ASP computed from exotic namespace');

// Backlog units only in non-USD unit type
const backlogExotic = {
  facts: { 'us-gaap': {
    Revenues: { units: { USD: [{ val: 5000000000, end: '2024-12-31', form: '10-K' }]}},
    HomesInBacklogUnits: { units: { pure: [{ val: 12000, end: '2024-12-31', form: '10-K' }]}},
  }}
};
const bxM = extractEdgarMetrics(backlogExotic, PUBLIC_BUILDERS[0]);
assert(bxM.backlogUnits === 12000, 'backlog units from non-USD unit');

// Older filings ranked correctly
const stale = {
  facts: { 'us-gaap': {
    Revenues: { units: { USD: [
      { val: 2000000000, end: '2021-12-31', form: '10-K' },
      { val: 2500000000, end: '2022-12-31', form: '10-K' },
      { val: 3000000000, end: '2023-12-31', form: '10-K' },
    ]}}
  }}
};
const stM = extractEdgarMetrics(stale, PUBLIC_BUILDERS[0]);
assert(stM.revenueUsd === 3000000000, 'latest by end-date chosen');
assert(stM.filingPeriodEnd === '2023-12-31', 'filing period reflects latest');

// buildEmptyBuilderProfile has grossMargin legacy alias
assert('grossMargin' in empty, 'empty profile has legacy grossMargin');
assert(empty.grossMargin === null, 'grossMargin legacy null');

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
console.log('  [OK] EDGAR benchmarks harness green\n');
