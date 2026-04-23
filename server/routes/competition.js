/**
 * Infinity Markets v1.6 — Competition Route
 *
 * GET /api/competition?zips=16066,16046,16002&city=Cranberry+Township&state=PA
 *
 * Sources:
 * RapidAPI Realtor → new construction listings (POST v3/list, cached 7d/ZIP, 500 req/mo)
 * Supabase communities → manual/cached community data fallback
 * NewHomeSource → community list by city
 * SEC EDGAR → public builder financials
 *
 * v1.6 fixes:
 * - [Object Object] bug: added safeStr() to flatten nested objects from API responses
 * - All community and builder fields are now guaranteed to be primitives (string/number/null)
 * - incentives, builder, schoolDist, positioning all safe-stringified
 *
 * v1.5 fixes:
 * - RapidAPI: changed from GET+query to POST+JSON body (v3/list requires POST)
 * - Added Supabase communities table fallback
 * - Added _sources metadata for citation provenance
 * - Fixed api_usage increment logic
 *
 * Returns { communities[], builders[], publicBenchmarks[], _sources }
 */
const express = require('express');
const { makeFetchStatus, FETCH_STATUS } = require('../lib/sourceLog');
const router  = express.Router();

function safeNum(v, fb = 0) {
  if (v == null || v === '' || v === '-') return fb;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? fb : n;
}

/**
 * safeStr — flatten any value to a display-safe string.
 * Prevents [Object Object] rendering in DataTable, PDF, and XLSX.
 *   - null/undefined → null (displayed as '—' by formatters)
 *   - string/number  → pass through
 *   - array of strings → join with ", "
 *   - array of objects → extract .name/.type/.description, join
 *   - plain object    → extract .name or .description or JSON key:val pairs
 */
/** Metadata keys to skip when flattening objects (GraphQL, RapidAPI internals) */
const SKIP_KEYS = new Set([
  '__typename', 'property_id', 'listing_id', 'mls_id', 'permalink',
  'href', 'photo', 'photos', 'thumbnail', 'flags', 'tags', 'source',
  'branding', 'advertisers', 'products', 'lead_attributes',
]);

function safeStr(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    return v.map(item => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) {
        return item.name || item.type || item.description || item.text || JSON.stringify(item);
      }
      return String(item);
    }).join(', ');
  }
  if (typeof v === 'object') {
    if (v.name) return v.name;
    if (v.description) return v.description;
    if (v.type && v.amount) return `${v.type}: $${Number(v.amount).toLocaleString('en-US')}`;
    if (v.type) return v.type;
    if (v.text) return v.text;
    // Filter out metadata/internal keys before flattening
    const entries = Object.entries(v).filter(([k, val]) => val != null && val !== '' && !SKIP_KEYS.has(k) && typeof val !== 'object');
    if (entries.length === 0) return null;
    return entries.map(([k, val]) => `${k}: ${val}`).join(', ');
  }
  return String(v);
}

/**
 * extractName — smart community name extraction from RapidAPI listing objects.
 * Tries string fields first, then digs into nested address/location objects.
 */
function extractName(l) {
  // Direct string fields (most common)
  const direct = l.community || l.subdivision || l.plan_name;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  // Nested address object — try neighborhood, city
  const addr = l.address || l.location?.address || {};
  if (typeof addr === 'object') {
    const neighborhood = addr.neighborhood || addr.subdivision;
    if (typeof neighborhood === 'string' && neighborhood.trim()) return neighborhood.trim();
    const city = addr.city || addr.locality;
    if (typeof city === 'string' && city.trim()) return city.trim();
  }

  // location.address.city as string
  const locCity = l.location?.address?.city;
  if (typeof locCity === 'string' && locCity.trim()) return locCity.trim();

  // Fallback: try address line
  const line = l.address?.line || l.location?.address?.line;
  if (typeof line === 'string' && line.trim()) return line.trim();

  return null;
}

/**
 * v2.3: Brokerage / MLS listing-agent patterns.
 */
const BROKERAGE_PATTERNS = [
  /sotheby/i, /berkshire\s*hathaway/i, /coldwell\s*banker/i, /keller\s*williams/i,
  /re\/?max/i, /century\s*21/i, /howard\s*hanna/i, /compass/i, /\bexp\s*realty/i,
  /piatt/i, /allen\s*tate/i, /better\s*homes\s*and\s*gardens/i, /weichert/i,
  /long\s*&\s*foster/i, /zillow/i, /redfin/i, /trulia/i,
  /\brealty\b/i, /\brealtors?\b/i, /real\s*estate/i, /\bbrokerage\b/i,
  // V41P-8 / W-8 — WNY brokerage additions (from Newstead post-deploy audit).
  /gurney[\s,]*becker/i, /hunt\s*real\s*estate/i, /hanna\s*holdings/i,
  /mj\s*peterson/i, /bhhs/i, /berkshire\s*hathaway\s*home/i,
  /cushman\s*&\s*wakefield/i, /jll\b/i, /colliers/i,
];

const KNOWN_BUILDERS = new Set([
  'NVR', 'NVR Inc.', 'Ryan Homes', 'Heartland Homes', 'NVHomes',
  'Lennar', 'D.R. Horton', 'DR Horton', 'PulteGroup', 'Pulte Homes', 'Centex',
  'Toll Brothers', 'KB Home', 'Meritage Homes', 'Taylor Morrison',
  'M/I Homes', 'MI Homes', 'Beazer Homes', 'Tri Pointe', 'Tripointe',
  'Maronda Homes', 'Costa Homebuilders', 'Eddy Homes', 'Paragon Homes',
  'Charter Homes', 'Heartland', 'Buncher', 'Weaver Homes', 'Falkirk Homes',
]);

/**
 * v2.5: Subdivision/community name suffix blocklist.
 * When RapidAPI Realtor returns a listing without an explicit builder field, extractBuilder()
 * falls back to the community name - erroneously seeding the builder list with names like
 * "Leslie Farms" or "Oakwood Estates". Names matching these suffixes AND not in KNOWN_BUILDERS
 * are treated as community names, not builders, and dropped from the builder summary.
 */
const COMMUNITY_NAME_SUFFIXES = [
  /\bfarms?\b/i, /\bestates?\b/i, /\bmeadows?\b/i, /\bridge\b/i, /\bpointe?\b/i,
  /\bvillage\b/i, /\bmanor\b/i, /\bcommons?\b/i, /\bcrossings?\b/i, /\bglen\b/i,
  /\bwoods?\b/i, /\bpark\b/i, /\bplace\b/i, /\bheights\b/i, /\bhills?\b/i,
  /\blanding\b/i, /\bgardens?\b/i, /\breserve\b/i, /\bpreserve\b/i, /\btrails?\b/i,
  /\bviews?\b/i, /\bshores?\b/i, /\bterrace\b/i,
];

function isCommunityName(name) {
  if (!name || typeof name !== 'string') return false;
  if (KNOWN_BUILDERS.has(name)) return false;
  return COMMUNITY_NAME_SUFFIXES.some(rx => rx.test(name));
}

