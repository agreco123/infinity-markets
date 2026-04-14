/**
 * Infinity Markets — Health & Debug Route
 * 
 * GET /api/health                — Quick status check
 * GET /api/health/full           — Full diagnostics (env, DB, APIs)
 * GET /api/health/geocode?q=...  — Test geocoder with verbose output
 * GET /api/health/sources?stateFips=...&countyFips=...&cbsa=...&zips=... — Test each data source
 * GET /api/health/logs           — Recent source_log entries
 */

const express = require('express');
const router = express.Router();

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), ...opts });
  if (!r.ok) throw new Error(`${r.status} — ${url}`);
  return r.json();
}

// ── Quick health check ───────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.4.2',
    uptime: Math.round(process.uptime()),
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
    node: process.version,
    timestamp: new Date().toISOString(),
  });
});

// ── Full diagnostics ─────────────────────────────────────────────────────────
router.get('/full', async (req, res) => {
  const { config, supabase } = req.app.locals;
  const results = {};

  // 1. Environment variables (present/missing, never values)
  const envKeys = [
    'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY',
    'ANTHROPIC_API_KEY', 'NODE_ENV',
  ];
  const configKeys = [
    'census_api_key', 'fred_api_key', 'hud_api_key', 'bea_api_key',
    'rapidapi_key', 'bls_api_key',
  ];
  results.env = {};
  envKeys.forEach(k => { results.env[k] = process.env[k] ? 'SET' : 'MISSING'; });
  configKeys.forEach(k => { results.env[k] = config[k] ? 'SET' : 'MISSING'; });
  // Show base URLs (not secrets) so we can verify they're correct
  results.configBases = {
    census_api_base: config.census_api_base || '(using default: https://api.census.gov/data)',
    fred_api_base: config.fred_api_base || '(using default: https://api.stlouisfed.org/fred)',
    bea_api_base: config.bea_api_base || '(using default: https://apps.bea.gov/api/data)',
    census_geocoder_base: config.census_geocoder_base || '(using default)',
    fhfa_hpi_download: config.fhfa_hpi_download ? 'SET' : 'MISSING',
    hmda_data_browser: config.hmda_data_browser ? 'SET' : 'MISSING',
  };

  // 2. Supabase connectivity + table counts
  results.supabase = { connected: false, tables: {} };
  try {
    const tables = [
      'api_usage', 'builder_profiles', 'building_permits', 'cbsa_county_xref',
      'census_demographics', 'communities', 'fips_lookup', 'fred_series_ref',
      'fred_timeseries', 'lodes_commute', 'proforma_scenarios', 'redfin_monthly',
      'scorecard', 'source_log', 'studies', 'zillow_zhvi',
    ];
    for (const t of tables) {
      try {
        const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
        results.supabase.tables[t] = error ? `ERROR: ${error.message}` : count;
      } catch (e) {
        results.supabase.tables[t] = `ERROR: ${e.message}`;
      }
    }
    results.supabase.connected = true;
  } catch (e) {
    results.supabase.error = e.message;
  }

  // 3. Storage bucket check
  try {
    const { data, error } = await supabase.storage.listBuckets();
    results.storage = error ? { error: error.message } : (data || []).map(b => ({ name: b.name, public: b.public }));
  } catch (e) {
    results.storage = { error: e.message };
  }

  // 4. External API reachability — uses ACTUAL config base URLs (not hardcoded)
  results.apis = {};
  const censusBase = config.census_api_base || 'https://api.census.gov/data';
  const fredBase = config.fred_api_base || 'https://api.stlouisfed.org/fred';
  const beaBase = config.bea_api_base || 'https://apps.bea.gov/api/data';
  const apiTests = [
    { name: 'Census Geocoder', url: 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=1+Main+St%2C+Buffalo+NY&benchmark=Public_AR_Current&vintage=Current_Current&format=json' },
    { name: 'Census ACS (via config base)', url: `${censusBase}/2023/acs/acs5?get=NAME&for=state:36&key=${config.census_api_key || 'NOKEY'}` },
    { name: 'Census BPS (via config base)', url: `${censusBase}/2022/bps/annperm?get=BLDGS_1UNIT&for=county:029&in=state:36&key=${config.census_api_key || 'NOKEY'}` },
    { name: 'FRED (via config base)', url: `${fredBase}/series?series_id=MORTGAGE30US&api_key=${config.fred_api_key || 'NOKEY'}&file_type=json` },
    { name: 'BEA (via config base)', url: `${beaBase}?&UserID=${config.bea_api_key || 'NOKEY'}&method=GetData&datasetname=Regional&TableName=CAINC1&LineCode=1&GeoFips=36029&Year=2023&ResultFormat=json` },
  ];
  for (const t of apiTests) {
    const start = Date.now();
    try {
      const r = await fetch(t.url, { signal: AbortSignal.timeout(8000) });
      results.apis[t.name] = { status: r.status, ok: r.ok, ms: Date.now() - start };
    } catch (e) {
      results.apis[t.name] = { error: e.message, ms: Date.now() - start };
    }
  }

  // 5. System info
  results.system = {
    version: '1.4.2',
    node: process.version,
    uptime: Math.round(process.uptime()),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    },
    timestamp: new Date().toISOString(),
  };

  return res.json(results);
});

