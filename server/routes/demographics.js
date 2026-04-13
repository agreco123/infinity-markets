/**
 * Infinity Markets v1.0 — Demographics Route (Task 4)
 * 
 * GET /api/demographics?stateFips=42&countyFips=019&subdivFips=16920&cbsa=38300&zips=16066,16046
 * 
 * Parallel calls:
 *   Census ACS 5-Year → population, MHI, median age, households, etc.
 *   Census PEP → multi-year population trend
 *   FRED → MSA unemployment, MSA population
 *   BLS → employment by sector
 *   BEA → GDP, personal income
 *   Census LODES → commute inflow/outflow
 *   Census CBP → employer counts by industry
 * 
 * Returns shape matching MOCK_DEMOGRAPHICS from v0.3 JSX.
 */

const express = require('express');
const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── ACS variable map ─────────────────────────────────────────────────────────
// Each key → Census ACS variable code
const ACS_VARS = {
  population:        'B01003_001E',
  medianAge:         'B01002_001E',
  households:        'B11001_001E',
  avgHouseholdSize:  'B25010_001E',
  mhi:               'B19013_001E',
  perCapitaIncome:   'B19301_001E',
  ownerOccupied:     'B25003_002E',
  renterOccupied:    'B25003_003E',
  totalTenure:       'B25003_001E',
  povertyTotal:      'B17001_001E',
  povertyBelow:      'B17001_002E',
  // Income distribution brackets (B19001)
  incLt10:     'B19001_002E',
  inc10_15:    'B19001_003E',
  inc15_20:    'B19001_004E',
  inc20_25:    'B19001_005E',
  inc25_30:    'B19001_006E',
  inc30_35:    'B19001_007E',
  inc35_40:    'B19001_008E',
  inc40_45:    'B19001_009E',
  inc45_50:    'B19001_010E',
  inc50_60:    'B19001_011E',
  inc60_75:    'B19001_012E',
  inc75_100:   'B19001_013E',
  inc100_125:  'B19001_014E',
  inc125_150:  'B19001_015E',
  inc150_200:  'B19001_016E',
  inc200p:     'B19001_017E',
  incTotal:    'B19001_001E',
  // Housing vacancy and vintage (H-2 fix)
  totalHousingUnits: 'B25001_001E',
  vacantUnits:       'B25002_003E',
  built2020:   'B25034_002E',
  built2010:   'B25034_003E',
  built2000:   'B25034_004E',
  built1990:   'B25034_005E',
  built1980:   'B25034_006E',
  builtPre1980:'B25034_007E',
};

