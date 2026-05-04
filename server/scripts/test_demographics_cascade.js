#!/usr/bin/env node
/**
 * v4.0.1 cascade test — no express, no network. Loads demographics.js,
 * locates the registered GET '/' handler on its internal router, and
 * invokes it with a fake req/res and a fake dataCache that returns
 * exactly the shape market_study.census_demographics returns for Butler
 * County PA vintage 2025 (confirmed via live Supabase query).
 *
 * Stubs global fetch to always fail, so fetchCensusACS/PEP/BLS/BEA/CBP
 * all return null. That mirrors the real-world em-dash failure mode.
 * The cascade must lift cached canonical values into the payload.
 */
const Module = require('module');
const path = require('path');

// Stub fetch before requiring the route.
global.fetch = async () => {
  return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
};

// Fake `express` just well enough for demographics.js:
//   const express = require('express');
//   const router = express.Router();
//   router.get('/', async (req, res) => {...});
//   module.exports = router;
const registered = { getRoot: null };
const fakeRouter = {
  get(routePath, handler) {
    if (routePath === '/') registered.getRoot = handler;
  },
};
const fakeExpress = { Router: () => fakeRouter };

// Intercept require('express') inside the demographics module.
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'express') return require.resolve('path'); // any real path; we'll intercept load
  return origResolve.call(this, request, parent, ...rest);
};
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === 'express') return fakeExpress;
  return origLoad.call(this, request, parent, ...rest);
};

// Now load the route.
require(path.join(__dirname, '..', 'routes', 'demographics.js'));
if (!registered.getRoot) {
  console.error('FAIL: could not locate router.get(/) in demographics.js');
  process.exit(1);
}

// ── Build fake req/res and invoke ──
const butlerCounty2025 = [
  { variable_code: 'population',         value: 34094 },
  { variable_code: 'mhi',                value: 125126 },
  { variable_code: 'households',         value: 14111 },
  { variable_code: 'homeownershipRate',  value: 75.3 },
  { variable_code: 'ownerOccupied',      value: 10625 },
  { variable_code: 'renterOccupied',     value: 3486 },
  { variable_code: 'totalHousingUnits',  value: 14896 },
  { variable_code: 'vacancyRate',        value: 5.3 },
  { variable_code: 'vacantUnits',        value: 785 },
  { variable_code: 'perCapitaIncome',    value: 63809 },
  { variable_code: 'medianAge',          value: 40.1 },
  { variable_code: 'unemploymentRate',   value: 4.1 },
  { variable_code: 'povertyRate',        value: 4.4 },
  { variable_code: 'avgHouseholdSize',   value: 2.4 },
  { variable_code: 'affordableCeiling',  value: 437941 },
  { variable_code: 'popGrowth5yr',       value: 0.9 },
  { variable_code: 'mhiYoY',             value: -0.3 },
  { variable_code: 'medianIncomeYoY',    value: -0.3 },
  { variable_code: 'mhiGrowth',          value: -0.3 },
  { variable_code: 'commuteInflow',      value: 28140 },
  { variable_code: 'commuteOutflow',     value: 12850 },
];

const appLocals = {
  config: {
    census_api_key: 'K', census_api_base: 'https://api.census.gov/data',
    fred_api_key: 'K', fred_api_base: 'https://api.stlouisfed.org/fred',
    bls_api_key: 'K', bls_api_base: 'https://api.bls.gov/publicAPI/v2',
    bea_api_key: 'K', bea_api_base: 'https://apps.bea.gov/api/data',
  },
  supabase: null,
  sourceLog: { log: async () => {} },
  cache: null,
  dataCache: {
    async getCachedDemographics(stateFips, countyFips) {
      if (stateFips === '42' && countyFips === '019') return butlerCounty2025;
      return null;
    },
    async cacheDemographics() {},
  },
};

const req = {
  query: { stateFips: '42', countyFips: '019', subdivFips: '16140', cbsa: '38300', zips: '16066,16046' },
  app: { locals: appLocals },
};

let resolvedBody = null;
let resolvedStatus = 200;
const res = {
  status(code) { resolvedStatus = code; return this; },
  json(obj) { resolvedBody = obj; return this; },
};

(async () => {
  await registered.getRoot(req, res);

  let pass = 0, fail = 0;
  const t = (n, ok) => {
    if (ok) { console.log(`  [PASS] ${n}`); pass++; }
    else    { console.log(`  [FAIL] ${n}`); fail++; }
  };

  t('handler resolved 200', resolvedStatus === 200);
  t('handler returned payload', resolvedBody && typeof resolvedBody === 'object');
  if (!resolvedBody) {
    console.log('payload was null; aborting');
    process.exit(1);
  }
  const b = resolvedBody;

  // Regression assertions: with live ACS failing, every §3 KPI that has
  // a cached canonical value MUST land in the payload.
  t('population = 34094 (from cache)',      b.population === 34094);
  t('mhi = 125126',                          b.mhi === 125126);
  t('households = 14111',                    b.households === 14111);
  t('homeownershipRate = 75.3',              b.homeownershipRate === 75.3);
  t('ownerOccupied = 10625',                 b.ownerOccupied === 10625);
  t('renterOccupied = 3486',                 b.renterOccupied === 3486);
  t('totalHousingUnits = 14896',             b.totalHousingUnits === 14896);
  t('vacancyRate = 5.3',                     b.vacancyRate === 5.3);
  t('vacantUnits = 785',                     b.vacantUnits === 785);
  t('perCapitaIncome = 63809',               b.perCapitaIncome === 63809);
  t('medianAge = 40.1',                      b.medianAge === 40.1);
  t('unemploymentRate = 4.1',                b.unemploymentRate === 4.1);
  t('povertyRate = 4.4',                     b.povertyRate === 4.4);
  t('avgHouseholdSize = 2.4',                b.avgHouseholdSize === 2.4);
  t('affordableCeiling = 437941',            b.affordableCeiling === 437941);
  t('commuteInflow = 28140',                 b.commuteInflow === 28140);
  t('commuteOutflow = 12850',                b.commuteOutflow === 12850);
  t('popGrowth5yr = 0.9',                    b.popGrowth5yr === 0.9);
  t('mhiYoY = -0.3',                         b.mhiYoY === -0.3);
  t('medianIncomeYoY = -0.3',                b.medianIncomeYoY === -0.3);
  t('mhiGrowth = -0.3',                      b.mhiGrowth === -0.3);
  t('_acsLevel = county',                    b._acsLevel === 'county');
  t('_acsNote explains fallback',            typeof b._acsNote === 'string' && b._acsNote.toLowerCase().includes('county'));
  t('_stepTag = v4.0.1-supabase-cascade',    b._stepTag === 'v4.0.1-supabase-cascade');

  // Null-cache case: no cached row means no values lifted; should not crash.
  const req2 = { query: { stateFips: '99', countyFips: '999', cbsa: '', zips: '' }, app: { locals: appLocals } };
  let body2 = null, status2 = 200;
  const res2 = { status(c){ status2 = c; return this; }, json(o){ body2 = o; return this; } };
  await registered.getRoot(req2, res2);
  t('null-cache: handler did not crash', body2 !== null);
  t('null-cache: _acsLevel is null',     body2 && body2._acsLevel === null);
  t('null-cache: population is null',    body2 && body2.population === null);

  console.log();
  console.log(pass + ' pass, ' + fail + ' fail');
  if (fail === 0) console.log('ALL PASS');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('TEST CRASHED:', (e && (e.stack || e.message)) || e);
  process.exit(1);
});
