#!/usr/bin/env node
// v4.0.2 — validate:
//   (1) deriveBandsFromListings no longer fabricates a 6-month supply;
//       when housing.monthsSupply is null, per-band monthsSupply/salesPerMonth
//       are null so the renderer em-dashes honestly.
//   (2) When real monthsSupply is present, bands use it.
//   (3) _stepTag is 'v4.0.2-no-fallback' on the returned bands.
//
// Also embeds regex-extracted tests for demographics.js pick() implausible-low
// guard (fixture 5) and _acsNote county-target suppression (fixture 4).

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

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  [PASS] ' + label); pass++; }
  else { console.log('  [FAIL] ' + label + (detail ? ' — ' + detail : '')); fail++; }
}

// ── Part 1: months-supply no-fallback ──
// deriveBandsFromListings is not exported, so extract it from analysis.js via regex
// and eval it in a sandbox. The function is self-contained (depends only on `tiers`
// definition inside it and arithmetic).
const analysisSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'analysis.js'), 'utf8');
const fnMatch = analysisSrc.match(/function deriveBandsFromListings\(housing\) \{[\s\S]*?\n\}/);
if (!fnMatch) {
  console.error('FAIL: could not locate deriveBandsFromListings in analysis.js');
  process.exit(1);
}
const factory = new Function(fnMatch[0] + '\nreturn deriveBandsFromListings;');
const deriveBandsFromListings = factory();

// Test 1: monthsSupply null → per-band monthsSupply null, salesPerMonth null
const bands1 = deriveBandsFromListings({
  medianValue: 500000, inventoryActive: 100, monthsSupply: null,
});
ok('no-MoS: returns 5 bands', Array.isArray(bands1) && bands1.length === 5);
ok('no-MoS: all bands have null monthsSupply', bands1.every(b => b.monthsSupply === null));
ok('no-MoS: all bands have null salesPerMonth', bands1.every(b => b.salesPerMonth === null));
ok('no-MoS: listings still populated', bands1.every(b => typeof b.listings === 'number' && b.listings >= 0));
ok('no-MoS: Entry-Level listings = 15 (100 * 0.15)', bands1[0].listings === 15);
ok('no-MoS: _stepTag v4.0.2-no-fallback', bands1[0]._stepTag === 'v4.0.2-no-fallback');

// Test 2: monthsSupply present → bands use it
const bands2 = deriveBandsFromListings({
  medianValue: 500000, inventoryActive: 100, monthsSupply: 3,
});
ok('with-MoS: Entry-Level monthsSupply = 3.0', bands2[0].monthsSupply === 3.0);
ok('with-MoS: Entry-Level salesPerMonth = 15 / 3 = 5.00', bands2[0].salesPerMonth === 5);
ok('with-MoS: Move-Up monthsSupply = 3.0', bands2[1].monthsSupply === 3.0);

// Test 3: zero monthsSupply treated as null
const bands3 = deriveBandsFromListings({
  medianValue: 500000, inventoryActive: 100, monthsSupply: 0,
});
ok('zero-MoS: treats 0 as absent → null monthsSupply', bands3.every(b => b.monthsSupply === null));
ok('zero-MoS: treats 0 as absent → null salesPerMonth', bands3.every(b => b.salesPerMonth === null));

// Test 4: missing median → null
ok('no-median: returns null', deriveBandsFromListings({ medianValue: 0, inventoryActive: 100, monthsSupply: 3 }) === null);

// Test 5: missing inventory → null
ok('no-inv: returns null', deriveBandsFromListings({ medianValue: 500000, inventoryActive: 0, monthsSupply: 3 }) === null);

// ── Part 2: demographics.js pick() implausible-low guard ──
// Extract the pick helper — it's inlined inside the route handler, so we grab
// the function body plus its SUBSTANTIAL_FIELDS Set and evaluate in isolation.
const demoSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'demographics.js'), 'utf8');
const pickBlock = demoSrc.match(/const SUBSTANTIAL_FIELDS = new Set[\s\S]*?const pick = \(computed, canonKey\) =>[\s\S]*?\n    \};/);
if (!pickBlock) {
  console.error('FAIL: could not locate pick() block in demographics.js');
  process.exit(1);
}
// The pick() closes over cachedCanon — we stub that in the sandbox.
const pickFactory = new Function('cachedCanon', pickBlock[0] + '\nreturn pick;');

// Fixture: Erie/Butler-like cache has substantial population; live returns a fragment.
const cache = {
  population: 34094,
  totalHousingUnits: 14896,
  households: 14111,
  mhi: 125126,
};
const pickFn = pickFactory(cache);

ok('pick: live > 0 and substantial, live wins',    pickFn(5000, 'population') === 5000);
ok('pick: live null, cache wins',                  pickFn(null, 'population') === 34094);
ok('pick: live tiny (94), cache substantial → cache wins',
   pickFn(94, 'totalHousingUnits') === 14896);
ok('pick: live plausible (2400), cache bigger but both plausible → live wins',
   pickFn(2400, 'totalHousingUnits') === 2400);
ok('pick: non-substantial field, tiny live still wins (no guard)',
   pickFn(0.5, 'mhi') === 0.5);
ok('pick: both null → null', pickFn(null, 'notInCache') === null);
ok('pick: NaN live falls through to cache', pickFn(NaN, 'population') === 34094);
ok('pick: substantial field, live == 500, cache 15000 → cache wins',
   pickFn(500, 'households') === 14111);
ok('pick: substantial field, live == 1500, cache 14000 → live wins (above threshold)',
   pickFn(1500, 'households') === 1500);
ok('pick: substantial field, no cache → live wins even if tiny',
   pickFactory({})(100, 'population') === 100);

// ── Part 3: _acsNote suppression when target IS county ──
const acsNoteBlock = demoSrc.match(/const _targetIsCounty = !subdivFips;[\s\S]*?const _acsNoteResolved =[\s\S]*?: null;/);
if (!acsNoteBlock) {
  console.error('FAIL: could not locate _acsNoteResolved block in demographics.js');
  process.exit(1);
}
const acsFactory = new Function('havingAcs', 'acs', 'havingCanon', 'subdivFips',
  acsNoteBlock[0] + '\nreturn _acsNoteResolved;');

ok('acsNote: county-level target (no subdivFips) + cache hit → no note',
   acsFactory(false, null, true, undefined) === null);
ok('acsNote: subdivision target + cache hit only → note fires',
   typeof acsFactory(false, null, true, '16920') === 'string'
   && acsFactory(false, null, true, '16920').includes('county level'));
ok('acsNote: live ACS resolved → no note', acsFactory(true, {}, true, '16920') === null);
ok('acsNote: live ACS resolved with own note → that note bubbles',
   acsFactory(true, { _acsNote: 'subdiv-level note' }, false, '16920') === 'subdiv-level note');
ok('acsNote: no cache, no live → null', acsFactory(false, null, false, '16920') === null);

console.log('\n' + pass + ' pass, ' + fail + ' fail');
if (fail > 0) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASS');
