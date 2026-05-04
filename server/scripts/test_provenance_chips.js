#!/usr/bin/env node
/**
 * V41-4 / R-4 — provenance-chip render contract.
 *
 * Verifies:
 *   1. pdf.js emits the chip CSS block (.prov-chip, .prov-measured, etc.)
 *   2. No chips render for a study without _env data.
 *   3. Top-level study._env map keyed by canonical path drives chip render.
 *   4. Per-bucket study.<bucket>._env map also works.
 *   5. Chip text is the expected short label (MEAS/DERIV/MODEL/LLM).
 *   6. title attribute carries source_url + fetched_at + confidence.
 *   7. HTML special chars in source_url are escaped.
 *   8. Enveloped fixture golden contains an expected set of provenance classes.
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

const { buildPDFHTML } = require('../routes/deliverables/pdf');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log('[PASS] ' + label); pass++; }
  catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// ── 1. CSS emitted ────────────────────────────────────────────────────────
check('chip CSS present in every render', () => {
  const html = buildPDFHTML({ geo:{}, demographics:{}, housing:{}, competition:{}, analysis:{} });
  for (const cls of ['.prov-chip{', '.prov-measured{', '.prov-derived{',
                     '.prov-modeled{', '.prov-llm{', '.prov-missing{']) {
    assert.ok(html.includes(cls), 'CSS class ' + cls + ' missing');
  }
});

// ── 2. No chips without _env ──────────────────────────────────────────────
check('no chips render without _env data', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{ population: 1000, mhi: 75000 },
    housing:{ totalUnits: 400 }, competition:{ activeListings: 5 }, analysis:{},
  });
  const count = (html.match(/class="prov-chip/g) || []).length;
  assert.strictEqual(count, 0);
});

// ── 3. Top-level _env table renders chips ────────────────────────────────
check('top-level study._env drives chip render', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{ population: 1000, mhi: 75000 },
    housing:{}, competition:{}, analysis:{},
    _env: {
      'demographics.population': { value: 1000, provenance: 'measured' },
      'demographics.mhi':        { value: 75000, provenance: 'derived' },
    },
  });
  // population renders in §1 Key Findings AND §3 Demographics; mhi the same.
  const count = (html.match(/class="prov-chip/g) || []).length;
  assert.ok(count >= 4, 'expected >= 4 chips, got ' + count);
  assert.ok(html.includes('>MEAS</span>'));
  assert.ok(html.includes('>DERIV</span>'));
});

// ── 4. Per-bucket _env also works ─────────────────────────────────────────
check('per-bucket <bucket>._env also drives render', () => {
  const html = buildPDFHTML({
    geo:{},
    demographics:{
      population: 1000,
      _env: { 'population': { value: 1000, provenance: 'llm' } },
    },
    housing:{}, competition:{}, analysis:{},
  });
  assert.ok(html.includes('>LLM</span>'));
});

// ── 5. Chip labels ────────────────────────────────────────────────────────
check('chip label table — measured/derived/modeled/llm/missing', () => {
  const env = {
    'demographics.population':    { value: 1, provenance: 'measured' },
    'demographics.mhi':           { value: 2, provenance: 'derived' },
    'competition.builderCount':   { value: 3, provenance: 'modeled' },
    'competition.medianListPrice':{ value: 4, provenance: 'llm' },
    'housing.totalUnits':         { value: 5, provenance: 'missing' },
  };
  const html = buildPDFHTML({
    geo:{}, demographics:{ population: 1, mhi: 2 },
    housing:{ totalUnits: 5 },
    competition:{ builderCount: 3, medianListPrice: 4 },
    analysis:{}, _env: env,
  });
  assert.ok(html.includes('>MEAS</span>'),   'MEAS');
  assert.ok(html.includes('>DERIV</span>'),  'DERIV');
  assert.ok(html.includes('>MODEL</span>'),  'MODEL');
  assert.ok(html.includes('>LLM</span>'),    'LLM');
  assert.ok(html.includes('>\u2014</span>'), 'em-dash for missing');
});

// ── 6. title tooltip carries metadata ─────────────────────────────────────
check('title tooltip carries source_url + fetched_at + confidence', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{ population: 1 }, housing:{}, competition:{}, analysis:{},
    _env: { 'demographics.population': {
      value: 1, provenance: 'measured',
      source_url: 'https://api.census.gov/data/2022/acs/acs5',
      fetched_at: '2026-04-10',
      confidence: 'high',
    } },
  });
  assert.ok(html.includes('https://api.census.gov/data/2022/acs/acs5'));
  assert.ok(html.includes('fetched 2026-04-10'));
  assert.ok(html.includes('conf: high'));
});

// ── 7. HTML escaping in source_url ────────────────────────────────────────
check('source_url with HTML special chars gets escaped in title attr', () => {
  const html = buildPDFHTML({
    geo:{}, demographics:{ population: 1 }, housing:{}, competition:{}, analysis:{},
    _env: { 'demographics.population': {
      value: 1, provenance: 'measured',
      source_url: '<script>x</script>&foo',
    } },
  });
  assert.ok(!html.includes('<script>x</script>&foo'),
    'raw script must be escaped');
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;&amp;foo'),
    'HTML-escaped form must appear');
});

// ── 8. Enveloped fixture golden sanity ────────────────────────────────────
check('study-enveloped golden contains expected provenance classes', () => {
  const gp = path.join(__dirname, 'fixtures', 'study-enveloped.pdf.html.golden');
  assert.ok(fs.existsSync(gp), 'golden must exist');
  const html = fs.readFileSync(gp, 'utf8');
  const measured = (html.match(/prov-chip prov-measured/g) || []).length;
  const derived  = (html.match(/prov-chip prov-derived/g)  || []).length;
  const modeled  = (html.match(/prov-chip prov-modeled/g)  || []).length;
  assert.ok(measured >= 10, 'measured chips: ' + measured);
  assert.ok(derived  >= 2,  'derived chips: '  + derived);
  assert.ok(modeled  >= 1,  'modeled chips: '  + modeled);
});

console.log('\n=== test_provenance_chips: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
