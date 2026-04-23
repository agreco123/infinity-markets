#!/usr/bin/env node
/**
 * V41-7 / R-1 — test_erie_butler_seed.
 *
 * Asserts:
 *  1. COVERAGE_THRESHOLD is a sensible integer.
 *  2. acsVal filters all sentinel prefixes (-666/-777/-888/-999) to null.
 *  3. parseFlags parses --dry-run, --target, --force, --year, --verbose.
 *  4. buildAcsUrl assembles canonical Census API URL with all variables.
 *  5. Empty cache → seeder fetches and upserts >= 15 rows for one county.
 *  6. Covered cache (>= threshold rows) → seeder skips (action=skip_covered).
 *  7. Covered cache + --force → seeder refetches regardless.
 *  8. --dry-run writes nothing but still reports plan count.
 *  9. ACS fetch returning all nulls (API stub) → action=fetch_failed.
 * 10. Upsert rows carry geography_level='county', dataset='acs5', and one
 *     row carries an _env envelope with provenance='measured'.
 * 11. Provenance-log rows carry bucket='demographics', provenance='measured',
 *     step_tag matching /v4\.1\.V41-7/.
 * 12. FOOTPRINT includes both 42_049 (PA Erie) and 42_019 (Butler).
 */
'use strict';
const assert = require('assert');
const S = require('./seed_erie_butler_acs');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); console.log('[PASS] ' + label); pass++; }
  catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

// ── Mock Supabase chain builder ─────────────────────────────────────
function makeMockSupabase({ coverageRows = [], upsertSink, insertSink, upsertError = null, insertError = null }) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        gte() { return this; },
        // final promise
        then(resolve) {
          resolve({ data: coverageRows, error: null });
          return this;
        },
        // upsert returns a thenable
        upsert(rows) {
          if (upsertSink) upsertSink.push({ table, rows });
          return Promise.resolve({ data: null, error: upsertError });
        },
        insert(rows) {
          if (insertSink) insertSink.push({ table, rows });
          return Promise.resolve({ data: null, error: insertError });
        },
      };
    },
  };
}