// ── Test geocoder with verbose output ────────────────────────────────────────
router.get('/geocode', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });

  const { config, supabase } = req.app.locals;
  const base = config.census_geocoder_base || 'https://geocoding.geo.census.gov/geocoder';
  const results = { query: q, strategies: [] };

  async function tryStrategy(name, url, opts = {}) {
    const start = Date.now();
    const entry = { name, url, ms: 0, status: null, matchCount: 0, match: null, error: null };
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000), ...opts });
      entry.status = r.status;
      if (r.ok) {
        const data = await r.json();
        const matches = data?.result?.addressMatches || [];
        entry.matchCount = matches.length;
        if (matches.length > 0) {
          const m = matches[0];
          entry.match = {
            address: m.matchedAddress,
            coords: m.coordinates,
            stateFips: m.geographies?.['Counties']?.[0]?.STATE || m.geographies?.['County Subdivisions']?.[0]?.STATE,
            countyFips: m.geographies?.['Counties']?.[0]?.COUNTY || m.geographies?.['County Subdivisions']?.[0]?.COUNTY,
            countyName: m.geographies?.['Counties']?.[0]?.NAME,
            subdivName: m.geographies?.['County Subdivisions']?.[0]?.NAME,
            geoKeys: Object.keys(m.geographies || {}),
          };
        }
      }
    } catch (e) {
      entry.error = e.message;
    }
    entry.ms = Date.now() - start;
    results.strategies.push(entry);
    return entry.match;
  }

  const enc = encodeURIComponent(q);

  // Strategy 1: Direct address
  let match = await tryStrategy('Direct address',
    `${base}/geographies/onelineaddress?address=${enc}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);

  // Strategy 2: ZIP with dummy address
  if (!match && /^\d{5}$/.test(q.trim())) {
    match = await tryStrategy('ZIP dummy address',
      `${base}/geographies/onelineaddress?address=${encodeURIComponent('1 Main St, ' + q.trim())}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);
  }

  // Strategy 3: City/place with dummy address
  if (!match) {
    match = await tryStrategy('City dummy address',
      `${base}/geographies/onelineaddress?address=${encodeURIComponent('1 Main St, ' + q)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);
  }

  // Strategy 4: Structured city,state (with dummy street to avoid 400)
  if (!match) {
    const parts = q.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      match = await tryStrategy('Structured city/state',
        `${base}/geographies/address?street=1+Main+St&city=${encodeURIComponent(parts[0])}&state=${encodeURIComponent(parts[1])}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);
    }
  }

  // Strategy 5: Append USA
  if (!match) {
    match = await tryStrategy('Append USA',
      `${base}/geographies/onelineaddress?address=${enc}%2C+USA&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);
  }

  // Strategy 6: Nominatim → Census coordinates reverse geocode
  let coordMatch = null;
  if (!match) {
    const start = Date.now();
    const entry = { name: 'Nominatim → Census coords', url: '', ms: 0, status: null, matchCount: 0, match: null, error: null };
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1&countrycodes=us`;
      entry.url = nomUrl;
      const nomResp = await fetch(nomUrl, {
        headers: { 'User-Agent': 'InfinityMarkets/1.2 (aric@forbescaprettohomes.com)' },
        signal: AbortSignal.timeout(8000),
      });
      entry.status = nomResp.status;
      if (nomResp.ok) {
        const nomData = await nomResp.json();
        if (nomData?.[0]) {
          const lat = parseFloat(nomData[0].lat);
          const lon = parseFloat(nomData[0].lon);
          const nomName = nomData[0].address?.town || nomData[0].address?.city || nomData[0].display_name?.split(',')[0] || q;

          const coordUrl = `${base}/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
          const coordData = await fetchJson(coordUrl);
          const geos = coordData?.result?.geographies;

          if (geos) {
            const counties = geos['Counties'] || [];
            const subdivs = geos['County Subdivisions'] || [];
            const county = counties[0] || {};
            const subdiv = subdivs[0] || {};
            const st = county.STATE || subdiv.STATE;
            const co = county.COUNTY || subdiv.COUNTY;

            if (st && co) {
              entry.matchCount = 1;
              entry.match = {
                address: nomData[0].display_name,
                coords: { x: lon, y: lat },
                stateFips: st,
                countyFips: co,
                countyName: county.NAME,
                subdivName: subdiv.NAME,
                geoKeys: Object.keys(geos),
                nominatimName: nomName,
              };
              coordMatch = entry.match;
            }
          }
        }
      }
    } catch (e) {
      entry.error = e.message;
    }
    entry.ms = Date.now() - start;
    results.strategies.push(entry);
  }

  // Strategy 7: fips_lookup name match
  if (!match && !coordMatch) {
    const start = Date.now();
    const entry = { name: 'fips_lookup name match', url: 'supabase:fips_lookup', ms: 0, status: null, matchCount: 0, match: null, error: null };
    try {
      const searchName = q.split(',')[0]?.trim();
      if (searchName?.length >= 2) {
        const { data } = await supabase
          .from('fips_lookup')
          .select('*')
          .ilike('name', searchName)
          .limit(1);
        const row = data?.[0];
        if (row && row.state_fips && row.county_fips) {
          entry.status = 200;
          entry.matchCount = 1;
          entry.match = {
            address: row.name,
            coords: { x: parseFloat(row.lon) || 0, y: parseFloat(row.lat) || 0 },
            stateFips: row.state_fips,
            countyFips: row.county_fips,
            countyName: null,
            subdivName: row.name,
            geoKeys: ['fips_lookup'],
          };
          coordMatch = entry.match;
        } else {
          entry.status = 200;
        }
      }
    } catch (e) {
      entry.error = e.message;
    }
    entry.ms = Date.now() - start;
    results.strategies.push(entry);
  }

  results.resolved = !!(match || coordMatch);
  results.finalMatch = match || coordMatch || null;
  return res.json(results);
});

// ── Test individual data sources ─────────────────────────────────────────────
// This endpoint mirrors EXACTLY what the actual routes do, including year
// fallbacks and HTML response detection. If a source shows green here,
// the actual study route will also get data from it.
router.get('/sources', async (req, res) => {
  const { stateFips, countyFips, cbsa, zips } = req.query;
  if (!stateFips || !countyFips) {
    return res.status(400).json({ error: 'stateFips and countyFips required. Example: /api/health/sources?stateFips=36&countyFips=029&cbsa=15380&zips=14221,14226' });
  }

  const { config, supabase } = req.app.locals;
  const censusKey = config.census_api_key;
  const censusBase = config.census_api_base || 'https://api.census.gov/data';
  const fredKey = config.fred_api_key;
  const fredBase = config.fred_api_base || 'https://api.stlouisfed.org/fred';
  const hudKey = config.hud_api_key;
  const beaKey = config.bea_api_key;
  const zipList = (zips || '').split(',').filter(Boolean);
  const results = {};
  const currentYear = new Date().getFullYear();

  async function testSource(name, fn) {
    const start = Date.now();
    try {
      const data = await fn();
      results[name] = { status: 'ok', ms: Date.now() - start, hasData: data != null, preview: summarize(data) };
    } catch (e) {
      results[name] = { status: 'error', ms: Date.now() - start, error: e.message };
    }
  }

  function summarize(obj) {
    if (Array.isArray(obj)) return `Array[${obj.length}]`;
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    const keys = Object.keys(obj);
    const out = {};
    keys.slice(0, 10).forEach(k => {
      const v = obj[k];
      out[k] = v === null ? null : Array.isArray(v) ? `Array[${v.length}]` : typeof v === 'object' ? '{...}' : v;
    });
    if (keys.length > 10) out['...'] = `+${keys.length - 10} more keys`;
    return out;
  }

  /** Fetch Census JSON with HTML detection. Returns null if HTML or error. */
  async function censusFetch(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const text = await r.text();
    if (text.trim().startsWith('<')) return null; // HTML error page
    return JSON.parse(text);
  }

  // Census ACS — tries multiple years like the actual route does
  await testSource('Census ACS', async () => {
    const years = [currentYear - 3, currentYear - 2, currentYear - 4]; // e.g. [2023, 2024, 2022]
    for (const yr of years) {
      const url = `${censusBase}/${yr}/acs/acs5?get=NAME,B01003_001E,B19013_001E&for=county:${countyFips}&in=state:${stateFips}&key=${censusKey}`;
      const data = await censusFetch(url);
      if (data && data.length >= 2) {
        return { year: yr, name: data[1][0], population: data[1][1], mhi: data[1][2] };
      }
    }
    throw new Error(`No ACS data for years ${years.join(', ')}`);
  });

  // Census PEP — population estimates
  await testSource('Census PEP', async () => {
    // Try vintage 2023 first, then 2022
    for (const vintage of [currentYear - 3, currentYear - 4]) {
      const popVar = vintage >= 2020 ? 'POP_2020' : 'POP';
      const url = `${censusBase}/${vintage}/pep/population?get=${popVar},DATE_CODE,DATE_DESC&for=county:${countyFips}&in=state:${stateFips}&key=${censusKey}`;
      const data = await censusFetch(url);
      if (data && data.length > 1) return { vintage, rows: data.length - 1 };
    }
    throw new Error('PEP unavailable (endpoint may have been restructured by Census)');
  });

  // FRED mortgage rate
  await testSource('FRED Mortgage', async () => {
    const url = `${fredBase}/series/observations?series_id=MORTGAGE30US&sort_order=desc&limit=1&api_key=${fredKey}&file_type=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const data = await r.json();
    return { rate: data?.observations?.[0]?.value, date: data?.observations?.[0]?.date };
  });

  // FRED unemployment — try fred_series_ref first, then LAUS pattern
  await testSource('FRED Unemployment', async () => {
    // Strategy 1: Check fred_series_ref for known series
    let seriesId = null;
    if (cbsa) {
      try {
        const { data } = await supabase.from('fred_series_ref').select('series_id').eq('cbsa_code', cbsa).eq('category', 'employment').limit(1).single();
        if (data) seriesId = data.series_id;
      } catch (_) {}
    }
    // Strategy 2: LAUS county pattern
    if (!seriesId) seriesId = `LAUCN${stateFips}${countyFips}0000000003`;
    
    const url = `${fredBase}/series/observations?series_id=${seriesId}&sort_order=desc&limit=1&api_key=${fredKey}&file_type=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${r.status} for series ${seriesId}`);
    const data = await r.json();
    const obs = data?.observations?.[0];
    if (!obs) throw new Error(`No observations for ${seriesId}`);
    return { seriesId, rate: obs.value, date: obs.date };
  });

  // Census BPS — building permits with year fallback
  await testSource('Census BPS', async () => {
    const years = [currentYear - 3, currentYear - 2, currentYear - 4]; // e.g. [2023, 2024, 2022]
    for (const yr of years) {
      const url = `${censusBase}/${yr}/bps/annperm?get=BLDGS_1UNIT,UNITS_1UNIT&for=county:${countyFips}&in=state:${stateFips}&key=${censusKey}`;
      const data = await censusFetch(url);
      if (data && data.length >= 2) {
        return { year: yr, headers: data[0], sf_units: data[1][1] };
      }
    }
    throw new Error(`No BPS data for years ${years.join(', ')}`);
  });

  // HUD FMR
  await testSource('HUD FMR', async () => {
    if (!hudKey) throw new Error('hud_api_key not set');
    const fips = `${stateFips}${countyFips}99999`;
    const url = `https://www.huduser.gov/hudapi/public/fmr/data/${fips}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${hudKey}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const data = await r.json();
    const fmr = data?.data?.basicdata;
    return { fmr_2br: fmr?.fmr_2, fmr_3br: fmr?.fmr_3 };
  });

  // BEA personal income
  await testSource('BEA', async () => {
    if (!beaKey) throw new Error('bea_api_key not set');
    const fips = `${stateFips}${countyFips}`;
    const url = `https://apps.bea.gov/api/data?&UserID=${beaKey}&method=GetData&datasetname=Regional&TableName=CAINC1&LineCode=1&GeoFips=${fips}&Year=2022,2023&ResultFormat=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const data = await r.json();
    const rows = data?.BEAAPI?.Results?.Data || [];
    return { rows: rows.length, sample: rows[0] };
  });

  // Supabase: Redfin data
  await testSource('Supabase redfin_monthly', async () => {
    if (!zipList.length) return { rows: 0, note: 'No ZIPs provided (need fips_lookup data or geocode ZIPs)' };
    const { data, error } = await supabase.from('redfin_monthly').select('zip_code, period_end', { count: 'exact' }).in('zip_code', zipList).limit(5);
    if (error) throw new Error(error.message);
    return { rows: data?.length || 0, sample: data?.slice(0, 2) };
  });

  // Supabase: Zillow data
  await testSource('Supabase zillow_zhvi', async () => {
    if (!zipList.length) return { rows: 0, note: 'No ZIPs provided (need fips_lookup data or geocode ZIPs)' };
    const { data, error } = await supabase.from('zillow_zhvi').select('region_name, period_date', { count: 'exact' }).in('region_name', zipList).limit(5);
    if (error) throw new Error(error.message);
    return { rows: data?.length || 0, sample: data?.slice(0, 2) };
  });

  // Supabase: LODES
  await testSource('Supabase lodes_commute', async () => {
    const fips = `${stateFips}${countyFips}`;
    const { data, error } = await supabase.from('lodes_commute').select('*').eq('municipality_fips', fips).limit(1);
    if (error) throw new Error(error.message);
    return { rows: data?.length || 0, sample: data?.[0] || null };
  });

  // fips_lookup
  await testSource('Supabase fips_lookup', async () => {
    const { data, error } = await supabase.from('fips_lookup').select('*').eq('state_fips', stateFips).eq('county_fips', countyFips);
    if (error) throw new Error(error.message);
    return { rows: data?.length || 0, hasZips: !!(data?.[0]?.zip_codes?.length), cbsa: data?.[0]?.cbsa_code, sample: data?.[0] };
  });

  return res.json({ query: req.query, results });
});

// ── Recent source logs ───────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  const { supabase } = req.app.locals;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const { data, error } = await supabase
      .from('source_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ count: data?.length || 0, logs: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
