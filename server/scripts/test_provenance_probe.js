/**
 * v3.0 Phase 1 / Step 1 — provenance probe contract & classifier test.
 *
 * Exercises the tier classifier + tree walker against a synthetic Cranberry-
 * shaped fixture. Functions are textually extracted from debug.js so the
 * harness doesn't need express installed.
 */
const fs   = require('fs');
const path = require('path');

const DEBUG = fs.readFileSync(path.resolve(__dirname, '..', 'routes', 'debug.js'), 'utf8');

// Contract checks — these strings MUST appear in debug.js
const MUST = [
  "router.get('/provenance'",
  "MEASURED_ROOTS = new Set(['demographics', 'housing', 'competition', 'geo'])",
  "DERIVED_PATTERNS = [",
  "function _isNumericLeaf(",
  "function _isMissingSentinel(",
  "function _classifyTier(",
  "function _resolveSource(",
  "function walkStudy(",
  "module.exports._v3step1",
];

let PASS = 0, FAIL = 0;
function a(ok, label) { ok ? PASS++ : FAIL++; console.log(`  [${ok?'PASS':'FAIL'}] ${label}`); }

console.log('=== Harness: provenance probe ===');
for (const s of MUST) a(DEBUG.includes(s), 'debug.js contains "' + s.slice(0, 50) + '..."');

// ── Textual extraction ──
// Slice from "const MEASURED_ROOTS" through the end of walkStudy, then eval.
const sliceStart = DEBUG.indexOf('const MEASURED_ROOTS');
const sliceEnd   = DEBUG.indexOf("router.get('/provenance'");
if (sliceStart < 0 || sliceEnd < 0 || sliceEnd <= sliceStart) {
  console.error('FATAL: could not locate classifier block in debug.js');
  process.exit(2);
}
const block = DEBUG.slice(sliceStart, sliceEnd);

let _isNumericLeaf, _isMissingSentinel, _classifyTier, _resolveSource, walkStudy;
try {
  const mod = (new Function(
    block +
    '\nreturn { _isNumericLeaf, _isMissingSentinel, _classifyTier, _resolveSource, walkStudy };'
  ))();
  _isNumericLeaf     = mod._isNumericLeaf;
  _isMissingSentinel = mod._isMissingSentinel;
  _classifyTier      = mod._classifyTier;
  _resolveSource     = mod._resolveSource;
  walkStudy          = mod.walkStudy;
} catch (e) {
  console.error('FATAL: eval of classifier block failed:', e.message);
  process.exit(2);
}
a(typeof _classifyTier === 'function', 'extracted _classifyTier');
a(typeof walkStudy === 'function',     'extracted walkStudy');

// ── _isNumericLeaf ──
a(_isNumericLeaf(42) === true,           'numeric: 42');
a(_isNumericLeaf(3.14) === true,         'numeric: 3.14');
a(_isNumericLeaf('125126') === true,     'numeric: "125126"');
a(_isNumericLeaf('$625,000') === true,   'numeric: "$625,000"');
a(_isNumericLeaf('75.3%') === true,      'numeric: "75.3%"');
a(_isNumericLeaf('Butler') === false,    'not numeric: "Butler"');
a(_isNumericLeaf(null) === false,        'not numeric: null');
a(_isNumericLeaf('') === false,          'not numeric: empty');

// ── _isMissingSentinel ──
a(_isMissingSentinel(null) === true,        'missing: null');
a(_isMissingSentinel(undefined) === true,   'missing: undefined');
a(_isMissingSentinel('') === true,          'missing: ""');
a(_isMissingSentinel('—') === true,         'missing: em-dash');
a(_isMissingSentinel('N/A') === true,       'missing: N/A');
a(_isMissingSentinel('Butler') === false,   'not missing: "Butler"');
a(_isMissingSentinel(0) === false,          'not missing: 0');

// ── _classifyTier ──
a(_classifyTier('demographics.population', 34094, {}) === 'measured',
  'tier: demographics.population -> measured');
a(_classifyTier('housing.medianDOM', 12, {}) === 'measured',
  'tier: housing.medianDOM -> measured');
a(_classifyTier('competition.builders[0].name', 'NVR', {}) === 'measured',
  'tier: competition.builders[0].name -> measured');
a(_classifyTier('geo.county', 'Butler', {}) === 'measured',
  'tier: geo.county -> measured');
a(_classifyTier('analysis.absorption.monthsSupply', 3.2, {}) === 'derived',
  'tier: analysis.absorption.monthsSupply -> derived');
a(_classifyTier('analysis.absorption.byPriceBand[0].listings', 25, {}) === 'derived',
  'tier: analysis.absorption.byPriceBand[...].listings -> derived');
