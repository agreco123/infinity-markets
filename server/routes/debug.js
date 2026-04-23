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

// ─────────────────────────────────────────────────────────────────────────────
// v3.0 Phase 1 / Step 1 — /api/debug/provenance
// Walks the full study object (geo + demographics + housing + competition +
// Claude analysis) and tags every leaf with {path, value, source, tier}.
// ─────────────────────────────────────────────────────────────────────────────

// Subtrees rooted under these top-level keys come from live fetchers and are
// "measured" by default. If a leaf inside one of these subtrees is null, it
// downgrades to "missing" (the fetcher was expected to populate it and did
// not). These subtrees attach _sources/_source sidecars which we surface.
const MEASURED_ROOTS = new Set(['demographics', 'housing', 'competition', 'geo']);

// Paths below are post-enrichment in analysis.js — they exist because the
// enrichAnalysisForDeliverables pass synthesized them from upstream inputs
// (listings fallback, priceRange → midpoint, tier alias resolution, etc.).
// A leaf matching any of these regexes is classified as "derived" even if
// it sits under the analysis subtree.
const DERIVED_PATTERNS = [
  /^analysis\.pricing\.targetHomePrice$/,
  /^analysis\.pricing\.targetPriceRange/,
  /^analysis\.pricing\.bandedPricing(\[|\.)/,
  /^analysis\.pricing\.stratification\[\d+\]\.(name|tier|band|priceBand)$/,
  /^analysis\.absorption\.byPriceBand(\[|\.)/,
  /^analysis\.absorption\.monthsSupply$/,
  /^analysis\.absorption\.annualSalesRate$/,
  /^analysis\..*\._derivedFrom$/,
];

// Keys that always render as sentinels in the PDF and are "numeric" for the
// purpose of the 40% modeled-count gate. We don't count narrative strings.
function _isNumericLeaf(v) {
  if (v == null) return false;
  if (typeof v === 'number' && isFinite(v)) return true;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return false;
    // Currency / percent / numbery strings count as numeric.
    if (/^[-+$]?\s*[\d,]+(\.\d+)?\s*(%|USD)?$/.test(s)) return true;
    if (/^\d+(\.\d+)?\s*(months|mo|pct|units|days)$/i.test(s)) return true;
  }
  return false;
}

function _isMissingSentinel(v) {
  if (v == null) return true;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return true;
    if (['—', '-', 'N/A', 'n/a', 'null', 'undefined', '—,'].includes(s)) return true;
  }
  return false;
}

function _classifyTier(path, value, ctx) {
  // Missing first — a null under any tree is a gap.
  if (_isMissingSentinel(value)) return 'missing';

  // Derived patterns win over subtree defaults.
  for (const re of DERIVED_PATTERNS) if (re.test(path)) return 'derived';

  // Explicit _derivedFrom sidecar.
  if (ctx && ctx.hasDerivedFrom) return 'derived';

  const top = path.split('.')[0].split('[')[0];
  if (MEASURED_ROOTS.has(top)) return 'measured';

  // Analysis subtree without a derived pattern = modeled (Claude wrote it).
  if (top === 'analysis') return 'modeled';

  // Anything else (meta/env/etc.) — don't count.
  return 'meta';
}

// Resolve a source string for a leaf. Walks up the subtree looking for a
// _sources or _source sidecar keyed by the leaf name, falling back to the
// nearest enclosing _source.
function _resolveSource(pathSegments, valueOwner, rootObj) {
  // If the immediate parent has _sources[leafName], use that.
  if (valueOwner && typeof valueOwner === 'object') {
    const leaf = pathSegments[pathSegments.length - 1];
    const src = valueOwner._sources;
    if (src && typeof src === 'object' && src[leaf]) return String(src[leaf]);
    if (valueOwner._source) return String(valueOwner._source);
  }
  // Walk up toward root looking for any _sources/_source.
  const segs = pathSegments.slice(0, -1);
  let cursor = rootObj;
  let lastSource = null;
  for (const s of segs) {
    if (!cursor || typeof cursor !== 'object') break;
    if (cursor._source) lastSource = cursor._source;
    if (cursor._sources) lastSource = cursor._sources._root || lastSource;
    const next = s.includes('[') ? null : cursor[s];
    cursor = next;
  }
  return lastSource ? String(lastSource) : null;
}

// Recursive walker. Emits flat {path, value, source, tier} rows for every
// leaf (primitive or array element, excluding objects themselves).
function walkStudy(obj, rootObj, prefix, rows, options) {
  if (obj == null) return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      const p = `${prefix}[${i}]`;
      if (item != null && typeof item === 'object') {
        walkStudy(item, rootObj, p, rows, options);
      } else {
        _emit(p, item, obj, rootObj, rows);
      }
    });
    return;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      // Skip sidecar-only keys (don't want them as data leaves).
      if (k === '_sources' || k === '_source' || k === '_derivedFrom'
          || k === '_acsLevel' || k === '_acsNote') continue;
      const v = obj[k];
      const p = prefix ? `${prefix}.${k}` : k;
      if (v != null && typeof v === 'object') {
        walkStudy(v, rootObj, p, rows, options);
      } else {
        _emit(p, v, obj, rootObj, rows);
      }
    }
    return;
  }
  // primitive at root — shouldn't happen, but handle it.
  _emit(prefix, obj, null, rootObj, rows);
}

