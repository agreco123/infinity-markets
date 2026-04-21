/**
 * Infinity Markets v1.2 — Geocode Route
 *
 * POST /api/geocode
 * Body: { query: "Amherst, NY" | "14221" | "123 Main St, Buffalo, NY" }
 *
 * 7-strategy geocoder:
 *   1-5: Census address geocoder (street addresses, ZIP with dummy, city dummy, structured, +USA)
 *   6:   Nominatim place-name → Census /coordinates reverse-geocode (towns, townships, cities)
 *   7:   fips_lookup table match (pre-seeded municipalities)
 *
 * Then: Lookup CBSA from fips_lookup / cbsa_county_xref, resolve PMA ZIPs
 * Returns: { lat, lon, stateFips, countyFips, subdivFips, name, msaName, cbsa, zips, stateAbbr }
 */

const express = require('express');
const router = express.Router();

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), ...opts });
  if (!r.ok) throw new Error(`${r.status} — ${url}`);
  return r.json();
}

/**
 * Parse a query into possible city + state components
 * "Amherst, NY" → { city: "Amherst", state: "NY" }
 * "14221" → null (ZIP code)
 * "123 Main St, Buffalo, NY" → { city: "Buffalo", state: "NY" } (best guess)
 */
function parseCityState(query) {
  const trimmed = query.trim();
  const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // Last part might be state (possibly with ZIP)
    const lastPart = parts[parts.length - 1].replace(/\d{5}(-\d{4})?/, '').trim();
    const stateCandidate = lastPart.length <= 3 ? lastPart : null;
    // Second-to-last part is likely the city (for "123 Main St, City, ST")
    const cityCandidate = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
    if (stateCandidate) return { city: cityCandidate, state: stateCandidate };
  }
  return null;
}

