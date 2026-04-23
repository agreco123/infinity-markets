#!/usr/bin/env node
/**
 * V41-2 — fetch-status enum + propagation test.
 *
 * Verifies:
 *   1. FETCH_STATUS enum values are stable (contract with R-4 PDF chips).
 *   2. makeFetchStatus() correctly maps Promise.allSettled outcomes.
 *   3. makeFetchStatus() honors { cached } and { stale } overrides.
 *   4. demographics/housing/competition routes attach _fetchStatus onto their
 *      response payloads (static source check — doesn't require live server).
 *   5. analysis route merges the three upstream _fetchStatus maps.
 */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const SourceLog = require('../lib/sourceLog');
const { FETCH_STATUS, makeFetchStatus } = SourceLog;

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log('[PASS] ' + label); pass++; }
  catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// 1. Enum stability.
check('FETCH_STATUS enum values', () => {
  assert.strictEqual(FETCH_STATUS.FETCHED, 'fetched');
  assert.strictEqual(FETCH_STATUS.NULL,    'null');
  assert.strictEqual(FETCH_STATUS.FAILED,  'failed');
  assert.strictEqual(FETCH_STATUS.CACHED,  'cached');
  assert.strictEqual(FETCH_STATUS.STALE,   'stale');
});

check('FETCH_STATUS is frozen', () => {
  assert.throws(() => { FETCH_STATUS.FETCHED = 'x'; }, /Cannot assign|read only/);
});

// 2. allSettled mapping.
check('fulfilled object → fetched', () => {
  assert.strictEqual(makeFetchStatus({ status: 'fulfilled', value: { x: 1 } }), 'fetched');
});
check('fulfilled array → fetched', () => {
  assert.strictEqual(makeFetchStatus({ status: 'fulfilled', value: [1, 2] }), 'fetched');
});
check('fulfilled null → null', () => {
  assert.strictEqual(makeFetchStatus({ status: 'fulfilled', value: null }), 'null');
});
check('fulfilled empty array → null', () => {
  assert.strictEqual(makeFetchStatus({ status: 'fulfilled', value: [] }), 'null');
});
check('fulfilled empty object → null', () => {
  assert.strictEqual(makeFetchStatus({ status: 'fulfilled', value: {} }), 'null');
});
check('rejected → failed', () => {
  assert.strictEqual(makeFetchStatus({ status: 'rejected', reason: new Error('boom') }), 'failed');
});
check('null settled → null', () => {
  assert.strictEqual(makeFetchStatus(null), 'null');
});

// 3. Override flags.
check('{ cached: true } → cached', () => {
  assert.strictEqual(makeFetchStatus({ status: 'fulfilled', value: { x: 1 } }, { cached: true }), 'cached');
});
check('{ stale: true } → stale', () => {
  assert.strictEqual(makeFetchStatus({ status: 'fulfilled', value: { x: 1 } }, { stale: true }), 'stale');
});
check('stale dominates cached', () => {
  assert.strictEqual(makeFetchStatus({ status: 'fulfilled', value: {} }, { cached: true, stale: true }), 'stale');
});

// 4. Static source check — upstream routes emit _fetchStatus.
for (const route of ['demographics', 'housing', 'competition']) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', route + '.js'), 'utf8');
  check(`${route}.js imports makeFetchStatus`, () => {
    assert.ok(src.includes("const { makeFetchStatus, FETCH_STATUS } = require('../lib/sourceLog');"),
      'missing makeFetchStatus import');
  });
  check(`${route}.js builds _fetchStatus map`, () => {
    assert.ok(src.includes("const _fetchStatus = {};"),
      'missing _fetchStatus declaration');
    assert.ok(src.includes("makeFetchStatus(results[i])"),
      'missing makeFetchStatus() call');
  });
  check(`${route}.js attaches _fetchStatus to response`, () => {
    // Accept either `payload._fetchStatus = _fetchStatus;` or inline object literal `_fetchStatus,`.
    const attached = src.includes('_fetchStatus = _fetchStatus')
                  || src.match(/\n\s*_fetchStatus,\s*\n\s*\}\);/);
    assert.ok(attached, 'no _fetchStatus attachment to response');
  });
}

// 5. analysis.js merges upstream maps.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'analysis.js'), 'utf8');
  check('analysis.js merges upstream _fetchStatus', () => {
    assert.ok(src.includes('demographics && demographics._fetchStatus'),
      'missing demographics merge');
    assert.ok(src.includes('housing && housing._fetchStatus'),
      'missing housing merge');
    assert.ok(src.includes('competition && competition._fetchStatus'),
      'missing competition merge');
    assert.ok(src.includes('analysis._fetchStatus = _fetchStatus'),
      'missing analysis._fetchStatus assignment');
  });
}

// 6. End-to-end propagation: simulate allSettled results → run through the
//    exact merge logic analysis.js uses → assert the merged map is correct.
check('end-to-end: simulated pipeline propagates status enum', () => {
  const demoResults = [
    { status: 'fulfilled', value: { population: 33096 } }, // ACS
    { status: 'rejected',  reason: new Error('BLS 503') }, // BLS
  ];
  const hsgResults = [
    { status: 'fulfilled', value: { medianSalePrice: 467500 } }, // Redfin
    { status: 'fulfilled', value: null },                         // Zillow
  ];
  const cmpResults = [
    { status: 'fulfilled', value: [{ name: 'NVR' }] },            // RapidAPI
  ];

  const demoNames = ['ACS', 'BLS'];
  const hsgNames  = ['Redfin', 'Zillow'];
  const cmpNames  = ['RapidAPI Realtor'];

  const demoFS = {}; demoResults.forEach((r, i) => demoFS[demoNames[i]] = makeFetchStatus(r));
  const hsgFS  = {}; hsgResults.forEach((r, i) => hsgFS[hsgNames[i]] = makeFetchStatus(r));
  const cmpFS  = {}; cmpResults.forEach((r, i) => cmpFS[cmpNames[i]] = makeFetchStatus(r));

  const demographics = { _fetchStatus: demoFS };
  const housing      = { _fetchStatus: hsgFS };
  const competition  = { _fetchStatus: cmpFS };

  const merged = Object.assign({}, demographics._fetchStatus, housing._fetchStatus, competition._fetchStatus);

  assert.strictEqual(merged.ACS,                'fetched');
  assert.strictEqual(merged.BLS,                'failed');
  assert.strictEqual(merged.Redfin,             'fetched');
  assert.strictEqual(merged.Zillow,             'null');
  assert.strictEqual(merged['RapidAPI Realtor'],'fetched');
  assert.strictEqual(Object.keys(merged).length, 5);
});

console.log('\n=== test_fetch_status: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
