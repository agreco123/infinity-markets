/**
 * Infinity Markets v1.5 — Demographics Route
 *
 * GET /api/demographics?stateFips=42&countyFips=019&subdivFips=16920&cbsa=38300&zips=16066,16046
 *
 * Parallel calls:
 * Census ACS 5-Year → population, MHI, median age, households, etc.
 * Census PEP → multi-year population trend (10+ years)
 * FRED → MSA unemployment rate
 * BLS → employment by sector
 * BEA → GDP, personal income
 * Census LODES → commute inflow/outflow (from Supabase)
 * Census CBP → employer counts by industry
 *
 * v1.5 fixes:
 * - FRED unemployment: fixed category filter 'employment' → 'unemployment'
 * - PEP: extended to 3 vintages for 10+ year population trend
 * - LODES: reads from Supabase lodes_commute table, tries subdiv then county
 * - Added _sources metadata for citation provenance
 * - FRED: skips "." observations, adds sanity check on rate values
 */

const express = require('express');
const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function safeNum(val, fallback = 0) {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function pctOf(part, total) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

// ── ACS variable map ───────────────────────────────────────────────────────

const ACS_VARS = {
  population: 'B01003_001E',
  medianAge: 'B01002_001E',
  households: 'B11001_001E',
  avgHouseholdSize: 'B25010_001E',
  mhi: 'B19013_001E',
  perCapitaIncome: 'B19301_001E',
  ownerOccupied: 'B25003_002E',
  renterOccupied: 'B25003_003E',
  totalTenure: 'B25003_001E',
  povertyTotal: 'B17001_001E',
  povertyBelow: 'B17001_002E',
  incLt10: 'B19001_002E',
  inc10_15: 'B19001_003E',
  inc15_20: 'B19001_004E',
  inc20_25: 'B19001_005E',
  inc25_30: 'B19001_006E',
  inc30_35: 'B19001_007E',
  inc35_40: 'B19001_008E',
  inc40_45: 'B19001_009E',
  inc45_50: 'B19001_010E',
  inc50_60: 'B19001_011E',
  inc60_75: 'B19001_012E',
  inc75_100: 'B19001_013E',
  inc100_125: 'B19001_014E',
  inc125_150: 'B19001_015E',
  inc150_200: 'B19001_016E',
  inc200p: 'B19001_017E',
  incTotal: 'B19001_001E',
  totalHousingUnits: 'B25001_001E',
  vacantUnits: 'B25002_003E',
  built2020: 'B25034_002E',
  built2010: 'B25034_003E',
  built2000: 'B25034_004E',
  built1990: 'B25034_005E',
  built1980: 'B25034_006E',
  builtPre1980:'B25034_007E',
};

// ── Route ──────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { stateFips, countyFips, subdivFips, cbsa, zips } = req.query;

  if (!stateFips || !countyFips) {
    return res.status(400).json({ error: 'stateFips and countyFips are required' });
  }

  try {
    const { config, supabase, sourceLog, cache, dataCache } = req.app.locals;
    const censusKey = config.census_api_key;
    const censusBase = config.census_api_base || 'https://api.census.gov/data';
    const fredKey = config.fred_api_key;
    const fredBase = config.fred_api_base || 'https://api.stlouisfed.org/fred';
    const blsBase = config.bls_api_base || 'https://api.bls.gov/publicAPI/v2';
    const blsKey = config.bls_api_key;
    const beaKey = config.bea_api_key;
    const beaBase = config.bea_api_base || 'https://apps.bea.gov/api/data';

    // ── Parallel data collection ──────────────────────────────────────────

    const results = await Promise.allSettled([
      fetchCensusACS(censusBase, censusKey, stateFips, countyFips, subdivFips),
      fetchCensusPEP(censusBase, censusKey, stateFips, countyFips),
      fetchFredSeries(fredBase, fredKey, cbsa, supabase, stateFips, countyFips),
      fetchBLSEmployment(blsBase, blsKey, stateFips, countyFips),
      fetchBEA(beaBase, beaKey, cbsa, stateFips, countyFips),
      fetchLODES(supabase, stateFips, countyFips, subdivFips),
      fetchCBP(censusBase, censusKey, stateFips, countyFips),
      // v2.5: prior-year ACS for MHI YoY calculation
      fetchCensusACSPriorYear(censusBase, censusKey, stateFips, countyFips, subdivFips),
    ]);

    const sourceNames = ['Census ACS', 'Census PEP', 'FRED', 'BLS', 'BEA', 'LODES', 'Census CBP', 'Census ACS (prior year)'];
    for (let i = 0; i < results.length; i++) {
      let status = results[i].status === 'fulfilled' ? 'success' : 'error';
      if (status === 'success' && results[i].value === null && sourceNames[i] === 'BLS') status = 'skipped';
      await sourceLog.log({
        source: sourceNames[i],
        tier: i <= 1 ? 'primary' : 'secondary',
        url: '',
        status,
        error_message: status === 'error' ? results[i].reason?.message : null,
        confidence: status === 'success' ? 'high' : 'none',
      }).catch(() => {});
    }

    const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null;
    const acs = val(0);
    const pep = val(1);
    const fred = val(2);
    const bls = val(3);
    const bea = val(4);
    const lodes = val(5);
    const cbpData = val(6);
    const acsPrior = val(7);  // v2.5

    // v2.5: MHI YoY - prefer ACS year-over-year when both years available
    const currMhi = acs ? safeNum(acs.mhi) : 0;
    const priorMhi = acsPrior ? safeNum(acsPrior.mhi) : 0;
    const mhiYoY = (currMhi > 0 && priorMhi > 0)
      ? Math.round(((currMhi - priorMhi) / priorMhi) * 1000) / 10
      : null;

    // ── Assemble response ─────────────────────────────────────────────────

    let incomeDist = [];
    if (acs) {
      const tot = safeNum(acs.incTotal);
      const lt50 = safeNum(acs.incLt10) + safeNum(acs.inc10_15) + safeNum(acs.inc15_20) + safeNum(acs.inc20_25) + safeNum(acs.inc25_30) + safeNum(acs.inc30_35) + safeNum(acs.inc35_40) + safeNum(acs.inc40_45) + safeNum(acs.inc45_50);
      const b50_75 = safeNum(acs.inc50_60) + safeNum(acs.inc60_75);
      const b75_100 = safeNum(acs.inc75_100);
      const b100_125 = safeNum(acs.inc100_125);
      const b125_150 = safeNum(acs.inc125_150);
      const b150_200 = safeNum(acs.inc150_200);
      const b200p = safeNum(acs.inc200p);
      incomeDist = [
        { bracket: '<$50K', pct: pctOf(lt50, tot) },
        { bracket: '$50-75K', pct: pctOf(b50_75, tot) },
        { bracket: '$75-100K', pct: pctOf(b75_100, tot) },
        { bracket: '$100-125K', pct: pctOf(b100_125, tot) },
        { bracket: '$125-150K', pct: pctOf(b125_150, tot) },
        { bracket: '$150-200K', pct: pctOf(b150_200, tot) },
        { bracket: '$200K+', pct: pctOf(b200p, tot) },
      ];
    }

    const popTrend = pep || [];

    let popGrowth5yr = 0;
    if (popTrend.length >= 2) {
      const oldest = popTrend[0].v;
      const newest = popTrend[popTrend.length - 1].v;
      popGrowth5yr = oldest > 0 ? Math.round(((newest - oldest) / oldest) * 1000) / 10 : 0;
    }

    // v2.5: prefer ACS YoY; fall back to BEA personal-income growth only if ACS YoY missing
    const mhiGrowth = mhiYoY != null ? mhiYoY : (bea?.personalIncomeGrowth ?? null);
    const population = acs ? safeNum(acs.population) : null;
    const homeownershipRate = acs ? pctOf(safeNum(acs.ownerOccupied), safeNum(acs.totalTenure)) : null;
    const povertyRate = acs ? pctOf(safeNum(acs.povertyBelow), safeNum(acs.povertyTotal)) : null;
    const totalHUnits = acs ? safeNum(acs.totalHousingUnits) : 0;
    const vacantUnitsVal = acs ? safeNum(acs.vacantUnits) : 0;
    const vacancyRate = totalHUnits > 0 ? pctOf(vacantUnitsVal, totalHUnits) : null;

    let vintage = [];
    if (acs && totalHUnits > 0) {
      vintage = [
        { era: '2020+', pct: pctOf(safeNum(acs.built2020), totalHUnits) },
        { era: '2010-2019', pct: pctOf(safeNum(acs.built2010), totalHUnits) },
        { era: '2000-2009', pct: pctOf(safeNum(acs.built2000), totalHUnits) },
        { era: '1990-1999', pct: pctOf(safeNum(acs.built1990), totalHUnits) },
        { era: '1980-1989', pct: pctOf(safeNum(acs.built1980), totalHUnits) },
        { era: 'Pre-1980', pct: pctOf(safeNum(acs.builtPre1980), totalHUnits) },
      ];
    }

    const mhiVal = acs ? safeNum(acs.mhi) : 0;
    const affordableCeiling = mhiVal > 0 ? Math.round(mhiVal * 3.5) : null;

    const payload = {
      population,
      popGrowth5yr,
      medianAge: acs ? safeNum(acs.medianAge) : null,
      households: acs ? safeNum(acs.households) : null,
      avgHouseholdSize: acs ? safeNum(acs.avgHouseholdSize) : null,
      mhi: acs ? safeNum(acs.mhi) : null,
      mhiGrowth,
      perCapitaIncome: acs ? safeNum(acs.perCapitaIncome) : null,
      homeownershipRate,
      povertyRate,
      unemploymentRate: fred?.unemploymentRate ?? null,
      popTrend,
      incomeDist,
      topEmployers: cbpData || [],
      commuteInflow: lodes?.inflow ?? null,
      commuteOutflow: lodes?.outflow ?? null,
      vacancyRate,
      vintage,
      affordableCeiling,
      // v2.3: surface ACS tenure counts so housing section can render Owner-Occ/Renter-Occ/Total Units
      ownerOccupied: acs ? safeNum(acs.ownerOccupied) : null,
      renterOccupied: acs ? safeNum(acs.renterOccupied) : null,
      totalHousingUnits: totalHUnits || null,
      vacantUnits: vacantUnitsVal || null,
      // v2.5: explicit MHI YoY surfaced for Section 3
      medianIncomeYoY: mhiYoY,
      mhiYoY,
      _sources: {
        population: acs?._acsYear ? `Census ACS 5-Year ${acs._acsYear}` : null,
        unemployment: fred?._source || null,
        permits: 'Census Building Permits Survey',
        housing: 'Redfin MLS + Zillow ZHVI',
        commute: lodes?._source || 'Census LEHD LODES',
        employers: 'Census County Business Patterns',
      },
    };

    if (dataCache) {
      dataCache.cacheDemographics(stateFips, countyFips, null, payload).catch(() => {});
    }

    return res.json(payload);
  } catch (err) {
    console.error('[demographics] Unhandled error:', err);
    return res.status(500).json({ error: 'Demographics data failed', detail: err.message });
  }
});

