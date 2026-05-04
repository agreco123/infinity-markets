#!/usr/bin/env node
/**
 * V41-3 — schema-error surfacing end-to-end.
 *
 * Verifies the H-8 contract:
 *   1. enforceSchema returns { valid, unknown, missingRequired, errorSummary, strict }
 *   2. errorSummary.text format:
 *        • empty → "[<ctx>] schema OK (0 unknown, 0 missing)"
 *        • with errors → "[<ctx>] N missing required, M unknown — f1, f2, +X more"
 *   3. errorSummary.rows parse validateStudy's "missing required: <field> (sources: ...)"
 *      strings into { kind, field, detail } tuples.
 *   4. errorSummary counts match unknown/missingRequired array lengths.
 *   5. buildErrorSummary() is exported and callable standalone.
 *   6. deliverables/pdf.js Data Quality appendix:
 *        • Absent when _schema.errorSummary is missing or rows empty.
 *        • Present when rows populated; includes "Appendix B" header, per-row
 *          <td> cells, Missing Required / Unknown Field pills, and schema-version footer.
 *   7. Byte-stability: clean studies (cranberry, newstead goldens) UNCHANGED
 *      — verified separately by test_deliverables_pdf.js (still passing).
 *
 * Exit code: 0 on success, 1 on any failure.
 */
'use strict';
const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

// Intercept express/puppeteer just like test_deliverables_pdf.js so that
// requiring the pdf module doesn't try to spin up real routing.
const Module = require('module');
const origLoad = Module._load;
const fakeRouter = () => ({ post: () => {}, get: () => {}, use: () => {} });
const fakeExpress = Object.assign(() => ({ Router: fakeRouter }), { Router: fakeRouter });
Module._load = function(req, parent, ...rest) {
  if (req === 'express') return fakeExpress;
  if (req === 'puppeteer-core' || req === '@sparticuz/chromium') return {};
  return origLoad.call(this, req, parent, ...rest);
};

const {
  normalizeStudy,
  validateStudy,
  enforceSchema,
  buildErrorSummary,
  SCHEMA_VERSION,
} = require('../lib/studySchema');
const { buildPDFHTML } = require('../routes/deliverables/pdf');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log('[PASS] ' + label); pass++; }
  catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// ── 1. enforceSchema return-shape contract ─────────────────────────────────
check('enforceSchema returns {valid, unknown, missingRequired, errorSummary, strict}', () => {
  const canon = normalizeStudy({ analysis: {} });
  const r = enforceSchema(canon, { context: 'unit' });
  assert.strictEqual(typeof r.valid, 'boolean');
  assert.ok(Array.isArray(r.unknown));
  assert.ok(Array.isArray(r.missingRequired));
  assert.ok(r.errorSummary && typeof r.errorSummary === 'object');
  assert.ok(Object.prototype.hasOwnProperty.call(r, 'strict'));
});

// ── 2. errorSummary.text format ────────────────────────────────────────────
check('errorSummary.text — empty path says "schema OK"', () => {
  const s = buildErrorSummary({ context: 'x' });
  assert.strictEqual(s.text, '[x] schema OK (0 unknown, 0 missing)');
  assert.strictEqual(s.missingCount, 0);
  assert.strictEqual(s.unknownCount, 0);
  assert.strictEqual(s.total, 0);
  assert.deepStrictEqual(s.rows, []);
});

check('errorSummary.text — populated path includes counts and first fields', () => {
  const s = buildErrorSummary({
    context: 'ctx',
    missingRequired: [
      'missing required: geo.name (sources: a|b)',
      'missing required: geo.stateAbbr (sources: c)',
      'missing required: demographics.mhi (sources: acs)',
    ],
    unknown: ['analysis.experimental.foo'],
  });
  assert.ok(s.text.startsWith('[ctx] '), 'must start with [ctx]');
  assert.ok(s.text.includes('3 missing required'), 'must report missing count');
  assert.ok(s.text.includes('1 unknown'),          'must report unknown count');
  assert.ok(s.text.includes('geo.name'),           'must include first field');
  assert.strictEqual(s.missingCount, 3);
  assert.strictEqual(s.unknownCount, 1);
  assert.strictEqual(s.total, 4);
});

