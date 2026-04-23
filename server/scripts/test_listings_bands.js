/**
 * Infinity Markets v2.6 Step 7 - deriveBandsFromListings Test Harness
 *
 * Standalone. Extracts deriveBandsFromListings from analysis.js and verifies:
 * - Returns 5 bands with the canonical Entry/Move-Up/Executive/Luxury/Ultra names
 * - Listings sum ~= inventoryActive (rounding tolerance)
 * - salesPerMonth = listings / monthsSupply
 * - Null inputs return null
 * - Missing median/inventory returns null (no fabrication)
 * - Weights sum to 1.0
 */

const fs   = require('fs');
const path = require('path');

const AN_PATH = path.resolve(__dirname, '..', 'routes', 'analysis.js');
const src = fs.readFileSync(AN_PATH, 'utf8');

const start = src.indexOf('function deriveBandsFromListings');
if (start < 0) { console.error('FATAL: could not locate deriveBandsFromListings'); process.exit(2); }
// find matching closing brace
let depth = 0, i = start, end = -1;
for (; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnSrc = src.slice(start, end);

let deriveBandsFromListings;
try {
  const mod = (new Function(`${fnSrc}\nreturn { deriveBandsFromListings };`))();
  deriveBandsFromListings = mod.deriveBandsFromListings;
} catch (e) {
  console.error('FATAL: eval failed:', e.message);
  process.exit(2);
}

let PASS = 0, FAIL = 0;
const results = [];
function assertTrue(label, val)  { const ok = val === true;  results.push({label,ok,actual:val}); ok?PASS++:FAIL++; console.log(`  [${ok?'PASS':'FAIL'}] ${label}`); }
function assertEq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({label,ok,actual,expected}); ok?PASS++:FAIL++;
  console.log(`  [${ok?'PASS':'FAIL'}] ${label}`);
}
function assertNear(label, actual, expected, tol) {
  const ok = typeof actual === 'number' && Math.abs(actual - expected) <= tol;
  results.push({label,ok,actual,expected}); ok?PASS++:FAIL++;
  console.log(`  [${ok?'PASS':'FAIL'}] ${label} (actual=${actual}, expected~${expected}+-${tol})`);
}

console.log('=== Harness: deriveBandsFromListings ===');

// Case 1: Cranberry-style realistic housing input
const cranberry = deriveBandsFromListings({
  medianValue: 500000,
  inventoryActive: 200,
  monthsSupply: 3.5,
});

assertTrue('returns an array', Array.isArray(cranberry));
assertEq('5 bands returned', cranberry && cranberry.length, 5);
assertEq('band 0 name', cranberry[0].name, 'Entry-Level');
assertEq('band 1 name', cranberry[1].name, 'Move-Up');
assertEq('band 2 name', cranberry[2].name, 'Executive');
assertEq('band 3 name', cranberry[3].name, 'Luxury');
assertEq('band 4 name', cranberry[4].name, 'Ultra-Luxury');
const listingsSum = cranberry.reduce((a,b) => a + (b.listings || 0), 0);
assertNear('listings sum ~= inventory (200)', listingsSum, 200, 2);
// salesPerMonth = listings / monthsSupply (which is 3.5 for every band)
assertNear('band 1 salesPerMonth = listings / supply', cranberry[1].salesPerMonth, cranberry[1].listings / 3.5, 0.1);
assertEq('band monthsSupply populated', cranberry[0].monthsSupply, 3.5);
assertEq('_derivedFrom tag', cranberry[0]._derivedFrom, 'housing-listings');

// Case 2 (v4.0.2): monthsSupply missing -> per-band monthsSupply is NULL
// (no more 6-month fabricated default). Renderer em-dashes honestly when
// Redfin months_of_supply is unavailable.
const defaultSupply = deriveBandsFromListings({
  medianValue: 400000,
  inventoryActive: 150,
  // no monthsSupply
});
assertTrue('returns non-null when supply missing', defaultSupply !== null);
assertEq('v4.0.2: default monthsSupply = null', defaultSupply[0].monthsSupply, null);
assertEq('v4.0.2: default salesPerMonth = null', defaultSupply[0].salesPerMonth, null);

// Case 3: missing median -> null
assertEq('no median -> null', deriveBandsFromListings({ inventoryActive: 100, monthsSupply: 4 }), null);

// Case 4: missing inventory -> null
assertEq('no inventory -> null', deriveBandsFromListings({ medianValue: 400000, monthsSupply: 4 }), null);

// Case 5: null input
assertEq('null input -> null', deriveBandsFromListings(null), null);

// Case 6: zero median
assertEq('zero median -> null', deriveBandsFromListings({ medianValue: 0, inventoryActive: 100 }), null);

// Case 7: medianHomeValue alias
const aliased = deriveBandsFromListings({
  medianHomeValue: 350000,
  totalUnits: 100,
  monthsSupply: 5,
});
assertTrue('accepts medianHomeValue/totalUnits aliases', Array.isArray(aliased) && aliased.length === 5);

// Case 8: medianSalePrice alias + totalInventory alias
const redfinShape = deriveBandsFromListings({
  medianSalePrice: 425000,
  totalInventory: 180,
  monthsSupply: 4.2,
});
assertTrue('accepts Redfin-shape aliases', Array.isArray(redfinShape) && redfinShape.length === 5);

// Case 9: weights should approximately sum to 1 (verify by listing distribution)
// 0.15+0.32+0.28+0.17+0.08 = 1.00
const wTest = deriveBandsFromListings({ medianValue: 500000, inventoryActive: 1000, monthsSupply: 6 });
const wSum = wTest.reduce((a,b) => a + b.listings, 0);
assertNear('weights sum to 1.0 at inv=1000', wSum, 1000, 2);

console.log(`\n${PASS} pass, ${FAIL} fail`);
if (FAIL === 0) {
  console.log('\nALL PASS');
  process.exit(0);
} else {
  for (const r of results.filter(r => !r.ok)) console.log(`  FAIL: ${r.label}  actual=${JSON.stringify(r.actual)}`);
  console.log('\nFAILURES PRESENT');
  process.exit(1);
}