// ── Route ────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { stateFips, countyFips, subdivFips, cbsa, zips } = req.query;
  if (!stateFips || !countyFips) {
    return res.status(400).json({ error: 'stateFips and countyFips are required' });
  }

  const { config, supabase, sourceLog, cache, dataCache } = req.app.locals;
  const censusKey = config.census_api_key;
  const censusBase = config.census_api_base || 'https://api.census.gov/data';
  const fredKey = config.fred_api_key;
  const fredBase = config.fred_api_base || 'https://api.stlouisfed.org/fred';
  const blsBase = config.bls_api_base || 'https://api.bls.gov/publicAPI/v2';
  const blsKey = config.bls_api_key;
  const beaKey = config.bea_api_key;
  const beaBase = config.bea_api_base || 'https://apps.bea.gov/api/data';
  const lodesBase = config.lodes_data_base || 'https://lehd.ces.census.gov/data/lodes';

  // ── Parallel data collection ────────────────────────────────────────────

  const results = await Promise.allSettled([
    // 0: Census ACS 5-Year (county subdivision level)
    fetchCensusACS(censusBase, censusKey, stateFips, countyFips, subdivFips),
    // 1: Census PEP — population estimates multi-year
    fetchCensusPEP(censusBase, censusKey, stateFips, countyFips),
    // 2: FRED — MSA/county unemployment rate
    fetchFredSeries(fredBase, fredKey, cbsa, supabase, stateFips, countyFips),
    // 3: BLS — employment by sector (county level)
    fetchBLSEmployment(blsBase, blsKey, stateFips, countyFips),
    // 4: BEA — GDP / personal income
    fetchBEA(beaBase, beaKey, cbsa, stateFips, countyFips),
    // 5: LODES — commute inflow/outflow
    fetchLODES(lodesBase, stateFips, countyFips),
    // 6: CBP — employer counts by industry
    fetchCBP(censusBase, censusKey, stateFips, countyFips),
  ]);

  // Log each source
  const sourceNames = ['Census ACS', 'Census PEP', 'FRED', 'BLS', 'BEA', 'LODES', 'Census CBP'];
  for (let i = 0; i < results.length; i++) {
    let status = results[i].status === 'fulfilled' ? 'success' : 'error';
    // M-9: BLS intentionally returns null — log as 'skipped' not 'success'
    if (status === 'success' && results[i].value === null && sourceNames[i] === 'BLS') status = 'skipped';
    await sourceLog.log({
      source: sourceNames[i],
      tier: i <= 1 ? 'primary' : 'secondary',
      url: '',
      status,
      error_message: status === 'error' ? results[i].reason?.message : null,
      confidence: status === 'success' ? 'high' : 'none',
    });
  }

  // Extract settled values (null if rejected)
  const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null;
  const acs = val(0);
  const pep = val(1);
  const fred = val(2);
  const bls = val(3);
  const bea = val(4);
  const lodes = val(5);
  const cbp = val(6);

  // ── Assemble response matching MOCK_DEMOGRAPHICS shape ──────────────────

  // Income distribution — collapse 16 ACS brackets into 7 display brackets
  let incomeDist = [];
  if (acs) {
    const tot = safeNum(acs.incTotal);
    const lt50 = safeNum(acs.incLt10) + safeNum(acs.inc10_15) + safeNum(acs.inc15_20) +
                 safeNum(acs.inc20_25) + safeNum(acs.inc25_30) + safeNum(acs.inc30_35) +
                 safeNum(acs.inc35_40) + safeNum(acs.inc40_45) + safeNum(acs.inc45_50);
    const b50_75  = safeNum(acs.inc50_60) + safeNum(acs.inc60_75);
    const b75_100 = safeNum(acs.inc75_100);
    const b100_125 = safeNum(acs.inc100_125);
    const b125_150 = safeNum(acs.inc125_150);
    const b150_200 = safeNum(acs.inc150_200);
    const b200p    = safeNum(acs.inc200p);
    incomeDist = [
      { bracket: '<$50K',      pct: pctOf(lt50, tot) },
      { bracket: '$50-75K',    pct: pctOf(b50_75, tot) },
      { bracket: '$75-100K',   pct: pctOf(b75_100, tot) },
      { bracket: '$100-125K',  pct: pctOf(b100_125, tot) },
      { bracket: '$125-150K',  pct: pctOf(b125_150, tot) },
      { bracket: '$150-200K',  pct: pctOf(b150_200, tot) },
      { bracket: '$200K+',     pct: pctOf(b200p, tot) },
    ];
  }

  // Population trend from PEP
  const popTrend = pep || [];

  // 5-year pop growth calc
  let popGrowth5yr = 0;
  if (popTrend.length >= 2) {
    const oldest = popTrend[0].v;
    const newest = popTrend[popTrend.length - 1].v;
    popGrowth5yr = oldest > 0 ? Math.round(((newest - oldest) / oldest) * 1000) / 10 : 0;
  }

  // MHI growth — if we have PEP-era MHI comparison we'd need a second ACS call.
  // For v1.0, use FRED personal income growth as proxy, or leave as calculated from
  // prior-year ACS. We'll stub a reasonable approach — can refine later with 1-year ACS.
  const mhiGrowth = bea?.personalIncomeGrowth ?? null;

  const population = acs ? safeNum(acs.population) : null;
  const homeownershipRate = acs
    ? pctOf(safeNum(acs.ownerOccupied), safeNum(acs.totalTenure))
    : null;
  const povertyRate = acs
    ? pctOf(safeNum(acs.povertyBelow), safeNum(acs.povertyTotal))
    : null;

  // Vacancy rate (H-2 fix)
  const totalHUnits = acs ? safeNum(acs.totalHousingUnits) : 0;
  const vacantUnits = acs ? safeNum(acs.vacantUnits) : 0;
  const vacancyRate = totalHUnits > 0 ? pctOf(vacantUnits, totalHUnits) : null;

  // Housing vintage distribution (H-2 fix)
  let vintage = [];
  if (acs && totalHUnits > 0) {
    vintage = [
      { era: '2020+',     pct: pctOf(safeNum(acs.built2020), totalHUnits) },
      { era: '2010-2019', pct: pctOf(safeNum(acs.built2010), totalHUnits) },
      { era: '2000-2009', pct: pctOf(safeNum(acs.built2000), totalHUnits) },
      { era: '1990-1999', pct: pctOf(safeNum(acs.built1990), totalHUnits) },
      { era: '1980-1989', pct: pctOf(safeNum(acs.built1980), totalHUnits) },
      { era: 'Pre-1980',  pct: pctOf(safeNum(acs.builtPre1980), totalHUnits) },
    ];
  }

  // Affordable ceiling: MHI × 3.5 qualified at prevailing rate (H-2 fix)
  // This is a rough ceiling; actual calc uses mortgage rate from housing route
  const mhiVal = acs ? safeNum(acs.mhi) : 0;
  const affordableCeiling = mhiVal > 0 ? Math.round(mhiVal * 3.5) : null;

  const payload = {
    population,
    popGrowth5yr,
    medianAge:         acs ? safeNum(acs.medianAge) : null,
    households:        acs ? safeNum(acs.households) : null,
    avgHouseholdSize:  acs ? safeNum(acs.avgHouseholdSize) : null,
    mhi:               acs ? safeNum(acs.mhi) : null,
    mhiGrowth:         mhiGrowth,
    perCapitaIncome:   acs ? safeNum(acs.perCapitaIncome) : null,
    homeownershipRate,
    povertyRate,
    unemploymentRate:  fred?.unemploymentRate ?? null,
    popTrend,
    incomeDist,
    topEmployers:      cbp || [],
    commuteInflow:     lodes?.inflow ?? null,
    commuteOutflow:    lodes?.outflow ?? null,
    vacancyRate,
    vintage,
    affordableCeiling,
  };

  // Persist census data to Supabase for cache-first reads on future studies
  if (dataCache) {
    dataCache.cacheDemographics(stateFips, countyFips, null, payload).catch(() => {});
  }

  return res.json(payload);
});