// V41P-2 / W-2 — compute P25/median/P75 quartiles from raw Realtor listings.
// Returns { n, p25, median, p75, medianSqft, medianPsf } or null when
// fewer than 5 usable listings exist. Listings are considered usable when
// price > 0; sqft-derived stats use only listings with both price and sqft.
function computeListingQuartiles(listings) {
  if (!Array.isArray(listings) || listings.length === 0) return null;
  const prices = [];
  const sqfts  = [];
  const psfs   = [];
  for (const l of listings) {
    if (!l) continue;
    const p = Number(l.price != null ? l.price : l.list_price);
    const s = Number(l.sqft != null ? l.sqft
                      : (l.building_size && l.building_size.size) ? l.building_size.size
                      : (l.description && l.description.sqft) ? l.description.sqft : null);
    if (Number.isFinite(p) && p > 0) prices.push(p);
    if (Number.isFinite(p) && p > 0 && Number.isFinite(s) && s > 0) {
      sqfts.push(s);
      psfs.push(p / s);
    }
  }
  if (prices.length < 5) return null;
  prices.sort((a, b) => a - b);
  sqfts.sort((a, b) => a - b);
  psfs.sort((a, b) => a - b);
  const q = (arr, pct) => {
    if (!arr.length) return null;
    const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * pct)));
    return arr[idx];
  };
  return {
    n: prices.length,
    p25:        Math.round(q(prices, 0.25)),
    median:     Math.round(q(prices, 0.50)),
    p75:        Math.round(q(prices, 0.75)),
    medianSqft: sqfts.length ? Math.round(q(sqfts, 0.50)) : null,
    medianPsf:  psfs.length  ? Math.round(q(psfs,  0.50)) : null,
  };
}

function isBrokerage(name) {
  if (!name || typeof name !== 'string') return false;
  if (KNOWN_BUILDERS.has(name)) return false;
  return BROKERAGE_PATTERNS.some(rx => rx.test(name));
}

/**
 * extractBuilder — v2.3 rejects MLS brokerage names.
 */
