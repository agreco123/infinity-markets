/**
 * v3.0 Phase 1 / Step 2 — canonical schema contract test.
 *
 * Exercises:
 *   - FIELDS inventory (~130 canonical fields, ≥260 aliases)
 *   - normalizeStudy: clean fixture, aliased fixture, nested/legacy fixture
 *   - validateStudy: valid shape, missing-required, row-level band checks
 */
const path = require('path');
const {
  SCHEMA_VERSION, FIELDS, ALIAS_INDEX, FIELD_BY_PATH,
  normalizeStudy, validateStudy,
} = require(path.resolve(__dirname, '..', 'lib', 'studySchema'));

let PASS = 0, FAIL = 0;
function a(ok, label) { ok ? PASS++ : FAIL++; console.log('  [' + (ok?'PASS':'FAIL') + '] ' + label); }
function deepGet(o, p) { const segs = p.split('.'); let c = o; for (const s of segs) { if (c == null) return undefined; c = c[s]; } return c; }

console.log('=== Harness: canonical study schema ===');

// ── Inventory ──
a(SCHEMA_VERSION === '4.0.1',          'SCHEMA_VERSION = 4.0.0');
a(FIELDS.length >= 125,                'FIELDS inventory >= 125 (got ' + FIELDS.length + ')');
a(ALIAS_INDEX.size >= 250,             'ALIAS_INDEX size >= 250 (got ' + ALIAS_INDEX.size + ')');
a(FIELD_BY_PATH.has('geo.county'),     'FIELD_BY_PATH has geo.county');
a(FIELD_BY_PATH.has('analysis.pricing.targetHomePrice'),
                                       'FIELD_BY_PATH has analysis.pricing.targetHomePrice');

// Every field has the required shape.
let shapeOk = true;
for (const f of FIELDS) {
  if (typeof f.canonical !== 'string') { shapeOk = false; break; }
  if (!Array.isArray(f.aliases))       { shapeOk = false; break; }
  if (typeof f.type !== 'string')      { shapeOk = false; break; }
  if (typeof f.required !== 'boolean') { shapeOk = false; break; }
  if (!Array.isArray(f.sources))       { shapeOk = false; break; }
}
a(shapeOk, 'every FIELD has {canonical, aliases, type, required, sources}');

// Required fields across buckets (gating)
const requiredByBucket = {};
for (const f of FIELDS) {
  if (!f.required) continue;
  const b = f.canonical.split('.')[0];
  requiredByBucket[b] = (requiredByBucket[b] || 0) + 1;
}
a(requiredByBucket.geo >= 5,          'geo has >= 5 required fields (got ' + (requiredByBucket.geo||0) + ')');
a(requiredByBucket.demographics >= 3, 'demographics has >= 3 required fields');
a(requiredByBucket.housing >= 3,      'housing has >= 3 required fields');
a(requiredByBucket.analysis >= 10,    'analysis has >= 10 required fields');

// ── normalizeStudy: clean canonical input ──
const cleanCranberry = {
  geo: {
    name: 'Cranberry township', stateAbbr: 'PA', stateFips: '42',
    countyFips: '019', subdivFips: '16920', county: 'Butler',
    subdivision: 'Cranberry', lat: 40.7099, lng: -80.1061,
    zips: ['16066','16046'], cbsa: '38300', cbsaName: 'Pittsburgh, PA',
  },
  demographics: {
    population: 34094, mhi: 125126, households: 14111,
    ownerOccupied: 0.753,
  },
  housing: { medianSalePrice: 482500, medianDOM: 12, monthsSupply: 2.1 },
  competition: { builderCount: 7, communityCount: 18, builders: [{ name: 'NVR' }] },
  analysis: {
    absorption: {
      annualSalesRate: 412, monthsSupply: 2.1,
      byPriceBand: [{ band: '$300-450K', listings: 18, salesPerMonth: 6, monthsSupply: 3.0 }],
    },
    pricing: {
      targetHomePrice: 625000, targetPriceRange: { min: 500000, max: 750000 },
      recommendedTier: 'Executive', stratification: [{ tier: 'Executive' }],
    },
    land: { avgCostPerAcre: 95000 },
    proforma: { averageSalePrice: 625000, hardCostPerSqft: 165, grossMargin: 0.252, netMargin: 0.164 },
    regulatory: { zoning: 'R-2', impactFeesPerUnit: 8500, entitlementTimelineMonths: 18 },
    scorecard: { verdict: 'BUY', score: 6.6 },
    swot: { strengths: ['x'], weaknesses: ['x'], opportunities: ['x'], threats: ['x'] },
    executiveSummary: 'Strong market',
  },
};

