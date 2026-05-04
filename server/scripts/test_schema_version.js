#!/usr/bin/env node
/**
 * V41-11 / H-5 — test_schema_version.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { EXPECTED_SCHEMA_VERSION, assertSchemaVersion } = require('../lib/schemaVersion');

let pass = 0, fail = 0;
function check(label, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      r.then(() => { console.log('[PASS] ' + label); pass++; })
       .catch(e => { console.error('[FAIL] ' + label + ': ' + e.message); fail++; });
    } else {
      console.log('[PASS] ' + label); pass++;
    }
  } catch (e) { console.error('[FAIL] ' + label + ': ' + e.message); fail++; }
}

function makeSupa(maxVersion, { throwTableMissing = false, throwQuery = false } = {}) {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        order() { return chain; },
        limit() {
          if (throwTableMissing) return Promise.resolve({ data: null, error: { message: 'relation "schema_version" does not exist' } });
          if (throwQuery) throw new Error('network down');
          const data = maxVersion > 0 ? [{ version: maxVersion }] : [];
          return Promise.resolve({ data, error: null });
        },
      };
      return chain;
    },
  };
}

// 1. EXPECTED_SCHEMA_VERSION is a sane positive integer.
check('EXPECTED_SCHEMA_VERSION is positive integer >= 5', () => {
  assert.strictEqual(typeof EXPECTED_SCHEMA_VERSION, 'number');
  assert.ok(Number.isInteger(EXPECTED_SCHEMA_VERSION));
  assert.ok(EXPECTED_SCHEMA_VERSION >= 5);
});

// 2. Migration file exists + has expected DDL.
check('migration 005_schema_version.sql exists + contains CREATE TABLE', () => {
  const p = path.join(__dirname, '..', 'migrations', '005_schema_version.sql');
  assert.ok(fs.existsSync(p), '005_schema_version.sql missing');
  const sql = fs.readFileSync(p, 'utf8');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS market_study.schema_version'),
    'CREATE TABLE DDL missing');
  assert.ok(sql.includes('version     INTEGER'), 'version column missing');
  assert.ok(sql.includes('applied_at  TIMESTAMPTZ'), 'applied_at column missing');
  assert.ok(sql.includes('ON CONFLICT (version) DO NOTHING'), 'idempotent backfill missing');
  // Backfill rows 1..5 present.
  for (const v of [1, 2, 3, 4, 5]) {
    const re = new RegExp('\\(\\s*' + v + ',');
    assert.ok(re.test(sql), 'backfill row for version ' + v + ' missing');
  }
});

// 3. assertSchemaVersion passes when actual >= expected.
check('assertSchemaVersion passes when actual >= expected', async () => {
  const supa = makeSupa(EXPECTED_SCHEMA_VERSION);
  const r = await assertSchemaVersion(supa);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.version, EXPECTED_SCHEMA_VERSION);
});

// 4. assertSchemaVersion passes when actual > expected.
check('assertSchemaVersion passes when actual > expected', async () => {
  const supa = makeSupa(EXPECTED_SCHEMA_VERSION + 10);
  const r = await assertSchemaVersion(supa);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.version, EXPECTED_SCHEMA_VERSION + 10);
});

// 5. assertSchemaVersion throws when actual < expected.
check('assertSchemaVersion throws loud when actual < expected', async () => {
  const supa = makeSupa(EXPECTED_SCHEMA_VERSION - 1);
  let threw = false;
  try { await assertSchemaVersion(supa); }
  catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'SCHEMA_VERSION_TOO_OLD');
    assert.strictEqual(e.actual, EXPECTED_SCHEMA_VERSION - 1);
    assert.strictEqual(e.expected, EXPECTED_SCHEMA_VERSION);
    assert.ok(/expected >=/.test(e.message));
  }
  assert.ok(threw, 'must throw when actual < expected');
});

// 6. assertSchemaVersion handles null supabase gracefully.
check('assertSchemaVersion returns no_supabase when supabase is null', async () => {
  const r = await assertSchemaVersion(null);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no_supabase');
});

// 7. assertSchemaVersion handles missing table.
check('assertSchemaVersion returns table_missing when relation is absent', async () => {
  const supa = makeSupa(0, { throwTableMissing: true });
  const r = await assertSchemaVersion(supa);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'table_missing');
});

// 8. Custom expectedMin argument overrides default.
check('assertSchemaVersion respects custom expectedMin', async () => {
  const supa = makeSupa(10);
  const r = await assertSchemaVersion(supa, 3);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.expected, 3);
});

// 9. Query-failure path (non-error exception).
check('assertSchemaVersion returns query_failed on thrown exception', async () => {
  const supa = makeSupa(0, { throwQuery: true });
  const r = await assertSchemaVersion(supa);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'query_failed');
});

// Wait for async settles + print.
setTimeout(() => {
  console.log('\n=== test_schema_version: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  process.exit(fail === 0 ? 0 : 1);
}, 250);