function extractBuilder(l) {
  if (typeof l.builder === 'string' && l.builder.trim()) {
    const v = l.builder.trim();
    if (!isBrokerage(v)) return v;
  }
  if (typeof l.builder === 'object' && l.builder?.name) {
    if (!isBrokerage(l.builder.name)) return l.builder.name;
  }
  const branding = l.branding?.name || l.branding?.listing_agent?.name;
  if (typeof branding === 'string' && branding.trim()) {
    const v = branding.trim();
    if (!isBrokerage(v)) return v;
  }
  const agents = l.source?.agents || l.advertisers;
  if (Array.isArray(agents) && agents.length > 0) {
    const office = agents[0]?.office_name || agents[0]?.office?.name || agents[0]?.name;
    if (typeof office === 'string' && office.trim() && !isBrokerage(office)) {
      return office.trim();
    }
  }
  return 'Unknown';
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} — ${url}`);
  return r.json();
}

const PUBLIC_BUILDERS = [
  { ticker: 'NVR',  cik: '0000906163', name: 'NVR Inc.'    },
  { ticker: 'LEN',  cik: '0000920760', name: 'Lennar'      },
  { ticker: 'DHI',  cik: '0000882184', name: 'D.R. Horton' },
  { ticker: 'PHM',  cik: '0000822416', name: 'PulteGroup'  },
  { ticker: 'TOL',  cik: '0000794170', name: 'Toll Brothers'},
];

router.get('/', async (req, res) => {
  const { zips, city, state } = req.query;
  const zipList = (zips || '').split(',').map(z => z.trim()).filter(Boolean);
  const { config, sourceLog, cache, supabase, dataCache } = req.app.locals;

  const results = await Promise.allSettled([
    fetchRapidAPIRealtor(config, cache, zipList, supabase),
    fetchSupabaseCommunities(supabase, zipList, city),
    fetchNewHomeSource(config, cache, city, state),
    fetchSECEdgar(config, cache, supabase),
    // v2.5: NHS-seeded communities from Supabase - populated by /api/etl/seed-nhs
    fetchSeededNHSCommunities(supabase, zipList),
  ]);

  const srcNames = ['RapidAPI Realtor', 'Supabase Communities', 'NewHomeSource', 'SEC EDGAR', 'NHS Seeded Cache'];
  for (let i = 0; i < results.length; i++) {
    const ok = results[i].status === 'fulfilled';
    await sourceLog.log({
      source: srcNames[i], tier: i === 0 ? 'primary' : 'secondary',
      url: '', status: ok ? 'success' : 'error',
      error_message: ok ? null : results[i].reason?.message,
      confidence: ok ? 'high' : 'none'
    }).catch(() => {});
  }

  // v4.1 (V41-2 / H-1): per-source fetch-status table.
  const _fetchStatus = {};
  for (let i = 0; i < results.length; i++) {
    _fetchStatus[srcNames[i]] = makeFetchStatus(results[i]);
  }

  const val = i => results[i].status === 'fulfilled' ? results[i].value : null;
  const realtor    = val(0) || [];
  const sbComms    = val(1) || [];
  const nhs        = val(2) || [];
  const edgar      = val(3) || [];
  const nhsSeeded  = val(4) || [];

  // ── Build communities from listings ─────────────────────────────────────
  const cMap = new Map();
  for (const l of realtor) {
    const name = extractName(l) || 'Unknown';
    if (!cMap.has(name)) cMap.set(name, {
      name,
      builder:    extractBuilder(l),
      product:    inferProduct(l),
      plans:      0,
      sfLow:      Infinity,
      sfHigh:     0,
      priceLow:   Infinity,
      priceHigh:  0,
      psfAcc:     [],
      lotsTotal:  null,
      lotsSold:   null,
      lotsRemain: null,
      monthlyAbs: null,
      openDate:   null,
      incentives: safeStr(l.incentives) || null,
      hoa:        safeNum(typeof l.hoa === 'object' ? l.hoa?.fee || l.hoa?.amount : l.hoa),
      schoolDist: safeStr(l.school_district) || null
    });
    const c = cMap.get(name);
    c.plans++;
    const sf    = safeNum(l.sqft || l.building_size?.size || l.description?.sqft);
    const price = safeNum(l.price || l.list_price);
    if (sf > 0)    { c.sfLow = Math.min(c.sfLow, sf); c.sfHigh = Math.max(c.sfHigh, sf); }
    if (price > 0) { c.priceLow = Math.min(c.priceLow, price); c.priceHigh = Math.max(c.priceHigh, price); }
    if (sf > 0 && price > 0) c.psfAcc.push(price / sf);
  }

  // Add Supabase communities (manual entries or cached from prior runs)
  for (const comm of sbComms) {
    const name = safeStr(comm.name || comm.community_name);
    if (!name || cMap.has(name)) continue;
    cMap.set(name, {
      name,
      builder:    safeStr(comm.builder) || 'Unknown',
      product:    safeStr(comm.product_type) || 'SFD',
      plans:      safeNum(comm.plan_count),
      sfLow:      safeNum(comm.sf_low),
      sfHigh:     safeNum(comm.sf_high),
      priceLow:   safeNum(comm.price_low),
      priceHigh:  safeNum(comm.price_high),
      psfAcc:     [],
      lotsTotal:  safeNum(comm.lots_total) || null,
      lotsSold:   safeNum(comm.lots_sold)  || null,
      lotsRemain: safeNum(comm.lots_remaining) || null,
      monthlyAbs: safeNum(comm.monthly_absorption) || null,
      openDate:   safeStr(comm.open_date) || null,
      incentives: safeStr(comm.incentives) || null,
      hoa:        safeNum(comm.hoa),
      schoolDist: safeStr(comm.school_district) || null
    });
  }

  // Add NewHomeSource communities
  for (const comm of nhs) {
    const name = safeStr(comm.name || comm.communityName);
    if (!name || cMap.has(name)) continue;
    cMap.set(name, {
      name,
      builder:    safeStr(comm.builder || comm.builderName) || 'Unknown',
      product:    safeStr(comm.productType) || 'SFD',
      plans:      safeNum(comm.planCount || comm.plans),
      sfLow:      safeNum(comm.sqftLow),
      sfHigh:     safeNum(comm.sqftHigh),
      priceLow:   safeNum(comm.priceLow),
      priceHigh:  safeNum(comm.priceHigh),
      psfAcc:     [],
      lotsTotal:  safeNum(comm.totalLots) || null,
      lotsSold:   safeNum(comm.soldLots)  || null,
      lotsRemain: safeNum(comm.remainingLots) || null,
      monthlyAbs: null,
      openDate:   safeStr(comm.openDate) || null,
      incentives: safeStr(comm.incentives) || null,
      hoa:        safeNum(comm.hoa),
      schoolDist: safeStr(comm.schoolDistrict) || null
    });
  }

  // v2.5: Add NHS-seeded communities from Supabase (populated by scraper / /api/etl/seed-nhs).
  // Columns follow public.communities schema (see server/migrations/001_communities.sql).
  for (const comm of nhsSeeded) {
    const name = safeStr(comm.name || comm.community_name);
    if (!name || cMap.has(name)) continue;
    cMap.set(name, {
      name,
      builder:    safeStr(comm.builder) || 'Unknown',
      product:    safeStr(comm.product_type) || 'SFD',
      plans:      safeNum(comm.plan_count),
      sfLow:      safeNum(comm.sf_low),
      sfHigh:     safeNum(comm.sf_high),
      priceLow:   safeNum(comm.price_low),
      priceHigh:  safeNum(comm.price_high),
      psfAcc:     comm.price_per_sqft ? [safeNum(comm.price_per_sqft)] : [],
      lotsTotal:  safeNum(comm.lots_total) || null,
      lotsSold:   safeNum(comm.lots_sold)  || null,
      lotsRemain: safeNum(comm.lots_remaining) || null,
      monthlyAbs: safeNum(comm.monthly_absorption) || null,
      openDate:   safeStr(comm.open_date) || null,
      incentives: safeStr(comm.incentives) || null,
      hoa:        safeNum(comm.hoa),
      schoolDist: safeStr(comm.school_district) || null
    });
  }

  const communities = [...cMap.values()].map(c => ({
    name:       c.name,
    builder:    c.builder,
    product:    c.product,
    plans:      c.plans,
    sfLow:      c.sfLow === Infinity ? null : c.sfLow,
    sfHigh:     c.sfHigh === 0 ? null : c.sfHigh,
    priceLow:   c.priceLow === Infinity ? null : c.priceLow,
    priceHigh:  c.priceHigh === 0 ? null : c.priceHigh,
    psfAvg:     c.psfAcc.length ? Math.round(c.psfAcc.reduce((a, b) => a + b, 0) / c.psfAcc.length) : null,
    lotsTotal:  c.lotsTotal,
    lotsSold:   c.lotsSold,
    lotsRemain: c.lotsRemain,
    monthlyAbs: c.monthlyAbs,
    openDate:   c.openDate,
    incentives: c.incentives,
    hoa:        c.hoa,
    schoolDist: c.schoolDist,
  }));

  // ── Builder summary ─────────────────────────────────────────────────────
  // v2.3: drop Unknown / brokerage; enrich with priceMin/Max/avgSqft/pricePerSqft.
  const bMap = new Map();
  for (const c of communities) {
    const bname = c.builder;
    if (!bname || bname === 'Unknown' || isBrokerage(bname) || isCommunityName(bname)) continue;
    if (!bMap.has(bname)) bMap.set(bname, {
      name: bname, communities: 0, priceAcc: [], sfAcc: [], psfAcc: [],
      priceMin: Infinity, priceMax: 0,
    });
    const b = bMap.get(bname);
    b.communities++;
    if (c.priceLow && c.priceHigh) {
      b.priceAcc.push((c.priceLow + c.priceHigh) / 2);
      b.priceMin = Math.min(b.priceMin, c.priceLow);
      b.priceMax = Math.max(b.priceMax, c.priceHigh);
    }
    if (c.sfLow && c.sfHigh) b.sfAcc.push((c.sfLow + c.sfHigh) / 2);
    if (c.psfAvg) b.psfAcc.push(c.psfAvg);
  }
  const builders = [...bMap.values()].map(b => {
    const avg = arr => arr.length ? Math.round(arr.reduce((a, c) => a + c, 0) / arr.length) : null;
    const avgPrice = avg(b.priceAcc);
    return {
      name:          b.name,
      communities:   b.communities,
      estClosingsYr: null,
      mktShare:      null,
      positioning:   inferPositioning(avgPrice),
      avgPrice,
      priceMin:      b.priceMin === Infinity ? null : b.priceMin,
      priceMax:      b.priceMax === 0 ? null : b.priceMax,
      avgSqft:       avg(b.sfAcc),
      pricePerSqft:  avg(b.psfAcc),
    };
  }).sort((a, b) => (b.communities || 0) - (a.communities || 0));

  // v2.6 Step 5: final-pass builder blocklist. Belt-and-suspenders filter in case
  // a community/brokerage name slipped past the intake-time filter via a variant
  // code path (e.g. extractBuilder branding fallback, case differences, or an
  // upstream cache). This is the authoritative list used in KPIs + response.
  const cleanBuilders = builders.filter(b => {
    const n = (b && b.name || '').trim();
    if (!n || n === 'Unknown') return false;
    if (isBrokerage(n)) return false;
    if (isCommunityName(n)) return false;
    return true;
  });

  // v3.0 Step 8: merge SEC EDGAR benchmarks + Supabase-seeded study-local builder_profiles.
  // This ensures deliverables.js Section 10 can render EDGAR financials keyed by builder name,
  // and that Section 6 Active Builders is never zero when the DB has known builders for the target.
  const byName = new Map(cleanBuilders.map(b => [String(b.name).toLowerCase(), b]));

  // Pull study-local seeded builder_profiles (Phase 2 data quality fix)
  let seeded = [];
  if (supabase) {
    try {
      // v3.1.1: widen the query to also pick up global_public_builders rows
      // and to do a fuzzy ilike match on the target city (so "Cranberry township, PA"
      // matches a seeded row regardless of exact punctuation). We then dedupe by
      // (builder_name, cik) preferring the city-specific row when both exist.
      const targetLike = `%${(city || '').replace(/[%_]/g, '')}%`;
      const { data } = await supabase
        .from('builder_profiles')
        .select('*')
        .or(`study_target.ilike.${targetLike},study_target.eq.global_public_builders`);
      if (Array.isArray(data)) {
        // Dedupe: prefer rows where study_target matches the city over the global row
        const dedupe = new Map();
        for (const r of data) {
          const key = String(r.builder_name || '').toLowerCase() + '|' + (r.cik || '');
          const existing = dedupe.get(key);
          if (!existing) { dedupe.set(key, r); continue; }
          // Prefer non-global, non-null fields; merge upwards
          const isGlobal  = (r.study_target || '').startsWith('global_');
          const existingIsGlobal = (existing.study_target || '').startsWith('global_');
          if (existingIsGlobal && !isGlobal) {
            // r is the local row; overlay non-null existing fields onto it
            for (const k of Object.keys(existing)) {
              if (r[k] == null && existing[k] != null) r[k] = existing[k];
            }
            dedupe.set(key, r);
          } else {
            // existing is local (or both global); overlay non-null r fields
            for (const k of Object.keys(r)) {
              if (existing[k] == null && r[k] != null) existing[k] = r[k];
            }
          }
        }
        seeded = Array.from(dedupe.values());
      }
    } catch (_) { /* swallow */ }
  }

  // Merge EDGAR benchmarks (name-matched). Keep Realtor-derived pricing; overlay financials.
  for (const e of (edgar || [])) {
    if (!e || !e.name) continue;
    const key = String(e.name).toLowerCase();
    const existing = byName.get(key);
    const edgarFields = {
      cik: e.cik,
      revenueUsd:           e.revenueUsd           != null ? e.revenueUsd           : null,
      grossProfitUsd:       e.grossProfitUsd       != null ? e.grossProfitUsd       : null,
      grossMarginPct:       e.grossMarginPct       != null ? e.grossMarginPct       : null,
      netIncomeUsd:         e.netIncomeUsd         != null ? e.netIncomeUsd         : null,
      homesDelivered:       e.homesDelivered       != null ? e.homesDelivered       : null,
      averageSellingPrice:  e.asp                  != null ? e.asp                  : null,
      cancellationRatePct:  e.cancelRate           != null ? e.cancelRate           : null,
      backlogUnits:         e.backlogUnits         != null ? e.backlogUnits         : null,
      backlogValueUsd:      e.backlogValueUsd      != null ? e.backlogValueUsd      : null,
      filingPeriodEnd:      e.filingPeriodEnd,
      filingForm:           e.filingForm || '10-K',
      // V41P-1 / W-1 — forward V41-10 ASP audit surface so deliverables/pdf.js
      // can render an error chip when rev/delivered end-dates misalign.
      homesDeliveredEnd:    e.homesDeliveredEnd    != null ? e.homesDeliveredEnd    : null,
      _aspSource:           e._aspSource           != null ? e._aspSource           : null,
      _aspReason:           e._aspReason           != null ? e._aspReason           : null,
      _aspRevEnd:           e._aspRevEnd           != null ? e._aspRevEnd           : null,
      _aspDelEnd:           e._aspDelEnd           != null ? e._aspDelEnd           : null,
    };
    if (existing) {
      Object.assign(existing, edgarFields);
    } else {
      cleanBuilders.push({
        name: e.name, communities: 0, estClosingsYr: null, mktShare: null,
        positioning: inferPositioning(edgarFields.averageSellingPrice),
        avgPrice: edgarFields.averageSellingPrice, priceMin: null, priceMax: null,
        avgSqft: null, pricePerSqft: null, ...edgarFields,
      });
      byName.set(key, cleanBuilders[cleanBuilders.length - 1]);
    }
  }

  // Merge study-local seeded builder_profiles rows (covers Realtor gaps)
  for (const s of seeded) {
    if (!s || !s.builder_name) continue;
    const key = String(s.builder_name).toLowerCase();
    const existing = byName.get(key);
    const seededFields = {
      cik:                 s.cik                 || null,
      revenueUsd:          s.revenue_usd         != null ? Number(s.revenue_usd)         : null,
      grossProfitUsd:      s.gross_profit_usd    != null ? Number(s.gross_profit_usd)    : null,
      grossMarginPct:      s.gross_margin_pct    != null ? Number(s.gross_margin_pct)    : null,
      netIncomeUsd:        s.net_income_usd      != null ? Number(s.net_income_usd)      : null,
      homesDelivered:      s.homes_delivered     != null ? Number(s.homes_delivered)     : null,
      averageSellingPrice: s.average_selling_price != null ? Number(s.average_selling_price) : null,
      cancellationRatePct: s.cancellation_rate_pct != null ? Number(s.cancellation_rate_pct) : null,
      backlogUnits:        s.backlog_units       != null ? Number(s.backlog_units)       : null,
      backlogValueUsd:     s.backlog_value_usd   != null ? Number(s.backlog_value_usd)   : null,
      filingPeriodEnd:     s.filing_period_end,
      filingForm:          s.filing_form,
    };
    if (existing) {
      // Only fill fields that are null on the existing row
      for (const k of Object.keys(seededFields)) {
        if (existing[k] == null && seededFields[k] != null) existing[k] = seededFields[k];
      }
      if (s.active_communities_pma != null && (existing.communities == null || existing.communities === 0)) {
        existing.communities = Number(s.active_communities_pma);
      }
      if (s.product_positioning && !existing.positioning) existing.positioning = s.product_positioning;
    } else {
      cleanBuilders.push({
        name: s.builder_name,
        communities: s.active_communities_pma != null ? Number(s.active_communities_pma) : 0,
        estClosingsYr: s.est_annual_closings_pma != null ? Number(s.est_annual_closings_pma) : null,
        mktShare: null,
        positioning: s.product_positioning || inferPositioning(seededFields.averageSellingPrice),
        avgPrice: seededFields.averageSellingPrice,
        priceMin: null, priceMax: null, avgSqft: null, pricePerSqft: null,
        ...seededFields,
      });
      byName.set(key, cleanBuilders[cleanBuilders.length - 1]);
    }
  }

  // v3.1.1: Roll up per-builder community counts + price/sqft/psf aggregates
  // from the local `communities` array (built from Realtor + Supabase + NHS).
  // This is the source of truth when builder_profiles rows lack per-community data.
  function normName(s) {
    return String(s || '').toLowerCase()
      .replace(/\binc\.?\b/gi, '').replace(/\bllc\b/gi, '')
      .replace(/\bhomes?\b/gi, '').replace(/\bhomebuilders?\b/gi, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  const builderRollup = new Map();
  for (const c of communities) {
    const bname = c.builder || '';
    if (!bname) continue;
    const k = normName(bname);
    if (!k) continue;
    if (!builderRollup.has(k)) builderRollup.set(k, {
      count: 0, priceLows: [], priceHighs: [], sqfts: [], psfs: []
    });
    const r = builderRollup.get(k);
    r.count++;
    if (typeof c.priceLow === 'number' && c.priceLow > 0)   r.priceLows.push(c.priceLow);
    if (typeof c.priceHigh === 'number' && c.priceHigh > 0) r.priceHighs.push(c.priceHigh);
    if (typeof c.avgSqft === 'number' && c.avgSqft > 0)     r.sqfts.push(c.avgSqft);
    if (typeof c.pricePerSqft === 'number' && c.pricePerSqft > 0) r.psfs.push(c.pricePerSqft);
  }
  function avgNum(arr) { if (!arr || !arr.length) return null; return Math.round(arr.reduce((s,v)=>s+v,0) / arr.length); }
  function minNum(arr) { if (!arr || !arr.length) return null; return Math.min.apply(null, arr); }
  function maxNum(arr) { if (!arr || !arr.length) return null; return Math.max.apply(null, arr); }
  for (const b of cleanBuilders) {
    const k = normName(b.name);
    const r = builderRollup.get(k);
    if (!r) continue;
    if ((b.communities == null || b.communities === 0) && r.count > 0) b.communities = r.count;
    if (b.priceMin == null && r.priceLows.length)  b.priceMin = minNum(r.priceLows);
    if (b.priceMax == null && r.priceHighs.length) b.priceMax = maxNum(r.priceHighs);
    if (b.avgSqft == null && r.sqfts.length)       b.avgSqft = avgNum(r.sqfts);
    if (b.pricePerSqft == null && r.psfs.length)   b.pricePerSqft = avgNum(r.psfs);
  }

  // v3.1.1: When a builder still has no pricing fields after rollup, use the
  // averageSellingPrice from EDGAR/builder_profiles as a weak fallback so
  // Section 6 does not render blanks.
  for (const b of cleanBuilders) {
    if (b.priceMin == null && b.priceMax == null && b.averageSellingPrice != null) {
      const asp = Number(b.averageSellingPrice);
      if (Number.isFinite(asp) && asp > 0) {
        b.priceMin = Math.round(asp * 0.85);
        b.priceMax = Math.round(asp * 1.15);
        b._priceFromAsp = true;
      }
    }
  }

  // V41P-2 / W-2 — third-tier market-wide proxy fallback. When an EDGAR-only
  // builder ended up with priceMin/priceMax/avgSqft/pricePerSqft all null
  // (no community-name match AND no ASP), and the market has enough raw
  // listings to be representative, backfill from market quartiles with an
  // explicit `_priceFallbackReason = 'market_wide_proxy'` flag so
  // deliverables/pdf.js can render an error chip instead of a silent dash.
  const marketListingQuartiles = computeListingQuartiles(realtor);
  if (marketListingQuartiles && marketListingQuartiles.n >= 20) {
    for (const b of cleanBuilders) {
      const hasPrice = b.priceMin != null && b.priceMax != null;
      const hasSqft  = b.avgSqft != null;
      const hasPsf   = b.pricePerSqft != null;
      if (hasPrice && hasSqft && hasPsf) continue;
      // Only fire when the row has NO pricing at all — we don't overwrite
      // real rollup data. The _priceFromAsp tier already succeeded above
      // if ASP was present, so this tier serves strictly EDGAR-only rows
      // whose communities rollup came up empty.
      if (!hasPrice && !b._priceFromAsp) {
        b.priceMin = marketListingQuartiles.p25;
        b.priceMax = marketListingQuartiles.p75;
      }
      if (!hasSqft) {
        b.avgSqft = marketListingQuartiles.medianSqft;
      }
      if (!hasPsf) {
        b.pricePerSqft = marketListingQuartiles.medianPsf;
      }
      b._priceFallbackReason = 'market_wide_proxy';
      b._priceFallbackN = marketListingQuartiles.n;
    }
  }

  // Re-sort by communities desc
  cleanBuilders.sort((a, b) => (b.communities || 0) - (a.communities || 0));

  // v2.3: market-level KPIs
  const allPrices = communities
    .map(c => c.priceLow && c.priceHigh ? (c.priceLow + c.priceHigh) / 2 : null)
    .filter(v => v && v > 0)
    .sort((a, b) => a - b);
  const medianListPrice = allPrices.length
    ? Math.round(allPrices[Math.floor(allPrices.length / 2)])
    : null;
  const allAbs = communities.map(c => c.monthlyAbs).filter(v => typeof v === 'number' && v > 0);
  const avgMonthlyAbs = allAbs.length
    ? Number((allAbs.reduce((a, c) => a + c, 0) / allAbs.length).toFixed(2))
    : null;
  // v2.5: DOM cascade - prefer median list_date_dom from live listings; client-side
  // useStudy.js will backfill from housing.medianDOM if still null.
  const listingDOMs = realtor
    .map(l => safeNum(l.list_date_dom || l.days_on_market || l.dom))
    .filter(v => v > 0 && v < 1000)
    .sort((a, b) => a - b);
  const listingsDomMedian = listingDOMs.length
    ? listingDOMs[Math.floor(listingDOMs.length / 2)]
    : null;

  const marketKPIs = {
    activeListings:  realtor.length || null,
    medianListPrice,
    daysOnMarket:    listingsDomMedian,
    builderCount:    cleanBuilders.length,
    communityCount:  communities.length,
    avgMonthlyAbs,
  };

  // Persist to Supabase
  const targetArea = `${city || zipList[0] || 'unknown'}, ${state || ''}`.trim();
  if (dataCache) await dataCache.cacheCompetition(targetArea, communities, cleanBuilders).catch(() => {});

  return res.json({
    communities,
    builders: cleanBuilders,
    marketKPIs,
    activeListings:  marketKPIs.activeListings,
    medianListPrice: marketKPIs.medianListPrice,
    builderCount:    marketKPIs.builderCount,
    avgMonthlyAbs:   marketKPIs.avgMonthlyAbs,
    publicBenchmarks: edgar,
    _sources: {
      communities: realtor.length > 0
        ? 'RapidAPI Realtor (new construction)'
        : (nhsSeeded.length > 0
            ? 'NewHomeSource (Supabase-cached, seeded via /api/etl/seed-nhs)'
            : (sbComms.length > 0 ? 'Supabase communities (manual)' : 'NewHomeSource (live)')),
      benchmarks: 'SEC EDGAR 10-K filings',
      seededNHS: nhsSeeded.length,
      realtorListings: realtor.length,
      manualCommunities: sbComms.length,
    },
    // v4.1 (V41-2 / H-1): per-source fetch-status table.
    _fetchStatus,
  });
});

// ── Fetchers ───────────────────────────────────────────────────────────────

async function fetchRapidAPIRealtor(config, cache, zipList, supabase) {
  const apiKey   = config.rapidapi_realtor_key;
  const host     = config.rapidapi_realtor_host;
  const endpoint = config.rapidapi_realtor_endpoint;
  if (!apiKey || !host || !endpoint || !zipList.length) return [];

  if (supabase) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: usage } = await supabase
        .from('api_usage').select('*').eq('source', 'rapidapi_realtor').single();
      if (usage) {
        const lastReset = usage.last_reset;
        if (lastReset !== today) {
          const resetMonth = lastReset?.slice(0, 7) !== today.slice(0, 7);
          await supabase.from('api_usage').update({
            calls_today: 0, ...(resetMonth ? { calls_month: 0 } : {}), last_reset: today,
          }).eq('source', 'rapidapi_realtor');
        }
        if ((usage.calls_month || 0) >= 450) {
          console.warn('RapidAPI monthly quota near limit (450/500). Skipping.');
          return [];
        }
      } else {
        await supabase.from('api_usage').insert({
          source: 'rapidapi_realtor', calls_today: 0, calls_month: 0, last_reset: today
        });
      }
    } catch (_) {}
  }

  const all = [];
  for (const zip of zipList) {
    const ck = `realtor_nc_${zip}`;
    let c = cache.get(ck);
    if (c) { all.push(...c); continue; }

    try {
      const body = JSON.stringify({
        postal_code: zip, type: ['single_family'], status: ['for_sale'],
        is_new_construction: true, limit: 50,
        sort: { direction: 'desc', field: 'list_date' },
      });
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': host },
        body,
      });

      if (!resp.ok) {
        const fallbackUrl = `${endpoint}?postal_code=${zip}&type=single_family&status=for_sale&is_new_construction=true&limit=50`;
        const fallbackResp = await fetch(fallbackUrl, {
          headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': host }
        });
        if (!fallbackResp.ok) throw new Error(`${resp.status} POST and ${fallbackResp.status} GET fallback`);
        const fallbackData = await fallbackResp.json();
        const listings = fallbackData?.data?.home_search?.results || fallbackData?.properties || fallbackData?.results || [];
        cache.set(ck, listings, 7 * 24 * 3600 * 1000);
        all.push(...listings);
      } else {
        const data = await resp.json();
        const listings = data?.data?.home_search?.results || data?.properties || data?.results || [];
        cache.set(ck, listings, 7 * 24 * 3600 * 1000);
        all.push(...listings);
      }

      if (supabase) {
        try {
          await supabase.rpc('increment_api_usage', { p_source: 'rapidapi_realtor' }).catch(async () => {
            const { data: cur } = await supabase.from('api_usage')
              .select('calls_today, calls_month').eq('source', 'rapidapi_realtor').single();
            if (cur) {
              await supabase.from('api_usage').update({
                calls_today: (cur.calls_today || 0) + 1, calls_month: (cur.calls_month || 0) + 1,
              }).eq('source', 'rapidapi_realtor');
            }
          });
        } catch (_) {}
      }
    } catch (e) { console.warn(`Realtor ZIP ${zip}: ${e.message}`); }
  }
  return all;
}

async function fetchSupabaseCommunities(supabase, zipList, city) {
  if (!supabase) return [];
  try {
    // v2.5: exclude source='newhomesource' - those come via fetchSeededNHSCommunities.
    let query = supabase.from('communities').select('*').neq('source', 'newhomesource');
    if (zipList.length > 0) { query = query.in('zip_code', zipList); }
    else if (city)           { query = query.ilike('city', `%${city}%`); }
    else                     { return []; }
    const { data, error } = await query.limit(50);
    if (error || !data?.length) return [];
    return data;
  } catch (_) { return []; }
}

/**
 * v2.5: Read NHS-seeded community rows from Supabase.
 * Populated by server/services/nhsScraper.js via the CLI (server/scripts/seedCommunities.js)
 * or the POST /api/etl/seed-nhs endpoint.
 */
async function fetchSeededNHSCommunities(supabase, zipList) {
  if (!supabase || !zipList.length) return [];
  try {
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .eq('source', 'newhomesource')
      .in('zip_code', zipList)
      .order('last_seen_at', { ascending: false })
      .limit(200);
    if (error || !data?.length) return [];
    return data;
  } catch (_) { return []; }
}

async function fetchNewHomeSource(config, cache, city, state) {
  const base = config.newhomesource_base;
  if (!base || !city) return [];
  const ck = `nhs_${city}_${state}`;
  const c = cache.get(ck);
  if (c) return c;
  try {
    const url = `${base}/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state || '')}&type=new-homes`;
    const data = await fetchJson(url);
    const comms = data?.communities || data?.results || [];
    cache.set(ck, comms, 7 * 24 * 3600 * 1000);
    return comms;
  } catch (_) { return []; }
}

// v3.0 Step 7: widened SEC EDGAR fetcher — pulls full 10-K financial benchmarks per builder.
// Extracts revenue, gross profit, net income, homes delivered, avg selling price,
// cancellation rate, backlog units+value. Persists measured rows to market_study.builder_profiles.
async function fetchSECEdgar(config, cache, supabase) {
  const CACHE_KEY = 'sec_edgar_builders_v3_step7';
  const c = cache && cache.get ? cache.get(CACHE_KEY) : null;
  if (c) return c;

  const out = [];
  for (const b of PUBLIC_BUILDERS) {
    const profile = buildEmptyBuilderProfile(b);
    try {
      const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${b.cik}.json`;
      const data = await fetchJson(url, {
        headers: { 'User-Agent': 'InfinityMarkets/1.0 (aric@forbescaprettohomes.com)' }
      });
      Object.assign(profile, extractEdgarMetrics(data, b));
      profile._stepTag = 'v3.0-step7';
      profile.sourceUrl = url;
    } catch (err) {
      profile._error = err && err.message ? err.message : String(err);
    }
    out.push(profile);
  }

  if (supabase) {
    try {
      const persistable = out.filter(p => p && (p.revenueUsd != null || p.grossMarginPct != null));
      if (persistable.length) {
        const rows = persistable.map(p => ({
          study_target:          'global_public_builders',
          builder_name:          p.name,
          builder_type:          'public',
          ticker_symbol:         p.ticker,
          cik:                   p.cik,
          revenue_usd:           p.revenueUsd,
          gross_profit_usd:      p.grossProfitUsd,
          gross_margin_pct:      p.grossMarginPct,
          net_income_usd:        p.netIncomeUsd,
          homes_delivered:       p.homesDelivered,
          average_selling_price: p.asp,
          cancellation_rate_pct: p.cancelRate,
          backlog_units:         p.backlogUnits,
          backlog_value_usd:     p.backlogValueUsd,
          filing_period_end:     p.filingPeriodEnd,
          filing_form:           p.filingForm || '10-K',
          source_url:            p.sourceUrl,
          _step_tag:             p._stepTag || 'v3.0-step7',
        }));
        await supabase.from('builder_profiles')
          .delete()
          .eq('study_target', 'global_public_builders');
        await supabase.from('builder_profiles').insert(rows);
      }
    } catch (_) {}
  }

  if (cache && cache.set) cache.set(CACHE_KEY, out, 24 * 3600 * 1000);
  return out;
}

