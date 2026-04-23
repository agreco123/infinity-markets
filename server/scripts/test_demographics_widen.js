/**
 * test_demographics_widen.js — v3.0 Phase 2 Step 5
 *
 * Exercises fetchExtendedDemographics() from server/routes/demographics.js
 * via textual extraction. Confirms:
 *   - Age cohorts assemble into a 5-bucket array
 *   - Education surfaces Bachelor's + HS + Graduate percentages
 *   - Tenure history surfaces 5yr trend + median years
 *   - IRS SOI migration surfaces inflow + AGI + origin MSA
 *   - Missing rows degrade fields to null (not throw)
 *   - Provenance _sources tags carry measured labels when data present
 *   - Null geoFips / empty data paths return null, not throw
 */

const fs = require('fs');
const path = require('path');

const DEMO = path.resolve(__dirname, '../routes/demographics.js');
const src = fs.readFileSync(DEMO, 'utf8');

function cut(label, re) {
  const m = src.match(re);
  if (!m) { console.error('[extract-fail]', label); process.exit(2); }
  return m[0];
}

// Extract fetchExtendedDemographics body
const fetchSrc = cut('fetchExtendedDemographics', /async function fetchExtendedDemographics\([\s\S]*?\n\}\n/);

// Build executable closure
const fetchExt = new Function('supabase','stateFips','countyFips',
  'return (async () => { ' +
  fetchSrc.replace(/^async function fetchExtendedDemographics\([^)]*\)\s*\{/, '').replace(/\}\n?$/, '') +
  ' })();'
);

// Mock Supabase long-format rows for Butler PA (42019)
function makeSupabase(rows) {
  return {
    from() {
      let filtered = rows.slice();
      return {
        select() { return this; },
        eq(col, val) {
          filtered = filtered.filter(r => r[col] === val);
          return Promise.resolve({ data: filtered, error: null });
        },
      };
    },
  };
}

const butler = [
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'agePct_under18', value: 19.4, vintage: 2022, dataset: 'acs5' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'agePct_18_24',   value:  7.8, vintage: 2022, dataset: 'acs5' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'agePct_25_44',   value: 23.9, vintage: 2022, dataset: 'acs5' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'agePct_45_64',   value: 28.1, vintage: 2022, dataset: 'acs5' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'agePct_65plus',  value: 20.8, vintage: 2022, dataset: 'acs5' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'edu_hsGradPct',    value: 94.8, vintage: 2022, dataset: 'acs5' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'edu_bachelorsPct', value: 35.2, vintage: 2022, dataset: 'acs5' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'edu_graduatePct',  value: 13.1, vintage: 2022, dataset: 'acs5' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'tenure_ownerPctTrend_5yr', value:  0.4, vintage: 2022, dataset: 'acs5' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'tenure_medianYearsInHome', value: 12.8, vintage: 2022, dataset: 'acs5' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'migration_netInflow', value:    687, vintage: 2022, dataset: 'irs_soi' },
  { geography_fips: '42019', geography_name: 'Butler County, PA', variable_code: 'migration_netAGI',    value:  42315, vintage: 2022, dataset: 'irs_soi' },
];

let passed = 0, failed = 0;
function ok(label, cond, info='') {
  if (cond) { passed++; console.log('  OK   ' + label); }
  else      { failed++; console.log('  FAIL ' + label + (info ? '  ::  '+info : '')); }
}