function _emit(path, value, owner, rootObj, rows) {
  const segs = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  const hasDerivedFrom = !!(owner && owner._derivedFrom);
  const tier = _classifyTier(path, value, { hasDerivedFrom });
  if (tier === 'meta') return;
  const source = _resolveSource(segs, owner, rootObj);
  rows.push({ path, value, source, tier });
}

router.get('/provenance', async (req, res) => {
  const query = req.query.query || 'Cranberry township PA';
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const result = {
    query,
    baseUrl,
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    version: 'v3.0-step1',
  };

  try {
    // Re-use study-raw's pipeline: geocode, then parallel fetches, then Claude.
    const geo = await internalPost(baseUrl, '/api/geocode', { query });
    if (!geo.ok) {
      result.error = `geocode ${geo.httpCode}`;
      result.geoData = geo.data;
      return res.json(result);
    }
    const geoData = geo.data || {};
    if (!geoData.stateFips || !geoData.countyFips || !Array.isArray(geoData.zips)) {
      result.error = 'geocode payload missing stateFips/countyFips/zips';
      result.geoData = geoData;
      return res.json(result);
    }
    result.geo = geoData;

    const params = `stateFips=${encodeURIComponent(geoData.stateFips)}`
                 + `&countyFips=${encodeURIComponent(geoData.countyFips)}`
                 + `&subdivFips=${encodeURIComponent(geoData.subdivFips || '')}`
                 + `&cbsa=${encodeURIComponent(geoData.cbsa || '')}`
                 + `&zips=${encodeURIComponent(geoData.zips.join(','))}`;

    const settled = await Promise.allSettled([
      internalGet(baseUrl, `/api/demographics?${params}`),
      internalGet(baseUrl, `/api/housing?${params}`),
      internalGet(baseUrl, `/api/competition?${params}`
        + `&city=${encodeURIComponent(geoData.name || '')}`
        + `&state=${encodeURIComponent(geoData.stateAbbr || '')}`),
    ]);
    const demographics = settled[0].status === 'fulfilled' ? (settled[0].value.data || {}) : {};
    const housing      = settled[1].status === 'fulfilled' ? (settled[1].value.data || {}) : {};
    const competition  = settled[2].status === 'fulfilled' ? (settled[2].value.data || {}) : {};

    // Claude analysis — reuse the real /api/analysis endpoint so the payload
    // matches production exactly.
    let analysis = {};
    try {
      const an = await internalPost(baseUrl, '/api/analysis', {
        targetArea: {
          name: geoData.name || query,
          stateAbbr: geoData.stateAbbr,
          stateFips: geoData.stateFips,
          countyFips: geoData.countyFips,
          subdivFips: geoData.subdivFips,
          cbsa: geoData.cbsa,
        },
        demographics,
        housing,
        competition,
      });
      if (an.ok) analysis = an.data || {};
      else result.analysisError = `analysis ${an.httpCode}`;
    } catch (err) {
      result.analysisError = err.message;
    }

    const study = { geo: geoData, demographics, housing, competition, analysis };
    const rows = [];
    walkStudy(study, study, '', rows, {});

    const totals = { measured: 0, derived: 0, modeled: 0, missing: 0, total: rows.length };
    let numericTotal = 0, modeledNumeric = 0;
    for (const r of rows) {
      totals[r.tier] = (totals[r.tier] || 0) + 1;
      if (_isNumericLeaf(r.value) || r.tier === 'missing') {
        numericTotal++;
        if (r.tier === 'modeled') modeledNumeric++;
      }
    }
    totals.numericTotal = numericTotal;
    totals.modeledNumericPct = numericTotal ? +(modeledNumeric / numericTotal * 100).toFixed(1) : 0;
    result.totals = totals;
    result.failed = totals.modeledNumericPct > 40;
    result.fields = rows;

    return res.json(result);
  } catch (err) {
    result.error = err.message;
    result.stack = err.stack;
    return res.status(500).json(result);
  }
});

// Expose classifier internals for the test harness.
module.exports._v3step1 = {
  MEASURED_ROOTS,
  DERIVED_PATTERNS,
  _isNumericLeaf,
  _isMissingSentinel,
  _classifyTier,
  _resolveSource,
  walkStudy,
};

// Lightweight self-check — confirms the route is mounted
router.get('/ping', (req, res) => {
  res.json({ ok: true, route: 'debug', version: 'v3.0-step1', timestamp: new Date().toISOString() });
});

module.exports = router;
// Re-attach internals after module.exports reassignment in some environments.
module.exports._v3step1 = {
  MEASURED_ROOTS,
  DERIVED_PATTERNS,
  _isNumericLeaf,
  _isMissingSentinel,
  _classifyTier,
  _resolveSource,
  walkStudy,
};