function buildEmptyBuilderProfile(b) {
  return {
    ticker: b.ticker, name: b.name, cik: b.cik,
    revenueUsd: null, grossProfitUsd: null, grossMarginPct: null, netIncomeUsd: null,
    homesDelivered: null, asp: null, cancelRate: null,
    backlogUnits: null, backlogValueUsd: null,
    filingPeriodEnd: null, filingForm: null,
    sourceUrl: null, _stepTag: null, _error: null,
    grossMargin: null,
  };
}

// Pure function: given the parsed EDGAR companyfacts JSON, extract canonical builder
// financial fields. Exported for the test harness.
function extractEdgarMetrics(data, b) {
  // Start with every canonical field = null so callers and tests can rely on a fixed shape.
  const out = {
    revenueUsd: null, grossProfitUsd: null, grossMarginPct: null, grossMargin: null,
    netIncomeUsd: null, backlogValueUsd: null,
    homesDelivered: null, asp: null, cancelRate: null, backlogUnits: null,
    filingPeriodEnd: null, filingForm: null,
    // V41-10 / O-5 — ASP alignment audit surface:
    homesDeliveredEnd: null, _aspSource: null, _aspReason: null,
    _aspRevEnd: null, _aspDelEnd: null,
  };
  const gaap = (data && data.facts && data.facts['us-gaap']) || {};

  function pickLatest(conceptMap, unit) {
    if (!conceptMap || !conceptMap.units) return null;
    const arr = conceptMap.units[unit];
    if (!arr || !arr.length) return null;
    const tenK = arr.filter(x => x.form === '10-K');
    const pool = tenK.length ? tenK : arr;
    return pool.slice().sort((x, y) => (y.end || '').localeCompare(x.end || ''))[0] || null;
  }
  function latestUSD(c) {
    const r = pickLatest(gaap[c], 'USD');
    return r ? r.val : null;
  }
  // v4.0.2: cascade-aware latest — walk the list of candidate concepts and pick
  // the concept whose latestRow.end is most recent. Prevents deprecated concepts
  // (e.g. `Revenues` for a filer who switched to `RFCCE` in FY2019) from silently
  // providing an ancient value that the OR-cascade preferred. Returns the FULL row
  // (val + end + form) so the filing metadata can track the chosen concept.
  function cascadeLatestUSD(concepts) {
    let best = null;
    for (const c of concepts) {
      const r = pickLatest(gaap[c], 'USD');
      if (r && r.end && (!best || r.end > best.end)) best = Object.assign({ _concept: c }, r);
    }
    return best;
  }
  // V41-8 / O-2 — cross-namespace cascade for industry-specific concepts
  // like HomebuildingRevenue/HomebuildingCostOfSales which filers publish
  // under their own taxonomy prefix (nvr:, tol:, dhi:, kbh:, mhi:, ...).
  // Walks every namespace in data.facts; picks globally newest 10-K row
  // whose concept name matches the given RegExp.
  function cascadeLatestAnyNamespace(nameRegex) {
    if (!data || !data.facts || typeof data.facts !== 'object') return null;
    let best = null;
    for (const ns of Object.keys(data.facts)) {
      const block = data.facts[ns];
      if (!block || typeof block !== 'object') continue;
      for (const concept of Object.keys(block)) {
        if (!nameRegex.test(concept)) continue;
        const r = pickLatest(block[concept], 'USD');
        if (r && r.end && (!best || r.end > best.end)) {
          best = Object.assign({ _concept: concept, _ns: ns }, r);
        }
      }
    }
    return best;
  }

  let revRow = cascadeLatestUSD([
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'SalesRevenueNet',
  ]);
  // V41-8 / O-2 — if no us-gaap revenue, try any-namespace homebuilding revenue.
  if (!revRow) {
    revRow = cascadeLatestAnyNamespace(/^Homebuilding.?Revenue/i);
  }
  const rev = revRow ? revRow.val : null;
  // Gross-profit concept cascade (handle filers who report CostOfGoodsAndServicesSold
  // instead of GrossProfit — compute GP = Revenue - CGS if needed).
  const gpRow = cascadeLatestUSD(['GrossProfit']);
  let gp = gpRow ? gpRow.val : null;
  if (gp == null && rev != null && revRow) {
    const cgsRow = cascadeLatestUSD(['CostOfGoodsAndServicesSold', 'CostOfRevenue']);
    if (cgsRow && cgsRow.val != null && cgsRow.end === revRow.end) {
      gp = rev - cgsRow.val;
    }
  }
  // V41-8 / O-2 — any-namespace HomebuildingCostOfSales fallback (paired with revRow end).
  if (gp == null && rev != null && revRow) {
    const hbcos = cascadeLatestAnyNamespace(/^Homebuilding.?Cost.?Of/i);
    if (hbcos && hbcos.val != null && hbcos.end === revRow.end) {
      gp = rev - hbcos.val;
    }
  }
  // V41-8 / O-2 — final us-gaap fallback: OperatingIncomeLoss + OperatingExpenses.
  // When a filer reports OpIncome net of all costs but no separate COGS/GP line,
  // GP ≈ OpIncome + OpEx (adding back operating expenses yields gross figure).
  if (gp == null && rev != null && revRow) {
    const oiRow = cascadeLatestUSD(['OperatingIncomeLoss']);
    const oeRow = cascadeLatestUSD(['OperatingExpenses']);
    if (oiRow && oeRow && oiRow.val != null && oeRow.val != null
        && oiRow.end === revRow.end && oeRow.end === revRow.end) {
      gp = oiRow.val + oeRow.val;
    }
  }
  const ni  = latestUSD('NetIncomeLoss');
  const blUsd = latestUSD('ContractWithCustomerLiability');

  out.revenueUsd     = rev;
  out.grossProfitUsd = gp;
  out.grossMarginPct = (rev && gp != null && rev !== 0) ? Math.round(gp / rev * 1000) / 10 : null;
  out.grossMargin    = out.grossMarginPct;
  out.netIncomeUsd   = ni;
  out.backlogValueUsd = blUsd;

  // v4.0.3 (O-4): Homes delivered cascade. Pick the concept whose latest 10-K
  // row has the GLOBALLY most recent end date — prevents a deprecated concept
  // with an old latest row from winning over the current one. Walk all
  // namespaces and all homes-delivered variants; tiebreaker is end-date newest.
  {
    let bestDel = null;
    for (const ns of Object.keys((data && data.facts) || {})) {
      const block = data.facts[ns];
      for (const concept of Object.keys(block)) {
        // V41P-6 / W-6 — widened delivery regex: (home|unit) + (deliver|settl|closed|sold|completed).
        // Excludes backlog concepts (tracked separately below) to avoid double-counting.
        if (!/(?:home|unit)s?/i.test(concept)) continue;
        if (!/(?:deliver|settl|closed|sold|completed)/i.test(concept)) continue;
        if (/backlog/i.test(concept)) continue;
        const units = block[concept].units || {};
        for (const u of Object.keys(units)) {
          const pool = units[u].filter(x => x.form === '10-K');
          const cur = (pool.length ? pool : units[u]).slice()
            .sort((x, y) => (y.end || '').localeCompare(x.end || ''))[0];
          if (cur && cur.val != null && cur.end &&
              (!bestDel || cur.end > bestDel.end)) {
            bestDel = { end: cur.end, val: cur.val, concept, ns };
          }
        }
      }
    }
    if (bestDel) {
      out.homesDelivered = bestDel.val;
      out.homesDeliveredEnd = bestDel.end;   // V41-10: audit — expose end for alignment check.
    }
  }

  // V41-10 / O-5 — ASP alignment. Three-tier cascade, all LAW #6 compliant:
  //   Tier 1: explicit filer-reported ASP concept (any namespace) whose
  //           latest 10-K row has the same end date as revRow. Strongest signal.
  //   Tier 2: derived rev / homesDelivered, but ONLY when revRow.end === bestDel.end.
  //   Tier 3: null + out._aspReason records why (for provenance/error chip).
  {
    let aspSet = false;
    // Tier 1: explicit ASP concept.
    const aspRow = cascadeLatestAnyNamespace(/(?:Average|Avg).?(?:Selling|Home).?Price|AverageSalesPrice/i);
    if (aspRow && aspRow.val != null && Number.isFinite(Number(aspRow.val))
        && revRow && aspRow.end === revRow.end) {
      out.asp = Math.round(Number(aspRow.val));
      out._aspSource = 'concept:' + (aspRow._ns || 'us-gaap') + ':' + (aspRow._concept || '?');
      aspSet = true;
    }
    // Tier 2: derived rev / delivered — require aligned end dates.
    if (!aspSet && rev != null && out.homesDelivered && out.homesDelivered > 0
        && revRow && out.homesDeliveredEnd) {
      if (revRow.end === out.homesDeliveredEnd) {
        out.asp = Math.round(rev / out.homesDelivered);
        out._aspSource = 'derived:rev/homesDelivered';
        aspSet = true;
      } else {
        out._aspReason = 'end_date_mismatch';
        out._aspRevEnd = revRow.end;
        out._aspDelEnd = out.homesDeliveredEnd;
      }
    }
    // Tier 3: no data path — leave out.asp null; _aspReason may be set above.
    if (!aspSet && !out._aspReason) {
      if (rev == null)             out._aspReason = 'no_revenue';
      else if (!out.homesDelivered) out._aspReason = 'no_delivered';
      else if (!revRow)            out._aspReason = 'no_revenue_row';
    }
  }

  // v4.0.3 (O-4): Cancellation rate cascade — global-latest across all /cancel/
  // concepts. Homebuilders sometimes report 'CancellationRate' directly and
  // sometimes 'OrdersCancelled'/'CancelledOrderPct' variants; take whichever
  // has the newest 10-K row.
  {
    let bestCancel = null;
    for (const ns of Object.keys((data && data.facts) || {})) {
      const block = data.facts[ns];
      for (const concept of Object.keys(block)) {
        if (!/cancel/i.test(concept)) continue;
        // V41P-6 / W-6 — prefer rate-shaped concepts (RatE, RatiO, PctN, Percent)
        // over raw-count concepts ('OrdersCancelled' without 'Rate' suffix).
        // Tiebreaker: same end-date, rate-named wins; otherwise newer end-date wins.
        const isRateShaped = /(rate|ratio|pct|percent)/i.test(concept);
        const units = block[concept].units || {};
        for (const u of Object.keys(units)) {
          const pool = units[u].filter(x => x.form === '10-K');
          const cur = (pool.length ? pool : units[u]).slice()
            .sort((x, y) => (y.end || '').localeCompare(x.end || ''))[0];
          if (!cur || cur.val == null || !cur.end) continue;
          if (!bestCancel) {
            bestCancel = { end: cur.end, val: cur.val, _isRateShaped: isRateShaped };
          } else if (cur.end > bestCancel.end) {
            bestCancel = { end: cur.end, val: cur.val, _isRateShaped: isRateShaped };
          } else if (cur.end === bestCancel.end && isRateShaped && !bestCancel._isRateShaped) {
            bestCancel = { end: cur.end, val: cur.val, _isRateShaped: isRateShaped };
          }
        }
      }
    }
    if (bestCancel) {
      const v = Number(bestCancel.val);
      out.cancelRate = v > 0 && v < 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10;
    }
  }

  // Backlog units (non-USD quantity)
  for (const ns of Object.keys((data && data.facts) || {})) {
    const block = data.facts[ns];
    for (const concept of Object.keys(block)) {
      if (!/backlog/i.test(concept)) continue;
      const units = block[concept].units || {};
      for (const u of Object.keys(units)) {
        if (u === 'USD') continue;
        const pool = units[u].filter(x => x.form === '10-K');
        const cur = (pool.length ? pool : units[u]).slice()
          .sort((x, y) => (y.end || '').localeCompare(x.end || ''))[0];
        if (cur && cur.val != null && out.backlogUnits == null) {
          out.backlogUnits = cur.val;
        }
      }
    }
  }

  // v4.0.2: track the revenue concept that actually resolved, not a fixed
  // preference order — this is what produces the "latest 10-K" date.
  if (revRow) {
    out.filingPeriodEnd = revRow.end || null;
    out.filingForm = revRow.form || null;
  }

  return out;
}

function inferProduct(l) {
  const d = safeStr(l.description?.type || l.prop_type || l.property_type || '');
  const lower = (d || '').toLowerCase();
  if (lower.includes('town'))  return 'TH';
  if (lower.includes('condo')) return 'Condo';
  if (lower.includes('55+') || lower.includes('active adult')) return '55+';
  return 'SFD';
}

function inferPositioning(p) {
  if (!p) return 'Unknown';
  if (p < 350000) return 'Entry / First-time';
  if (p < 500000) return 'Entry / Value';
  if (p < 650000) return 'Core Move-up';
  if (p < 850000) return 'Move-up / Premium';
  return 'Luxury / Custom';
}

module.exports = router;
// v2.6 Step 5: export filter helpers so server/scripts/test_builder_filter.js can
// verify the blocklist behavior in isolation without spinning up express.
module.exports.isCommunityName = isCommunityName;
module.exports.isBrokerage = isBrokerage;
// v3.0 Step 7: export EDGAR extractor for isolated test harness
module.exports.extractEdgarMetrics = extractEdgarMetrics;
module.exports.buildEmptyBuilderProfile = buildEmptyBuilderProfile;
module.exports.PUBLIC_BUILDERS = PUBLIC_BUILDERS;