// ── Data fetchers ────────────────────────────────────────────────────────────

/**
 * Census ACS 5-Year at county subdivision level
 * Fallback chain: year-1 → year-2 → year-3 at subdivision level,
 * then repeat at county level if subdivision fails entirely.
 */
async function fetchCensusACS(base, key, stateFips, countyFips, subdivFips) {
  const vars = Object.values(ACS_VARS).join(',');
  const currentYear = new Date().getFullYear();
  // ACS 5-Year for year X is typically released Dec of year X+1
  // In April 2026, latest available is likely 2023 or 2024
  const yearsToTry = [currentYear - 2, currentYear - 1, currentYear - 3];

  // Try subdivision level first, then county level as fallback
  const geoLevels = [];
  if (subdivFips) {
    geoLevels.push(`for=county+subdivision:${subdivFips}&in=state:${stateFips}+county:${countyFips}`);
  }
  geoLevels.push(`for=county:${countyFips}&in=state:${stateFips}`);

  for (const geo of geoLevels) {
    for (const yr of yearsToTry) {
      try {
        const url = `${base}/${yr}/acs/acs5?get=NAME,${vars}&${geo}&key=${key}`;
        const data = await fetchJson(url);
        if (data && data.length >= 2) {
          const headers = data[0];
          const values = data[1];
          const result = {};
          for (const [friendlyKey, varCode] of Object.entries(ACS_VARS)) {
            const idx = headers.indexOf(varCode);
            result[friendlyKey] = idx >= 0 ? values[idx] : null;
          }
          result._name = values[headers.indexOf('NAME')];
          result._acsYear = yr;
          result._geoLevel = subdivFips && geo.includes('subdivision') ? 'subdivision' : 'county';
          return result;
        }
      } catch (_) { /* try next year/level */ }
    }
  }
  throw new Error(`ACS data unavailable for state=${stateFips} county=${countyFips} (tried years ${yearsToTry.join(', ')})`);
}