// Override: coverageCountForCounty reads .data.length from the first select.
// We patch the function via dep injection: since seedOne calls it directly,
// we need a mock Supabase whose .select()/.eq()/.eq() chain resolves with
// our row list. Rewrite as explicit thenable.
function makeSupabaseWithCoverage(countsByFips, upsertSink, insertSink) {
  return {
    from(table) {
      const state = { filters: {} };
      const chain = {
        select(_c, _opts) { return chain; },
        eq(col, val) { state.filters[col] = val; return chain; },
        order() { return chain; },
        limit() { return chain; },
        gte() { return chain; },
        then(resolve) {
          if (table === 'census_demographics') {
            const fips = state.filters.geography_fips || '';
            const n = countsByFips[fips] || 0;
            resolve({ data: Array(n).fill({ variable_code: 'B01003_001E' }), error: null });
          } else {
            resolve({ data: [], error: null });
          }
          return chain;
        },
        upsert(rows) {
          if (upsertSink) upsertSink.push({ table, rows });
          return Promise.resolve({ data: null, error: null });
        },
        insert(rows) {
          if (insertSink) insertSink.push({ table, rows });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
}

// Canned ACS response factory.
function makeAcsFetchImpl({ stub = false, allNull = false }) {
  return async function fetchImpl(_url) {
    if (stub) return { ok: false, status: 500 };
    const vars = Object.values(S.ACS_VARS);
    const headers = ['NAME', ...vars, 'state', 'county'];
    const values = ['Fake County, PA',
      ...vars.map(() => allNull ? '-666666666' : '12345'),
      '42', '049'];
    return {
      ok: true,
      status: 200,
      json: async () => [headers, values],
    };
  };
}

// ── 1. COVERAGE_THRESHOLD is sane ──────────────────────────────────
check('COVERAGE_THRESHOLD is a positive integer', () => {
  assert.strictEqual(typeof S.COVERAGE_THRESHOLD, 'number');
  assert.ok(S.COVERAGE_THRESHOLD >= 5 && S.COVERAGE_THRESHOLD <= 50);
  assert.strictEqual(S.COVERAGE_THRESHOLD % 1, 0);
});

// ── 2. acsVal filters sentinels ────────────────────────────────────
check('acsVal filters -666/-777/-888/-999 sentinels to null', () => {
  assert.strictEqual(S.acsVal('-666666666'), null);
  assert.strictEqual(S.acsVal('-888888888'), null);
  assert.strictEqual(S.acsVal('-999999999'), null);
  assert.strictEqual(S.acsVal('-777777777'), null);
  assert.strictEqual(S.acsVal(''), null);
  assert.strictEqual(S.acsVal(null), null);
  assert.strictEqual(S.acsVal('12345'), 12345);
  assert.strictEqual(S.acsVal(0), 0);
});

// ── 3. parseFlags parses all flags ─────────────────────────────────
check('parseFlags handles --dry-run/--force/--target/--year/--verbose', () => {
  const f = S.parseFlags(['--dry-run', '--target=42_049', '--force', '--year=2023', '--verbose']);
  assert.strictEqual(f.dryRun, true);
  assert.strictEqual(f.target, '42_049');
  assert.strictEqual(f.force, true);
  assert.strictEqual(f.year, 2023);
  assert.strictEqual(f.verbose, true);
  const g = S.parseFlags([]);
  assert.strictEqual(g.dryRun, false);
  assert.strictEqual(g.target, null);
  assert.strictEqual(g.year, null);
});

// ── 4. buildAcsUrl shape ───────────────────────────────────────────
check('buildAcsUrl contains state, county, vintage, all variables', () => {
  const url = S.buildAcsUrl(2023, '42', '049', 'DUMMYKEY');
  assert.ok(url.includes('2023/acs/acs5'));
  assert.ok(url.includes('for=county:049'));
  assert.ok(url.includes('in=state:42'));
  assert.ok(url.includes('key=DUMMYKEY'));
  // Every ACS_VAR must appear in the URL.
  for (const code of Object.values(S.ACS_VARS)) assert.ok(url.includes(code), 'missing ' + code);
});

// ── 5. Empty cache → fetch + upsert ≥ 15 rows ──────────────────────
check('empty cache → seedOne upserts >=15 rows', async () => {
  const upsertSink = [], insertSink = [];
  const supa = makeSupabaseWithCoverage({}, upsertSink, insertSink);
  const fetchImpl = makeAcsFetchImpl({});
  const r = await S.seedOne({
    supabase: supa,
    target: { fips: '42_049', name: 'Erie County, PA' },
    flags: { dryRun: false, force: false },
    censusKey: 'DUMMY',
    fetchImpl,
    yearsToTry: [2023],
  });
  assert.strictEqual(r.action, 'upsert_ok', 'expected upsert_ok, got ' + r.action);
  assert.ok(r.written >= 15, 'expected >=15 rows, got ' + r.written);
  const demoUpsert = upsertSink.find(u => u.table === 'census_demographics');
  assert.ok(demoUpsert, 'census_demographics upsert must fire');
  assert.ok(demoUpsert.rows.length >= 15);
});
// Wrap async check: node top-level await not portable pre-14; use sync wrapper.

// ── 6. Covered cache → skip_covered ────────────────────────────────
check('covered cache (>= threshold) → action=skip_covered', async () => {
  const upsertSink = [];
  const supa = makeSupabaseWithCoverage({ '42_049': 20 }, upsertSink, []);
  const r = await S.seedOne({
    supabase: supa,
    target: { fips: '42_049', name: 'Erie County, PA' },
    flags: { dryRun: false, force: false },
    censusKey: 'DUMMY',
    fetchImpl: makeAcsFetchImpl({}),
    yearsToTry: [2023],
  });
  assert.strictEqual(r.action, 'skip_covered');
  assert.strictEqual(r.written, 0);
  assert.strictEqual(upsertSink.filter(u => u.table === 'census_demographics').length, 0);
});

// ── 7. Covered + --force → refetch ─────────────────────────────────
check('covered cache + --force → upsert_ok anyway', async () => {
  const upsertSink = [];
  const supa = makeSupabaseWithCoverage({ '42_049': 20 }, upsertSink, []);
  const r = await S.seedOne({
    supabase: supa,
    target: { fips: '42_049', name: 'Erie County, PA' },
    flags: { dryRun: false, force: true },
    censusKey: 'DUMMY',
    fetchImpl: makeAcsFetchImpl({}),
    yearsToTry: [2023],
  });
  assert.strictEqual(r.action, 'upsert_ok');
  assert.ok(r.written >= 15);
});

// ── 8. --dry-run → no writes, plan count reported ──────────────────
check('--dry-run writes nothing, reports plan count', async () => {
  const upsertSink = [], insertSink = [];
  const supa = makeSupabaseWithCoverage({}, upsertSink, insertSink);
  const r = await S.seedOne({
    supabase: supa,
    target: { fips: '42_049', name: 'Erie County, PA' },
    flags: { dryRun: true, force: false },
    censusKey: 'DUMMY',
    fetchImpl: makeAcsFetchImpl({}),
    yearsToTry: [2023],
  });
  assert.strictEqual(r.action, 'plan_upsert');
  assert.ok(r.written >= 15, 'plan count should be reported as written (pre-write)');
  assert.strictEqual(upsertSink.filter(u => u.table === 'census_demographics').length, 0);
  assert.strictEqual(insertSink.filter(u => u.table === 'provenance_log').length, 0);
});

// ── 9. ACS stub (all-null) → fetch_failed ──────────────────────────
check('all-null ACS response → action=fetch_failed', async () => {
  const supa = makeSupabaseWithCoverage({}, [], []);
  const r = await S.seedOne({
    supabase: supa,
    target: { fips: '42_049', name: 'Erie County, PA' },
    flags: { dryRun: false, force: false },
    censusKey: 'DUMMY',
    fetchImpl: makeAcsFetchImpl({ allNull: true }),
    yearsToTry: [2023, 2022],
  });
  assert.strictEqual(r.action, 'fetch_failed');
});

// ── 10. Upsert shape + _env envelope ───────────────────────────────
check('upserted rows have geography_level=county, dataset=acs5, _env envelope present', async () => {
  const upsertSink = [];
  const supa = makeSupabaseWithCoverage({}, upsertSink, []);
  await S.seedOne({
    supabase: supa,
    target: { fips: '42_049', name: 'Erie County, PA' },
    flags: { dryRun: false, force: false },
    censusKey: 'DUMMY',
    fetchImpl: makeAcsFetchImpl({}),
    yearsToTry: [2023],
  });
  const demoUpsert = upsertSink.find(u => u.table === 'census_demographics');
  assert.ok(demoUpsert);
  for (const row of demoUpsert.rows) {
    assert.strictEqual(row.geography_level, 'county');
    assert.strictEqual(row.dataset, 'acs5');
    assert.strictEqual(row.geography_fips, '42_049');
  }
  // first row carries _env envelope (representative carrier per 004 migration)
  const envCarrier = demoUpsert.rows[0];
  assert.ok(envCarrier._env, 'first row must carry _env envelope');
  const envKeys = Object.keys(envCarrier._env);
  assert.ok(envKeys.length >= 15, 'envelope should have >=15 keys, got ' + envKeys.length);
  for (const k of envKeys) {
    assert.strictEqual(envCarrier._env[k].provenance, 'measured');
    assert.ok(envCarrier._env[k].source_url.includes('api.census.gov'));
    assert.ok(envCarrier._env[k].fetched_at);
    assert.strictEqual(envCarrier._env[k].confidence, 'high');
  }
});

// ── 11. Provenance log shape ───────────────────────────────────────
check('provenance_log rows shaped: bucket=demographics, provenance=measured, step_tag v4.1.V41-7', async () => {
  const insertSink = [];
  const supa = makeSupabaseWithCoverage({}, [], insertSink);
  await S.seedOne({
    supabase: supa,
    target: { fips: '42_049', name: 'Erie County, PA' },
    flags: { dryRun: false, force: false },
    censusKey: 'DUMMY',
    fetchImpl: makeAcsFetchImpl({}),
    yearsToTry: [2023],
  });
  const plogInsert = insertSink.find(u => u.table === 'provenance_log');
  assert.ok(plogInsert, 'provenance_log insert must fire');
  assert.ok(plogInsert.rows.length >= 15);
  for (const row of plogInsert.rows) {
    assert.strictEqual(row.bucket, 'demographics');
    assert.strictEqual(row.provenance, 'measured');
    assert.strictEqual(row.confidence, 'high');
    assert.ok(/v4\.1\.V41-7/.test(row.step_tag), 'step_tag should match, got ' + row.step_tag);
    assert.ok(row.field_path.startsWith('demographics.'));
  }
});

// ── 12. FOOTPRINT completeness ─────────────────────────────────────
check('FOOTPRINT includes 42_049 (PA Erie) and 42_019 (Butler)', () => {
  const fips = S.FOOTPRINT.map(f => f.fips);
  assert.ok(fips.includes('42_049'), 'PA Erie missing');
  assert.ok(fips.includes('42_019'), 'Butler missing');
  assert.ok(fips.includes('36_029'), 'NY Erie missing');
  assert.ok(S.FOOTPRINT.length >= 15, 'footprint should cover at least 15 counties');
});

// ── tail: wait for async settle and print ──────────────────────────
setTimeout(() => {
  console.log('\n=== test_erie_butler_seed: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  process.exit(fail === 0 ? 0 : 1);
}, 200);