const canon1 = normalizeStudy(cleanCranberry);
a(deepGet(canon1, 'geo.county') === 'Butler',                         'clean: geo.county = Butler');
a(deepGet(canon1, 'demographics.population') === 34094,               'clean: demographics.population = 34094');
a(deepGet(canon1, 'housing.medianDOM') === 12,                        'clean: housing.medianDOM = 12');
a(deepGet(canon1, 'analysis.scorecard.verdict') === 'BUY',            'clean: analysis.scorecard.verdict = BUY');
a(deepGet(canon1, 'analysis.pricing.targetHomePrice') === 625000,     'clean: targetHomePrice = 625000');

const val1 = validateStudy(canon1);
a(val1.valid === true, 'clean fixture validates (errors: ' + JSON.stringify(val1.errors) + ')');
a(val1.provenance.measured >= 10, 'clean fixture measured >= 10 (got ' + val1.provenance.measured + ')');

// ── normalizeStudy: aliased inputs ──
const aliased = {
  geo: {
    name: 'Cranberry', state: 'PA', stateFips: '42', countyFips: '019',
    subdivFips: '16920', countyName: 'Butler',           // alias of county
    subdivisionName: 'Cranberry',                        // alias of subdivision
    latitude: 40.71, lon: -80.1, zips: ['16066'],
  },
  demographics: {
    pop: 34000,                                          // alias of population
    medianHouseholdIncome: 125000,                       // alias of mhi
    hhCount: 14000,                                      // alias of households
    homeownership: 0.75,                                 // alias of ownerOccupied
  },
  housing: {
    medianPrice: 480000,                                 // alias of medianSalePrice
    dom: 12,                                             // alias of medianDOM
    monthsOfSupply: 2.0,                                 // alias of monthsSupply
  },
  competition: { buildersCount: 5, numCommunities: 10, builders: [{ name: 'NVR' }] },
  analysis: {
    absorption: {
      yearlyAbsorption: 400,                             // alias of annualSalesRate
      monthsSupplyAbsorption: 2.1,
      byPriceBand: [{
        name: 'Entry',                                   // alias of band
        units: 18,                                       // alias of listings
        monthlySales: 6,                                 // alias of salesPerMonth
        supply: 3.0,                                     // alias of monthsSupply
      }],
    },
    pricing: {
      targetPrice: 625000, priceRange: { min: 500000, max: 750000 },
      targetTier: 'Executive', stratification: [{ tier: 'Executive' }],
    },
    land: { landPricePerAcre: 95000 },
    proforma: { asp: 625000, hardCostPsf: 165, gpMargin: 0.25, npMargin: 0.16 },
    regulatory: { zoningDistrict: 'R-2', impactFees: 8500, entitlementTime: 18 },
    scorecard: { recommendation: 'BUY', overallScore: 6.6 },
    swot: { strengths: ['x'], weaknesses: ['x'], opportunities: ['x'], threats: ['x'] },
    summary: 'Strong market',
  },
};
const canon2 = normalizeStudy(aliased);
a(deepGet(canon2, 'geo.county') === 'Butler',                            'aliased: countyName -> geo.county');
a(deepGet(canon2, 'geo.subdivision') === 'Cranberry',                    'aliased: subdivisionName -> geo.subdivision');
a(deepGet(canon2, 'demographics.population') === 34000,                  'aliased: pop -> demographics.population');
a(deepGet(canon2, 'demographics.mhi') === 125000,                        'aliased: medianHouseholdIncome -> demographics.mhi');
a(deepGet(canon2, 'housing.medianSalePrice') === 480000,                 'aliased: medianPrice -> housing.medianSalePrice');
a(deepGet(canon2, 'housing.medianDOM') === 12,                           'aliased: dom -> housing.medianDOM');
a(deepGet(canon2, 'analysis.absorption.annualSalesRate') === 400,        'aliased: yearlyAbsorption -> annualSalesRate');
a(deepGet(canon2, 'analysis.pricing.targetHomePrice') === 625000,        'aliased: targetPrice -> targetHomePrice');
a(deepGet(canon2, 'analysis.proforma.averageSalePrice') === 625000,      'aliased: asp -> averageSalePrice');
a(deepGet(canon2, 'analysis.scorecard.verdict') === 'BUY',               'aliased: recommendation -> verdict');
a(deepGet(canon2, 'analysis.executiveSummary') === 'Strong market',      'aliased: summary -> executiveSummary');

