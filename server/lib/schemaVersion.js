/**
 * V41-11 / H-5 — schema-version assertion helper.
 *
 * Keeps the lib module load-safe: no side effects on require(); the
 * assertion runs only when explicitly called, so tests and CLI tooling
 * that don't touch the DB remain unaffected.
 *
 * Contract:
 *   assertSchemaVersion(supabase, expectedMin = EXPECTED_SCHEMA_VERSION)
 *   Returns { ok: true, version } on success.
 *   Throws Error('schema_version_too_old: expected >=N, actual M, ...') on failure.
 *   Returns { ok: false, reason: 'no_supabase' } when supabase is null/undefined.
 *   Returns { ok: false, reason: 'table_missing' } when the schema_version
 *   table can't be read (pre-005 deploys).
 */
'use strict';

const EXPECTED_SCHEMA_VERSION = 5;

async function assertSchemaVersion(supabase, expectedMin) {
  const expected = typeof expectedMin === 'number' && expectedMin > 0
    ? expectedMin : EXPECTED_SCHEMA_VERSION;
  if (!supabase || typeof supabase.from !== 'function') {
    return { ok: false, reason: 'no_supabase', expected };
  }
  let actual = 0;
  try {
    const { data, error } = await supabase
      .from('schema_version')
      .select('version')
      .order('version', { ascending: false })
      .limit(1);
    if (error) {
      return { ok: false, reason: 'table_missing', expected, error: error.message };
    }
    if (Array.isArray(data) && data.length && Number.isFinite(Number(data[0].version))) {
      actual = Number(data[0].version);
    }
  } catch (e) {
    return { ok: false, reason: 'query_failed', expected, error: e && e.message };
  }
  if (actual < expected) {
    const msg = `schema_version_too_old: expected >=${expected}, actual ${actual}. ` +
                `Apply pending migrations in server/migrations/ then retry.`;
    const err = new Error(msg);
    err.code = 'SCHEMA_VERSION_TOO_OLD';
    err.expected = expected;
    err.actual = actual;
    throw err;
  }
  return { ok: true, version: actual, expected };
}

module.exports = {
  EXPECTED_SCHEMA_VERSION,
  assertSchemaVersion,
};
