#!/usr/bin/env node
/**
 * v4.0.1 regression test — deepMergeNullWins in deliverables.js.
 *
 * Simulates the exact shape that Supabase returns for a regenerated study:
 *   { demographics: { population: null, medianIncome: null, households: null }, ... }
 * with a canonical source tree from normalizeStudy() that has the measured values.
 *
 * The v4.0.0 bug was `Object.assign({}, source, target)` — depth-1 shallow
 * merge preserved the nulls. The v4.0.1 fix does a null-preserving deep merge.
 *
 * This test extracts the helper by eval'ing it out of deliverables.js so we
 * don't have to duplicate the implementation. If deliverables.js changes
 * shape, update the extraction regex.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'routes', 'deliverables.js');
const text = fs.readFileSync(SRC, 'utf8');

// Extract the function body between the function declaration and the
// blank line that follows. Explicit boundaries so we don't grab too much.
const m = text.match(/function deepMergeNullWins\(target, source\)[\s\S]*?\n\}\n/);
if (!m) {
  console.error('FAIL: could not locate deepMergeNullWins in deliverables.js');
  process.exit(1);
}
// eslint-disable-next-line no-new-func
// Evaluate the full function declaration so recursive self-reference
// (`deepMergeNullWins(...)` inside the body) resolves inside the sandbox.
const factory = new Function(`${m[0]}\nreturn deepMergeNullWins;`);
const deepMergeNullWins = factory();

let pass = 0, fail = 0;
function t(name, ok) {
  if (ok) { console.log(`  [PASS] ${name}`); pass++; }
  else    { console.log(`  [FAIL] ${name}`); fail++; }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ── The regression case ──
const study = {
  demographics: {
    population: null,
    medianIncome: null,
    households: null,
    homeownershipRate: null
  },
  geo: { state: 'PA', county: 'Butler' }
};
const canon = {
  demographics: {
    population: 32199,
    medianIncome: 98500,
    households: 12804,
    homeownershipRate: 0.78,
    medianAge: 42.1
  },
  geo: { state: 'PA', county: 'Butler', fips: '42019' }
};
const merged = deepMergeNullWins(study, canon);

t('regression: population fills in (null -> 32199)',      merged.demographics.population === 32199);
t('regression: medianIncome fills in (null -> 98500)',    merged.demographics.medianIncome === 98500);
t('regression: households fills in',                       merged.demographics.households === 12804);
t('regression: homeownershipRate fills in',                merged.demographics.homeownershipRate === 0.78);
t('regression: new field medianAge appears',               merged.demographics.medianAge === 42.1);
t('regression: existing non-null scalar wins (state)',     merged.geo.state === 'PA');
t('regression: existing non-null scalar wins (county)',    merged.geo.county === 'Butler');
t('regression: canonical adds missing fips',               merged.geo.fips === '42019');

// ── Existing non-null must not be clobbered ──
const s2 = { demographics: { population: 50000, medianIncome: 75000 } };
const c2 = { demographics: { population: 999999, medianIncome: 1 } };
const m2 = deepMergeNullWins(s2, c2);
t('existing wins: population preserved when both non-null', m2.demographics.population === 50000);
t('existing wins: medianIncome preserved when both non-null', m2.demographics.medianIncome === 75000);

// ── Null target / null source ──
t('null source returns target',  deepMergeNullWins({a:1}, null).a === 1);
t('null target returns source',  deepMergeNullWins(null, {a:2}).a === 2);

// ── Array handling (treated as opaque) ──
const a1 = { builders: [] };
const a2 = { builders: [{name:'NVR'},{name:'Lennar'}] };
t('empty array replaced by populated', deepMergeNullWins(a1, a2).builders.length === 2);
const a3 = { builders: [{name:'Custom'}] };
t('populated array wins over canonical', deepMergeNullWins(a3, a2).builders[0].name === 'Custom');

// ── Deep nesting: 3 levels ──
const s3 = { analysis: { housing: { totalUnits: 12345, ownerOcc: null } } };
const c3 = { analysis: { housing: { totalUnits: 99, ownerOcc: 8000, renterOcc: 4000 } } };
const m3 = deepMergeNullWins(s3, c3);
t('deep: totalUnits existing wins',    m3.analysis.housing.totalUnits === 12345);
t('deep: ownerOcc fills in',           m3.analysis.housing.ownerOcc === 8000);
t('deep: renterOcc added',             m3.analysis.housing.renterOcc === 4000);

// ── Pure scalars ──
t('scalar: target wins',  deepMergeNullWins(5, 99) === 5);
t('scalar: null target falls through', deepMergeNullWins(null, 99) === 99);

// ── Full PDF-path smoke: every §3 KPI lands ──
const supabaseStudy = {
  demographics: {
    population: null, medianIncome: null, households: null,
    homeownershipRate: null, unemploymentRate: null, medianAge: null,
    avgHouseholdSize: null, perCapitaIncome: null, mhiGrowthYoY: null,
    povertyRate: null, vacancyRate: null, affordableCeiling: null
  }
};
const canonFull = {
  demographics: {
    population: 32199, medianIncome: 98500, households: 12804,
    homeownershipRate: 0.78, unemploymentRate: 0.041, medianAge: 42.1,
    avgHouseholdSize: 2.51, perCapitaIncome: 48900, mhiGrowthYoY: 0.032,
    povertyRate: 0.058, vacancyRate: 0.039, affordableCeiling: 344750
  }
};
const mFull = deepMergeNullWins(supabaseStudy, canonFull);
const tilesOK = Object.keys(canonFull.demographics).every(
  k => mFull.demographics[k] === canonFull.demographics[k]
);
t('full §3 tiles: every measured value lands', tilesOK);

console.log();
console.log(pass + ' pass, ' + fail + ' fail');
if (fail === 0) console.log('ALL PASS');
process.exit(fail === 0 ? 0 : 1);
