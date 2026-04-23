/**
 * Infinity Markets v2.6 Step 5 - Builder Blocklist Test Harness
 *
 * Standalone. Loads the exported isCommunityName + isBrokerage helpers from
 * server/routes/competition.js and verifies that the 8 v2.5-regressed
 * community-name patterns are caught, while real builders + edge cases are
 * preserved.
 *
 * We avoid requiring express by textual extraction: read competition.js,
 * snip from `const KNOWN_BUILDERS` through `function isBrokerage(name)` closing
 * brace, eval, and expose the two helpers.
 */

const fs   = require('fs');
const path = require('path');

const COMP_PATH = path.resolve(__dirname, '..', 'routes', 'competition.js');
const src = fs.readFileSync(COMP_PATH, 'utf8');

// Find the slice: from `const KNOWN_BUILDERS` through the end of isBrokerage().
const start = src.indexOf('const KNOWN_BUILDERS');
if (start < 0) {
  console.error('FATAL: could not locate KNOWN_BUILDERS');
  process.exit(2);
}
// End marker: first "function extractBuilder" after isBrokerage.
const end = src.indexOf('function extractBuilder', start);
if (end < 0) {
  console.error('FATAL: could not locate function extractBuilder terminator');
  process.exit(2);
}
const slice = src.slice(start, end);

// Also pull BROKERAGE_PATTERNS (appears before KNOWN_BUILDERS in the file)
const bkStart = src.indexOf('const BROKERAGE_PATTERNS');
const bkEnd   = src.indexOf('];', bkStart) + 2;
if (bkStart < 0 || bkEnd < 0) {
  console.error('FATAL: could not locate BROKERAGE_PATTERNS');
  process.exit(2);
}
const bkSlice = src.slice(bkStart, bkEnd);

const bundle = `${bkSlice}\n${slice}\nreturn { isCommunityName, isBrokerage };`;
let isCommunityName, isBrokerage;
try {
  const mod = (new Function(bundle))();
  isCommunityName = mod.isCommunityName;
  isBrokerage     = mod.isBrokerage;
} catch (e) {
  console.error('FATAL: eval of extracted helpers failed:', e.message);
  process.exit(2);
}

let PASS = 0, FAIL = 0;
const results = [];

function assertTrue(label, val) {
  const ok = val === true;
  results.push({ label, ok, actual: val });
  if (ok) PASS++; else FAIL++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}`);
}
function assertFalse(label, val) {
  const ok = val === false;
  results.push({ label, ok, actual: val });
  if (ok) PASS++; else FAIL++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}`);
}

console.log('=== Harness: isCommunityName catches community-name patterns ===');
// The 8 cases from the workplan spec
assertTrue('Leslie Farms -> community',        isCommunityName('Leslie Farms'));
assertTrue('Oak Farms -> community',           isCommunityName('Oak Farms'));
assertTrue('Ridge Estates -> community',       isCommunityName('Ridge Estates'));
assertTrue('Preserve at Rochester -> community', isCommunityName('Preserve at Rochester'));
assertTrue('The Reserve -> community',         isCommunityName('The Reserve'));
assertTrue('Pine Ridge -> community',          isCommunityName('Pine Ridge'));
assertTrue('Meadow Glen -> community',         isCommunityName('Meadow Glen'));
assertTrue('Heritage Pointe -> community',     isCommunityName('Heritage Pointe'));

console.log('\n=== Harness: known builders are NOT flagged as communities ===');
assertFalse('NVR -> builder',              isCommunityName('NVR'));
assertFalse('Ryan Homes -> builder',       isCommunityName('Ryan Homes'));
assertFalse('Heartland Homes -> builder',  isCommunityName('Heartland Homes'));
assertFalse('Maronda Homes -> builder',    isCommunityName('Maronda Homes'));
assertFalse('Eddy Homes -> builder',       isCommunityName('Eddy Homes'));
assertFalse('Costa Homebuilders -> builder', isCommunityName('Costa Homebuilders'));

console.log('\n=== Harness: brokerage patterns still caught ===');
// Spot-check a couple brokerage names (actual patterns depend on BROKERAGE_PATTERNS contents)
// These should at minimum NOT be flagged as community names:
assertFalse('Toll Brothers -> not a community', isCommunityName('Toll Brothers'));
assertFalse('KB Home -> not a community',       isCommunityName('KB Home'));

console.log('\n=== Harness: edge cases ===');
assertFalse('empty string -> false',  isCommunityName(''));
assertFalse('null -> false',          isCommunityName(null));
assertFalse('undefined -> false',     isCommunityName(undefined));

console.log(`\n${PASS} pass, ${FAIL} fail`);
if (FAIL === 0) {
  console.log('\nALL PASS');
  process.exit(0);
} else {
  for (const r of results.filter(r => !r.ok)) {
    console.log(`  FAIL: ${r.label}  actual=${JSON.stringify(r.actual)}`);
  }
  console.log('\nFAILURES PRESENT');
  process.exit(1);
}
