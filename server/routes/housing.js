/**
 * Infinity Markets v1.7 — Housing Route (Sprint 5.1)
 *
 * GET /api/housing?zips=16066,16046,16002&stateFips=42&countyFips=019&cbsa=38300
 *
 * Parallel calls:
 *   Redfin TSV (cached, ZIP filter) → median sale price, DOM, inventory, sale-to-list
 *   Zillow CSV (cached) → ZHVI by ZIP
 *   Census BPS → building permits SF + MF by place/county
 *   FHFA HPI → quarterly price index
 *   HMDA → mortgage origination activity
 *   HUD → Fair Market Rents
 *   FRED MORTGAGE30US → current mortgage rate
 *
 * Returns shape matching MOCK_HOUSING from v0.3 JSX.
 */

const express = require('express');
const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeNum(val, fallback = 0) {
  if (val === undefined || val === null || val === '' || val === '-') return fallback;
  const n = Number(String(val).replace(/,/g, ''));
  return isNaN(n) ? fallback : n;
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

function parseTSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split('\t');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ''; });
    return obj;
  });
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const splitRow = (row) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (const ch of row) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  };
  const headers = splitRow(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitRow(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

// ── Route ────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { zips, stateFips, countyFips, cbsa } = req.query;
  if (!stateFips || !countyFips) {
    return res.status(400).json({ error: 'stateFips and countyFips required' });
  }
  const zipList = (zips || '').split(',').map(z => z.trim()).filter(Boolean);

  try {
    const { config, supabase, sourceLog, cache, dataCache } = req.app.locals;
    const censusKey = config.census_api_key;
    const censusBase = config.census_api_base || 'https://api.census.gov/data';
    const fredKey = config.fred_api_key;
    const fredBase = config.fred_api_base || 'https://api.stlouisfed.org/fred';
    const hudKey = config.hud_api_key;

    // ── Parallel data collection ────────────────────────────────────────────

    const results = await Promise.allSettled([
      fetchRedfin(supabase, cache, zipList),
      fetchZillow(supabase, cache, zipList),
      fetchBuildingPermits(censusBase, censusKey, stateFips, countyFips),
      fetchFHFA(config, cache, stateFips, countyFips, cbsa),
      fetchHMDA(config, stateFips, countyFips),
      fetchHUD(hudKey, stateFips, countyFips, cbsa),
      fetchMortgageRate(fredBase, fredKey),
    ]);

    const sourceNames = ['Redfin', 'Zillow', 'Census BPS', 'FHFA HPI', 'HMDA', 'HUD FMR', 'FRED Mortgage'];
    for (let i = 0; i < results.length; i++) {
      const status = results[i].status === 'fulfilled' ? 'success' : 'error';
      await sourceLog.log({
        source: sourceNames[i],
        tier: i <= 2 ? 'primary' : 'secondary',
        url: '',
        status,
        error_message: status === 'error' ? results[i].reason?.message : null,
        confidence: status === 'success' ? 'high' : 'none',
      }).catch(() => {});
    }

    const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null;
    const redfin = val(0);
    const zillow = val(1);
    const permits = val(2);
    const fhfa = val(3);
    const hmda = val(4);
    const hud = val(5);
    const mortgage = val(6);

    // ── Assemble MOCK_HOUSING shape ─────────────────────────────────────────

    const payload = {
      totalUnits:      redfin?.totalInventory ?? null,
      vacancyRate:     null, // Requires ACS B25002 — filled by useStudy merge
      medianValue:     redfin?.medianSalePrice ?? null,
      valueGrowthYoY:  redfin?.priceGrowthYoY ?? null,
      medianDOM:       redfin?.medianDOM ?? null,
      saleToList:      redfin?.saleToList ?? null,
      monthsSupply:    redfin?.monthsSupply ?? null,
      medianRent:      hud?.fmr2br ?? null,
      permitsSF:       permits?.sf ?? [],
      permitsMF:       permits?.mf ?? [],
      priceTrend:      zillow?.priceTrend ?? [],
      vintage:         [], // ACS B25034 — filled by useStudy merge
      mortgageRate:    mortgage ?? null,
      affordableCeiling: null, // Calculated in demographics
    };

    // Persist building permits to Supabase for future studies
    if (dataCache && permits) {
      const permitData = (permits.sf || []).map((v, i) => ({
        year: parseInt(permits.sf[i]?.yr || 0) || null,
        name: permits.sf[i]?.name || null,
        sf: parseInt(permits.sf[i]?.v) || 0,
        mf: parseInt(permits.mf?.[i]?.v) || 0,
      })).filter(d => d.year);
      dataCache.cachePermits(stateFips, countyFips, permitData).catch(() => {});
    }

    return res.json(payload);
  } catch (err) {
    console.error('[housing] Unhandled error:', err);
    return res.status(500).json({ error: 'Housing data failed', detail: err.message });
  }
});

