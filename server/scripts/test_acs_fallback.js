/**
 * Infinity Markets v2.6 Step 6 - ACS County-Level Fallback Test Harness
 *
 * Standalone. Extracts _hasValidCoreFields from demographics.js and verifies:
 * - Subdivision with 0 valid core fields -> invalid (trigger county fallback)
 * - Subdivision with 2 valid core fields -> invalid (needs >= 3)
 * - Subdivision with 3 valid core fields -> valid
 * - County with full data -> valid
 * - null/undefined -> invalid
 * - Zero values -> NOT counted as valid (must be > 0)
 */

const fs   = require('fs');
const path = require('path');

const DEMO_PATH = path.resolve(__dirname, '..', 'routes', 'demographics.js');
const src = fs.readFileSync(DEMO_PATH, 'utf8');

// Extract _hasValidCoreFields function body
const start = src.indexOf('function _hasValidCoreFields');
if (start < 0) {
  console.error('FATAL: could not locate _hasValidCoreFields');
  process.exit(2);
}
// find matching closing brace of function
let depth = 0, i = start, end = -1;
for (; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) {
  console.error('FATAL: could not find end of _hasValidCoreFields');
  process.exit(2);
}
const fnSrc = src.slice(start, end);

let _hasValidCoreFields;
try {
  const mod = (new Function(`${fnSrc}\nreturn { _hasValidCoreFields };`))();
  _hasValidCoreFields = mod._hasValidCoreFields;
} catch (e) {
  console.error('FATAL: eval failed:', e.message);
  process.exit(2);
}

let PASS = 0, FAIL = 0;
const results = [];

function assertTrue(label, val)  { const ok = val === true;  results.push({label,ok,actual:val}); ok?PASS++:FAIL++; console.log(`  [${ok?'PASS':'FAIL'}] ${label}`); }
function assertFalse(label, val) { const ok = val === false; results.push({label,ok,actual:val}); ok?PASS++:FAIL++; console.log(`  [${ok?'PASS':'FAIL'}] ${label}`); }

console.log('=== Harness: _hasValidCoreFields ===');

// Case 1: Cranberry-style all-null (regression case)
assertFalse('Cranberry all-null -> invalid', _hasValidCoreFields({
  population: null, mhi: null, households: null,
  totalTenure: null, totalHousingUnits: null, medianAge: null,
}));

// Case 2: only 2 valid fields (< 3 threshold)
assertFalse('Only 2 valid fields -> invalid', _hasValidCoreFields({
  population: 12000, mhi: 75000, households: null,
  totalTenure: null, totalHousingUnits: null,
}));

// Case 3: exactly 3 valid fields -> valid
assertTrue('3 valid fields -> valid', _hasValidCoreFields({
  population: 12000, mhi: 75000, households: 4500,
  totalTenure: null, totalHousingUnits: null,
}));

// Case 4: full data -> valid
assertTrue('Full Butler County data -> valid', _hasValidCoreFields({
  population: 195000, mhi: 82000, households: 74000,
  totalTenure: 74000, totalHousingUnits: 82000,
}));

// Case 5: zero values should NOT count as valid
assertFalse('Zero values -> invalid', _hasValidCoreFields({
  population: 0, mhi: 0, households: 0,
  totalTenure: 0, totalHousingUnits: 0,
}));

// Case 6: null input
assertFalse('null -> invalid', _hasValidCoreFields(null));

// Case 7: undefined input
assertFalse('undefined -> invalid', _hasValidCoreFields(undefined));

// Case 8: empty object
assertFalse('empty {} -> invalid', _hasValidCoreFields({}));

// Case 9: NaN values should not count
assertFalse('NaN values -> invalid', _hasValidCoreFields({
  population: NaN, mhi: NaN, households: NaN,
  totalTenure: NaN, totalHousingUnits: NaN,
}));

// Case 10: mix of valid + null (4 valid)
assertTrue('4 of 5 valid -> valid', _hasValidCoreFields({
  population: 50000, mhi: 70000, households: 18000,
  totalTenure: 18000, totalHousingUnits: null,
}));

console.log(`\n${PASS} pass, ${FAIL} fail`);
if (FAIL === 0) {
  console.log('\nALL PASS');
  process.exit(0);
} else {
  for (const r of results.filter(r => !r.ok)) console.log(`  FAIL: ${r.label}  actual=${JSON.stringify(r.actual)}`);
  console.log('\nFAILURES PRESENT');
  process.exit(1);
}
