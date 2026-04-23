#!/usr/bin/env node
/**
 * V41P-1 / W-1 — test_asp_chip_render.
 *
 * Verifies:
 *   1. aspChipFromRow extracted from pdf.js returns '' when no _aspReason set.
 *   2. aspChipFromRow returns a prov-error chip when _aspReason is set.
 *   3. Tooltip carries both _aspRevEnd and _aspDelEnd when present.
 *   4. Tooltip carries reason alone when end-dates missing.
 *   5. Integration: buildPDFHTML on a study with a misaligned EDGAR row emits
 *      the ERR chip inside the §10 table cell for that builder.
 *   6. Integration: aligned row does NOT emit the ERR chip.
 *   7. competition.js edgarFields merge forwards _aspReason/_aspRevEnd/_aspDelEnd
 *      onto cleanBuilders row (regex-based shape assertion on the JS source).
 *   8. HTML escaping survives: a reason with special chars is escaped in tooltip.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const assert = require('assert');

const Module = require('module');
const origLoad = Module._load;
const fakeRouter = () => ({ post: () => {}, get: () => {}, use: () => {} });
const fakeExpress = Object.assign(() => ({ Router: fakeRouter }), { Router: fakeRouter });
Module._load = function(req, parent, ...rest) {
  if (req === 'express') return fakeExpress;
  if (req === 'puppeteer-core' || req === '@sparticuz/chromium') return {};
  return origLoad.call(this, req, parent, ...rest);
};

const { buildPDFHTML } = require('../routes/deliverables/pdf');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log('[PASS] ' + label); pass++; }
  catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// Extract aspChipFromRow directly from pdf.js source for unit-level testing.
const pdfSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'deliverables', 'pdf.js'), 'utf8');
const fnMatch = pdfSrc.match(/function aspChipFromRow\(b\)\s*\{([\s\S]*?)\n\}/);
if (!fnMatch) {
  console.error('FATAL: could not extract aspChipFromRow from pdf.js');
  process.exit(1);
}
// Need esc() from pdf.js too (simple HTML-escape). Provide a minimal equivalent.
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const aspChipFromRow = new Function('esc', 'return function aspChipFromRow(b){' + fnMatch[1] + '\n}')(esc);

// 1. Empty → no chip
check('aspChipFromRow: no _aspReason → empty string', () => {
  assert.strictEqual(aspChipFromRow({}), '');
  assert.strictEqual(aspChipFromRow({ _aspReason: null }), '');
  assert.strictEqual(aspChipFromRow(null), '');
});

// 2. Has reason → chip emitted
check('aspChipFromRow: _aspReason set → prov-error chip emitted', () => {
  const out = aspChipFromRow({ _aspReason: 'end_date_mismatch' });
  assert.ok(out.includes('prov-chip prov-error'), 'missing class');
  assert.ok(out.includes('>ERR<'), 'missing chip label');
});

// 3. Tooltip carries both end dates
check('aspChipFromRow: tooltip carries rev=X · delivered=Y when both present', () => {
  const out = aspChipFromRow({
    _aspReason: 'end_date_mismatch',
    _aspRevEnd: '2025-12-31',
    _aspDelEnd: '2024-12-31',
  });
  assert.ok(out.includes('rev=2025-12-31'), 'rev end missing');
  assert.ok(out.includes('delivered=2024-12-31'), 'delivered end missing');
  assert.ok(out.includes('end_date_mismatch'), 'reason missing');
});

// 4. Reason alone when end-dates missing
check('aspChipFromRow: reason alone when _aspRevEnd/_aspDelEnd absent', () => {
  const out = aspChipFromRow({ _aspReason: 'no_revenue' });
  assert.ok(out.includes('no_revenue'));
  assert.ok(!out.includes('rev='));
  assert.ok(!out.includes('delivered='));
});

// 5. Integration: misaligned row → buildPDFHTML §10 emits ERR chip on ASP cell.
check('buildPDFHTML: misaligned EDGAR row → §10 ASP cell contains prov-error chip', () => {
  const study = {
    geo: { targetArea: 'Test Market' },
    demographics: {},
    housing: {},
    competition: {
      builders: [
        {
          name: 'Misaligned Co',
          revenueUsd: 14000000000,
          grossMarginPct: 20.1,
          homesDelivered: 30000,
          averageSellingPrice: null,
          filingPeriodEnd: '2025-12-31',
          homesDeliveredEnd: '2024-12-31',
          _aspReason: 'end_date_mismatch',
          _aspRevEnd: '2025-12-31',
          _aspDelEnd: '2024-12-31',
        },
      ],
    },
    analysis: {},
  };
  const html = buildPDFHTML(study);
  // Locate §10 EDGAR block and confirm prov-error chip appears in it.
  const edgarSliceIdx = html.indexOf('SEC EDGAR Public Builder Benchmarks');
  assert.ok(edgarSliceIdx > 0, '§10 EDGAR block missing');
  const tailHtml = html.slice(edgarSliceIdx);
  assert.ok(tailHtml.includes('Misaligned Co'), 'builder row missing');
  // Extract the row for Misaligned Co and check its ASP cell has the chip.
  const rowRe = /<tr><td>Misaligned Co<\/td>[\s\S]*?<\/tr>/;
  const rowMatch = tailHtml.match(rowRe);
  assert.ok(rowMatch, 'Misaligned Co row not located');
  const row = rowMatch[0];
  assert.ok(row.includes('prov-chip prov-error'),
    'ASP row should have prov-error chip; row HTML: ' + row);
  assert.ok(row.includes('end_date_mismatch'), 'reason missing from row chip');
});

// 6. Aligned row → no chip
check('buildPDFHTML: aligned EDGAR row → §10 ASP cell emits no chip', () => {
  const study = {
    geo: { targetArea: 'Test Market' },
    demographics: {},
    housing: {},
    competition: {
      builders: [
        {
          name: 'Aligned Co',
          revenueUsd: 12000000000,
          grossMarginPct: 22.5,
          homesDelivered: 30000,
          averageSellingPrice: 400000,
          filingPeriodEnd: '2024-12-31',
          homesDeliveredEnd: '2024-12-31',
          _aspSource: 'derived:rev/homesDelivered',
          _aspReason: null,
        },
      ],
    },
    analysis: {},
  };
  const html = buildPDFHTML(study);
  const edgarIdx = html.indexOf('SEC EDGAR Public Builder Benchmarks');
  assert.ok(edgarIdx > 0);
  const tailHtml = html.slice(edgarIdx);
  const rowRe = /<tr><td>Aligned Co<\/td>[\s\S]*?<\/tr>/;
  const rowMatch = tailHtml.match(rowRe);
  assert.ok(rowMatch, 'Aligned Co row missing');
  const row = rowMatch[0];
  assert.ok(!row.includes('prov-chip prov-error'),
    'aligned row must not carry error chip; row: ' + row);
  assert.ok(row.includes('$400,000'), 'ASP value missing');
});

// 7. competition.js edgarFields merge shape — regex assertion on source
check('competition.js edgarFields merge forwards _aspReason/_aspRevEnd/_aspDelEnd', () => {
  const compSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'competition.js'), 'utf8');
  assert.ok(/_aspReason:\s+e\._aspReason/.test(compSrc), '_aspReason forward missing');
  assert.ok(/_aspRevEnd:\s+e\._aspRevEnd/.test(compSrc), '_aspRevEnd forward missing');
  assert.ok(/_aspDelEnd:\s+e\._aspDelEnd/.test(compSrc), '_aspDelEnd forward missing');
  assert.ok(/_aspSource:\s+e\._aspSource/.test(compSrc), '_aspSource forward missing');
  assert.ok(/homesDeliveredEnd:\s+e\.homesDeliveredEnd/.test(compSrc),
    'homesDeliveredEnd forward missing');
});

// 8. HTML-escape in tooltip
check('aspChipFromRow: HTML-special chars in reason are escaped in tooltip', () => {
  const out = aspChipFromRow({ _aspReason: 'rev<2025> & "stale"' });
  assert.ok(out.includes('&lt;2025&gt;'), 'angle brackets must escape: ' + out);
  assert.ok(out.includes('&amp;'), 'ampersand must escape');
  assert.ok(out.includes('&quot;'), 'quote must escape');
  assert.ok(!out.includes('<2025>'), 'raw angle brackets leaked');
});

console.log('\n=== test_asp_chip_render: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