// ── Data Fetchers ────────────────────────────────────────────────────────────

/**
 * Redfin — query Supabase redfin_monthly table (pre-populated via ETL)
 * Replaces national TSV download that would OOM on Render (C-1 fix)
 */
async function fetchRedfin(supabase, cache, zipList) {
  if (!zipList.length) return null;

  const ck = `redfin_${zipList.join(',')}`;
  const cached = cache.get(ck);
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from('redfin_monthly')
      .select('*')
      .in('zip_code', zipList)
      .order('period_end', { ascending: false })
      .limit(zipList.length * 13); // 13 months for YoY calc

    if (error || !data?.length) return null;

    // Latest period
    const latestPeriod = data[0].period_end;
    const latest = data.filter(r => r.period_end === latestPeriod);

    const avg = (field) => {
      const vals = latest.map(r => safeNum(r[field])).filter(v => v > 0);
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };
    const avgDec = (field) => {
      const vals = latest.map(r => safeNum(r[field])).filter(v => v > 0);
      return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    };

    const medianSalePrice = avg('median_sale_price');
    const medianDOM = avg('median_dom');
    let saleToList = avgDec('avg_sale_to_list');
    if (saleToList && saleToList > 2) saleToList = saleToList / 100; // H-4: normalize percentage to decimal
    const monthsSupply = avgDec('months_of_supply');
    const totalInventory = avg('inventory');

    // YoY price growth
    let priceGrowthYoY = null;
    const periods = [...new Set(data.map(r => r.period_end))].sort();
    if (periods.length >= 13 && medianSalePrice) {
      const priorPeriod = periods[periods.length - 13];
      const priorRows = data.filter(r => r.period_end === priorPeriod);
      const priorVals = priorRows.map(r => safeNum(r.median_sale_price)).filter(v => v > 0);
      if (priorVals.length > 0) {
        const priorAvg = priorVals.reduce((a, b) => a + b, 0) / priorVals.length;
        priceGrowthYoY = priorAvg > 0 ? Math.round(((medianSalePrice - priorAvg) / priorAvg) * 1000) / 10 : null;
      }
    }

    const result = { medianSalePrice, medianDOM, saleToList, monthsSupply, totalInventory, priceGrowthYoY };
    cache.set(ck, result, 24 * 3600 * 1000);
    return result;
  } catch (_) {
    return null;
  }
}

/**
 * Zillow — query Supabase zillow_zhvi table (pre-populated via ETL)
 * Replaces national CSV download that would OOM on Render (C-1 fix)
 */
async function fetchZillow(supabase, cache, zipList) {
  if (!zipList.length) return null;

  const ck = `zillow_${zipList.join(',')}`;
  const cached = cache.get(ck);
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from('zillow_zhvi')
      .select('*')
      .eq('region_type', 'zip')
      .in('region_name', zipList)
      .order('period_date', { ascending: false })
      .limit(zipList.length * 6);

    if (error || !data?.length) return null;

    // Get unique periods, most recent 6
    const periods = [...new Set(data.map(r => r.period_date))].sort().slice(-6);

    const priceTrend = periods.map(period => {
      const rows = data.filter(r => r.period_date === period);
      const vals = rows.map(r => safeNum(r.zhvi_value)).filter(v => v > 0);
      const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length / 1000) : 0;
      const d = new Date(period);
      const mo = d.toLocaleString('en-US', { month: 'short' });
      const yr = String(d.getFullYear()).slice(-2);
      return { mo: `${mo} ${yr}`, v: avg };
    });

    const result = { priceTrend };
    cache.set(ck, result, 24 * 3600 * 1000);
    return result;
  } catch (_) {
    return null;
  }
}

