/**
 * v2.6.1 band normalizer test — contract emits {name, tier, band, priceBand}
 * and maps Claude's {units} into {listings}.
 */
// The normalizer is an inline map() inside enrichAnalysisForDeliverables,
// so we re-implement the same logic here as a contract check and verify it
// matches what analysis.js does. If you change the normalizer, mirror here.
function normalizeBand(b, safeNumA) {
  const label = b.name || b.tier || b.band || b.priceBand || null;
  return {
    ...b,
    name: label,
    tier: label,
    band: label,
    priceBand: label,
    listings: safeNumA(b.listings ?? b.units ?? b.active ?? b.activeListings ?? b.count),
    salesPerMonth: safeNumA(b.salesPerMonth ?? b.monthlyAbsorption ?? b.absorption),
    monthsSupply: safeNumA(b.monthsSupply ?? b.supply),
  };
}
const safeNumA = v => (typeof v === 'number' && !Number.isNaN(v)) ? v : null;

// Also verify analysis.js contains the same text so this test breaks if someone
// edits analysis without updating the mirror.
const fs   = require('fs');
const path = require('path');
const AN = fs.readFileSync(path.resolve(__dirname, '..', 'routes', 'analysis.js'), 'utf8');
const MUST = [
  "name: label,",
  "tier: label,",
  "band: label,",
  "priceBand: label,",
  "b.listings ?? b.units ?? b.active",
];
let PASS = 0, FAIL = 0;
console.log('=== Harness: band normalizer contract ===');
for (const s of MUST) {
  const ok = AN.includes(s);
  ok ? PASS++ : FAIL++;
  console.log(`  [${ok?'PASS':'FAIL'}] analysis.js contains "${s}"`);
}

// Claude-shape input (band + units + pct) -> all 4 name aliases + listings populated
const claudeIn = { band: '$200-350K', units: 25, pct: 0.15 };
const out = normalizeBand(claudeIn, safeNumA);
function aEq(label, actual, expected) {
  const ok = actual === expected;
  ok ? PASS++ : FAIL++;
  console.log(`  [${ok?'PASS':'FAIL'}] ${label} (actual=${JSON.stringify(actual)})`);
}
aEq('out.name = "$200-350K"', out.name, '$200-350K');
aEq('out.tier = "$200-350K"', out.tier, '$200-350K');
aEq('out.band = "$200-350K"', out.band, '$200-350K');
aEq('out.priceBand = "$200-350K"', out.priceBand, '$200-350K');
aEq('units -> listings = 25', out.listings, 25);

// Enricher shape (name + listings + salesPerMonth) -> band/priceBand populated
const encIn = { name: 'Entry-Level', listings: 30, salesPerMonth: 5, monthsSupply: 6 };
const enc = normalizeBand(encIn, safeNumA);
aEq('name=Entry -> band=Entry', enc.band, 'Entry-Level');
aEq('name=Entry -> priceBand=Entry', enc.priceBand, 'Entry-Level');
aEq('listings passthrough', enc.listings, 30);

console.log(`\n${PASS} pass, ${FAIL} fail`);
if (FAIL === 0) { console.log('\nALL PASS'); process.exit(0); }
console.log('\nFAILURES PRESENT'); process.exit(1);
