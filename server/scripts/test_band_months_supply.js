#!/usr/bin/env node
/**
 * V41P-7 / W-7 — test_band_months_supply.
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

const { enrichAnalysisForDeliverables } = require('../routes/analysis');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log('[PASS] ' + label); pass++; }
  catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// 1. Claude flat-12 but per-band listings/salesPerMonth give DIFFERENT ratios.
//    Expected: recompute per band from raw inputs, kill Claude's flat fabrication.
check('flat-12 Claude + varied listings/sales -> per-band recomputed', () => {
  const a = {
    absorption: {
      byPriceBand: [
        { name: 'Under $300K',   listings: 50,  salesPerMonth: 10,  monthsSupply: 12.0 }, // true 5.0
        { name: '$300K-$450K',   listings: 200, salesPerMonth: 25,  monthsSupply: 12.0 }, // true 8.0
        { name: '$450K-$600K',   listings: 340, salesPerMonth: 40,  monthsSupply: 12.0 }, // true 8.5
        { name: '$600K-$800K',   listings: 120, salesPerMonth: 6,   monthsSupply: 12.0 }, // true 20
        { name: 'Over $800K',    listings: 90,  salesPerMonth: 4.5, monthsSupply: 12.0 }, // true 20
      ],
    },
  };
  enrichAnalysisForDeliverables(a, { medianValue: 400000 }, null);
  const b = a.absorption.byPriceBand;
  assert.strictEqual(b[0].monthsSupply, 5.0, 'band 0 should be 5.0, got ' + b[0].monthsSupply);
  assert.strictEqual(b[1].monthsSupply, 8.0, 'band 1 should be 8.0, got ' + b[1].monthsSupply);
  assert.strictEqual(b[2].monthsSupply, 8.5, 'band 2 should be 8.5, got ' + b[2].monthsSupply);
  assert.strictEqual(b[3].monthsSupply, 20.0, 'band 3 should be 20.0, got ' + b[3].monthsSupply);
  assert.strictEqual(b[4].monthsSupply, 20.0, 'band 4 should be 20.0, got ' + b[4].monthsSupply);
  assert.strictEqual(b[0]._monthsSupplyOriginal, 12.0);
  assert.strictEqual(b[0]._monthsSupplySource, 'computed_from_listings');
});

// 2. Claude value matches computed exactly → no rewrite (clean pass-through).
check('Claude exact-match -> no rewrite; deviation -> computed wins', () => {
  const a = {
    absorption: {
      byPriceBand: [
        { name: 'A', listings: 100, salesPerMonth: 10, monthsSupply: 10.0 }, // exact
        { name: 'B', listings: 100, salesPerMonth: 10, monthsSupply: 10.5 }, // 5% off
        { name: 'C', listings: 100, salesPerMonth: 10, monthsSupply: 12.0 }, // 20% off
      ],
    },
  };
  enrichAnalysisForDeliverables(a, { medianValue: 400000 }, null);
  const b = a.absorption.byPriceBand;
  assert.strictEqual(b[0].monthsSupply, 10.0);
  assert.strictEqual(b[0]._monthsSupplyOriginal, undefined, 'exact match leaves no audit trail');
  assert.strictEqual(b[1].monthsSupply, 10.0, '5% off rewritten to computed');
  assert.strictEqual(b[1]._monthsSupplyOriginal, 10.5);
  assert.strictEqual(b[1]._monthsSupplySource, 'computed_from_listings');
  assert.strictEqual(b[2].monthsSupply, 10.0);
  assert.strictEqual(b[2]._monthsSupplyOriginal, 12.0);
});

// 3. Flat Claude values + missing listings → coerce to null.
check('flat Claude + no listings/sales -> null (smell-test fabrication)', () => {
  const a = {
    absorption: {
      byPriceBand: [
        { name: 'A', listings: null, salesPerMonth: null, monthsSupply: 12.0 },
        { name: 'B', listings: null, salesPerMonth: null, monthsSupply: 12.0 },
        { name: 'C', listings: null, salesPerMonth: null, monthsSupply: 12.0 },
      ],
    },
  };
  enrichAnalysisForDeliverables(a, null, null);
  const b = a.absorption.byPriceBand;
  for (const row of b) {
    assert.strictEqual(row.monthsSupply, null);
    assert.strictEqual(row._monthsSupplySource, 'null_flat_fabrication');
    assert.strictEqual(row._monthsSupplyOriginal, 12.0);
  }
});

// 4. Varied Claude values + missing listings → preserve (real signal).
check('varied Claude + no listings/sales -> preserve (real signal)', () => {
  const a = {
    absorption: {
      byPriceBand: [
        { name: 'A', listings: null, salesPerMonth: null, monthsSupply: 4.5 },
        { name: 'B', listings: null, salesPerMonth: null, monthsSupply: 6.8 },
        { name: 'C', listings: null, salesPerMonth: null, monthsSupply: 9.2 },
      ],
    },
  };
  enrichAnalysisForDeliverables(a, null, null);
  const b = a.absorption.byPriceBand;
  assert.strictEqual(b[0].monthsSupply, 4.5);
  assert.strictEqual(b[1].monthsSupply, 6.8);
  assert.strictEqual(b[2].monthsSupply, 9.2);
});

// 5. Divide-by-zero + flat Claude → null (smell-test fires).
check('salesPerMonth = 0 -> flat-smell coerces to null', () => {
  const a = {
    absorption: {
      byPriceBand: [
        { name: 'A', listings: 50, salesPerMonth: 0, monthsSupply: 12.0 },
        { name: 'B', listings: 50, salesPerMonth: 0, monthsSupply: 12.0 },
      ],
    },
  };
  enrichAnalysisForDeliverables(a, null, null);
  assert.strictEqual(a.absorption.byPriceBand[0].monthsSupply, null);
});

// 6. All-null + no Claude → stays null, no crash.
check('empty bands / all-null -> no crash, no fabrication', () => {
  const a = { absorption: { byPriceBand: [{ name: 'X' }] } };
  enrichAnalysisForDeliverables(a, null, null);
  assert.strictEqual(a.absorption.byPriceBand[0].monthsSupply, null);
});

// 7. Mixed: 3 rows computable, 2 rows with varied Claude -> 3 recomputed, 2 preserved.
check('mixed inputs -> per-row decision, no cross-contamination', () => {
  const a = {
    absorption: {
      byPriceBand: [
        { name: 'A', listings: 200, salesPerMonth: 25, monthsSupply: 12.0 }, // true 8
        { name: 'B', listings: 300, salesPerMonth: 15, monthsSupply: 12.0 }, // true 20
        { name: 'C', listings: 100, salesPerMonth: 20, monthsSupply: 12.0 }, // true 5
        { name: 'D', listings: null, salesPerMonth: null, monthsSupply: 4.5 },
        { name: 'E', listings: null, salesPerMonth: null, monthsSupply: 8.2 },
      ],
    },
  };
  enrichAnalysisForDeliverables(a, null, null);
  const b = a.absorption.byPriceBand;
  assert.strictEqual(b[0].monthsSupply, 8.0, 'A: ' + b[0].monthsSupply);
  assert.strictEqual(b[1].monthsSupply, 20.0, 'B: ' + b[1].monthsSupply);
  assert.strictEqual(b[2].monthsSupply, 5.0, 'C: ' + b[2].monthsSupply);
  assert.strictEqual(b[3].monthsSupply, 4.5, 'D preserved');
  assert.strictEqual(b[4].monthsSupply, 8.2, 'E preserved');
});

console.log('\n=== test_band_months_supply: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
