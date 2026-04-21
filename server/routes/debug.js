/**
 * Infinity Markets v2.6 — Debug / Diagnostics Route
 *
 * GET /api/debug/study-raw?query=Cranberry+township+PA
 *
 * Returns the raw, tier-by-tier results of a full study run without any
 * post-processing, so we can see exactly which upstream data pipes are
 * populated vs. empty vs. erroring in production. This is the authoritative
 * source of truth for "why is Section X showing dashes?"
 *
 * Response shape:
 *   {
 *     query, timestamp,
 *     steps: [
 *       { phase: 'geocode',      status, httpCode, keys, county, subdivision, ... },
 *       { phase: 'demographics', status, httpCode, topLevelKeys, _sources, sampleValues: {...} },
 *       { phase: 'housing',      status, httpCode, topLevelKeys, _sources, sampleValues: {...} },
 *       { phase: 'competition',  status, httpCode, topLevelKeys, _sources, sampleValues: {...} },
 *     ],
 *     error? // populated on unhandled exception
 *   }
 *
 * Use in v2.6 Step 1 to diagnose the residual gaps in the Cranberry PDF:
 *   curl "https://infinity-markets.onrender.com/api/debug/study-raw?query=Cranberry+township+PA" | jq .
 */

const express = require('express');
const router  = express.Router();

// Helper — wrap Promise.allSettled result into a normalized diagnostic row
function summarize(settled, phase) {
  if (!settled) return { phase, status: 'missing' };
  if (settled.status === 'rejected') {
    return { phase, status: 'rejected', error: settled.reason && settled.reason.message };
  }
  const v = settled.value || {};
  const { ok, httpCode, data } = v;
  const d = data || {};
  return {
    phase,
    status: ok ? 'success' : 'fail',
    httpCode,
    topLevelKeys: Object.keys(d),
    _sources: d._sources || null,
    _acsLevel: d._acsLevel || null,
    _acsNote: d._acsNote || null,
    sampleValues: {
      // demographics
      population: d.population,
      mhi: d.mhi !== undefined ? d.mhi : d.medianIncome,
      households: d.households,
      ownerOccupied: d.ownerOccupied,
      renterOccupied: d.renterOccupied,
      totalHousingUnits: d.totalHousingUnits,
      mhiYoY: d.medianIncomeYoY !== undefined ? d.medianIncomeYoY : d.mhiYoY,
      unemploymentRate: d.unemploymentRate,
      vacancyRate: d.vacancyRate,
      // housing
      medianDOM: d.medianDOM,
      daysOnMarket: d.daysOnMarket,
      totalUnits: d.totalUnits,
      medianSalePrice: d.medianSalePrice,
      medianHomeValue: d.medianHomeValue,
      monthsSupply: d.monthsSupply,
      permitsLen: Array.isArray(d.permits) ? d.permits.length : null,
      listingsLen: Array.isArray(d.listings) ? d.listings.length
                   : Array.isArray(d.activeListings) ? d.activeListings.length : null,
      latestPermitYear: d.latestPermitYear,
      // competition
      builderCount: d.marketKPIs && d.marketKPIs.builderCount,
      communityCount: d.marketKPIs && d.marketKPIs.communityCount,
      activeListings: d.marketKPIs && d.marketKPIs.activeListings,
      medianListPrice: d.marketKPIs && d.marketKPIs.medianListPrice,
      compDaysOnMarket: d.marketKPIs && d.marketKPIs.daysOnMarket,
      builders: Array.isArray(d.builders)
        ? d.builders.slice(0, 10).map(b => ({ name: b.name, communities: b.communities, priceMin: b.priceMin, priceMax: b.priceMax }))
        : null,
      communitiesLen: Array.isArray(d.communities) ? d.communities.length : null,
    },
  };
}

// Wrapper: call an internal API route and capture httpCode + body + ok flag
async function internalGet(baseUrl, pathAndQuery) {
  const url = `${baseUrl}${pathAndQuery}`;
  try {
    const r = await fetch(url);
    let data = null;
    try { data = await r.json(); } catch (_) { data = { _parseError: 'non-JSON response' }; }
    return { ok: r.ok, httpCode: r.status, data };
  } catch (err) {
    throw new Error(`fetch ${url} failed: ${err.message}`);
  }
}