// ── Data fetchers ──────────────────────────────────────────────────────────

async function censusFetchDemo(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) return null;
  const text = await resp.text();
  if (text.trim().startsWith('<')) {
    const noKeyUrl = url.replace(/&key=[^&]*/i, '');
    if (noKeyUrl !== url) {
      try {
        const r2 = await fetch(noKeyUrl, { signal: AbortSignal.timeout(12000) });
        if (!r2.ok) return null;
        const t2 = await r2.text();
        if (t2.trim().startsWith('<')) return null;
        return JSON.parse(t2);
      } catch (_) { return null; }
    }
    return null;
  }
  return JSON.parse(text);
}

/**
 * v2.5: sentinel filter - ACS uses -666666666, -888888888, -999999999 for unavailable cells.
 * Returns null for any sentinel so callers don't treat them as real values.
 */
function _acsVal(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw);
  if (s.startsWith('-666') || s.startsWith('-888') || s.startsWith('-999')) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function _acsQueryOne(base, key, stateFips, countyFips, subdivFips, year, tryLevel) {
  const vars = Object.values(ACS_VARS).join(',');
  const validSubdiv = subdivFips && subdivFips !== 'null' && subdivFips !== 'undefined' && subdivFips !== '';
  const geo = (tryLevel === 'subdivision' && validSubdiv)
    ? `for=county+subdivision:${subdivFips}&in=state:${stateFips}+county:${countyFips}`
    : `for=county:${countyFips}&in=state:${stateFips}`;
  try {
    const url = `${base}/${year}/acs/acs5?get=NAME,${vars}&${geo}&key=${key}`;
    const data = await censusFetchDemo(url);
    if (!data || data.length < 2) return null;
    const headers = data[0];
    const values = data[1];
    const result = {};
    for (const [friendlyKey, varCode] of Object.entries(ACS_VARS)) {
      const idx = headers.indexOf(varCode);
      result[friendlyKey] = idx >= 0 ? _acsVal(values[idx]) : null;
    }
    result._name = values[headers.indexOf('NAME')];
    result._acsYear = year;
    result._geoLevel = tryLevel;
    return result;
  } catch (_) { return null; }
}