/**
 * Census BPS — building permits, multi-year
 * Uses flat file download from https://www2.census.gov/econ/bps/County/co{YYYY}a.txt
 * (the Census BPS API /data/{yr}/bps/annperm does NOT exist)
 *
 * Flat file columns (0-indexed, comma-separated):
 *   0: Survey Date (year)
 *   1: State FIPS
 *   2: County FIPS
 *   3: Region Code
 *   4: Division Code
 *   5: County Name
 *   6-8:   1-unit  (Bldgs, Units, Value)
 *   9-11:  2-units (Bldgs, Units, Value)
 *   12-14: 3-4 units (Bldgs, Units, Value)
 *   15-17: 5+ units (Bldgs, Units, Value)
 *   18-29: Reported equivalents of the above
 *
 * File is ~3000 lines / ~370KB — cached in memory per year.
 */

// Module-level cache for BPS flat files (persists across requests within a process)
const _bpsFileCache = new Map();

async function fetchBuildingPermits(base, key, stateFips, countyFips) {
  const sf = [];
  const mf = [];
  const currentYear = new Date().getFullYear();
  // BPS annual data lags ~18 months. In April 2026, 2024 may be available, 2023 guaranteed.
  const years = [currentYear - 2, currentYear - 3, currentYear - 4, currentYear - 5];

  // Pad FIPS to match file format (state=2 digits, county=3 digits)
  const stPad = String(stateFips).padStart(2, '0');
  const coPad = String(countyFips).padStart(3, '0');

  for (const yr of years) {
    try {
      // Check module-level cache first
      const cacheKey = `bps_flat_${yr}`;
      let rows = _bpsFileCache.get(cacheKey);

      if (!rows) {
        const url = `https://www2.census.gov/econ/bps/County/co${yr}a.txt`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) continue; // Year not available yet

        const text = await resp.text();
        const lines = text.split('\n').filter(l => l.trim());

        // Skip the two header rows
        // Row 0: "Survey,FIPS,FIPS,Region,Division,County,,1-unit,,,..."
        // Row 1: "Date,State,County,Code,Code,Name,Bldgs,Units,Value,..."
        rows = [];
        for (let i = 2; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length >= 18) rows.push(cols);
        }

        // Cache for 24 hours (these files don't change once published)
        _bpsFileCache.set(cacheKey, rows);
        setTimeout(() => _bpsFileCache.delete(cacheKey), 24 * 3600 * 1000);
      }

      // Find the row matching our state + county FIPS
      const match = rows.find(cols =>
        String(cols[1]).padStart(2, '0') === stPad &&
        String(cols[2]).padStart(3, '0') === coPad
      );

      if (!match) continue;

      const countyName = match[5] || '';
      const sfUnits = safeNum(match[7]);   // 1-unit Units
      const mfUnits = safeNum(match[16]);  // 5+ units Units

      sf.push({ yr: String(yr), v: sfUnits, name: countyName });
      mf.push({ yr: String(yr), v: mfUnits });
    } catch (_) { /* year unavailable — skip silently */ }
  }

  sf.sort((a, b) => a.yr.localeCompare(b.yr));
  mf.sort((a, b) => a.yr.localeCompare(b.yr));
  return { sf, mf };
}

/**
 * FHFA HPI — quarterly price index
 */
