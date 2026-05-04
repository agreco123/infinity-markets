#!/usr/bin/env node
/**
 * V41P-8 + V41P-9 — test_v41p89_polish.
 */
'use strict';
const assert = require('assert');

const Module = require('module');
const origLoad = Module._load;
const fakeRouter = () => ({ post: () => {}, get: () => {}, use: () => {} });
const fakeExpress = Object.assign(() => ({ Router: fakeRouter }), { Router: fakeRouter });
Module._load = function(req, parent, ...rest) {
  if (req === 'express') return fakeExpress;
  if (req === 'puppeteer-core' || req === '@sparticuz/chromium') return {};
  return origLoad.call(this, req, parent, ...rest);
};

const { isBrokerage } = require('../routes/competition');
const { enrichAnalysisForDeliverables } = require('../routes/analysis');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log('[PASS] ' + label); pass++; }
  catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// V41P-8 — brokerage blocklist additions
check('V41P-8 — Gurney Becker flagged as brokerage', () => {
  assert.strictEqual(isBrokerage('Gurney Becker & Bourne'), true);
  assert.strictEqual(isBrokerage('gurney becker'), true);
  assert.strictEqual(isBrokerage('Gurney, Becker, & Bourne'), true);
});
check('V41P-8 — other WNY brokerages flagged', () => {
  assert.strictEqual(isBrokerage('Hunt Real Estate Buffalo'), true);
  assert.strictEqual(isBrokerage('MJ Peterson'), true);
  assert.strictEqual(isBrokerage('BHHS Professional Realty'), true);
  assert.strictEqual(isBrokerage('Berkshire Hathaway Home Services'), true);
});
check('V41P-8 — genuine builders NOT flagged', () => {
  assert.strictEqual(isBrokerage('NVR Inc.'), false);
  assert.strictEqual(isBrokerage('Forbes Capretto Homes'), false);
  assert.strictEqual(isBrokerage('Ryan Homes'), false);
  assert.strictEqual(isBrokerage('Maronda Homes'), false);
});

// V41P-9 — landCostPctOfRevenue normalization
check('V41P-9 — decimal fraction 0.18 → 18', () => {
  const a = { land: { lotToHomeRatio: 0.18 } };
  enrichAnalysisForDeliverables(a, null, null);
  assert.strictEqual(a.land.landCostPctOfRevenue, 18);
  assert.strictEqual(a.land._landCostPctSource, 'normalized_from_fraction');
});

check('V41P-9 — decimal fraction 0.162 → 16.2', () => {
  const a = { land: { lotToHomeRatio: 0.162 } };
  enrichAnalysisForDeliverables(a, null, null);
  assert.strictEqual(a.land.landCostPctOfRevenue, 16.2);
});

check('V41P-9 — already-percent 17.9 → 17.9 (no double-scale)', () => {
  const a = { land: { landCostPctOfRevenue: 17.9 } };
  enrichAnalysisForDeliverables(a, null, null);
  assert.strictEqual(a.land.landCostPctOfRevenue, 17.9);
  assert.strictEqual(a.land._landCostPctSource, undefined);
});

check('V41P-9 — suspicious value >= 60 left alone (likely corrupt)', () => {
  const a = { land: { landCostPctOfRevenue: 75 } };
  enrichAnalysisForDeliverables(a, null, null);
  assert.strictEqual(a.land.landCostPctOfRevenue, 75);
});

check('V41P-9 — null stays null', () => {
  const a = { land: {} };
  enrichAnalysisForDeliverables(a, null, null);
  assert.strictEqual(a.land.landCostPctOfRevenue, null);
});

console.log('\n=== test_v41p89_polish: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
