#!/usr/bin/env node
/**
 * V41-1 — Fixture-based snapshot test for deliverables/pdf.js.
 *
 * Loads representative studies (Cranberry, Newstead, Incomplete), calls
 * buildPDFHTML on each, and diffs against committed golden-master files.
 *
 * Incomplete fixture is preProcessed to attach _schema.errorSummary via
 * enforceSchema so the Data Quality appendix (v4.1 / V41-3 / H-8) is exercised.
 *
 * Usage:
 *   node scripts/test_deliverables_pdf.js           — run tests
 *   node scripts/test_deliverables_pdf.js --update  — regenerate goldens
 */
'use strict';
const fs   = require('fs');
const path = require('path');

// ── 1. Freeze Date so snapshots are deterministic ───────────────────────
const FIXED_EPOCH = Date.UTC(2026, 3, 22, 17, 0, 0); // 2026-04-22T17:00:00Z
const RealDate = Date;
class FrozenDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) return new RealDate(FIXED_EPOCH);
    return new RealDate(...args);
  }
  static now() { return FIXED_EPOCH; }
}
for (const k of Object.getOwnPropertyNames(RealDate)) {
  if (!(k in FrozenDate) && typeof RealDate[k] === 'function') {
    FrozenDate[k] = RealDate[k].bind(RealDate);
  }
}
global.Date = FrozenDate;

// ── 2. Intercept external deps (Module._load shim) ──────────────────────
const Module = require('module');
const origLoad = Module._load;
const fakeRouter = () => ({ post: () => {}, get: () => {}, use: () => {} });
const fakeExpress = Object.assign(() => ({ Router: fakeRouter }), { Router: fakeRouter });
Module._load = function(req, parent, ...rest) {
  if (req === 'express') return fakeExpress;
  if (req === 'puppeteer-core' || req === '@sparticuz/chromium') return {};
  return origLoad.call(this, req, parent, ...rest);
};

// ── 3. Load module under test ───────────────────────────────────────────
const { buildPDFHTML } = require('../routes/deliverables/pdf');
const { normalizeStudy, enforceSchema, SCHEMA_VERSION } = require('../lib/studySchema');

// ── 4. Locate fixtures + goldens ────────────────────────────────────────
const FIX_DIR = path.join(__dirname, 'fixtures');
const CASES = [
  { name: 'cranberry',  fixture: 'study-cranberry.json',  golden: 'study-cranberry.pdf.html.golden'  },
  { name: 'newstead',   fixture: 'study-newstead.json',   golden: 'study-newstead.pdf.html.golden'   },
  { name: 'incomplete', fixture: 'study-incomplete.json', golden: 'study-incomplete.pdf.html.golden',
    preProcess: (s) => {
      const canon = normalizeStudy(s);
      const r = enforceSchema(canon, { context: 'fixture:incomplete' });
      s._schema = { version: SCHEMA_VERSION, valid: r.valid, errorSummary: r.errorSummary };
      return s;
    } },
  // v4.1 / V41-4 / R-4 — enveloped study: exercises provChip rendering across §1/§3/§4/§6.
  { name: 'enveloped', fixture: 'study-enveloped.json', golden: 'study-enveloped.pdf.html.golden' },
];

const UPDATE = process.argv.includes('--update');

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a.charCodeAt(i) !== b.charCodeAt(i)) return i;
  return n;
}
function snippet(s, i, ctx = 80) {
  const start = Math.max(0, i - ctx);
  const end   = Math.min(s.length, i + ctx);
  return JSON.stringify(s.slice(start, end));
}

let ok = 0, fail = 0;
for (const c of CASES) {
  let study = JSON.parse(fs.readFileSync(path.join(FIX_DIR, c.fixture), 'utf8'));
  if (typeof c.preProcess === 'function') study = c.preProcess(study);
  let html;
  try {
    html = buildPDFHTML(study);
  } catch (err) {
    console.error(`[FAIL] ${c.name}: buildPDFHTML threw: ${err.message}`);
    console.error(err.stack);
    fail++;
    continue;
  }
  if (typeof html !== 'string' || html.length < 1000) {
    console.error(`[FAIL] ${c.name}: suspicious output (type=${typeof html}, len=${html && html.length})`);
    fail++;
    continue;
  }
  const goldenPath = path.join(FIX_DIR, c.golden);
  if (UPDATE || !fs.existsSync(goldenPath)) {
    fs.writeFileSync(goldenPath, html, 'utf8');
    console.log(`[WROTE] ${c.golden}  (${html.length.toLocaleString()} bytes)`);
    ok++;
    continue;
  }
  const golden = fs.readFileSync(goldenPath, 'utf8');
  if (golden === html) {
    console.log(`[PASS] ${c.name}  (${html.length.toLocaleString()} bytes byte-identical)`);
    ok++;
  } else {
    const i = firstDiff(golden, html);
    console.error(`[FAIL] ${c.name}: snapshot mismatch`);
    console.error(`  golden length:  ${golden.length.toLocaleString()}`);
    console.error(`  current length: ${html.length.toLocaleString()}`);
    console.error(`  first diff at offset ${i.toLocaleString()}`);
    console.error(`  golden near:  ${snippet(golden, i)}`);
    console.error(`  current near: ${snippet(html, i)}`);
    fail++;
  }
}
console.log(`\n=== test_deliverables_pdf: ${ok} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
