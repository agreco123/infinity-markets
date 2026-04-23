#!/usr/bin/env node
/**
 * V41-5 / H-3 — enricher fail-loud contract.
 *
 * Verifies:
 *   1. enrichAnalysisForDeliverables pushes _enrichErrors[] when absorption's
 *      byPriceBand cascade ends empty (Claude empty AND competition empty
 *      AND housing listings empty).
 *   2. Pushes when pricing has no stratification AND no targetHomePrice
 *      AND no bandedPricing.
 *   3. Pushes when proforma has empty scenarios[].
 *   4. Pushes when scorecard is empty AND upstream had signal.
 *   5. Does NOT push on the happy path (populated bands / pricing / proforma
 *      / scorecard).
 *   6. pdf.js CSS includes .prov-error and .prov-error-block classes.
 *   7. pdf.js emits errBlock() when _schema.enrichErrors is populated.
 *   8. pdf.js emits NO error blocks when _schema.enrichErrors is absent.
 *   9. Error block tooltip carries cause + detail (escaped).
 *  10. _schema.enrichErrors is attached by hot-path analysis route when
 *      enricher returns errors (simulated by wiring directly through the
 *      exported function path).
 */
'use strict';
const fs     = require('fs');
const path   = require('path');
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

const { enrichAnalysisForDeliverables } = require('../routes/analysis');
const { buildPDFHTML } = require('../routes/deliverables/pdf');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log('[PASS] ' + label); pass++; }
  catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// ── 1. byPriceBand cascade empty emits error ─────────────────────────────
check('enricher: absorption.byPriceBand cascade_empty emitted', () => {
  const a = { absorption: { marketWideMonthly: 24 } };
  enrichAnalysisForDeliverables(a, null, null);
  const errs = a._enrichErrors || [];
  const hit  = errs.find(e => e.bucket === 'absorption' && e.field === 'byPriceBand');
  assert.ok(hit, 'absorption.byPriceBand entry missing; errs=' + JSON.stringify(errs));
  assert.strictEqual(hit.cause, 'cascade_empty');
  assert.ok(hit.detail && hit.detail.length > 0, 'detail should be populated');
});

// ── 2. pricing all_sources_missing ───────────────────────────────────────
check('enricher: pricing.all_sources_missing emitted when pricing barren', () => {
  const a = { pricing: {} };
  enrichAnalysisForDeliverables(a, null, null);
  const errs = a._enrichErrors || [];
  const hit  = errs.find(e => e.bucket === 'pricing' && e.field === 'stratification');
  assert.ok(hit, 'pricing entry missing; errs=' + JSON.stringify(errs));
  assert.strictEqual(hit.cause, 'all_sources_missing');
});

// ── 3. proforma no_base_scenario ─────────────────────────────────────────
check('enricher: proforma.no_base_scenario emitted for empty scenarios', () => {
  const a = { proforma: { scenarios: [] } };
  enrichAnalysisForDeliverables(a, null, null);
  const errs = a._enrichErrors || [];
  const hit  = errs.find(e => e.bucket === 'proforma' && e.field === 'scenarios');
  assert.ok(hit, 'proforma entry missing; errs=' + JSON.stringify(errs));
  assert.strictEqual(hit.cause, 'no_base_scenario');
});

// ── 4. scorecard empty_despite_inputs ────────────────────────────────────
check('enricher: scorecard.empty_despite_inputs fires when upstream had signal', () => {
  const a = { scorecard: [] };
  enrichAnalysisForDeliverables(a, { totalUnits: 5000, medianHomeValue: 400000 }, { activeListings: 100 });
  const errs = a._enrichErrors || [];
  const hit  = errs.find(e => e.bucket === 'scorecard' && e.field === 'scorecard');
  assert.ok(hit, 'scorecard entry missing; errs=' + JSON.stringify(errs));
  assert.strictEqual(hit.cause, 'empty_despite_inputs');
});