async function fetchFHFA(config, cache, stateFips, countyFips, cbsa) {
  const downloadUrl = config.fhfa_hpi_download;
  if (!downloadUrl) return null;

  const CACHE_KEY = 'fhfa_hpi';
  let data = cache.get(CACHE_KEY);

  if (!data) {
    try {
      const text = await fetchText(downloadUrl);
      data = parseTSV(text);
      cache.set(CACHE_KEY, data, 24 * 60 * 60 * 1000);
    } catch (_) { return null; }
  }

  const filtered = cbsa
    ? data.filter(r => (r['place_id'] || r['cbsa'] || '') === cbsa)
    : data.filter(r => (r['state'] || r['place_id'] || '') === stateFips);

  if (filtered.length === 0) return null;

  const sorted = filtered.sort((a, b) => {
    const aK = `${a['yr'] || a['year']}${a['qtr'] || a['quarter']}`;
    const bK = `${b['yr'] || b['year']}${b['qtr'] || b['quarter']}`;
    return aK.localeCompare(bK);
  });

  return sorted.slice(-8).map(r => ({
    period: `${r['yr'] || r['year']}Q${r['qtr'] || r['quarter']}`,
    index: safeNum(r['index_nsa'] || r['index']),
  }));
}

/**
 * HMDA — mortgage origination
 */
async function fetchHMDA(config, stateFips, countyFips) {
  const browserUrl = config.hmda_data_browser;
  if (!browserUrl) return null;
  try {
    const fips = `${stateFips}${countyFips}`;
    const url = `${browserUrl}?counties=${fips}&actions_taken=1&years=2023`;
    return await fetchJson(url);
  } catch (_) { return null; }
}

/**
 * HUD — Fair Market Rents
 */
async function fetchHUD(apiKey, stateFips, countyFips, cbsa) {
  if (!apiKey) return null;
  const headers = { Authorization: `Bearer ${apiKey}` };

  // Try metro CBSA first (counties in metro areas use METRO entity ID)
  if (cbsa) {
    try {
      const metroId = `METRO${cbsa}M${cbsa}`;
      const url = `https://www.huduser.gov/hudapi/public/fmr/data/${metroId}`;
      console.log(`[housing] HUD FMR trying metro: ${metroId}`);
      const data = await fetchJson(url, { headers });
      const fmr = data?.data?.basicdata;
      if (fmr) {
        console.log(`[housing] HUD FMR success via metro ${metroId}`);
        return {
          fmr0br: safeNum(fmr?.fmr_0),
          fmr1br: safeNum(fmr?.fmr_1),
          fmr2br: safeNum(fmr?.fmr_2),
          fmr3br: safeNum(fmr?.fmr_3),
          fmr4br: safeNum(fmr?.fmr_4),
        };
      }
    } catch (err) {
      console.log(`[housing] HUD FMR metro ${cbsa} failed: ${err.message}, trying county FIPS`);
    }
  }

  // Fallback: county FIPS (for non-metro counties)
  try {
    const fips = `${stateFips}${countyFips}99999`;
    const url = `https://www.huduser.gov/hudapi/public/fmr/data/${fips}`;
    console.log(`[housing] HUD FMR trying county FIPS: ${fips}`);
    const data = await fetchJson(url, { headers });
    const fmr = data?.data?.basicdata;
    if (fmr) {
      console.log(`[housing] HUD FMR success via county ${fips}`);
      return {
        fmr0br: safeNum(fmr?.fmr_0),
        fmr1br: safeNum(fmr?.fmr_1),
        fmr2br: safeNum(fmr?.fmr_2),
        fmr3br: safeNum(fmr?.fmr_3),
        fmr4br: safeNum(fmr?.fmr_4),
      };
    }
    return null;
  } catch (err) {
    console.log(`[housing] HUD FMR county FIPS also failed: ${err.message}`);
    return null;
  }
}

/**
 * FRED — 30-year mortgage rate
 */
async function fetchMortgageRate(base, key) {
  try {
    const url = `${base}/series/observations?series_id=MORTGAGE30US&sort_order=desc&limit=1&api_key=${key}&file_type=json`;
    const data = await fetchJson(url);
    return data?.observations?.[0] ? safeNum(data.observations[0].value) : null;
  } catch (_) { return null; }
}

module.exports = router;