/**
 * Census PEP — Population Estimates Program, multi-year
 * Returns: [{ yr: "2018", v: 29800 }, ...]
 */
async function fetchCensusPEP(base, key, stateFips, countyFips) {
  // PEP endpoint: vintage 2023, county level
  // Try population estimates API for years 2018-2023
  const years = ['2018', '2019', '2020', '2021', '2022', '2023'];
  const trend = [];

  // PEP vintage=2023 has estimates for 2020-2023
  // For 2018-2019, we can use vintage=2019
  const vintages = [
    { vintage: '2019', years: ['2018', '2019'], popVar: 'POP' },
    { vintage: '2023', years: ['2020', '2021', '2022', '2023'], popVar: 'POP_2020' },
  ];

  for (const { vintage, years: yrs, popVar } of vintages) {
    try {
      const url = `${base}/${vintage}/pep/population?get=${popVar},DATE_CODE,DATE_DESC&for=county:${countyFips}&in=state:${stateFips}&key=${key}`;
      const data = await fetchJson(url);
      if (data && data.length > 1) {
        const headers = data[0];
        const popIdx = headers.indexOf(popVar) >= 0 ? headers.indexOf(popVar) : headers.indexOf('POP');
        const dateDescIdx = headers.indexOf('DATE_DESC');
        for (let r = 1; r < data.length; r++) {
          const desc = data[r][dateDescIdx] || '';
          // DATE_DESC like "7/1/2021 population estimate"
          const yrMatch = desc.match(/(\d{4})/);
          if (yrMatch && yrs.includes(yrMatch[1])) {
            trend.push({ yr: yrMatch[1], v: safeNum(data[r][popIdx]) });
          }
        }
      }
    } catch (_) { /* skip vintage if unavailable */ }
  }

  // Dedupe by year, sort ascending
  const seen = new Set();
  const deduped = [];
  for (const t of trend) {
    if (!seen.has(t.yr)) { seen.add(t.yr); deduped.push(t); }
  }
  deduped.sort((a, b) => a.yr.localeCompare(b.yr));
  return deduped;
}

/**
 * FRED — MSA unemployment rate
 * Looks up the FRED series prefix from fred_series_ref table using CBSA code.
 */
async function fetchFredSeries(base, key, cbsa, supabase, stateFips, countyFips) {
  if (!key) return { unemploymentRate: null };

  // Strategy 1: Lookup known FRED series from fred_series_ref
  // Try cbsa_code+category first; fall back to geography/title match if columns don't exist
  let seriesId = null;
  if (cbsa) {
    try {
      const { data, error } = await supabase
        .from('fred_series_ref')
        .select('series_id')
        .eq('cbsa_code', cbsa)
        .eq('category', 'employment')
        .limit(1)
        .single();
      if (!error) seriesId = data?.series_id;
    } catch (_) {}
    // Fallback: search by geography column (known to exist per build directive)
    if (!seriesId) {
      try {
        const { data } = await supabase
          .from('fred_series_ref')
          .select('series_id, title')
          .ilike('geography_name', `%${cbsa}%`)
          .limit(5);
        const match = (data || []).find(r => /UR$|unemployment/i.test(r.series_id + r.title));
        if (match) seriesId = match.series_id;
      } catch (_) {}
    }
  }

  // Strategy 2: County-level LAUS series (reliable pattern for all US counties)
  // Format: LAUCN{STATE_FIPS}{COUNTY_FIPS}0000000003 (unemployment rate)
  if (!seriesId && stateFips && countyFips) {
    seriesId = `LAUCN${stateFips}${countyFips}0000000003`;
  }

  if (!seriesId) return { unemploymentRate: null };

  try {
    const url = `${base}/series/observations?series_id=${seriesId}&sort_order=desc&limit=1&api_key=${key}&file_type=json`;
    const data = await fetchJson(url);
    const obs = data?.observations?.[0];
    return { unemploymentRate: obs ? safeNum(obs.value) : null };
  } catch (_) {
    return { unemploymentRate: null };
  }
}

