#!/usr/bin/env node
/**
 * V41-7 / R-1 — Erie/Butler ACS re-sweep seeder.
 *
 * Targets Forbes Capretto Homes Western PA / WNY footprint counties that
 * cold-miss on Supabase market_study.census_demographics. For each target
 * county, either
 *   (a) confirms coverage (>= 10 variable rows) and skips (default), or
 *   (b) refetches the full ACS variable set via Census API and upserts
 *       with a provenance _env envelope + provenance_log audit entry.
 *
 * Usage:
 *   node server/scripts/seed_erie_butler_acs.js [flags]
 *
 * Flags:
 *   --dry-run          Print plan; no writes.
 *   --target=<sf_cf>   Filter to one county, e.g. --target=42_049.
 *   --force            Refetch even when coverage is adequate.
 *   --year=<yyyy>      Use specific ACS vintage.
 *   --verbose          Per-row detail.
 *
 * Env required at runtime:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CENSUS_API_KEY
 *
 * Programmatic entry (for tests):
 *   const { runSeed } = require('./seed_erie_butler_acs');
 *   await runSeed({ supabase, censusKey, targets, flags, fetchImpl });
 */
'use strict';

// ── Forbes Capretto Homes footprint ─────────────────────────────────
// Key: `${stateFips}_${countyFips}` for Census API pairing.
const FOOTPRINT = Object.freeze([
  // Western PA (primary market)
  { fips: '42_003', name: 'Allegheny County, PA' },
  { fips: '42_005', name: 'Armstrong County, PA' },
  { fips: '42_007', name: 'Beaver County, PA' },
  { fips: '42_019', name: 'Butler County, PA' },
  { fips: '42_021', name: 'Cambria County, PA' },
  { fips: '42_039', name: 'Crawford County, PA' },
  { fips: '42_049', name: 'Erie County, PA' },
  { fips: '42_051', name: 'Fayette County, PA' },
  { fips: '42_059', name: 'Greene County, PA' },
  { fips: '42_063', name: 'Indiana County, PA' },
  { fips: '42_073', name: 'Lawrence County, PA' },
  { fips: '42_085', name: 'Mercer County, PA' },
  { fips: '42_125', name: 'Washington County, PA' },
  { fips: '42_129', name: 'Westmoreland County, PA' },
  // Western NY (secondary market)
  { fips: '36_029', name: 'Erie County, NY' },
  { fips: '36_055', name: 'Monroe County, NY' },
  { fips: '36_063', name: 'Niagara County, NY' },
]);

// ── ACS variable map (mirrors demographics.js ACS_VARS, kept local to
// avoid loading the route file which requires express).
const ACS_VARS = {
  population:         'B01003_001E',
  medianAge:          'B01002_001E',
  households:         'B11001_001E',
  avgHouseholdSize:   'B25010_001E',
  mhi:                'B19013_001E',
  perCapitaIncome:    'B19301_001E',
  ownerOccupied:      'B25003_002E',
  renterOccupied:     'B25003_003E',
  totalTenure:        'B25003_001E',
  povertyTotal:       'B17001_001E',
  povertyBelow:       'B17001_002E',
  totalHousingUnits:  'B25001_001E',
  vacantUnits:        'B25004_001E',
  built2020:          'B25034_002E',
  built2010:          'B25034_003E',
  built2000:          'B25034_005E',
  built1990:          'B25034_006E',
  built1980:          'B25034_007E',
  builtPre1980:       'B25034_009E',
};

const SENTINEL_PREFIXES = ['-666', '-777', '-888', '-999'];
const COVERAGE_THRESHOLD = 10;

function acsVal(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw);
  if (SENTINEL_PREFIXES.some(p => s.startsWith(p))) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseFlags(argv) {
  const flags = { dryRun: false, force: false, verbose: false, target: null, year: null };
  for (const a of argv) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a.startsWith('--target=')) flags.target = a.slice(9);
    else if (a.startsWith('--year=')) flags.year = Number(a.slice(7));
  }
  return flags;
}

