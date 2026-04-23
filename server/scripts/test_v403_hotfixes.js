#!/usr/bin/env node
// v4.0.3 / v4.1 — validate:
//   (O-4a) homesDelivered cascade picks globally-latest row across all
//          /home.*(deliver|settl|closed)/ concepts.
//   (O-4b) cancelRate cascade picks globally-latest across all /cancel/.
//   (O-1)  deliverables.js §10 EDGAR table renders all builders, with the
//          `hasEdgarData` predicate correctly counting rows with data.

const Module = require('module');
const path = require('path');
const fs = require('fs');

const fakeRouter = { get() {}, post() {}, use() {} };
const fakeExpress = { Router: () => fakeRouter };
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === 'express') return fakeExpress;
  return origLoad.call(this, request, parent, ...rest);
};

const { extractEdgarMetrics } =
  require(path.join(__dirname, '..', 'routes', 'competition.js'));

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  [PASS] ' + label); pass++; }
  else { console.log('  [FAIL] ' + label + (detail ? ' -- ' + detail : '')); fail++; }
}

// ---------- O-4a: homesDelivered globally-latest ----------
const fixt_del = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { end: '2025-10-31', val: 11000000000, form: '10-K' },
      ]}},
    },
    dei: {
      HomesSettled: { units: { pure: [
        { end: '2017-10-31', val: 7500, form: '10-K' },
        { end: '2018-10-31', val: 8200, form: '10-K' },
      ]}},
      HomesClosed: { units: { pure: [
        { end: '2024-10-31', val: 11800, form: '10-K' },
        { end: '2025-10-31', val: 12500, form: '10-K' },
      ]}},
    },
  },
};
const m1 = extractEdgarMetrics(fixt_del, { name: 'X', cik: '1', ticker: 'X' });
ok('O-4a: homesDelivered picks 2025 HomesClosed (12500) over 2018 HomesSettled',
   m1.homesDelivered === 12500, 'got ' + m1.homesDelivered);
ok('O-4a: ASP derived = round(11,000,000,000 / 12500) = 880,000',
   m1.asp === 880000, 'got ' + m1.asp);

const fixt_del_legacy = {
  facts: {
    dei: {
      HomesDelivered: { units: { pure: [
        { end: '2022-12-31', val: 5000, form: '10-K' },
        { end: '2023-12-31', val: 5500, form: '10-K' },
      ]}},
    },
  },
};
const m2 = extractEdgarMetrics(fixt_del_legacy, { name: 'Y', cik: '2', ticker: 'Y' });
ok('O-4a: legacy-only concept returns 2023 row (5500)',
   m2.homesDelivered === 5500, 'got ' + m2.homesDelivered);

const fixt_del_none = { facts: { 'us-gaap': {} } };
const m3 = extractEdgarMetrics(fixt_del_none, { name: 'Z', cik: '3', ticker: 'Z' });
ok('O-4a: no homes concept -> null', m3.homesDelivered === null);

const fixt_del_ns = {
  facts: {
    'us-gaap': {
      HomesDelivered: { units: { pure: [
        { end: '2022-12-31', val: 8000, form: '10-K' },
      ]}},
    },
    tol: {
      HomesDelivered: { units: { pure: [
        { end: '2025-12-31', val: 10500, form: '10-K' },
      ]}},
    },
  },
};
const m4 = extractEdgarMetrics(fixt_del_ns, { name: 'W', cik: '4', ticker: 'W' });
ok('O-4a: cross-namespace picks 2025 value (10500)',
   m4.homesDelivered === 10500, 'got ' + m4.homesDelivered);

// ---------- O-4b: cancelRate globally-latest ----------
const fixt_cancel = {
  facts: {
    'us-gaap': {
      CancellationRate: { units: { pure: [
        { end: '2018-12-31', val: 0.22, form: '10-K' },
        { end: '2019-12-31', val: 0.21, form: '10-K' },
      ]}},
      OrderCancellationRate: { units: { pure: [
        { end: '2024-12-31', val: 0.17, form: '10-K' },
        { end: '2025-12-31', val: 0.18, form: '10-K' },
      ]}},
    },
  },
};
const m5 = extractEdgarMetrics(fixt_cancel, { name: 'C', cik: '5', ticker: 'C' });
ok('O-4b: cancelRate picks 2025 row normalized to 18.0',
   m5.cancelRate === 18.0, 'got ' + m5.cancelRate);