async function internalPost(baseUrl, pathAndQuery, body) {
  const url = `${baseUrl}${pathAndQuery}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await r.json(); } catch (_) { data = { _parseError: 'non-JSON response' }; }
    return { ok: r.ok, httpCode: r.status, data };
  } catch (err) {
    throw new Error(`fetch ${url} failed: ${err.message}`);
  }
}

router.get('/study-raw', async (req, res) => {
  const query = req.query.query || 'Cranberry township PA';
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const diagnostics = {
    query,
    baseUrl,
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    steps: [],
    env: {
      hasCensusKey: !!process.env.CENSUS_API_KEY,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasRapidApiKey: !!process.env.RAPIDAPI_KEY,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_KEY,
      nodeEnv: process.env.NODE_ENV || null,
    },
  };

  try {
    // Phase 1: Geocode
    let geoData = null;
    try {
      const geo = await internalPost(baseUrl, '/api/geocode', { query });
      geoData = geo.data || {};
      diagnostics.steps.push({
        phase: 'geocode',
        status: geo.ok ? 'success' : 'fail',
        httpCode: geo.httpCode,
        keys: Object.keys(geoData),
        name: geoData.name,
        stateAbbr: geoData.stateAbbr,
        stateFips: geoData.stateFips,
        countyFips: geoData.countyFips,
        subdivFips: geoData.subdivFips,
        cbsa: geoData.cbsa,
        county: geoData.county,
        countyName: geoData.countyName,
        subdivision: geoData.subdivision,
        subdivName: geoData.subdivName,
        cbsaName: geoData.cbsaName,
        msaName: geoData.msaName,
        lat: geoData.lat,
        lng: (geoData.lng !== undefined) ? geoData.lng : geoData.lon,
        lon: geoData.lon,
        zips: geoData.zips,
      });
      if (!geo.ok) return res.json(diagnostics);
    } catch (err) {
      diagnostics.steps.push({ phase: 'geocode', status: 'exception', error: err.message });
      return res.json(diagnostics);
    }

    // Required for downstream fetches
    if (!geoData.stateFips || !geoData.countyFips || !Array.isArray(geoData.zips)) {
      diagnostics.steps.push({
        phase: 'geocode-validation',
        status: 'fail',
        note: 'geocode payload missing stateFips / countyFips / zips — cannot proceed',
      });
      return res.json(diagnostics);
    }

    const params = `stateFips=${encodeURIComponent(geoData.stateFips)}`
                 + `&countyFips=${encodeURIComponent(geoData.countyFips)}`
                 + `&subdivFips=${encodeURIComponent(geoData.subdivFips || '')}`
                 + `&cbsa=${encodeURIComponent(geoData.cbsa || '')}`
                 + `&zips=${encodeURIComponent(geoData.zips.join(','))}`;

    // Phase 2-4: parallel fetches
    const settled = await Promise.allSettled([
      internalGet(baseUrl, `/api/demographics?${params}`),
      internalGet(baseUrl, `/api/housing?${params}`),
      internalGet(baseUrl, `/api/competition?${params}`
        + `&city=${encodeURIComponent(geoData.name || '')}`
        + `&state=${encodeURIComponent(geoData.stateAbbr || '')}`),
    ]);

    diagnostics.steps.push(summarize(settled[0], 'demographics'));
    diagnostics.steps.push(summarize(settled[1], 'housing'));
    diagnostics.steps.push(summarize(settled[2], 'competition'));

    return res.json(diagnostics);
  } catch (err) {
    diagnostics.error = err.message;
    diagnostics.stack = err.stack;
    return res.status(500).json(diagnostics);
  }
});

// Lightweight self-check — confirms the route is mounted
router.get('/ping', (req, res) => {
  res.json({ ok: true, route: 'debug', version: 'v2.6', timestamp: new Date().toISOString() });
});

module.exports = router;