check('errorSummary.text — truncates to 5 with +N more', () => {
  const many = [];
  for (let i = 0; i < 8; i++) many.push('missing required: field_' + i + ' (sources: s)');
  const s = buildErrorSummary({ context: 'big', missingRequired: many });
  assert.ok(s.text.includes('+3 more'), 'expected "+3 more" suffix');
  assert.ok(!s.text.includes('field_5,'), 'rows beyond index 4 must not appear inline');
});

// ── 3. errorSummary.rows parsing ───────────────────────────────────────────
check('errorSummary.rows — parsed missing_required shape', () => {
  const s = buildErrorSummary({
    missingRequired: ['missing required: housing.medianSalePrice (sources: redfin|zillow|fallback)'],
  });
  assert.strictEqual(s.rows.length, 1);
  assert.strictEqual(s.rows[0].kind,   'missing_required');
  assert.strictEqual(s.rows[0].field,  'housing.medianSalePrice');
  assert.strictEqual(s.rows[0].detail, 'sources: redfin|zillow|fallback');
});

check('errorSummary.rows — unparsed missing falls back to (unparsed)', () => {
  const s = buildErrorSummary({ missingRequired: ['totally different error shape'] });
  assert.strictEqual(s.rows[0].kind,   'missing_required');
  assert.strictEqual(s.rows[0].field,  '(unparsed)');
  assert.strictEqual(s.rows[0].detail, 'totally different error shape');
});

check('errorSummary.rows — unknown_field shape', () => {
  const s = buildErrorSummary({ unknown: ['analysis.experimental.foo'] });
  assert.strictEqual(s.rows[0].kind,   'unknown_field');
  assert.strictEqual(s.rows[0].field,  'analysis.experimental.foo');
  assert.strictEqual(s.rows[0].detail, 'not in canonical schema');
});

// ── 4. counts match array lengths ──────────────────────────────────────────
check('errorSummary counts match underlying array lengths', () => {
  const canon = normalizeStudy({
    demographics: { population: 100 },
    junk1: { x: 1 },
    junk2: { y: 2 },
  });
  const r = enforceSchema(canon, { context: 'counts' });
  assert.strictEqual(r.errorSummary.unknownCount, r.unknown.length);
  assert.strictEqual(r.errorSummary.missingCount, r.missingRequired.length);
  assert.strictEqual(r.errorSummary.total, r.unknown.length + r.missingRequired.length);
});

// ── 5. buildErrorSummary exported ──────────────────────────────────────────
check('buildErrorSummary is exported from studySchema', () => {
  assert.strictEqual(typeof buildErrorSummary, 'function');
});

// ── 6. deliverables/pdf.js Data Quality appendix ───────────────────────────
check('pdf.js: OMITS appendix when _schema missing', () => {
  const html = buildPDFHTML({ geo:{}, demographics:{}, housing:{}, competition:{}, analysis:{} });
  // v4.2.0: Appendix A = Source Manifest (always emitted). Data Quality is now Appendix B (conditional).
  assert.ok(!html.includes('Appendix B'),           'Appendix B must not appear when no schema errors');
  assert.ok(!html.includes('Data Quality Report'),  'Data Quality Report must not appear');
  assert.ok(html.includes('Appendix A'),            'Appendix A (Source Manifest) is unconditional');
});

check('pdf.js: OMITS appendix when errorSummary.rows empty', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{}, housing:{}, competition:{}, analysis:{},
    _schema: { version: SCHEMA_VERSION, errorSummary: { text: '[x] OK', rows: [] } },
  });
  assert.ok(!html.includes('Data Quality Report'));
});