router.post('/', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required' });

  const { config, supabase, sourceLog } = req.app.locals;
  const geocoderBase = config.census_geocoder_base || 'https://geocoding.geo.census.gov/geocoder';

  try {
    let match = null;        // Census address match (has .coordinates + .geographies)
    let coordResult = null;  // Coordinate-based result (already has FIPS extracted)

    // ── Strategy 1: Try as full address ────────────────────────────────
    const encQuery = encodeURIComponent(query);
    const geoUrl = `${geocoderBase}/geographies/onelineaddress?address=${encQuery}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
    try {
      const geoData = await fetchJson(geoUrl);
      match = geoData?.result?.addressMatches?.[0] || null;
    } catch (_) {}

    // ── Strategy 2: ZIP code with dummy address ────────────────────────
    if (!match && /^\d{5}$/.test(query.trim())) {
      try {
        const zipUrl = `${geocoderBase}/geographies/onelineaddress?address=${encodeURIComponent('1 Main St, ' + query.trim())}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
        const zipData = await fetchJson(zipUrl);
        match = zipData?.result?.addressMatches?.[0] || null;
      } catch (_) {}
    }

    // ── Strategy 3: City/place with dummy address ─────────────────────
    if (!match) {
      try {
        const placeUrl = `${geocoderBase}/geographies/onelineaddress?address=${encodeURIComponent('1 Main St, ' + query)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
        const placeData = await fetchJson(placeUrl);
        match = placeData?.result?.addressMatches?.[0] || null;
      } catch (_) {}
    }

    // ── Strategy 4: Structured city,state endpoint ────────────────────
    if (!match) {
      const parts = query.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        try {
          const structUrl = `${geocoderBase}/geographies/address?street=1+Main+St&city=${encodeURIComponent(parts[0])}&state=${encodeURIComponent(parts[1])}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
          const structData = await fetchJson(structUrl);
          match = structData?.result?.addressMatches?.[0] || null;
        } catch (_) {}
      }
    }

    // ── Strategy 5: Append ", USA" ────────────────────────────────────
    if (!match) {
      try {
        const usaUrl = `${geocoderBase}/geographies/onelineaddress?address=${encQuery}%2C+USA&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
        const usaData = await fetchJson(usaUrl);
        match = usaData?.result?.addressMatches?.[0] || null;
      } catch (_) {}
    }

    // ── Strategy 6: Nominatim place name → Census reverse geocode ─────
    // This is the key fix for town/township names like "Amherst, NY"
    // that the Census address geocoder cannot resolve.
    if (!match) {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1&countrycodes=us`;
        const nomResp = await fetch(nomUrl, {
          headers: { 'User-Agent': 'InfinityMarkets/1.2 (aric@forbescaprettohomes.com)' },
          signal: AbortSignal.timeout(8000),
        });
        if (nomResp.ok) {
          const nomData = await nomResp.json();
          if (nomData?.[0]) {
            const lat = parseFloat(nomData[0].lat);
            const lon = parseFloat(nomData[0].lon);
            const nomName = nomData[0].address?.town || nomData[0].address?.city
              || nomData[0].address?.village || nomData[0].address?.hamlet
              || nomData[0].display_name?.split(',')[0] || query;

            // Reverse geocode through Census to get FIPS codes
            const coordUrl = `${geocoderBase}/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
            const coordData = await fetchJson(coordUrl);
            const geos = coordData?.result?.geographies;

            if (geos) {
              const counties = geos['Counties'] || [];
              const subdivs = geos['County Subdivisions'] || [];
              const county = counties[0] || {};
              const subdiv = subdivs[0] || {};
              const st = county.STATE || subdiv.STATE || '';
              const co = county.COUNTY || subdiv.COUNTY || '';

              if (st && co) {
                coordResult = {
                  lat, lon,
                  stateFips: st,
                  countyFips: co,
                  subdivFips: subdiv.COUSUB || subdiv.PLACE || '',
                  name: subdiv.NAME || county.NAME || nomName,
                };
              }
            }
          }
        }
      } catch (_) {}
    }

    // ── Strategy 7: fips_lookup table name match ──────────────────────
    // Matches pre-seeded municipalities by name (case-insensitive)
    if (!match && !coordResult) {
      const parsed = parseCityState(query);
      const searchName = parsed?.city || query.split(',')[0]?.trim();
      if (searchName?.length >= 2) {
        try {
          // Try matching against municipality_name column (case-insensitive)
          const { data } = await supabase
            .from('fips_lookup')
            .select('*')
            .ilike('name', searchName)
            .limit(1);
          const row = data?.[0];
          if (row && row.state_fips && row.county_fips) {
            coordResult = {
              lat: 0,  // fips_lookup has no lat/lon columns; Nominatim (Strategy 6) handles coords
              lon: 0,
              stateFips: row.state_fips,
              countyFips: row.county_fips,
              subdivFips: row.subdivision_fips || '',
              name: row.name || searchName,
              // Pre-resolved from fips_lookup
              _cbsa: row.cbsa_code || null,
              _msaName: row.cbsa_name || null,
              _zips: row.zip_codes || [],
            };
          }
        } catch (_) {
          // Column name mismatch or table structure different — skip silently
        }
      }
    }

    // ── Log result ────────────────────────────────────────────────────
    const resolved = !!(match || coordResult);
    await sourceLog.log({
      source: 'Census Geocoder',
      tier: 'primary',
      url: geoUrl,
      status: resolved ? 'success' : 'error',
      confidence: match ? 'high' : coordResult ? 'medium' : 'none',
      error_message: resolved ? null : 'All 7 strategies failed',
    });

    if (!resolved) {
      return res.status(404).json({ error: 'Location not found. Try a full address, city + state, or ZIP code.' });
    }

    // ── Process result ────────────────────────────────────────────────
    if (match) {
      return processMatch(match, supabase, res);
    } else {
      return processCoordResult(coordResult, supabase, res);
    }
  } catch (err) {
    await sourceLog.log({ source: 'Census Geocoder', tier: 'primary', url: '', status: 'error', error_message: err.message, confidence: 'none' });
    return res.status(500).json({ error: 'Geocoding failed', detail: err.message });
  }
});

// ── Process a Census address match ──────────────────────────────────────────
async function processMatch(match, supabase, res) {
  const coords = match.coordinates;
  const geographies = match.geographies || {};

  const counties = geographies['Counties'] || geographies['Census Tracts'] || [];
  const subdivisions = geographies['County Subdivisions'] || [];

  const county = counties[0] || {};
  const subdiv = subdivisions[0] || {};

  const stateFips = county.STATE || subdiv.STATE || '';
  const countyFips = county.COUNTY || subdiv.COUNTY || '';
  const subdivFips = subdiv.COUSUB || subdiv.PLACE || '';
  const placeName = subdiv.NAME || county.NAME || match.matchedAddress || '';

  // v2.6 Step 4 + v2.6.1: For Western PA (42) and Western NY (36), prefer the
  // hardcoded fallback map FIRST — those are the only markets this product serves
  // and the map is authoritative. Census NAME is used only as a tertiary fallback
  // for any non-Western-PA/NY markets that slip through.
  const censusCountyName = (county.NAME || '').replace(/\s+County$/i, '') || null;
  const censusSubdivName = subdiv.NAME || null;
  const isCore = (String(stateFips) === '42' || String(stateFips) === '36');
  const fallbackCountyName = isCore
    ? (lookupCountyFallback(stateFips, countyFips) || censusCountyName)
    : (censusCountyName || lookupCountyFallback(stateFips, countyFips));
  const fallbackSubdivName = isCore
    ? (lookupSubdivFallback(stateFips, countyFips, subdivFips) || censusSubdivName)
    : (censusSubdivName || lookupSubdivFallback(stateFips, countyFips, subdivFips));

  const result = {
    lat: coords.y,
    lon: coords.x,
    stateFips,
    countyFips,
    subdivFips,
    // v2.3: expose human-readable county + subdivision names for deliverables Section 2
    county: fallbackCountyName,
    subdivision: fallbackSubdivName,
    name: placeName,
  };

  return enrichAndRespond(result, supabase, res);
}

// ── v2.6 Step 4: Western PA / Western NY FIPS fallback maps ───────────────
// Used when Supabase fips_lookup table query returns nothing (unseeded or
// silent failure). Covers Forbes Capretto Homes' entire Western PA / WNY
// footprint. Keys are `${stateFips}_${countyFips}` for county map and
// `${stateFips}_${countyFips}_${subdivFips}` for subdivision map.
const WESTERN_PA_FIPS_FALLBACK = {
  '42_003': 'Allegheny',
  '42_005': 'Armstrong',
  '42_007': 'Beaver',
  '42_019': 'Butler',
  '42_021': 'Cambria',
  '42_031': 'Crawford',
  '42_033': 'Clearfield',
  '42_039': 'Crawford',
  '42_051': 'Fayette',
  '42_053': 'Forest',
  '42_059': 'Greene',
  '42_063': 'Indiana',
  '42_073': 'Lawrence',
  '42_085': 'Mercer',
  '42_121': 'Venango',
  '42_125': 'Washington',
  '42_129': 'Westmoreland',
};
const WESTERN_NY_FIPS_FALLBACK = {
  '36_029': 'Erie',
  '36_063': 'Niagara',
  '36_009': 'Cattaraugus',
  '36_013': 'Chautauqua',
  '36_073': 'Orleans',
  '36_121': 'Wyoming',
  '36_003': 'Allegany',
  '36_055': 'Monroe',
  '36_117': 'Wayne',
  '36_069': 'Ontario',
  '36_051': 'Livingston',
  '36_101': 'Steuben',
};
const WESTERN_PA_SUBDIVISION_FALLBACK = {
  // Butler County
  '42_019_16920': 'Cranberry',
  '42_019_03256': 'Adams',
  '42_019_47520': 'Jackson',
  '42_019_58168': 'Middlesex',
  '42_019_55936': 'Mars',
  '42_019_10472': 'Butler',
  '42_019_29544': 'Evans City',
  '42_019_87832': 'Zelienople',
  '42_019_35416': 'Forward',
  '42_019_26856': 'Economy',
  // Allegheny County
  '42_003_56200': 'Pine',
  '42_003_50328': 'McCandless',
  '42_003_71208': 'Ross',
  '42_003_52360': 'Marshall',
  '42_003_24528': 'Richland',
  '42_003_33408': 'Franklin Park',
  '42_003_37704': 'Hampton',
  '42_003_84656': 'West Deer',
  '42_003_10000': 'Baldwin',
  '42_003_77208': 'Upper St. Clair',
  '42_003_55856': 'Moon',
  '42_003_62072': 'North Fayette',
  '42_003_66928': 'Peters',
  '42_003_25128': 'Robinson',
  // Washington County
  '42_125_13296': 'Canonsburg',
  '42_125_43720': 'Peters',
  '42_125_52840': 'McDonald',
  '42_125_32248': 'Cecil',
  '42_125_85392': 'South Strabane',
  '42_125_52944': 'North Strabane',
  // Westmoreland
  '42_129_32608': 'Hempfield',
  '42_129_55944': 'North Huntingdon',
  '42_129_51960': 'Murrysville',
  '42_129_82080': 'Penn',
  // Beaver
  '42_007_16920': 'Center',
  '42_007_31344': 'Economy',
  '42_007_35432': 'Franklin',
  '42_007_32632': 'Hopewell',
};
const WESTERN_NY_SUBDIVISION_FALLBACK = {
  // Erie County — Amherst, Clarence, Orchard Park, Hamburg, Lancaster, etc.
  '36_029_02154': 'Alden',
  '36_029_01835': 'Amherst',
  '36_029_27485': 'Cheektowaga',
  '36_029_15495': 'Clarence',
  '36_029_33000': 'East Aurora',
  '36_029_27275': 'Grand Island',
  '36_029_30675': 'Hamburg',
  '36_029_40149': 'Lancaster',
  '36_029_54474': 'Orchard Park',
  '36_029_73796': 'West Seneca',
  '36_029_78032': 'Williamsville',
  '36_029_70564': 'Tonawanda',
  // Niagara County
  '36_063_36556': 'Lewiston',
  '36_063_54260': 'North Tonawanda',
  '36_063_84649': 'Wheatfield',
  '36_063_42389': 'Lockport',
  '36_063_79301': 'Wilson',
};

// v2.6.1: pad all FIPS keys so "19" and "019" (and numeric 19) all match.
function _padFips(s, n) {
  if (s == null) return '';
  return String(s).padStart(n, '0');
}
function lookupCountyFallback(stateFips, countyFips) {
  const st = _padFips(stateFips, 2);
  const co = _padFips(countyFips, 3);
  const key = `${st}_${co}`;
  return WESTERN_PA_FIPS_FALLBACK[key] || WESTERN_NY_FIPS_FALLBACK[key] || null;
}
function lookupSubdivFallback(stateFips, countyFips, subdivFips) {
  if (!subdivFips) return null;
  const st = _padFips(stateFips, 2);
  const co = _padFips(countyFips, 3);
  const sd = _padFips(subdivFips, 5);
  const key = `${st}_${co}_${sd}`;
  return WESTERN_PA_SUBDIVISION_FALLBACK[key] || WESTERN_NY_SUBDIVISION_FALLBACK[key] || null;
}

// ── Process a coordinate-based result (Nominatim + Census coords, or fips_lookup) ─
async function processCoordResult(cr, supabase, res) {
  // v2.5: enrich with county_name + subdivision_name from fips_lookup so
  // Section 2 of the report can show human-readable labels instead of dashes.
  let countyName = null, subdivName = null;
  if (supabase && cr.stateFips && cr.countyFips) {
    try {
      let q = supabase.from('fips_lookup')
        .select('county_name, subdivision_name')
        .eq('state_fips', cr.stateFips)
        .eq('county_fips', cr.countyFips);
      if (cr.subdivFips) q = q.eq('subdiv_fips', cr.subdivFips);
      const { data } = await q.limit(1).maybeSingle();
      countyName = data?.county_name || null;
      subdivName = data?.subdivision_name || null;
    } catch (_) {}
  }

  // v2.6 Step 4 + v2.6.1: for Western PA/NY prefer fallback map over Supabase fips_lookup
  // because the map is authoritative and fips_lookup may be under-seeded.
  const _isCore = (String(cr.stateFips) === '42' || String(cr.stateFips) === '36');
  if (_isCore) {
    const mapCounty = lookupCountyFallback(cr.stateFips, cr.countyFips);
    const mapSubdiv = lookupSubdivFallback(cr.stateFips, cr.countyFips, cr.subdivFips);
    if (mapCounty) countyName = mapCounty;
    if (mapSubdiv) subdivName = mapSubdiv;
  } else {
    if (!countyName) countyName = lookupCountyFallback(cr.stateFips, cr.countyFips);
    if (!subdivName) subdivName = lookupSubdivFallback(cr.stateFips, cr.countyFips, cr.subdivFips);
  }

  const result = {
    lat: cr.lat,
    lon: cr.lon,
    stateFips: cr.stateFips,
    countyFips: cr.countyFips,
    subdivFips: cr.subdivFips,
    name: cr.name,
    county: countyName ? countyName.replace(/\s+County$/i, '') : null,
    subdivision: subdivName || cr.name || null,
    // Pre-resolved values from fips_lookup (Strategy 7)
    _cbsa: cr._cbsa || null,
    _msaName: cr._msaName || null,
    _zips: cr._zips || null,
  };

  return enrichAndRespond(result, supabase, res);
}

// ── Shared: resolve CBSA, ZIPs, state abbreviation ──────────────────────────
async function enrichAndRespond(result, supabase, res) {
  const { stateFips, countyFips } = result;

  // CBSA resolution (use pre-resolved if available)
  let cbsa = result._cbsa || null;
  let msaName = result._msaName || null;

  if (!cbsa) {
    // Try fips_lookup first
    try {
      const { data } = await supabase
        .from('fips_lookup')
        .select('cbsa_code, cbsa_name')
        .eq('state_fips', stateFips)
        .eq('county_fips', countyFips)
        .not('cbsa_code', 'is', null)
        .limit(1)
        .single();
      cbsa = data?.cbsa_code || null;
      msaName = data?.cbsa_name || null;
    } catch (_) {}
  }

  // Fallback: try cbsa_county_xref table
  if (!cbsa) {
    try {
      const { data } = await supabase
        .from('cbsa_county_xref')
        .select('cbsa_code, cbsa_name')
        .eq('state_fips', stateFips)
        .eq('county_fips', countyFips)
        .limit(1)
        .single();
      cbsa = data?.cbsa_code || null;
      msaName = data?.cbsa_name || null;
    } catch (_) {}
  }

  // State abbreviation
  const stateAbbr = FIPS_TO_STATE_ABBR[stateFips] || '';

  // ZIP resolution (use pre-resolved if available)
  let zips = (result._zips && result._zips.length > 0) ? result._zips : [];

  if (zips.length === 0) {
    try {
      const { data } = await supabase
        .from('fips_lookup')
        .select('zip_codes')
        .eq('state_fips', stateFips)
        .eq('county_fips', countyFips);
      zips = [...new Set((data || []).flatMap(r => r.zip_codes || []).filter(Boolean))];
    } catch (_) {}
  }

  // Fallback: TIGERweb ZCTAs
  if (zips.length === 0) {
    try {
      const tigerBase = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2023/MapServer/2/query';
      const tigerUrl = `${tigerBase}?where=STATE%3D%27${stateFips}%27+AND+COUNTY%3D%27${countyFips}%27&outFields=ZCTA5CE20&returnGeometry=false&f=json`;
      const tigerData = await fetchJson(tigerUrl);
      zips = [...new Set((tigerData?.features || []).map(f => f.attributes?.ZCTA5CE20).filter(Boolean))];
    } catch (_) {}
  }

  return res.json({
    lat: result.lat,
    lon: result.lon,
    // v2.5: lng alias for deliverables Section 2 coord formatter
    lng: result.lon,
    stateFips,
    countyFips,
    subdivFips: result.subdivFips,
    stateAbbr,
    name: result.name,
    // v2.5: human-readable labels for Section 2
    // v2.6.1: emit every alias the downstream renderers look for (county/countyName,
    // subdivision/subdivName/subdivisionName) — contract hardening.
    county: result.county || null,
    countyName: result.county || null,
    subdivision: result.subdivision || null,
    subdivName: result.subdivision || null,
    subdivisionName: result.subdivision || null,
    msaName,
    cbsaName: msaName,
    cbsa,
    zips,
  });
}

// ── State FIPS → abbreviation ────────────────────────────────────────────────
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
