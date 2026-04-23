/**
 * v4.0.0 Phase 3 Step 9 — envelope + provenance test harness.
 * Validates the new studySchema.js exports added for LAW #2 / LAW #6.
 */
const path = require('path');
const {
  SCHEMA_VERSION,
  PROVENANCE_CLASSES,
  isEnveloped,
  makeEnvelope,
  unwrapValue,
  unwrapEnvelope,
  attachBareMirror,
  normalizeAndEnvelope,
  collectProvenance,
  enforceSchema,
  LAWS_OF_V4,
  normalizeStudy,
} = require(path.resolve(__dirname, '..', 'lib', 'studySchema'));

let pass = 0, fail = 0;
function a(cond, msg) { if (cond) { console.log('  [PASS]', msg); pass++; } else { console.log('  [FAIL]', msg); fail++; } }

// ── version + laws ──
a(SCHEMA_VERSION === '4.0.1', 'SCHEMA_VERSION = 4.0.0');
a(Array.isArray(PROVENANCE_CLASSES) && PROVENANCE_CLASSES.length === 5, 'PROVENANCE_CLASSES has 5 entries');
a(PROVENANCE_CLASSES.includes('measured'), 'measured class exists');
a(PROVENANCE_CLASSES.includes('missing'),  'missing class exists');
a(LAWS_OF_V4.LAW_2 === 'MEASURED_BEFORE_MODELED_BEFORE_LLM', 'LAW_2 label correct');
a(LAWS_OF_V4.LAW_6 === 'NO_SILENT_DEFAULTS',                 'LAW_6 label correct');

// ── makeEnvelope / isEnveloped / unwrapValue ──
const env1 = makeEnvelope(98500, { provenance: 'measured', source_url: 'https://api.census.gov/...', confidence: 'high' });
a(isEnveloped(env1),                 'makeEnvelope produces enveloped value');
a(env1.value === 98500,              'envelope value preserved');
a(env1.provenance === 'measured',    'envelope provenance preserved');
a(env1.source_url.startsWith('https://api.census.gov'), 'envelope source_url preserved');
a(unwrapValue(env1) === 98500,       'unwrapValue strips envelope');
a(unwrapValue(12345) === 12345,      'unwrapValue passes bare values through');
a(!isEnveloped(12345),               'bare number is not enveloped');
a(!isEnveloped({foo: 1}),            'bare object is not enveloped');

// ── invalid provenance throws ──
let threw = false;
try { makeEnvelope(1, { provenance: 'invented' }); } catch (e) { threw = true; }
a(threw, 'makeEnvelope rejects invalid provenance class');

// ── unwrapEnvelope (deep) ──
const deep = {
  demographics: {
    mhi: makeEnvelope(98500, { provenance: 'measured' }),
    population: makeEnvelope(32000, { provenance: 'measured' }),
  },
  housing: {
    medianHomeValue: makeEnvelope(475000, { provenance: 'modeled', confidence: 'medium' }),
  },
};
const bare = unwrapEnvelope(deep);
a(bare.demographics.mhi === 98500,        'unwrapEnvelope deep: mhi bare');
a(bare.demographics.population === 32000, 'unwrapEnvelope deep: population bare');
a(bare.housing.medianHomeValue === 475000,'unwrapEnvelope deep: medianHomeValue bare');

// ── attachBareMirror ──
const mirrored = attachBareMirror({
  demographics: {
    mhi: makeEnvelope(98500, { provenance: 'measured' }),
    population: makeEnvelope(32000, { provenance: 'measured' }),
  },
});
a(mirrored.demographics.mhi === 98500,        'attachBareMirror: bare mhi present');
a(mirrored.demographics.population === 32000, 'attachBareMirror: bare population present');
a(mirrored.demographics._env != null,         'attachBareMirror: _env sidecar present');
a(mirrored.demographics._env.mhi.provenance === 'measured', 'attachBareMirror: _env preserves envelope');