async function fetchCensusACS(base, key, stateFips, countyFips, subdivFips) {
  const currentYear = new Date().getFullYear();
  // v2.5: extended year fallback to cover ACS 18-month lag
  const yearsToTry = [currentYear - 2, currentYear - 3, currentYear - 4, currentYear - 5];
  const validSubdiv = subdivFips && subdivFips !== 'null' && subdivFips !== 'undefined' && subdivFips !== '';

  // v2.5: pull subdivision-level AND county-level, then backfill subdivision nulls from county.
  let subdivResult = null, countyResult = null;
  for (const yr of yearsToTry) {
    if (validSubdiv && !subdivResult) subdivResult = await _acsQueryOne(base, key, stateFips, countyFips, subdivFips, yr, 'subdivision');
    if (!countyResult) countyResult = await _acsQueryOne(base, key, stateFips, countyFips, subdivFips, yr, 'county');
    if ((subdivResult || !validSubdiv) && countyResult) break;
  }

  if (!subdivResult && !countyResult) {
    throw new Error(`ACS unavailable: state=${stateFips} county=${countyFips} years=${yearsToTry.join(',')}`);
  }

  // If both present, merge: subdivision preferred, but any null backfills from county.
  if (subdivResult && countyResult) {
    const coreFields = ['population', 'mhi', 'households', 'avgHouseholdSize', 'medianAge',
      'perCapitaIncome', 'ownerOccupied', 'renterOccupied', 'totalTenure',
      'povertyTotal', 'povertyBelow', 'totalHousingUnits', 'vacantUnits',
      'built2020', 'built2010', 'built2000', 'built1990', 'built1980', 'builtPre1980'];
    for (const f of coreFields) {
      if (subdivResult[f] == null && countyResult[f] != null) subdivResult[f] = countyResult[f];
    }
    subdivResult._mergedFromCounty = true;
    return subdivResult;
  }
  return subdivResult || countyResult;
}