(async () => {
  // 1. Null guards
  ok('null supabase returns null',          (await fetchExt(null, '42', '019')) === null);
  ok('null stateFips returns null',         (await fetchExt(makeSupabase([]), null, '019')) === null);
  ok('null countyFips returns null',        (await fetchExt(makeSupabase([]), '42', null)) === null);
  ok('empty result returns null',           (await fetchExt(makeSupabase([]), '42', '019')) === null);

  // 2. Full Butler result
  const r = await fetchExt(makeSupabase(butler), '42', '019');
  ok('result is object', r && typeof r === 'object');
  ok('geographyName carried', r.geographyName === 'Butler County, PA');
  ok('vintage carried', r.vintage === 2022);

  // Age cohorts
  ok('ageCohorts is array of 5',  Array.isArray(r.ageCohorts) && r.ageCohorts.length === 5);
  ok('ageCohorts[0].cohort=Under 18', r.ageCohorts[0].cohort === 'Under 18');
  ok('ageCohorts[0].pct=19.4',        r.ageCohorts[0].pct === 19.4);
  ok('ageCohorts[1].pct=7.8',         r.ageCohorts[1].pct === 7.8);
  ok('ageCohorts[2].pct=23.9',        r.ageCohorts[2].pct === 23.9);
  ok('ageCohorts[3].pct=28.1',        r.ageCohorts[3].pct === 28.1);
  ok('ageCohorts[4].pct=20.8',        r.ageCohorts[4].pct === 20.8);
  const totalPct = r.ageCohorts.reduce((a,b)=>a+b.pct,0);
  ok('ageCohorts sum to ~100%', Math.abs(totalPct - 100) < 0.5, `sum=${totalPct.toFixed(2)}`);

  // Education
  ok('education is object',                   r.education && typeof r.education === 'object');
  ok('education.bachelorsOrHigherPct=35.2',   r.education.bachelorsOrHigherPct === 35.2);
  ok('education.highSchoolOrHigherPct=94.8',  r.education.highSchoolOrHigherPct === 94.8);
  ok('education.graduateDegreePct=13.1',      r.education.graduateDegreePct === 13.1);

  // Tenure
  ok('tenure is object',                        r.tenure && typeof r.tenure === 'object');
  ok('tenure.ownershipTrend5yrPct=0.4',         r.tenure.ownershipTrend5yrPct === 0.4);
  ok('tenure.medianYearsInCurrentHome=12.8',    r.tenure.medianYearsInCurrentHome === 12.8);

  // Migration
  ok('migration is object',                        r.migration && typeof r.migration === 'object');
  ok('migration.netHouseholdInflow=687',           r.migration.netHouseholdInflow === 687);
  ok('migration.netAGI_000=42315',                 r.migration.netAGI_000 === 42315);

  // Provenance tags
  ok('_sources.ageCohorts mentions B01001',    String(r._sources.ageCohorts).includes('B01001'));
  ok('_sources.education mentions S1501',      String(r._sources.education).includes('S1501'));
  ok('_sources.tenure mentions B25003',        String(r._sources.tenure).includes('B25003'));
  ok('_sources.migration mentions IRS',        String(r._sources.migration).includes('IRS'));

  // 3. Partial degrade — only age rows present; other sections null
  const partial = butler.filter(r => r.variable_code.startsWith('agePct_'));
  const rp = await fetchExt(makeSupabase(partial), '42', '019');
  ok('partial: ageCohorts still populated', Array.isArray(rp.ageCohorts));
  ok('partial: education null',             rp.education === null);
  ok('partial: tenure null',                rp.tenure === null);
  ok('partial: migration null',             rp.migration === null);
  ok('partial: _sources.education null',    rp._sources.education === null);
  ok('partial: _sources.ageCohorts set',    rp._sources.ageCohorts !== null);

  // 4. FIPS zero-pad: stateFips '4' countyFips '19' must still resolve '42019'… we pass '4' and '19' but helper pads to '00042019'. Need to check the 2+3 padding.
  // Mock uses strict .eq(geography_fips, geoFips), so let's confirm: stateFips '42' countyFips '19' → '42019'
  const padded = await fetchExt(makeSupabase(butler), '42', '19');
  ok('FIPS padding 42 + 19 → 42019',         Array.isArray(padded?.ageCohorts));

  // 5. Padding sanity: state '4' county '19' → '00400019' (wrong) or '042019' per our pad2+pad3
  //    Implementation pads state to 2 and county to 3, so '4' + '19' → '04' + '019' = '04019' which won't match '42019' — correct behavior
  const misfit = await fetchExt(makeSupabase(butler), '4', '19');
  ok('misfit FIPS returns null (no match)', misfit === null);

  // 6. No ageCohorts data (all other buckets still deliver) — ageCohorts null, rest present
  const noAge = butler.filter(r => !r.variable_code.startsWith('agePct_'));
  const rNoAge = await fetchExt(makeSupabase(noAge), '42', '019');
  ok('noAge: ageCohorts null',         rNoAge.ageCohorts === null);
  ok('noAge: education populated',     rNoAge.education && rNoAge.education.bachelorsOrHigherPct === 35.2);
  ok('noAge: tenure populated',        rNoAge.tenure   && rNoAge.tenure.medianYearsInCurrentHome === 12.8);
  ok('noAge: migration populated',     rNoAge.migration&& rNoAge.migration.netHouseholdInflow === 687);

  // 7. Supabase .eq error handling — mock throws
  const throwingSupa = { from() { throw new Error('connection failed'); } };
  const rErr = await fetchExt(throwingSupa, '42', '019');
  ok('supabase throw degrades to null', rErr === null);

  // 8. Supabase returns {error} — should also degrade
  const errSupa = { from() { return { select(){return this;}, eq(){return Promise.resolve({data:null, error:{message:'oops'}});} }; } };
  const rErr2 = await fetchExt(errSupa, '42', '019');
  ok('supabase error degrades to null', rErr2 === null);

  // 9. Only migration data — exotic path
  const migOnly = butler.filter(r => r.variable_code.startsWith('migration_'));
  const rMig = await fetchExt(makeSupabase(migOnly), '42', '019');
  ok('migOnly: migration populated',   rMig.migration && rMig.migration.netHouseholdInflow === 687);
  ok('migOnly: ageCohorts null',       rMig.ageCohorts === null);
  ok('migOnly: education null',        rMig.education === null);

  console.log(`\n[test_demographics_widen] ${passed}/${passed+failed} passed${failed ? ' -- FAILED':''}`);
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('UNCAUGHT:', err); process.exit(99); });