function buildAcsUrl(year, stateFips, countyFips, apiKey) {
  const vars = Object.values(ACS_VARS).join(',');
  const base = 'https://api.census.gov/data';
  return `${base}/${year}/acs/acs5?get=NAME,${vars}&for=county:${countyFips}&in=state:${stateFips}&key=${apiKey}`;
}

async function fetchAcsForCounty({ stateFips, countyFips, year, censusKey, fetchImpl }) {
  const url = buildAcsUrl(year, stateFips, countyFips, censusKey);
  const fx = fetchImpl || globalThis.fetch;
  try {
    const res = await fx(url);
    if (!res || !res.ok) return { ok: false, url, status: res ? res.status : 0 };
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return { ok: false, url, status: 'empty' };
    const headers = data[0];
    const values = data[1];
    const out = {};
    for (const [friendly, code] of Object.entries(ACS_VARS)) {
      const idx = headers.indexOf(code);
      out[code] = idx >= 0 ? acsVal(values[idx]) : null;
    }
    const nameIdx = headers.indexOf('NAME');
    return { ok: true, url, values: out, name: nameIdx >= 0 ? values[nameIdx] : null, year };
  } catch (e) {
    return { ok: false, url, error: e && e.message };
  }
}

async function coverageCountForCounty(supabase, fips) {
  try {
    const { data, error } = await supabase
      .from('census_demographics')
      .select('variable_code', { count: 'exact', head: false })
      .eq('geography_fips', fips)
      .eq('geography_level', 'county');
    if (error) return 0;
    return Array.isArray(data) ? data.length : 0;
  } catch (_) { return 0; }
}

async function upsertDemographicRows({ supabase, fips, vintage, values, url, flags }) {
  const rows = Object.entries(values)
    .filter(([_, v]) => v !== null && v !== undefined)
    .map(([code, value]) => ({
      geography_fips: fips,
      geography_level: 'county',
      vintage,
      variable_code: code,
      value: typeof value === 'number' ? value : Number(value),
      dataset: 'acs5',
    }));
  if (!rows.length) return { written: 0 };
  if (flags.dryRun) return { written: 0, plan: rows.length };
  // Build _env envelope keyed by variable_code.
  const nowIso = new Date().toISOString();
  const env = {};
  for (const r of rows) {
    env[r.variable_code] = {
      provenance: 'measured',
      source_url: url,
      fetched_at: nowIso,
      confidence: 'high',
    };
  }
  // Attach env to first row as a representative carrier (the column lives on
  // every row per 004_provenance_columns.sql; one row per county is enough).
  rows[0]._env = env;
  const { error } = await supabase.from('census_demographics').upsert(rows, {
    onConflict: 'geography_fips,vintage,variable_code',
  });
  if (error) throw new Error('upsert failed: ' + error.message);
  return { written: rows.length };
}

async function logProvenance({ supabase, fips, vintage, values, url, flags, studyTarget }) {
  if (flags.dryRun) return { logged: 0 };
  const nowIso = new Date().toISOString();
  const rows = Object.entries(values)
    .filter(([_, v]) => v !== null && v !== undefined)
    .map(([code, value]) => ({
      study_target: studyTarget,
      bucket: 'demographics',
      field_path: `demographics.${code}`,
      value_text: String(value),
      provenance: 'measured',
      source_url: url,
      fetched_at: nowIso,
      confidence: 'high',
      step_tag: `v4.1.V41-7.acs5.${vintage}.reseed`,
      context: 'seed_erie_butler_acs',
    }));
  if (!rows.length) return { logged: 0 };
  try {
    const { error } = await supabase.from('provenance_log').insert(rows);
    if (error) return { logged: 0, error: error.message };
    return { logged: rows.length };
  } catch (e) {
    return { logged: 0, error: e && e.message };
  }
}