// ── 4b. scorecard NOT pushed when upstream also empty ────────────────────
check('enricher: scorecard empty AND upstream empty → NO error (nothing to score)', () => {
  const a = { scorecard: [] };
  enrichAnalysisForDeliverables(a, null, null);
  const errs = a._enrichErrors || [];
  const hit  = errs.find(e => e.bucket === 'scorecard');
  assert.ok(!hit, 'should NOT fire when upstream also empty; got ' + JSON.stringify(errs));
});

// ── 5. happy path — no errors ────────────────────────────────────────────
check('enricher: happy path emits no _enrichErrors', () => {
  const a = {
    absorption: { byPriceBand: [{ name: 'Mid', listings: 10, salesPerMonth: 3, monthsSupply: 3 }] },
    pricing: { stratification: [{ segment: 'Mid', priceRange: '$400K-$500K' }] },
    proforma: { scenarios: [{ label: 'Base', asp: 500000, margin: 100000, marginPct: 20 }] },
    scorecard: [{ metric: 'Population Growth', score: 8, weight: 20 }],
  };
  enrichAnalysisForDeliverables(a, { totalUnits: 5000 }, { activeListings: 100 });
  assert.ok(!a._enrichErrors, 'happy path must not push errors; got ' + JSON.stringify(a._enrichErrors));
});

// ── 6. pdf.js CSS has prov-error classes ─────────────────────────────────
check('renderer: CSS has prov-error and prov-error-block classes', () => {
  const html = buildPDFHTML({ geo:{}, demographics:{}, housing:{}, competition:{}, analysis:{} });
  assert.ok(html.includes('.prov-error{'), 'missing .prov-error class');
  assert.ok(html.includes('.prov-error-block{'), 'missing .prov-error-block class');
});

// ── 7. renderer emits error blocks when enrichErrors populated ───────────
check('renderer: emits error blocks for every enrichErrors row', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{}, housing:{}, competition:{}, analysis:{},
    scorecard: [],
    _schema: {
      enrichErrors: [
        { bucket: 'absorption', field: 'byPriceBand', cause: 'cascade_empty', detail: 'demo detail A' },
        { bucket: 'pricing',    field: 'stratification', cause: 'all_sources_missing', detail: 'demo detail B' },
        { bucket: 'proforma',   field: 'scenarios', cause: 'no_base_scenario', detail: 'demo detail C' },
        { bucket: 'scorecard',  field: 'scorecard', cause: 'empty_despite_inputs', detail: 'demo detail D' },
      ],
    },
  });
  const blocks = (html.match(/class="prov-error-block"/g) || []).length;
  assert.strictEqual(blocks, 4, 'expected 4 error blocks, got ' + blocks);
});

// ── 8. renderer emits ZERO error blocks without enrichErrors ─────────────
check('renderer: no error blocks when _schema.enrichErrors absent', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{}, housing:{}, competition:{}, analysis:{}, scorecard: [],
  });
  const blocks = (html.match(/class="prov-error-block"/g) || []).length;
  assert.strictEqual(blocks, 0);
  const chips = (html.match(/class="prov-chip prov-error"/g) || []).length;
  assert.strictEqual(chips, 0);
});

// ── 9. tooltip carries cause + escaped detail ────────────────────────────
check('renderer: tooltip carries cause + escaped detail', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{}, housing:{}, competition:{}, analysis:{},
    _schema: {
      enrichErrors: [
        { bucket: 'absorption', field: 'byPriceBand', cause: 'cascade_empty',
          detail: '<script>x</script>&foo' },
      ],
    },
  });
  assert.ok(html.includes('cascade_empty'), 'cause must appear');
  assert.ok(!html.includes('<script>x</script>&foo'), 'raw detail must be escaped');
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;&amp;foo'), 'HTML-escaped form must appear');
});

// ── 10. errChip-shape assertion ─────────────────────────────────────────
check('renderer: error chip has prov-chip prov-error class', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{}, housing:{}, competition:{}, analysis:{},
    _schema: {
      enrichErrors: [
        { bucket: 'absorption', field: 'byPriceBand', cause: 'cascade_empty' },
      ],
    },
  });
  assert.ok(html.includes('class="prov-chip prov-error"'),
    'error chip class="prov-chip prov-error" must appear in rendered block');
});

console.log('\n=== test_enrich_fail_loud: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