/**
 * v2.5: Fetch ACS for the year BEFORE the one fetchCensusACS will prefer.
 * Used for MHI year-over-year calculation in the main payload.
 */
async function fetchCensusACSPriorYear(base, key, stateFips, countyFips, subdivFips) {
  const currentYear = new Date().getFullYear();
  // Shifted one year earlier than fetchCensusACS's primary window
  const yearsToTry = [currentYear - 3, currentYear - 4, currentYear - 5, currentYear - 6];
  const validSubdiv = subdivFips && subdivFips !== 'null' && subdivFips !== 'undefined' && subdivFips !== '';

  for (const yr of yearsToTry) {
    const sub = validSubdiv
      ? await _acsQueryOne(base, key, stateFips, countyFips, subdivFips, yr, 'subdivision')
      : null;
    if (sub && sub.mhi != null) return sub;
    const cty = await _acsQueryOne(base, key, stateFips, countyFips, subdivFips, yr, 'county');
    if (cty && cty.mhi != null) return cty;
  }
  return null;
}

/**
 * Census PEP — Population Estimates Program, multi-year
 * v1.5: Extended vintage ranges for 10+ year population trend
 */
async function fetchCensusPEP(base, key, stateFips, countyFips) {
  const trend = [];

  const vintages = [
    { vintage: '2015', years: ['2010','2011','2012','2013','2014','2015'], popVar: 'POP' },
    { vintage: '2019', years: ['2016','2017','2018','2019'], popVar: 'POP' },
    { vintage: '2023', years: ['2020','2021','2022','2023'], popVar: 'POP_2020' },
  ];

  for (const { vintage, years: yrs, popVar } of vintages) {
    try {
      const url = `${base}/${vintage}/pep/population?get=${popVar},DATE_CODE,DATE_DESC&for=county:${countyFips}&in=state:${stateFips}&key=${key}`;
      const data = await censusFetchDemo(url);
      if (data && data.length > 1) {
        const headers = data[0];
        const popIdx = headers.indexOf(popVar) >= 0 ? headers.indexOf(popVar) : headers.indexOf('POP');
        const dateDescIdx = headers.indexOf('DATE_DESC');
        for (let r = 1; r < data.length; r++) {
          const desc = data[r][dateDescIdx] || '';
          const yrMatch = desc.match(/(\d{4})/);
          if (yrMatch && yrs.includes(yrMatch[1])) {
            trend.push({ yr: yrMatch[1], v: safeNum(data[r][popIdx]) });
          }
        }
      }
    } catch (_) {}
  }

  const seen = new Set();
  const deduped = [];
  for (const t of trend) {
    if (!seen.has(t.yr) && t.v > 0) {
      seen.add(t.yr);
      deduped.push(t);
    }
  }
  deduped.sort((a, b) => a.yr.localeCompare(b.yr));
  return deduped;
}