async function seedOne({ supabase, target, flags, censusKey, fetchImpl, yearsToTry }) {
  const [stateFips, countyFips] = target.fips.split('_');
  const existing = await coverageCountForCounty(supabase, target.fips);
  const hasCoverage = existing >= COVERAGE_THRESHOLD;
  if (hasCoverage && !flags.force) {
    return { fips: target.fips, name: target.name, action: 'skip_covered',
             existing, written: 0, logged: 0 };
  }
  // Try years in descending order; take first non-empty.
  let fetched = null;
  for (const yr of yearsToTry) {
    const r = await fetchAcsForCounty({ stateFips, countyFips, year: yr, censusKey, fetchImpl });
    if (r.ok && r.values) {
      // Reject if every var is null (API returned stub).
      const nonNull = Object.values(r.values).filter(v => v !== null).length;
      if (nonNull >= 3) { fetched = Object.assign({}, r, { vintage: yr }); break; }
    }
  }
  if (!fetched) {
    return { fips: target.fips, name: target.name, action: 'fetch_failed',
             existing, written: 0, logged: 0 };
  }
  const up = await upsertDemographicRows({
    supabase, fips: target.fips, vintage: fetched.vintage,
    values: fetched.values, url: fetched.url, flags,
  });
  const pl = await logProvenance({
    supabase, fips: target.fips, vintage: fetched.vintage,
    values: fetched.values, url: fetched.url, flags, studyTarget: target.name,
  });
  return {
    fips: target.fips, name: target.name,
    action: flags.dryRun ? 'plan_upsert' : 'upsert_ok',
    vintage: fetched.vintage, existing,
    written: up.written || up.plan || 0, logged: pl.logged || 0,
  };
}

async function runSeed({ supabase, censusKey, targets, flags, fetchImpl }) {
  if (!supabase) throw new Error('supabase client required');
  if (!censusKey) throw new Error('CENSUS_API_KEY required');
  const ftargets = targets || FOOTPRINT;
  const filtered = flags.target ? ftargets.filter(t => t.fips === flags.target) : ftargets;
  const yearsToTry = flags.year ? [flags.year]
    : (() => {
        const cy = new Date().getFullYear();
        return [cy - 2, cy - 3, cy - 4, cy - 5];
      })();
  const results = [];
  for (const t of filtered) {
    const r = await seedOne({ supabase, target: t, flags, censusKey, fetchImpl, yearsToTry });
    results.push(r);
    if (flags.verbose || !flags.dryRun) {
      console.log(`[seed] ${t.fips.padEnd(8)} ${t.name.padEnd(28)} → ${r.action}` +
                  ` (existing=${r.existing}, written=${r.written}, logged=${r.logged})`);
    }
  }
  return results;
}

// ── CLI entry ────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const flags = parseFlags(process.argv.slice(2));
    let supabase, censusKey;
    try {
      // Lazy-require so unit tests don't need the deps available.
      const { createClient } = require('@supabase/supabase-js');
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      censusKey = process.env.CENSUS_API_KEY;
    } catch (e) {
      console.error('[seed] failed to initialize Supabase/Census creds:', e.message);
      process.exit(1);
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !censusKey) {
      console.error('[seed] missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CENSUS_API_KEY');
      process.exit(1);
    }
    try {
      const results = await runSeed({ supabase, censusKey, flags });
      const sum = results.reduce((a, r) => ({
        touched: a.touched + (r.action === 'upsert_ok' ? 1 : 0),
        written: a.written + r.written,
        logged:  a.logged  + r.logged,
        failed:  a.failed  + (r.action === 'fetch_failed' ? 1 : 0),
        skipped: a.skipped + (r.action === 'skip_covered' ? 1 : 0),
      }), { touched: 0, written: 0, logged: 0, failed: 0, skipped: 0 });
      console.log('');
      console.log(`[seed] summary: ${sum.touched} touched, ${sum.skipped} skipped, ` +
                  `${sum.failed} failed, ${sum.written} rows written, ${sum.logged} audit entries`);
      process.exit(0);
    } catch (e) {
      console.error('[seed] fatal:', e && e.stack || e);
      process.exit(1);
    }
  })();
}

module.exports = {
  FOOTPRINT, ACS_VARS, COVERAGE_THRESHOLD,
  acsVal, buildAcsUrl, parseFlags,
  fetchAcsForCounty, coverageCountForCounty,
  upsertDemographicRows, logProvenance, seedOne, runSeed,
};
