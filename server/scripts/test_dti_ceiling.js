#!/usr/bin/env node
/**
 * V41-6 / R-3 — test_dti_ceiling.
 *
 * Verifies:
 *   1. Cranberry-like case produces DTI ceiling within a tight band of ground truth.
 *   2. Erie-like case produces DTI ceiling within band.
 *   3. Invalid MHI returns { homePrice: null, reason: 'invalid_mhi' }.
 *   4. rate=0 returns a finite homePrice (zero-rate amort branch in pmtFactor).
 *   5. pmtFactor(0, 360) === 1/360.
 *   6. pmtFactor(0.005, 360) > 0 and matches standard amort formula.
 */
'use strict';
const assert = require('assert');
const { pmtFactor, maxAffordablePrice, DEFAULTS } = require('../lib/affordability');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log('[PASS] ' + label); pass++; }
  catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// 1. Cranberry ground-truth validation
check('Cranberry (MHI=112345, rate=6.82%, tax=1.16%) → $367K ± $5K', () => {
  const r = maxAffordablePrice({
    mhi: 112345,
    rate: 0.0682,
    taxRate: 0.0116,
    insRate: DEFAULTS.insRate,
    dtiFrontEnd: DEFAULTS.dtiFrontEnd,
    downPct: DEFAULTS.downPct,
    termYears: DEFAULTS.termYears,
  });
  assert.ok(r && r.homePrice, 'homePrice should be computed');
  assert.ok(r.homePrice > 362000 && r.homePrice < 372000,
    'expected 362K-372K, got ' + r.homePrice);
  assert.strictEqual(typeof r.monthlyPITI, 'number');
  assert.ok(r.monthlyPITI > 0);
});

// 2. Erie (lower MHI, higher tax)
check('Erie (MHI=55000, rate=6.82%, tax=1.91%) → 160K-170K band', () => {
  const r = maxAffordablePrice({
    mhi: 55000,
    rate: 0.0682,
    taxRate: 0.0191,
    insRate: DEFAULTS.insRate,
  });
  assert.ok(r && r.homePrice > 160000 && r.homePrice < 170000,
    'expected 160K-170K, got ' + (r && r.homePrice));
});

// 3. Invalid MHI → null with reason
check('MHI=0 returns {homePrice:null, reason:invalid_mhi}', () => {
  const r = maxAffordablePrice({ mhi: 0 });
  assert.strictEqual(r.homePrice, null);
  assert.strictEqual(r.reason, 'invalid_mhi');
});

// 4. rate=0 zero-rate amort branch
check('rate=0 returns finite homePrice via zero-rate amort', () => {
  const r = maxAffordablePrice({ mhi: 100000, rate: 0 });
  assert.ok(r && r.homePrice, 'zero-rate should still compute');
  assert.ok(Number.isFinite(r.homePrice));
  assert.ok(r.homePrice > 0);
});

// 5. pmtFactor(0, 360) === 1/360 (zero-rate special case)
check('pmtFactor(0, 360) === 1/360', () => {
  const f = pmtFactor(0, 360);
  assert.ok(Math.abs(f - (1/360)) < 1e-12, 'got ' + f);
});

// 6. pmtFactor(0.005, 360) matches standard amort formula within 1e-9
check('pmtFactor(0.005, 360) matches standard amort formula', () => {
  const r = 0.005, n = 360;
  const pow = Math.pow(1 + r, n);
  const expected = (r * pow) / (pow - 1);
  const f = pmtFactor(r, n);
  assert.ok(Math.abs(f - expected) < 1e-12, 'got ' + f + ' expected ' + expected);
  assert.ok(f > 0);
});

console.log('\n=== test_dti_ceiling: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