/**
 * FRED — MSA/county unemployment rate
 * v1.5 FIX: Changed category filter from 'employment' to 'unemployment'
 */
async function fetchFredSeries(base, key, cbsa, supabase, stateFips, countyFips) {
  if (!key) return { unemploymentRate: null };

  let seriesId = null;
  let sourceName = null;

  // Strategy 1: Lookup unemployment rate from fred_series_ref by CBSA
  if (cbsa) {
    try {
      const { data, error } = await supabase
        .from('fred_series_ref')
        .select('series_id, title')
        .eq('cbsa_code', cbsa)
        .eq('category', 'unemployment')
        .limit(1);
      if (!error && data?.length > 0) {
        seriesId = data[0].series_id;
        sourceName = `FRED ${data[0].title}`;
      }
    } catch (_) {}

    // Fallback: search by title
    if (!seriesId) {
      try {
        const { data } = await supabase
          .from('fred_series_ref')
          .select('series_id, title')
          .eq('cbsa_code', cbsa)
          .ilike('title', '%unemployment%rate%')
          .limit(1);
        if (data?.length > 0) {
          seriesId = data[0].series_id;
          sourceName = `FRED ${data[0].title}`;
        }
      } catch (_) {}
    }
  }

  // Strategy 2: County-level LAUS series
  if (!seriesId && stateFips && countyFips) {
    seriesId = `LAUCN${stateFips}${countyFips}0000000003A`;
    sourceName = `FRED LAUS County Unemployment (${stateFips}${countyFips})`;
  }

  if (!seriesId) return { unemploymentRate: null, _source: null };

  try {
    const url = `${base}/series/observations?series_id=${seriesId}&sort_order=desc&limit=5&api_key=${key}&file_type=json`;
    const data = await fetchJson(url);
    const observations = data?.observations || [];
    // v1.5: Skip "." values (FRED missing data marker)
    const validObs = observations.find(o => o.value && o.value !== '.');
    if (validObs) {
      const rate = safeNum(validObs.value);
      if (rate > 0 && rate < 30) {
        return { unemploymentRate: rate, _source: sourceName };
      }
    }
    return { unemploymentRate: null, _source: sourceName };
  } catch (e) {
    console.warn('[demographics] FRED unemployment fetch failed:', e.message);
    return { unemploymentRate: null, _source: null };
  }
}