// ── normalizeAndEnvelope ──
const raw = {
  geo: { name: 'Cranberry Township', stateAbbr: 'PA', countyFips: '42019' },
  demographics: {
    population: 32000,
    mhi: 98500,
    households: 11500,
    ownerOccupied: 0.82,
  },
  housing: {
    medianSalePrice: 485000,
    medianDOM: 28,
    monthsSupply: 2.1,
  },
  competition: {
    builderCount: 7,
    communityCount: 12,
  },
};
const provHints = {
  'demographics.mhi':        { provenance: 'measured', source_url: 'https://api.census.gov/data/2023/acs/acs5?get=B19013_001E', fetched_at: '2026-04-22T00:00:00Z' },
  'demographics.population': { provenance: 'measured', source_url: 'https://api.census.gov/data/2023/acs/acs5?get=B01003_001E', fetched_at: '2026-04-22T00:00:00Z' },
  'housing.medianSalePrice': { provenance: 'measured', source_url: 'https://www.redfin.com/...', fetched_at: '2026-04-22T00:00:00Z' },
};
const canon = normalizeAndEnvelope(raw, provHints);
a(isEnveloped(canon.demographics.mhi),              'normalizeAndEnvelope: mhi is enveloped');
a(canon.demographics.mhi.value === 98500,           'normalizeAndEnvelope: mhi value correct');
a(canon.demographics.mhi.provenance === 'measured', 'normalizeAndEnvelope: mhi provenance');
a(canon.demographics.mhi.source_url.includes('api.census.gov'), 'normalizeAndEnvelope: mhi source_url');
a(isEnveloped(canon.housing.medianSalePrice),       'normalizeAndEnvelope: medianSalePrice is enveloped');
a(canon.housing.medianSalePrice.provenance === 'measured', 'medianSalePrice provenance measured');
// ownerOccupied had no hint but is in demographics bucket -> measured by default
a(isEnveloped(canon.demographics.ownerOccupied),    'ownerOccupied enveloped (default measured)');
a(canon.demographics.ownerOccupied.provenance === 'measured', 'ownerOccupied default -> measured');

// ── idempotent: normalizeAndEnvelope on already-enveloped input ──
const canon2 = normalizeAndEnvelope(canon, provHints);
a(isEnveloped(canon2.demographics.mhi),             'envelope: idempotent on already-enveloped');
a(canon2.demographics.mhi.value === 98500,          'envelope: idempotent preserves value');

// ── collectProvenance ──
const report = collectProvenance(canon);
a(Array.isArray(report.fields),                     'collectProvenance: fields array');
a(report.fields.length > 20,                        'collectProvenance: at least 20 fields reported');
a(typeof report.summary.measured === 'number',      'collectProvenance: summary.measured numeric');
a(typeof report.summary.missing === 'number',       'collectProvenance: summary.missing numeric');
a(report.summary.measured >= 4,                     'collectProvenance: at least 4 measured');
// Spot check: demographics.mhi row exists with correct metadata
const mhiRow = report.fields.find(r => r.canonical === 'demographics.mhi');
a(mhiRow != null,                                   'collectProvenance: demographics.mhi row exists');
a(mhiRow.value === 98500,                           'collectProvenance: mhi row value');
a(mhiRow.provenance === 'measured',                 'collectProvenance: mhi row provenance');

// ── enforceSchema: strict mode ──
process.env.INFINITY_STRICT_SCHEMA = '1';
let strictThrew = false;
try {
  enforceSchema({
    demographics: { unknownFieldXyz: 1 },
  }, { context: 'test:strict' });
} catch (e) { strictThrew = true; }
a(strictThrew, 'enforceSchema strict mode throws on unknown field');
delete process.env.INFINITY_STRICT_SCHEMA;

// Loose mode (default) -- warns but does not throw
let looseThrew = false;
try {
  enforceSchema({ demographics: { unknownFieldXyz: 1 } }, { context: 'test:loose' });
} catch (e) { looseThrew = true; }
a(!looseThrew, 'enforceSchema loose mode does not throw');

// Known fields pass enforcement
let knownThrew = false;
try {
  process.env.INFINITY_STRICT_SCHEMA = '1';
  enforceSchema(canon, { context: 'test:known' });
} catch (e) { knownThrew = true; console.log('    (enforce threw:', e.message, ')'); }
delete process.env.INFINITY_STRICT_SCHEMA;
a(!knownThrew, 'enforceSchema strict mode accepts canonical study');

// ── backward compat: normalizeStudy still works for legacy callers ──
const legacyCanon = normalizeStudy(raw);
a(legacyCanon.demographics.mhi === 98500,           'normalizeStudy (legacy): mhi is bare number');
a(!isEnveloped(legacyCanon.demographics.mhi),       'normalizeStudy (legacy): no envelope');

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
if (fail > 0) { console.log('FAILURES PRESENT'); process.exit(1); }
console.log('ALL PASS');
