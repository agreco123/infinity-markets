/**
 * v3.0 Phase 1 / Step 3 — analysis.js schema wire-up test.
 *
 * Verifies that analysis.js imports the schema and runs normalizeStudy +
 * validateStudy after enrichment, attaching _schema to the response.
 */
const fs   = require('fs');
const path = require('path');

const AN = fs.readFileSync(path.resolve(__dirname, '..', 'routes', 'analysis.js'), 'utf8');

const MUST = [
  "require('../lib/studySchema')",
  "normalizeStudy",
  "validateStudy",
  "SCHEMA_VERSION",
  "// v3.0 Step 3: normalize the enriched analysis through the canonical schema.",
  "const canon = normalizeStudy({ analysis });",
  "Object.assign(analysis, canon.analysis)",
  "const val = validateStudy(",
  "analysis._schema = {",
  "version: SCHEMA_VERSION",
  "provenance: val.provenance",
];

let PASS = 0, FAIL = 0;
function a(ok, label) { ok ? PASS++ : FAIL++; console.log('  [' + (ok?'PASS':'FAIL') + '] ' + label); }

console.log('=== Harness: schema wire-up (analysis.js) ===');
for (const s of MUST) a(AN.includes(s), 'analysis.js contains: ' + s.slice(0, 40) + '...');

// Call-order guard: normalizeStudy must appear AFTER enrichAnalysisForDeliverables.
const iEnrich = AN.indexOf('enrichAnalysisForDeliverables(analysis,');
const iNorm   = AN.indexOf('const canon = normalizeStudy({ analysis });');
const iCache  = AN.indexOf('if (dataCache) await dataCache.cacheAnalysis');
a(iEnrich > 0 && iNorm > iEnrich, 'normalizeStudy runs AFTER enrichAnalysisForDeliverables');
a(iCache > iNorm,                 'normalizeStudy runs BEFORE dataCache.cacheAnalysis');

// Validate the schema module boots and the exported functions are live.
const { SCHEMA_VERSION, normalizeStudy, validateStudy, FIELDS } =
  require(path.resolve(__dirname, '..', 'lib', 'studySchema'));
a(SCHEMA_VERSION === '4.0.0', 'schema version 4.0.0');
a(Array.isArray(FIELDS) && FIELDS.length >= 125, 'FIELDS loaded');

// End-to-end sanity: feed a Claude-shaped response through normalize + validate.
const claudeResponse = {
  absorption: {
    yearlyAbsorption: 400,
    byPriceBand: [{ name: 'Entry', units: 18 }],
  },
  pricing: {
    targetPrice: 625000,
    recommendedTier: 'Executive',
    stratification: [{ tier: 'Executive' }],
  },
  land: { avgCostPerAcre: 95000 },
  proforma: {
    averageSalePrice: 625000, hardCostPerSqft: 165,
    grossMargin: 0.25, netMargin: 0.16,
  },
  regulatory: { zoning: 'R-2', impactFeesPerUnit: 8500, entitlementTimelineMonths: 18 },
  scorecard: { recommendation: 'BUY', overallScore: 6.6 },
  swot: { strengths: ['x'], weaknesses: ['x'], opportunities: ['x'], threats: ['x'] },
  summary: 'Strong market',
};
const canon = normalizeStudy({ analysis: claudeResponse });
a(canon.analysis.pricing.targetHomePrice === 625000, 'wire: targetPrice -> targetHomePrice');
a(canon.analysis.scorecard.verdict === 'BUY',        'wire: recommendation -> verdict');
a(canon.analysis.executiveSummary === 'Strong market','wire: summary -> executiveSummary');
a(canon.analysis.absorption.annualSalesRate === 400, 'wire: yearlyAbsorption -> annualSalesRate');

// Minimal valid shape for E2E validate
const fullStudy = {
  geo: { name: 'X', stateAbbr: 'PA', stateFips: '42', countyFips: '019', county: 'Butler', lat: 1, lng: 2, zips: ['X'] },
  demographics: { population: 100, mhi: 100000, households: 30, ownerOccupied: 0.7 },
  housing: { medianSalePrice: 500000, medianDOM: 10, monthsSupply: 2 },
  competition: { builderCount: 5, communityCount: 10, builders: [{ name: 'NVR' }] },
  analysis: canon.analysis,
};
const val = validateStudy(fullStudy);
a(val.errors.some(e => e.includes('byPriceBand[0].salesPerMonth')), 'wire: validate flags sparse Claude fixture (byPriceBand[0].salesPerMonth missing)');
a(val.errors.some(e => e.includes('analysis.absorption.monthsSupply')), 'wire: validate flags sparse Claude fixture (monthsSupply missing)');
a(typeof val.provenance.measured === 'number',  'wire: provenance.measured exposed');
a(typeof val.provenance.modeled  === 'number',  'wire: provenance.modeled exposed');

console.log('\n' + PASS + ' pass, ' + FAIL + ' fail');
if (FAIL === 0) { console.log('\nALL PASS'); process.exit(0); }
console.log('\nFAILURES PRESENT'); process.exit(1);