check('pdf.js: RENDERS appendix with all expected elements when rows populated', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{}, housing:{}, competition:{}, analysis:{},
    _schema: {
      version: SCHEMA_VERSION,
      errorSummary: {
        text: '[analysis:Test PA] 2 missing required, 1 unknown — geo.name, demographics.mhi, junk',
        missingCount: 2, unknownCount: 1, total: 3,
        rows: [
          { kind: 'missing_required', field: 'geo.name',         detail: 'sources: a|b' },
          { kind: 'missing_required', field: 'demographics.mhi', detail: 'sources: acs' },
          { kind: 'unknown_field',    field: 'junk',             detail: 'not in canonical schema' },
        ],
      },
    },
  });
  assert.ok(html.includes('Appendix B'));
  assert.ok(html.includes('Data Quality Report'));
  assert.ok(html.includes('Missing Required'));
  assert.ok(html.includes('Unknown Field'));
  assert.ok(html.includes('geo.name'));
  assert.ok(html.includes('demographics.mhi'));
  assert.ok(html.includes('junk'));
  assert.ok(html.includes('Schema version: ' + SCHEMA_VERSION));
  assert.ok(html.includes('Missing: 2'));
  assert.ok(html.includes('Unknown: 1'));
  // Summary line should have the context prefix stripped.
  const i = html.indexOf('Summary: ');
  assert.ok(!html.slice(i, i + 200).startsWith('Summary: ['),
    'context prefix must be stripped from Summary line');
});

check('pdf.js: escapes HTML special chars in field names + detail', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{}, housing:{}, competition:{}, analysis:{},
    _schema: {
      errorSummary: {
        rows: [{ kind: 'unknown_field', field: '<script>x</script>', detail: 'a&b<c' }],
      },
    },
  });
  assert.ok(!html.includes('<script>x</script>'),
    'raw script tags must be escaped');
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;'),
    'field name must be HTML-escaped');
  assert.ok(html.includes('a&amp;b&lt;c'),
    'detail must be HTML-escaped');
});

// ── 7. Incomplete fixture end-to-end ───────────────────────────────────────
check('fixture study-incomplete: enforceSchema flags missing + unknown', () => {
  const fp = path.join(__dirname, 'fixtures', 'study-incomplete.json');
  const fx = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const canon = normalizeStudy(fx);
  const r = enforceSchema(canon, { context: 'fixture:incomplete' });
  assert.strictEqual(r.valid, false, 'must be invalid');
  assert.ok(r.missingRequired.length > 0, 'expected missing-required errors');
  // Fixture intentionally includes analysis.experimental.foo which is unknown.
  assert.ok(r.unknown.some(f => f.includes('experimental')),
    'unknown array must include the intentional experimental field');
  // errorSummary.rows must be a full tally.
  assert.strictEqual(r.errorSummary.total,
    r.errorSummary.missingCount + r.errorSummary.unknownCount,
    'total must equal missing + unknown');
});

check('fixture study-incomplete → pdf.js renders appendix with >=3 rows', () => {
  const fp = path.join(__dirname, 'fixtures', 'study-incomplete.json');
  const fx = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const canon = normalizeStudy(fx);
  const r = enforceSchema(canon, { context: 'fixture:incomplete' });
  // Attach like analysis.js does.
  fx._schema = { version: SCHEMA_VERSION, valid: r.valid, errorSummary: r.errorSummary };
  const html = buildPDFHTML(fx);
  assert.ok(html.includes('Appendix B'));
  assert.ok(html.includes('Data Quality Report'));
  assert.ok(html.includes('Missing Required'));
  // Should render at least a handful of rows.
  const missingPillCount = (html.match(/Missing Required</g) || []).length;
  assert.ok(missingPillCount >= 3, 'expected at least 3 Missing Required pills, got ' + missingPillCount);
});

console.log('\n=== test_schema_errorSummary: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
