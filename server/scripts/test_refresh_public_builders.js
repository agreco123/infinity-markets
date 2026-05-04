#!/usr/bin/env node
/**
 * V41P-4 — test_refresh_public_builders.
 */
'use strict';
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

const R = require('./refresh_public_builders');
const { extractEdgarMetrics, buildEmptyBuilderProfile } = require('../routes/competition');

let pass = 0, fail = 0;
function check(label, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      r.then(() => { console.log('[PASS] ' + label); pass++; })
       .catch(e => { console.error('[FAIL] ' + label + ': ' + e.message); fail++; });
    } else { console.log('[PASS] ' + label); pass++; }
  } catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// 1. CANONICAL_BUILDERS covers the 10 Forbes-Capretto peer set.
check('CANONICAL_BUILDERS lists all 10 public homebuilders', () => {
  assert.strictEqual(R.CANONICAL_BUILDERS.length, 10);
  const tickers = R.CANONICAL_BUILDERS.map(b => b.ticker).sort();
  for (const t of ['NVR','LEN','DHI','PHM','TOL','KBH','MDC','TMHC','MHO','LGIH']) {
    assert.ok(tickers.includes(t), 'missing ticker ' + t);
  }
  for (const b of R.CANONICAL_BUILDERS) {
    assert.ok(/^\d{10}$/.test(b.cik), b.ticker + ' cik not 10-digit: ' + b.cik);
    assert.ok(b.name && b.name.length > 2);
  }
});

// 2. parseFlags handles all options.
check('parseFlags handles --dry-run, --verbose, --ticker, --no-sleep', () => {
  const f = R.parseFlags(['--dry-run', '--verbose', '--ticker=tol', '--no-sleep']);
  assert.strictEqual(f.dryRun, true);
  assert.strictEqual(f.verbose, true);
  assert.strictEqual(f.ticker, 'TOL');
  assert.strictEqual(f.noSleep, true);
  const g = R.parseFlags([]);
  assert.strictEqual(g.dryRun, false);
  assert.strictEqual(g.ticker, null);
});

// 3. Dry-run does not write even if supabase is provided.
check('runRefresh --dry-run does not invoke supabase.insert', async () => {
  const fetchImpl = async (url) => {
    const m = url.match(/CIK(\d+)\.json/);
    const cik = m ? m[1] : '0';
    return {
      ok: true, status: 200,
      json: async () => ({
        facts: {
          'us-gaap': {
            Revenues: { units: { USD: [{ end: '2024-12-31', val: 10e9, form: '10-K' }] } },
            GrossProfit: { units: { USD: [{ end: '2024-12-31', val: 2.2e9, form: '10-K' }] } },
          },
        },
        cik,
      }),
    };
  };
  const writeSink = [];
  const supa = {
    from() {
      return {
        delete() { return this; },
        eq() { return this; },
        in() { writeSink.push('in'); return Promise.resolve({ error: null }); },
        insert(rows) { writeSink.push({ rows }); return Promise.resolve({ data: null, error: null }); },
      };
    },
  };
  const out = await R.runRefresh({
    supabase: supa, extractEdgarMetrics, buildEmptyBuilderProfile,
    fetchImpl, flags: { dryRun: true, noSleep: true, ticker: 'TOL' },
  });
  assert.strictEqual(out.dryRun, true);
  assert.strictEqual(out.persisted, 0);
  assert.strictEqual(writeSink.length, 0, 'no writes expected in dry-run');
  assert.strictEqual(out.results.length, 1);
  assert.strictEqual(out.results[0].ok, true);
});

// 4. Non-dry-run writes expected row shape.
check('runRefresh persists with correct row shape when not dry-run', async () => {
  const fetchImpl = async () => ({
    ok: true, status: 200,
    json: async () => ({
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [{ end: '2024-10-31', val: 10850000000, form: '10-K' }] } },
          GrossProfit: { units: { USD: [{ end: '2024-10-31', val: 2700000000, form: '10-K' }] } },
          NetIncomeLoss: { units: { USD: [{ end: '2024-10-31', val: 1.5e9, form: '10-K' }] } },
        },
        'tol': {
          HomesSettled: { units: { 'pure': [{ end: '2024-10-31', val: 9800, form: '10-K' }] } },
        },
      },
    }),
  });
  const insertedRows = [];
  const supa = {
    from() {
      return {
        delete() { return this; },
        eq() { return this; },
        in() { return Promise.resolve({ error: null }); },
        insert(rows) { insertedRows.push(...rows); return Promise.resolve({ data: null, error: null }); },
      };
    },
  };
  const out = await R.runRefresh({
    supabase: supa, extractEdgarMetrics, buildEmptyBuilderProfile,
    fetchImpl, flags: { dryRun: false, noSleep: true, ticker: 'TOL' },
  });
  assert.strictEqual(out.persisted, 1);
  assert.strictEqual(insertedRows.length, 1);
  const row = insertedRows[0];
  assert.strictEqual(row.study_target, 'global_public_builders');
  assert.strictEqual(row.builder_type, 'public');
  assert.strictEqual(row.ticker_symbol, 'TOL');
  assert.strictEqual(row.builder_name, 'Toll Brothers');
  assert.strictEqual(row.filing_period_end, '2024-10-31');
  assert.strictEqual(row.revenue_usd, 10850000000);
  assert.strictEqual(row.homes_delivered, 9800);
  // V41-10 + V41P-6 cascade should set these:
  assert.ok(row.average_selling_price > 0, 'asp should derive');
  assert.strictEqual(row.homes_delivered_end, '2024-10-31');
  assert.ok(/rev\/homesDelivered|AverageSellingPrice/i.test(String(row.asp_source || '')));
});

