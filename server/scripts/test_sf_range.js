#!/usr/bin/env node
/**
 * V41-9 / O-3 — test_sf_range.
 *
 * Verifies the widened NHS sqft-range resolver covers every known payload
 * shape, falls back to plans aggregate, and stays silent (null/null) under
 * LAW #6 when nothing resolves.
 */
'use strict';
const assert = require('assert');
const { resolveSqftRange, parseSqftRangeString, numStr, normalizeCommunity } =
  require('../services/nhsScraper');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log('[PASS] ' + label); pass++; }
  catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// 1. legacy sqftLow/sqftHigh
check('legacy sqftLow/sqftHigh → {1800, 3200}', () => {
  const r = resolveSqftRange({ sqftLow: 1800, sqftHigh: 3200 });
  assert.strictEqual(r.sfLow, 1800);
  assert.strictEqual(r.sfHigh, 3200);
});

// 2. minSqft/maxSqft
check('minSqft/maxSqft → {2000, 4000}', () => {
  const r = resolveSqftRange({ minSqft: 2000, maxSqft: 4000 });
  assert.strictEqual(r.sfLow, 2000);
  assert.strictEqual(r.sfHigh, 4000);
});

// 3. squareFeetMin/squareFeetMax (new path)
check('squareFeetMin/squareFeetMax → {2200, 3500}', () => {
  const r = resolveSqftRange({ squareFeetMin: 2200, squareFeetMax: 3500 });
  assert.strictEqual(r.sfLow, 2200);
  assert.strictEqual(r.sfHigh, 3500);
});

// 4. squareFeetFrom/squareFeetTo (new path)
check('squareFeetFrom/squareFeetTo → {1500, 2800}', () => {
  const r = resolveSqftRange({ squareFeetFrom: 1500, squareFeetTo: 2800 });
  assert.strictEqual(r.sfLow, 1500);
  assert.strictEqual(r.sfHigh, 2800);
});

// 5. livingArea: {min, max} (nested path)
check('livingArea {min:1700, max:3100} → {1700, 3100}', () => {
  const r = resolveSqftRange({ livingArea: { min: 1700, max: 3100 } });
  assert.strictEqual(r.sfLow, 1700);
  assert.strictEqual(r.sfHigh, 3100);
});

// 6. sqftRange "1,800 - 3,200" string
check('sqftRange "1,800 - 3,200" string → {1800, 3200}', () => {
  const r = resolveSqftRange({ sqftRange: '1,800 - 3,200' });
  assert.strictEqual(r.sfLow, 1800);
  assert.strictEqual(r.sfHigh, 3200);
});

// 6b. "1800 to 3200" variant
check('sqftRange "1800 to 3200" → {1800, 3200}', () => {
  const r = resolveSqftRange({ sqftRange: '1800 to 3200' });
  assert.strictEqual(r.sfLow, 1800);
  assert.strictEqual(r.sfHigh, 3200);
});

// 7. plans aggregate fallback
check('plans[].squareFeet aggregate → {min, max} across valid entries', () => {
  const r = resolveSqftRange({
    plans: [
      { squareFeet: 2000 },
      { squareFeet: 2800 },
      { squareFeet: 3500 },
      { squareFeet: null },  // ignored
    ],
  });
  assert.strictEqual(r.sfLow, 2000);
  assert.strictEqual(r.sfHigh, 3500);
});

// 8. single number string "1800 sqft"
check('single number string "1800 sqft" → {1800, 1800}', () => {
  const r = resolveSqftRange({ sqftRange: '1800 sqft' });
  assert.strictEqual(r.sfLow, 1800);
  assert.strictEqual(r.sfHigh, 1800);
});

// 9. all-null → LAW #6 compliance
check('all-null inputs → {null, null}', () => {
  const r = resolveSqftRange({});
  assert.strictEqual(r.sfLow, null);
  assert.strictEqual(r.sfHigh, null);
  const r2 = resolveSqftRange(null);
  assert.strictEqual(r2.sfLow, null);
  assert.strictEqual(r2.sfHigh, null);
});

// 10. comma-laden numerics via numStr
check('numStr("1,800") → 1800', () => {
  assert.strictEqual(numStr('1,800'), 1800);
  assert.strictEqual(numStr('3,250 sqft'), 3250);
  assert.strictEqual(numStr('  4,125  '), 4125);
});

// 11. garbage strings → null
check('numStr garbage → null', () => {
  assert.strictEqual(numStr('n/a'), null);
  assert.strictEqual(numStr('varies'), null);
  assert.strictEqual(numStr(''), null);
  assert.strictEqual(numStr('  '), null);
});

// 12. plans aggregate ignores nulls/bogus
check('plans aggregate handles mixed nulls + strings + numbers', () => {
  const r = resolveSqftRange({
    plans: [
      { squareFeet: '1,800' },   // string with comma
      { SquareFeet: 2400 },      // PascalCase variant
      { sqft: 'n/a' },           // bogus
      { size: 3100 },            // alternate field name
    ],
  });
  assert.strictEqual(r.sfLow, 1800);
  assert.strictEqual(r.sfHigh, 3100);
});

// 13. order-independence in nested obj (min > max by accident)
check('livingArea {min:3500, max:1800} → normalized to {1800, 3500}', () => {
  const r = resolveSqftRange({ livingArea: { min: 3500, max: 1800 } });
  assert.strictEqual(r.sfLow, 1800);
  assert.strictEqual(r.sfHigh, 3500);
});

// 14. normalizeCommunity integration — full row passes through
check('normalizeCommunity integration: squareFeetMin/Max + priceLow/High', () => {
  const row = normalizeCommunity({
    name: 'Test Community',
    priceLow: 400000,
    priceHigh: 550000,
    squareFeetMin: 2200,
    squareFeetMax: 3500,
    builder: { name: 'Acme' },
  }, '16066');
  assert.ok(row, 'row should be non-null');
  assert.strictEqual(row.sf_low, 2200);
  assert.strictEqual(row.sf_high, 3500);
  assert.strictEqual(row.price_low, 400000);
  assert.strictEqual(row.price_high, 550000);
});

// 15. normalizeCommunity with all-null sqft paths → sf_low/high still null
check('normalizeCommunity with no sqft data → sf_low/sf_high null (LAW #6)', () => {
  const row = normalizeCommunity({
    name: 'No Sqft Community',
    priceLow: 400000,
    priceHigh: 550000,
    builder: { name: 'Acme' },
  }, '16066');
  assert.ok(row);
  assert.strictEqual(row.sf_low, null);
  assert.strictEqual(row.sf_high, null);
});

// 16. parseSqftRangeString direct coverage
check('parseSqftRangeString direct forms', () => {
  assert.deepStrictEqual(parseSqftRangeString('1500-3000'), [1500, 3000]);
  assert.deepStrictEqual(parseSqftRangeString('1,500 – 3,000'), [1500, 3000]);
  assert.deepStrictEqual(parseSqftRangeString('2000'), [2000, 2000]);
  assert.strictEqual(parseSqftRangeString(''), null);
  assert.strictEqual(parseSqftRangeString('n/a'), null);
  assert.strictEqual(parseSqftRangeString(null), null);
});

console.log('\n=== test_sf_range: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