// Row-level alias rewriting
const band0 = deepGet(canon2, 'analysis.absorption.byPriceBand')[0];
a(band0.band === 'Entry',         'aliased row: name -> band');
a(band0.listings === 18,          'aliased row: units -> listings');
a(band0.salesPerMonth === 6,      'aliased row: monthlySales -> salesPerMonth');
a(band0.monthsSupply === 3.0,     'aliased row: supply -> monthsSupply');

const val2 = validateStudy(canon2);
a(val2.valid === true, 'aliased fixture validates (errors: ' + val2.errors.length + ')');

// ── validateStudy: missing required ──
const missingShape = {
  geo: { stateAbbr: 'PA', stateFips: '42', countyFips: '019', lat: 1, lng: 2, zips: ['X'] },
  // geo.name + geo.county missing — both required
  demographics: { /* population + mhi + households + ownerOccupied missing */ },
  housing: {},
  competition: { builders: [] },
  analysis: {},
};
const canon3 = normalizeStudy(missingShape);
const val3 = validateStudy(canon3);
a(val3.valid === false,                                  'missing fixture does NOT validate');
a(val3.errors.some(e => e.includes('geo.name')),         'error: geo.name missing');
a(val3.errors.some(e => e.includes('geo.county')),       'error: geo.county missing');
a(val3.errors.some(e => e.includes('demographics.population')), 'error: demographics.population missing');
a(val3.errors.some(e => e.includes('demographics.mhi')),        'error: demographics.mhi missing');
a(val3.errors.some(e => e.includes('analysis.scorecard.verdict')), 'error: analysis.scorecard.verdict missing');
a(val3.provenance.missing >= 10,                         'provenance.missing >= 10 (got ' + val3.provenance.missing + ')');

// ── validateStudy: row-level band checks ──
const badBands = {
  ...cleanCranberry,
  analysis: {
    ...cleanCranberry.analysis,
    absorption: {
      annualSalesRate: 412, monthsSupply: 2.1,
      byPriceBand: [
        { band: 'Entry', listings: 18 }, // missing salesPerMonth + monthsSupply
      ],
    },
  },
};
const canon4 = normalizeStudy(badBands);
const val4 = validateStudy(canon4);
a(val4.errors.some(e => e.includes('byPriceBand[0].salesPerMonth')), 'row error: byPriceBand[0].salesPerMonth missing');
a(val4.errors.some(e => e.includes('byPriceBand[0].monthsSupply')),  'row error: byPriceBand[0].monthsSupply missing');

// ── Idempotence: normalize(normalize(x)) === normalize(x) ──
const canon1b = normalizeStudy(canon1);
a(JSON.stringify(canon1b.geo) === JSON.stringify(canon1.geo),
                                                         'idempotent: normalize(normalize(x)).geo stable');
a(JSON.stringify(canon1b.analysis.scorecard) === JSON.stringify(canon1.analysis.scorecard),
                                                         'idempotent: analysis.scorecard stable');

console.log('\n' + PASS + ' pass, ' + FAIL + ' fail');
if (FAIL === 0) { console.log('\nALL PASS'); process.exit(0); }
console.log('\nFAILURES PRESENT'); process.exit(1);