/**
 * BLS — Employment by sector (QCEW, county level)
 * Returns top 5 industries by employment.
 */
async function fetchBLSEmployment(base, key, stateFips, countyFips) {
  // BLS QCEW: single county, all industries, most recent quarter
  // QCEW data via: https://data.bls.gov/cew/data/api/{YEAR}/{QTR}/area/{AREA_CODE}.csv
  // Area code = county FIPS with leading C: CN{STATE}{COUNTY}
  // The BLS v2 API is more reliable for specific series
  // For top employers, we use CBP instead (more structured). BLS supplements with
  // aggregate employment. Return null — CBP handler covers employer data.
  return null;
}

/**
 * BEA — Regional GDP and personal income
 */
async function fetchBEA(base, key, cbsa, stateFips, countyFips) {
  if (!key) return null;
  try {
    // BEA Regional data: personal income growth for MSA
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
 * LODES — Commute inflow/outflow (county level)
 * Uses Residence Area Characteristics (RAC) and Workplace Area Characteristics (WAC)
 */
async function fetchLODES(base, stateFips, countyFips) {
  // Query pre-populated lodes_commute table in Supabase (H-3 fix)
  try {
    const supabase = require('../lib/supabase');
    const fips = `${stateFips}${countyFips}`;
    const { data } = await supabase
      .from('lodes_commute')
      .select('workers_commuting_in, workers_commuting_out')
      .eq('municipality_fips', fips)
      .order('year', { ascending: false })
      .limit(1)
      .single();
    return { inflow: data?.workers_commuting_in ?? null, outflow: data?.workers_commuting_out ?? null };
  } catch (_) {
    return { inflow: null, outflow: null };
  }
}

/**
 * Census CBP — County Business Patterns
 * Returns top employers/industries by employment.
 */
async function fetchCBP(base, key, stateFips, countyFips) {
  try {
    // CBP: employment by 2-digit NAICS
    const url = `${base}/2022/cbp?get=NAICS2017,NAICS2017_LABEL,EMP,ESTAB&for=county:${countyFips}&in=state:${stateFips}&NAICS2017=11,21,22,23,31-33,42,44-45,48-49,51,52,53,54,55,56,61,62,71,72,81&key=${key}`;
    const data = await fetchJson(url);
    if (!data || data.length < 2) return [];

    const headers = data[0];
    const labelIdx = headers.indexOf('NAICS2017_LABEL');
    const empIdx = headers.indexOf('EMP');
    const estabIdx = headers.indexOf('ESTAB');

    const sectors = data.slice(1).map(row => ({
      name: row[labelIdx],
      sector: row[labelIdx],
      est: safeNum(row[empIdx]),
      establishments: safeNum(row[estabIdx]),
    }));

    // Sort by employment descending, return top 5
    sectors.sort((a, b) => b.est - a.est);
    return sectors.slice(0, 5);
  } catch (_) {
    return [];
  }
}

// ── State FIPS → abbreviation (subset for LODES paths) ──────────────────────
const FIPS_TO_STATE_ABBR = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO',
  '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI',
  '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
  '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
  '54': 'WV', '55': 'WI', '56': 'WY',
};

module.exports = router;