// 5. Failed fetch does not block other builders.
check('fetch-fail on one builder does not abort the run', async () => {
  let callIdx = 0;
  const fetchImpl = async (url) => {
    callIdx++;
    if (callIdx === 1) throw new Error('simulated network blip');
    return {
      ok: true, status: 200,
      json: async () => ({
        facts: { 'us-gaap': {
          Revenues: { units: { USD: [{ end: '2024-12-31', val: 5e9, form: '10-K' }] } },
          GrossProfit: { units: { USD: [{ end: '2024-12-31', val: 1.2e9, form: '10-K' }] } },
        }},
      }),
    };
  };
  const out = await R.runRefresh({
    supabase: null, extractEdgarMetrics, buildEmptyBuilderProfile,
    fetchImpl, flags: { dryRun: true, noSleep: true },
  });
  assert.strictEqual(out.results.length, 10);
  assert.strictEqual(out.results.filter(r => !r.ok).length, 1);
  assert.strictEqual(out.results.filter(r => r.ok).length, 9);
});

// 6. --ticker filter restricts the set.
check('--ticker=NVR restricts to one builder', async () => {
  const fetchImpl = async () => ({
    ok: true, status: 200,
    json: async () => ({ facts: { 'us-gaap': {} } }),
  });
  const out = await R.runRefresh({
    supabase: null, extractEdgarMetrics, buildEmptyBuilderProfile,
    fetchImpl, flags: { dryRun: true, noSleep: true, ticker: 'NVR' },
  });
  assert.strictEqual(out.results.length, 1);
  assert.strictEqual(out.results[0].builder.ticker, 'NVR');
});

// 7. rowFromProfile shape sanity.
check('rowFromProfile builds every expected column', () => {
  const p = {
    name: 'NVR Inc.', ticker: 'NVR', cik: '0000906163',
    revenueUsd: 10e9, grossProfitUsd: 2.8e9, grossMarginPct: 28.0,
    netIncomeUsd: 1.3e9, homesDelivered: 22000, asp: 450000,
    cancelRate: 12.5, backlogUnits: 9500, backlogValueUsd: 4.2e9,
    filingPeriodEnd: '2024-12-31', filingForm: '10-K',
    homesDeliveredEnd: '2024-12-31', _aspSource: 'derived:rev/homesDelivered',
    _aspReason: null, _aspRevEnd: null, _aspDelEnd: null,
    sourceUrl: 'https://data.sec.gov/...', _stepTag: 'v4.1.2.V41P-4.refresh',
  };
  const row = R.rowFromProfile(p);
  assert.strictEqual(row.study_target, 'global_public_builders');
  assert.strictEqual(row.revenue_usd, 10e9);
  assert.strictEqual(row.homes_delivered_end, '2024-12-31');
  assert.strictEqual(row.asp_source, 'derived:rev/homesDelivered');
  assert.strictEqual(row.filing_form, '10-K');
  assert.strictEqual(row.ticker_symbol, 'NVR');
});

// 8. fetchCompanyFacts URL + User-Agent shape.
check('fetchCompanyFacts sends User-Agent + hits companyfacts endpoint', async () => {
  let seenUrl = null, seenUA = null;
  const fetchImpl = async (url, opts) => {
    seenUrl = url;
    seenUA = opts && opts.headers && opts.headers['User-Agent'];
    return { ok: true, status: 200, json: async () => ({ facts: {} }) };
  };
  const out = await R.fetchCompanyFacts('0000906163', { fetchImpl });
  assert.ok(seenUrl.includes('data.sec.gov'));
  assert.ok(seenUrl.includes('CIK0000906163.json'));
  assert.ok(seenUA && /InfinityMarkets/.test(seenUA));
  assert.ok(out.data && typeof out.data === 'object');
});

// 9. formatTable renders all rows non-empty.
check('formatTable renders header + body for a result set', () => {
  const rs = [
    { builder: R.CANONICAL_BUILDERS[0], profile: {
      ticker: 'NVR', name: 'NVR Inc.',
      revenueUsd: 10e9, grossMarginPct: 28.0, homesDelivered: 22000, asp: 450000,
      cancelRate: 12.5, filingPeriodEnd: '2024-12-31',
    }, ok: true },
  ];
  const out = R.formatTable(rs);
  assert.ok(out.includes('NVR'));
  assert.ok(out.includes('$10000M') || out.includes('10000M'));
  assert.ok(out.includes('2024-12-31'));
});

// Tail: wait for async settles.
setTimeout(() => {
  console.log('\n=== test_refresh_public_builders: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  process.exit(fail === 0 ? 0 : 1);
}, 250);