async function fetchBLSEmployment(base, key, stateFips, countyFips) {
  return null;
}

async function fetchBEA(base, key, cbsa, stateFips, countyFips) {
  if (!key) return null;
  try {
    const fips = `${stateFips}${countyFips}`;
    const url = `${base}?&UserID=${key}&method=GetData&datasetname=Regional&TableName=CAINC1&LineCode=1&GeoFips=${fips}&Year=2022,2023&ResultFormat=json`;
    const data = await fetchJson(url);
    const rows = data?.BEAAPI?.Results?.Data;
    if (rows && rows.length >= 2) {
      const sorted = rows.sort((a, b) => Number(a.TimePeriod) - Number(b.TimePeriod));
      const prev = safeNum(sorted[sorted.length - 2]?.DataValue?.replace(/,/g, ''));
      const curr = safeNum(sorted[sorted.length - 1]?.DataValue?.replace(/,/g, ''));
      const growth = prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null;
      return { personalIncomeGrowth: growth };
    }
  } catch (_) {}
  return null;
}

/**
 * LODES — Commute inflow/outflow from Supabase
 * v1.5: Try subdivision FIPS first, then county
 */
async function fetchLODES(supabase, stateFips, countyFips, subdivFips) {
  try {
    const subdivFullFips = subdivFips ? `${stateFips}${countyFips}${subdivFips}` : null;
    const countyFullFips = `${stateFips}${countyFips}`;
    const fipsList = [subdivFullFips, countyFullFips].filter(Boolean);

    for (const fips of fipsList) {
      const { data, error } = await supabase
        .from('lodes_commute')
        .select('workers_commuting_in, workers_commuting_out')
        .eq('municipality_fips', fips)
        .order('year', { ascending: false })
        .limit(1);

      if (!error && data?.length > 0) {
        return {
          inflow: data[0].workers_commuting_in ?? null,
          outflow: data[0].workers_commuting_out ?? null,
          _source: `Census LEHD LODES (FIPS: ${fips})`,
        };
      }
    }
    return { inflow: null, outflow: null, _source: null };
  } catch (_) {
    return { inflow: null, outflow: null, _source: null };
  }
}

async function fetchCBP(base, key, stateFips, countyFips) {
  const currentYear = new Date().getFullYear();
  const yearsToTry = [currentYear - 4, currentYear - 3, currentYear - 5];

  for (const yr of yearsToTry) {
    try {
      const url = `${base}/${yr}/cbp?get=NAICS2017,NAICS2017_LABEL,EMP,ESTAB&for=county:${countyFips}&in=state:${stateFips}&NAICS2017=*&key=${key}`;
      const data = await censusFetchDemo(url);
      if (!data || data.length < 2) continue;

      const headers = data[0];
      const labelIdx = headers.indexOf('NAICS2017_LABEL');
      const empIdx = headers.indexOf('EMP');
      const estabIdx = headers.indexOf('ESTAB');
      const naicsIdx = headers.indexOf('NAICS2017');

      const sectors = data.slice(1)
        .filter(row => /^\d{2}(-\d{2})?$/.test(String(row[naicsIdx] || '')))
        .map(row => {
          const emp = safeNum(row[empIdx]);
          return {
            name: row[labelIdx],
            sector: row[labelIdx],
            emp,               // v2.3: canonical key the deliverables read
            employment: emp,   // v2.3: alias
            est: emp,          // legacy
            establishments: safeNum(row[estabIdx]),
          };
        });

      sectors.sort((a, b) => b.emp - a.emp);
      return sectors.slice(0, 5);
    } catch (_) {}
  }
  return [];
}

const FIPS_TO_STATE_ABBR = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY',
};

module.exports = router;