const fixt_cancel_pct = {
  facts: {
    'us-gaap': {
      CancellationRate: { units: { pure: [
        { end: '2025-12-31', val: 19.47, form: '10-K' },
      ]}},
    },
  },
};
const m6 = extractEdgarMetrics(fixt_cancel_pct, { name: 'P', cik: '6', ticker: 'P' });
ok('O-4b: percentage-form cancelRate rounded to 1dp (19.5)',
   m6.cancelRate === 19.5, 'got ' + m6.cancelRate);

const fixt_cancel_none = { facts: { 'us-gaap': { Revenues: { units: { USD: [
  { end: '2025-12-31', val: 1e9, form: '10-K' }
]}}}}};
const m7 = extractEdgarMetrics(fixt_cancel_none, { name: 'N', cik: '7', ticker: 'N' });
ok('O-4b: no cancel concept -> null', m7.cancelRate === null);

// ---------- O-1: deliverables.js §10 hasEdgarData predicate ----------
const delSrc = fs.readFileSync(
  // v4.1 (V41-1): §10 EDGAR block moved to deliverables/pdf.js.
  path.join(__dirname, '..', 'routes', 'deliverables', 'pdf.js'), 'utf8');
const predMatch = delSrc.match(
  /const hasEdgarData = b => b && \([\s\S]*?\);/);
if (!predMatch) {
  console.error('FAIL: could not locate hasEdgarData predicate');
  process.exit(1);
}
const arrowSrc = predMatch[0].replace('const hasEdgarData = ', '').replace(/;$/, '');
const hasEdgarData = new Function('return (' + arrowSrc + ');')();

// Predicate is consumed in boolean context in production; test via truthy/falsy.
const truthy = v => Boolean(v);
const falsy  = v => !v;
ok('O-1: builder with revenueUsd -> has EDGAR data',
   truthy(hasEdgarData({ name: 'A', revenueUsd: 5e9 })));
ok('O-1: builder with only cik -> has EDGAR data',
   truthy(hasEdgarData({ name: 'B', cik: '123' })));
ok('O-1: builder with only homesDelivered -> has EDGAR data',
   truthy(hasEdgarData({ name: 'C', homesDelivered: 1000 })));
ok('O-1: builder with only ASP -> has EDGAR data',
   truthy(hasEdgarData({ name: 'D', averageSellingPrice: 500000 })));
ok('O-1: builder with only grossMarginPct -> has EDGAR data',
   truthy(hasEdgarData({ name: 'E', grossMarginPct: 22.5 })));
ok('O-1: builder with only name+communities -> NO EDGAR data',
   falsy(hasEdgarData({ name: 'F', communities: 3 })));
ok('O-1: null/empty builder -> NO EDGAR data',
   falsy(hasEdgarData(null)) && falsy(hasEdgarData({})));
ok('O-1: builder with priceMin/priceMax only -> NO EDGAR data',
   falsy(hasEdgarData({ name: 'G', priceMin: 400000, priceMax: 600000 })));

// Verify §10 table code structure in deliverables.js
const hasNWithData    = /nWithData\s*=\s*allBuilders\.filter\(hasEdgarData\)\.length/.test(delSrc);
const hasSortFloat    = /ebMarks\.sort\(\(a, b\) => \(hasEdgarData\(b\) \? 1 : 0\) - \(hasEdgarData\(a\) \? 1 : 0\)\)/.test(delSrc);
const hasTransparency = /\+ nWithData \+ ' of ' \+ ebMarks\.length/.test(delSrc);
ok('O-1: deliverables.js computes nWithData from allBuilders', hasNWithData);
ok('O-1: deliverables.js sorts builders-with-data to top',    hasSortFloat);
ok('O-1: deliverables.js emits transparency footnote (N of M)', hasTransparency);

console.log('\n' + pass + ' pass, ' + fail + ' fail');
if (fail > 0) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASS');