a(_classifyTier('analysis.pricing.targetHomePrice', 625000, {}) === 'derived',
  'tier: analysis.pricing.targetHomePrice -> derived');
a(_classifyTier('analysis.pricing.bandedPricing[2].name', 'Executive', {}) === 'derived',
  'tier: analysis.pricing.bandedPricing[...].name -> derived');
a(_classifyTier('analysis.scorecard.verdict', 'BUY', {}) === 'modeled',
  'tier: analysis.scorecard.verdict -> modeled');
a(_classifyTier('analysis.executiveSummary', 'The market is attractive', {}) === 'modeled',
  'tier: analysis.executiveSummary -> modeled');
a(_classifyTier('analysis.proforma.grossMargin', 0.252, {}) === 'modeled',
  'tier: analysis.proforma.grossMargin -> modeled');
a(_classifyTier('demographics.population', null, {}) === 'missing',
  'tier: demographics.population=null -> missing');
a(_classifyTier('analysis.foo.bar', '—', {}) === 'missing',
  'tier: sentinel em-dash -> missing');
a(_classifyTier('analysis.narratives.absorption', 'Steady pace', { hasDerivedFrom: true }) === 'derived',
  'tier: explicit _derivedFrom override -> derived');

// ── walkStudy on a synthetic Cranberry-shaped fixture ──
const fixture = {
  geo: { county: 'Butler', subdivision: 'Cranberry', stateFips: '42', countyFips: '019' },
  demographics: {
    population: 34094,
    mhi: 125126,
    _sources: { population: 'Census ACS 2023', mhi: 'Census ACS 2023' },
  },
  housing: {
    medianDOM: 12,
    medianSalePrice: 480000,
    monthsSupply: null,
    _sources: { medianDOM: 'Redfin 2026-03' },
  },
  competition: {
    marketKPIs: { builderCount: 7, communityCount: 18 },
    _sources: { builders: 'RapidAPI Realtor' },
  },
  analysis: {
    executiveSummary: 'Attractive market with steady absorption',
    absorption: {
      monthsSupply: 3.2,
      byPriceBand: [{ band: '$300-500K', listings: 25 }],
    },
    pricing: {
      targetHomePrice: 625000,
      stratification: [{ tier: 'Executive', priceRange: '$500-750K' }],
    },
    scorecard: { verdict: 'BUY — WITH CONDITIONS', score: 6.6 },
    proforma: { grossMargin: 0.252 },
  },
};

const rows = [];
walkStudy(fixture, fixture, '', rows, {});
console.log('  walked ' + rows.length + ' leaves');

const byTier = { measured: 0, derived: 0, modeled: 0, missing: 0 };
for (const r of rows) byTier[r.tier] = (byTier[r.tier] || 0) + 1;
console.log('  tier counts: ' + JSON.stringify(byTier));

a(byTier.measured >= 6, 'measured >= 6 (got ' + byTier.measured + ')');
a(byTier.derived  >= 3, 'derived  >= 3 (got ' + byTier.derived + ')');
a(byTier.modeled  >= 3, 'modeled  >= 3 (got ' + byTier.modeled + ')');
a(byTier.missing  >= 1, 'missing  >= 1 (got ' + byTier.missing + ')');

function findRow(p) { return rows.find(r => r.path === p); }
const pop = findRow('demographics.population');
a(pop && pop.tier === 'measured',          'row: demographics.population is measured');
a(pop && pop.source === 'Census ACS 2023', 'row: demographics.population source=ACS');

const ms = findRow('housing.monthsSupply');
a(ms && ms.tier === 'missing',             'row: housing.monthsSupply is missing');

const tp = findRow('analysis.pricing.targetHomePrice');
a(tp && tp.tier === 'derived',             'row: analysis.pricing.targetHomePrice is derived');

const es = findRow('analysis.executiveSummary');
a(es && es.tier === 'modeled',             'row: analysis.executiveSummary is modeled');

const bp0 = findRow('analysis.absorption.byPriceBand[0].listings');
a(bp0 && bp0.tier === 'derived',           'row: byPriceBand[0].listings is derived');

const sideRows = rows.filter(r => r.path.endsWith('._sources') || r.path.includes('._sources.'));
a(sideRows.length === 0, 'sidecar _sources keys excluded (got ' + sideRows.length + ' leaks)');

console.log('\n' + PASS + ' pass, ' + FAIL + ' fail');
if (FAIL === 0) { console.log('\nALL PASS'); process.exit(0); }
console.log('\nFAILURES PRESENT'); process.exit(1);
