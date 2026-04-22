#!/usr/bin/env node
// v4.0.2 — EDGAR cascade-aware latest resolver test.
// Covers the Toll Brothers / PulteGroup "stale 10-K" regression where a filer
// migrating from `us-gaap:Revenues` to `us-gaap:RFCCE` (FY2019+) caused the
// OR-cascade to lock onto the deprecated concept's last row (Toll's 2018
// final Revenues filing) instead of the 2024 RFCCE. v4.0.2 picks the concept
// whose latest row is globally most recent.
//
// Uses the same express-intercept pattern as test_demographics_cascade.js so
// we can require('../routes/competition.js') without pulling real deps.

const Module = require('module');
const path = require('path');

const fakeRouter = { get() {}, post() {}, use() {} };
const fakeExpress = { Router: () => fakeRouter };
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === 'express') return fakeExpress;
  return origLoad.call(this, request, parent, ...rest);
};

const { extractEdgarMetrics, buildEmptyBuilderProfile } =
  require(path.join(__dirname, '..', 'routes', 'competition.js'));

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  [PASS] ${label}`); pass++; }
  else { console.log(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

// Fixture 1: Filer who switched concepts in FY2018. `Revenues` stops at 2018,
// `RFCCE` runs 2019-2025. Cascade-aware resolver must pick the 2025 RFCCE.
const fixt_switched = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { end: '2016-10-31', val: 5170400000, form: '10-K' },
        { end: '2017-10-31', val: 5820900000, form: '10-K' },
        { end: '2018-10-31', val: 7143258000, form: '10-K' },
      ]}},
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
        { end: '2019-10-31', val:  7223971000, form: '10-K' },
        { end: '2020-10-31', val:  7080970000, form: '10-K' },
        { end: '2023-10-31', val:  9995100000, form: '10-K' },
        { end: '2024-10-31', val: 10847200000, form: '10-K' },
        { end: '2025-10-31', val: 11234500000, form: '10-K' },
      ]}},
      GrossProfit: { units: { USD: [
        { end: '2024-10-31', val: 2700000000, form: '10-K' },
        { end: '2025-10-31', val: 2820000000, form: '10-K' },
      ]}},
    },
  },
};
const m1 = extractEdgarMetrics(fixt_switched, { name: 'Toll', cik: '794170', ticker: 'TOL' });
ok('switched-concept: revenue is 2025 RFCCE, not 2018 Revenues', m1.revenueUsd === 11234500000, `got ${m1.revenueUsd}`);
ok('switched-concept: filingPeriodEnd = 2025-10-31', m1.filingPeriodEnd === '2025-10-31', `got ${m1.filingPeriodEnd}`);
ok('switched-concept: filingForm = 10-K', m1.filingForm === '10-K');
ok('switched-concept: grossProfitUsd = 2,820,000,000', m1.grossProfitUsd === 2820000000, `got ${m1.grossProfitUsd}`);
ok('switched-concept: gross margin ≈ 25.1%', Math.abs(m1.grossMarginPct - 25.1) < 0.2, `got ${m1.grossMarginPct}`);

// Fixture 2: Filer who only ever used `Revenues`.
const fixt_legacy = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { end: '2023-12-31', val: 30000000000, form: '10-K' },
        { end: '2024-12-31', val: 34250400000, form: '10-K' },
      ]}},
      GrossProfit: { units: { USD: [
        { end: '2024-12-31', val: 7700000000, form: '10-K' },
      ]}},
    },
  },
};
const m2 = extractEdgarMetrics(fixt_legacy, { name: 'DHI', cik: '882184', ticker: 'DHI' });
ok('legacy-revenues: revenue is 2024 value', m2.revenueUsd === 34250400000);
ok('legacy-revenues: filingPeriodEnd = 2024-12-31', m2.filingPeriodEnd === '2024-12-31');
ok('legacy-revenues: gross margin ≈ 22.5%', Math.abs(m2.grossMarginPct - 22.5) < 0.2, `got ${m2.grossMarginPct}`);

// Fixture 3: No GrossProfit line, but CostOfGoodsAndServicesSold — GP computed as Rev - CGS.
const fixt_cgs = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-12-31', val: 10000000000, form: '10-K' }]}},
      CostOfGoodsAndServicesSold: { units: { USD: [{ end: '2024-12-31', val: 7500000000, form: '10-K' }]}},
    },
  },
};
const m3 = extractEdgarMetrics(fixt_cgs, { name: 'NVR', cik: '906163', ticker: 'NVR' });
ok('cgs-fallback: GP computed as Rev - CGS = 2,500,000,000', m3.grossProfitUsd === 2500000000, `got ${m3.grossProfitUsd}`);
ok('cgs-fallback: gross margin = 25.0%', Math.abs(m3.grossMarginPct - 25.0) < 0.1, `got ${m3.grossMarginPct}`);

// Fixture 4: Empty input. All fields null.
const m4 = extractEdgarMetrics({ facts: { 'us-gaap': {} } }, { name: 'X', cik: '0', ticker: 'X' });
ok('empty: revenueUsd null', m4.revenueUsd === null);
ok('empty: grossMarginPct null', m4.grossMarginPct === null);
ok('empty: filingPeriodEnd null', m4.filingPeriodEnd === null);

// Fixture 5: Cascade picks latest across concepts where SalesRevenueNet is newest.
const fixt_srn = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2015-12-31', val: 1e9, form: '10-K' }]}},
      SalesRevenueNet: { units: { USD: [{ end: '2024-12-31', val: 5e9, form: '10-K' }]}},
    },
  },
};
const m5 = extractEdgarMetrics(fixt_srn, { name: 'Y', cik: '1', ticker: 'Y' });
ok('cascade-SRN: picks 2024 SalesRevenueNet over 2015 Revenues', m5.revenueUsd === 5e9, `got ${m5.revenueUsd}`);
ok('cascade-SRN: filingPeriodEnd = 2024-12-31', m5.filingPeriodEnd === '2024-12-31');

// Fixture 6: buildEmptyBuilderProfile returns all-null canonical shape.
const empty = buildEmptyBuilderProfile({ name: 'Z', cik: '2', ticker: 'Z' });
const requiredNullKeys = ['revenueUsd','grossProfitUsd','grossMarginPct','netIncomeUsd',
  'homesDelivered','asp','cancelRate','backlogUnits','backlogValueUsd',
  'filingPeriodEnd','filingForm','sourceUrl','_stepTag','_error'];
ok('buildEmpty: all required fields null', requiredNullKeys.every(k => empty[k] === null));

// Fixture 7: Cascade with misordered end-dates — still picks globally latest.
const fixt_mixed = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { end: '2022-12-31', val: 1e9, form: '10-K' },
        { end: '2023-12-31', val: 2e9, form: '10-K' },
      ]}},
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
        { end: '2021-12-31', val: 3e9, form: '10-K' },
      ]}},
    },
  },
};
const m7 = extractEdgarMetrics(fixt_mixed, { name: 'W', cik: '3', ticker: 'W' });
ok('mixed: picks 2023 Revenues over 2021 RFCCE', m7.revenueUsd === 2e9, `got ${m7.revenueUsd}`);
ok('mixed: filingPeriodEnd = 2023-12-31', m7.filingPeriodEnd === '2023-12-31');

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASS');
