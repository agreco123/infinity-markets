/**
 * Infinity Markets v1.0 — Geocode Route (Task 3)
 *
 * POST /api/geocode
 * Body: { query: "Cranberry Township, PA" }
 *
 * 1. Census Geocoder → lat/lon, FIPS codes
 * 2. Lookup CBSA from fips_lookup table
 * 3. Identify PMA ZIPs from subdivision FIPS
 * Returns: { lat, lon, stateFips, countyFips, subdivFips, name, msaName, cbsa, zips }
 */

const express = require('express');
const router = express.Router();

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} — ${url}`);
  return r.json();
}

router.post('/', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required' });

  const { config, supabase, sourceLog } = req.app.locals;
  const geocoderBase = config.census_geocoder_base || 'https://geocoding.geo.census.gov/geocoder';

  try {
    // Multi-strategy geocoder (C-4 fix)
    let match = null;

    // Strategy 1: Try as full address
    const encQuery = encodeURIComponent(query);
    const geoUrl = `${geocoderBase}/geographies/onelineaddress?address=${encQuery}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
    const geoData = await fetchJson(geoUrl);
    match = geoData?.result?.addressMatches?.[0];

    // Strategy 2: If numeric, treat as ZIP code with dummy address
    if (!match && /^\d{5}$/.test(query.trim())) {
      const zipUrl = `${geocoderBase}/geographies/onelineaddress?address=${encodeURIComponent('1 Main St, ' + query.trim())}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
      const zipData = await fetchJson(zipUrl);
      match = zipData?.result?.addressMatches?.[0];
    }

    // Strategy 3: Append dummy address for city/place names
    if (!match) {
      const placeUrl = `${geocoderBase}/geographies/onelineaddress?address=${encodeURIComponent('1 Main St, ' + query)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
      const placeData = await fetchJson(placeUrl);
      match = placeData?.result?.addressMatches?.[0];
    }

    // Strategy 4: Try Census structured address endpoint for city,state
    if (!match) {
      const parts = query.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        const city = parts[0];
        const state = parts[1];
        const structUrl = `${geocoderBase}/geographies/address?street=&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
        try {
          const structData = await fetchJson(structUrl);
          match = structData?.result?.addressMatches?.[0];
        } catch (_) {}
      }
    }

    // Strategy 5: Append ", USA" as last resort
    if (!match) {
      const usaUrl = `${geocoderBase}/geographies/onelineaddress?address=${encQuery}%2C+USA&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
      const usaData = await fetchJson(usaUrl);
      match = usaData?.result?.addressMatches?.[0];
    }

    await sourceLog.log({ source: 'Census Geocoder', tier: 'primary', url: geoUrl, status: match ? 'success' : 'error', confidence: match ? 'high' : 'none' });

    if (!match) {
      return res.status(404).json({ error: 'Location not found. Try a full address or city, state.' });
    }

    return processMatch(match, supabase, res);
  } catch (err) {
    await sourceLog.log({ source: 'Census Geocoder', tier: 'primary', url: '', status: 'error', error_message: err.message, confidence: 'none' });
    return res.status(500).json({ error: 'Geocoding failed', detail: err.message });
  }
});

async function processMatch(match, supabase, res) {
  const coords = match.coordinates;
  const geographies = match.geographies || {};

  // Extract FIPS from Census geographies
  const counties = geographies['Counties'] || geographies['Census Tracts'] || [];
  const subdivisions = geographies['County Subdivisions'] || [];
  const places = geographies['Incorporated Places'] || geographies['Census Designated Places'] || [];

  const county = counties[0] || {};
  const subdiv = subdivisions[0] || {};

  const stateFips = county.STATE || subdiv.STATE || '';
  const countyFips = county.COUNTY || subdiv.COUNTY || '';
  const subdivFips = subdiv.COUSUB || subdiv.PLACE || '';
  const placeName = subdiv.NAME || county.NAME || match.matchedAddress || '';

  // Step 2: Lookup CBSA from fips_lookup
  let cbsa = null;
  let msaName = null;
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

  // State abbreviation for downstream use (H-1 fix)
  const stateAbbr = FIPS_TO_STATE_ABBR[stateFips] || '';

  // Step 3: Get ZIPs for the PMA
  // zip_codes is a JSON array column per fips_lookup row
  let zips = [];
  try {
    const { data } = await supabase
      .from('fips_lookup')
      .select('zip_codes')
      .eq('state_fips', stateFips)
      .eq('county_fips', countyFips);
    zips = [...new Set((data || []).flatMap(r => r.zip_codes || []).filter(Boolean))];
  } catch (_) {}

  // If no ZIPs from fips_lookup, try Census TIGERweb
  if (zips.length === 0) {
    try {
      const tigerBase = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2023/MapServer/2/query';
      const tigerUrl = `${tigerBase}?where=STATE%3D%27${stateFips}%27+AND+COUNTY%3D%27${countyFips}%27&outFields=ZCTA5CE20&returnGeometry=false&f=json`;
      const tigerData = await fetchJson(tigerUrl);
      zips = [...new Set((tigerData?.features || []).map(f => f.attributes?.ZCTA5CE20).filter(Boolean))];
    } catch (_) {}
  }

  return res.json({
    lat: coords.y,
    lon: coords.x,
    stateFips,
    countyFips,
    subdivFips,
    stateAbbr,
    name: placeName,
    msaName,
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
