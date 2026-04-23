/**
 * v2.6.1 FIPS fallback padding test.
 *
 * Extracts lookupCountyFallback + lookupSubdivFallback from geocode.js and
 * verifies that "19"/19/"019" all normalize to the same Butler lookup.
 */
const fs   = require('fs');
const path = require('path');

const GEO = path.resolve(__dirname, '..', 'routes', 'geocode.js');
const src = fs.readFileSync(GEO, 'utf8');

// Extract everything from the map constants through lookupSubdivFallback close brace.
// Simpler: eval the relevant module-scope constants + functions via textual slices.
function extractBlock(name) {
  const i = src.indexOf(name);
  if (i < 0) throw new Error('missing: ' + name);
  // if it's a const or function
  return i;
}

// Grab the two map constants and both helpers + _padFips.
const startMap = src.indexOf('const WESTERN_PA_FIPS_FALLBACK');
const endHelpers = src.indexOf('// ── Process a Census address match');
const startPad = src.indexOf('function _padFips');
// Helpers live between the maps section and the "// ── State FIPS" section.
const endHelpersBlock = src.indexOf('// ── State FIPS');
// Slice from startMap up to endHelpersBlock (includes maps + _padFips + both lookups)
const block = src.slice(startMap, endHelpersBlock);

let lookupCountyFallback, lookupSubdivFallback;
try {
  const mod = (new Function(`${block}\nreturn { lookupCountyFallback, lookupSubdivFallback };`))();
  lookupCountyFallback = mod.lookupCountyFallback;
  lookupSubdivFallback = mod.lookupSubdivFallback;
} catch (e) {
  console.error('FATAL: eval failed:', e.message);
  process.exit(2);
}

let PASS = 0, FAIL = 0;
function assertEq(label, actual, expected) {
  const ok = actual === expected;
  ok ? PASS++ : FAIL++;
  console.log(`  [${ok?'PASS':'FAIL'}] ${label} (actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)})`);
}

console.log('=== Harness: FIPS fallback padding ===');

// Case 1: string padded
assertEq('42 / "019" -> Butler', lookupCountyFallback('42', '019'), 'Butler');
// Case 2: numeric unpadded
assertEq('"42" / "19" -> Butler (padded)', lookupCountyFallback('42', '19'), 'Butler');
// Case 3: numeric literal
assertEq('42 / 19 (numbers) -> Butler', lookupCountyFallback(42, 19), 'Butler');
// Case 4: unknown county
assertEq('42 / "999" -> null', lookupCountyFallback('42', '999'), null);
// Case 5: WNY
assertEq('36 / "29" -> Erie', lookupCountyFallback('36', '29'), 'Erie');
assertEq('36 / "029" -> Erie', lookupCountyFallback('36', '029'), 'Erie');

// Subdivision
assertEq('42 / 19 / 16920 -> Cranberry', lookupSubdivFallback('42', '19', '16920'), 'Cranberry');
assertEq('42 / "019" / "16920" -> Cranberry', lookupSubdivFallback('42', '019', '16920'), 'Cranberry');
assertEq('42 / "019" / "ABCDE" -> null', lookupSubdivFallback('42', '019', 'ABCDE'), null);
assertEq('no subdivFips -> null', lookupSubdivFallback('42', '019', null), null);

console.log(`\n${PASS} pass, ${FAIL} fail`);
if (FAIL === 0) { console.log('\nALL PASS'); process.exit(0); }
console.log('\nFAILURES PRESENT'); process.exit(1);
