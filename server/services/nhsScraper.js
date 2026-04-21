/**
 * Infinity Markets v2.5 — NewHomeSource scraper service
 *
 * Scrapes NewHomeSource's public community search pages for a given ZIP, parses the
 * embedded JSON-LD / Next.js __NEXT_DATA__ blocks, and upserts into Supabase
 * public.communities. Designed to be idempotent — rerunning for the same ZIP refreshes
 * last_seen_at and overwrites pricing/lot fields but preserves first_seen_at.
 *
 * Usage (programmatic):
 *   const { scrapeZips } = require('./services/nhsScraper');
 *   await scrapeZips(supabase, ['16066','16046','16002','16033','16059']);
 *
 * Usage (CLI, via scripts/seedCommunities.js):
 *   node server/scripts/seedCommunities.js 16066 16046 16002 16033 16059
 *
 * IMPORTANT: NewHomeSource has no official API. This scraper is best-effort and
 * respects rate-limits (1 request every 2 seconds) + User-Agent identifying the client.
 * If NewHomeSource changes their page structure, the parser will need updating.
 */

const USER_AGENT = 'InfinityMarketsScraper/2.5 (+mailto:ops@forbeshomes.com)';
const RATE_LIMIT_MS = 2000;
const BASE_URL = 'https://www.newhomesource.com';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Fetch a ZIP-scoped search page from NewHomeSource.
 * Returns the raw HTML string or null on failure.
 */
async function fetchZipPage(zip) {
  const url = `${BASE_URL}/communities/search?keyword=${encodeURIComponent(zip)}&sortby=featured`;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch (_) {
    return null;
  }
}

/**
 * Parse __NEXT_DATA__ JSON from the HTML.
 * NewHomeSource uses Next.js; community data is in window.__NEXT_DATA__.props.pageProps.
 */
function extractNextData(html) {
  if (!html) return null;
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (_) {
    return null;
  }
}

/**
 * Pick community records out of the Next.js page props. Shape has shifted over time,
 * so we check multiple known paths. Returns an array of normalized community objects.
 */
function extractCommunities(nextData, searchZip) {
  if (!nextData) return [];
  const pageProps = nextData.props?.pageProps || {};
  const candidates = pageProps.searchResults?.communities
                  || pageProps.communities
                  || pageProps.results?.communities
                  || pageProps.initialState?.search?.results
                  || [];
  const rows = Array.isArray(candidates) ? candidates : [];
  return rows.map(r => normalizeCommunity(r, searchZip)).filter(Boolean);
}

/**
 * Normalize a raw NHS community object into the shape our communities table expects.
 */
function normalizeCommunity(r, searchZip) {
  if (!r || !r.name) return null;
  const priceLow  = num(r.priceLow || r.fromPrice || r.minPrice);
  const priceHigh = num(r.priceHigh || r.toPrice || r.maxPrice);
  const sfLow     = num(r.sqftLow || r.minSqft);
  const sfHigh    = num(r.sqftHigh || r.maxSqft);
  const psf = priceLow && sfLow && sfHigh
    ? Math.round(((priceLow / sfLow) + ((priceHigh || priceLow) / sfHigh)) / 2)
    : null;
  return {
    source: 'newhomesource',
    source_url: r.communityUrl || r.url || null,
    name: String(r.name).trim(),
    builder: r.builder?.name || r.builderName || null,
    product_type: r.productType || r.homeType || 'SFD',
    plan_count: num(r.planCount || r.plans?.length) || null,
    sf_low: sfLow,
    sf_high: sfHigh,
    price_low: priceLow,
    price_high: priceHigh,
    price_per_sqft: psf,
    lots_total: num(r.totalLots) || null,
    lots_sold: num(r.soldLots) || null,
    lots_remaining: num(r.remainingLots || r.availableLots) || null,
    monthly_absorption: null,   // NHS doesn't expose this; filled by analysis pipeline
    open_date: r.openDate || null,
    status: r.status || 'active',
    address_line: r.address?.line1 || null,
    city: r.address?.city || r.city || null,
    state: r.address?.state || r.state || null,
    zip_code: String(r.address?.zip || r.zip || searchZip).slice(0, 5),
    county: r.address?.county || null,
    lat: num(r.lat || r.latitude),
    lon: num(r.lon || r.longitude),
    school_district: r.schoolDistrict || null,
    hoa: num(r.hoa || r.hoaFee) || null,
    incentives: r.incentives || null,
    raw_payload: r,
  };
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Upsert a batch of community rows into Supabase.
 * Conflict on (zip_code, lower(name)) — updates pricing/lot fields but preserves first_seen_at.
 */
async function upsertCommunities(supabase, rows) {
  if (!supabase || !rows.length) return { inserted: 0, updated: 0, errors: [] };
  const result = { inserted: 0, updated: 0, errors: [] };
  for (const row of rows) {
    try {
      // Check for existing
      const { data: existing } = await supabase
        .from('communities')
        .select('id, first_seen_at')
        .eq('zip_code', row.zip_code)
        .ilike('name', row.name)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase
          .from('communities')
          .update({ ...row, last_seen_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) result.errors.push({ row: row.name, error: error.message });
        else result.updated++;
      } else {
        const { error } = await supabase
          .from('communities')
          .insert([row]);
        if (error) result.errors.push({ row: row.name, error: error.message });
        else result.inserted++;
      }
    } catch (e) {
      result.errors.push({ row: row.name, error: e.message });
    }
  }
  return result;
}

/**
 * Top-level entry point — scrape each ZIP sequentially, upsert results.
 * Returns a per-zip summary.
 */
async function scrapeZips(supabase, zipList) {
  const summary = [];
  for (const zip of zipList) {
    const html = await fetchZipPage(zip);
    const nextData = extractNextData(html);
    const rows = extractCommunities(nextData, zip);
    const upsert = await upsertCommunities(supabase, rows);
    summary.push({ zip, found: rows.length, ...upsert });
    await sleep(RATE_LIMIT_MS);
  }
  return summary;
}

module.exports = {
  scrapeZips,
  fetchZipPage,
  extractNextData,
  extractCommunities,
  normalizeCommunity,
  upsertCommunities,
};
