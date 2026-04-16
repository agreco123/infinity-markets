/**
 * Infinity Markets v1.5 — Competition Route
 *
 * GET /api/competition?zips=16066,16046,16002&city=Cranberry+Township&state=PA
 *
 * Sources:
 * RapidAPI Realtor → new construction listings (POST v3/list, cached 7d/ZIP, 500 req/mo)
 * Supabase communities → manual/cached community data fallback
 * NewHomeSource → community list by city
 * SEC EDGAR → public builder financials
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
const router = express.Router();

function safeNum(v, fb = 0) {
  if (v == null || v === '' || v === '-') return fb;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? fb : n;
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} — ${url}`);
  return r.json();
}

const PUBLIC_BUILDERS = [
  { ticker: 'NVR', cik: '0000906163', name: 'NVR Inc.' },
  { ticker: 'LEN', cik: '0000920760', name: 'Lennar' },
  { ticker: 'DHI', cik: '0000045012', name: 'D.R. Horton' },
  { ticker: 'PHM', cik: '0000822416', name: 'PulteGroup' },
  { ticker: 'TOL', cik: '0000794170', name: 'Toll Brothers' },
];

router.get('/', async (req, res) => {
  const { zips, city, state } = req.query;
  const zipList = (zips || '').split(',').map(z => z.trim()).filter(Boolean);
  const { config, sourceLog, cache, supabase, dataCache } = req.app.locals;

  const results = await Promise.allSettled([
    fetchRapidAPIRealtor(config, cache, zipList, supabase),
    fetchSupabaseCommunities(supabase, zipList, city),
    fetchNewHomeSource(config, cache, city, state),
    fetchSECEdgar(config, cache),
  ]);

  const srcNames = ['RapidAPI Realtor', 'Supabase Communities', 'NewHomeSource', 'SEC EDGAR'];
  for (let i = 0; i < results.length; i++) {
    const ok = results[i].status === 'fulfilled';
    await sourceLog.log({
      source: srcNames[i],
      tier: i === 0 ? 'primary' : 'secondary',
      url: '',
      status: ok ? 'success' : 'error',
      error_message: ok ? null : results[i].reason?.message,
      confidence: ok ? 'high' : 'none'
    }).catch(() => {});
  }

  const val = i => results[i].status === 'fulfilled' ? results[i].value : null;
  const realtor = val(0) || [];
  const sbComms = val(1) || [];
  const nhs = val(2) || [];
  const edgar = val(3) || [];

  // ── Build communities from listings ─────────────────────────────────────
  const cMap = new Map();

  for (const l of realtor) {
    const name = l.community || l.subdivision || l.address?.neighborhood || l.location?.address?.city || 'Unknown';
    if (!cMap.has(name)) cMap.set(name, {
      name, builder: l.builder || l.branding?.name || l.source?.agents?.[0]?.office_name || 'Unknown',
      product: inferProduct(l), plans: 0,
      sfLow: Infinity, sfHigh: 0, priceLow: Infinity, priceHigh: 0, psfAcc: [],
      lotsTotal: null, lotsSold: null, lotsRemain: null, monthlyAbs: null,
      openDate: null, incentives: l.incentives || null,
      hoa: safeNum(l.hoa?.fee), schoolDist: l.school_district || null
    });
    const c = cMap.get(name);
    c.plans++;
    const sf = safeNum(l.sqft || l.building_size?.size || l.description?.sqft);
    const price = safeNum(l.price || l.list_price);
    if (sf > 0) { c.sfLow = Math.min(c.sfLow, sf); c.sfHigh = Math.max(c.sfHigh, sf); }
    if (price > 0) { c.priceLow = Math.min(c.priceLow, price); c.priceHigh = Math.max(c.priceHigh, price); }
    if (sf > 0 && price > 0) c.psfAcc.push(price / sf);
  }

  // Add Supabase communities (manual entries or cached from prior runs)
  for (const comm of sbComms) {
    const name = comm.name || comm.community_name;
    if (!name || cMap.has(name)) continue;
    cMap.set(name, {
      name, builder: comm.builder || 'Unknown',
      product: comm.product_type || 'SFD', plans: safeNum(comm.plan_count),
      sfLow: safeNum(comm.sf_low), sfHigh: safeNum(comm.sf_high),
      priceLow: safeNum(comm.price_low), priceHigh: safeNum(comm.price_high),
      psfAcc: [], lotsTotal: safeNum(comm.lots_total) || null,
      lotsSold: safeNum(comm.lots_sold) || null,
      lotsRemain: safeNum(comm.lots_remaining) || null,
      monthlyAbs: safeNum(comm.monthly_absorption) || null,
      openDate: comm.open_date || null, incentives: comm.incentives || null,
      hoa: safeNum(comm.hoa), schoolDist: comm.school_district || null
    });
  }

  // Add NewHomeSource communities
  for (const comm of nhs) {
    const name = comm.name || comm.communityName;
    if (!name || cMap.has(name)) continue;
    cMap.set(name, {
      name, builder: comm.builder || comm.builderName || 'Unknown',
      product: comm.productType || 'SFD', plans: safeNum(comm.planCount || comm.plans),
      sfLow: safeNum(comm.sqftLow), sfHigh: safeNum(comm.sqftHigh),
      priceLow: safeNum(comm.priceLow), priceHigh: safeNum(comm.priceHigh),
      psfAcc: [], lotsTotal: safeNum(comm.totalLots) || null,
      lotsSold: safeNum(comm.soldLots) || null,
      lotsRemain: safeNum(comm.remainingLots) || null,
      monthlyAbs: null, openDate: comm.openDate || null,
      incentives: comm.incentives || null,
      hoa: safeNum(comm.hoa), schoolDist: comm.schoolDistrict || null
    });
  }

  const communities = [...cMap.values()].map(c => ({
    name: c.name, builder: c.builder, product: c.product, plans: c.plans,
    sfLow: c.sfLow === Infinity ? null : c.sfLow,
    sfHigh: c.sfHigh === 0 ? null : c.sfHigh,
    priceLow: c.priceLow === Infinity ? null : c.priceLow,
    priceHigh: c.priceHigh === 0 ? null : c.priceHigh,
    psfAvg: c.psfAcc.length ? Math.round(c.psfAcc.reduce((a, b) => a + b, 0) / c.psfAcc.length) : null,
    lotsTotal: c.lotsTotal, lotsSold: c.lotsSold, lotsRemain: c.lotsRemain,
    monthlyAbs: c.monthlyAbs, openDate: c.openDate,
    incentives: c.incentives, hoa: c.hoa, schoolDist: c.schoolDist,
  }));

  // ── Builder summary ─────────────────────────────────────────────────────
  const bMap = new Map();
  for (const c of communities) {
    if (!bMap.has(c.builder)) bMap.set(c.builder, { name: c.builder, communities: 0, priceAcc: [] });
    const b = bMap.get(c.builder);
    b.communities++;
    if (c.priceLow && c.priceHigh) b.priceAcc.push((c.priceLow + c.priceHigh) / 2);
  }

  const builders = [...bMap.values()].map(b => {
    const avgPrice = b.priceAcc.length ? Math.round(b.priceAcc.reduce((a, c) => a + c, 0) / b.priceAcc.length) : null;
    return { name: b.name, communities: b.communities, estClosingsYr: null, mktShare: null, positioning: inferPositioning(avgPrice), avgPrice };
  });

  // Persist to Supabase
  const targetArea = `${city || zipList[0] || 'unknown'}, ${state || ''}`.trim();
  if (dataCache) await dataCache.cacheCompetition(targetArea, communities, builders).catch(() => {});

  return res.json({
    communities,
    builders,
    publicBenchmarks: edgar,
    _sources: {
      communities: realtor.length > 0 ? 'RapidAPI Realtor (new construction)' : (sbComms.length > 0 ? 'Supabase communities (manual/cached)' : 'NewHomeSource'),
      benchmarks: 'SEC EDGAR 10-K filings',
    },
  });
});

// ── Fetchers ───────────────────────────────────────────────────────────────

/**
 * RapidAPI Realtor — v3/list endpoint (POST with JSON body)
 * v1.5 FIX: Changed from GET+query to POST+JSON body
 */
async function fetchRapidAPIRealtor(config, cache, zipList, supabase) {
  const apiKey = config.rapidapi_realtor_key;
  const host = config.rapidapi_realtor_host;
  const endpoint = config.rapidapi_realtor_endpoint;
  if (!apiKey || !host || !endpoint || !zipList.length) return [];

  // Check and track RapidAPI usage
  if (supabase) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: usage } = await supabase
        .from('api_usage')
        .select('*')
        .eq('source', 'rapidapi_realtor')
        .single();

      if (usage) {
        const lastReset = usage.last_reset;
        if (lastReset !== today) {
          const resetMonth = lastReset?.slice(0, 7) !== today.slice(0, 7);
          await supabase.from('api_usage').update({
            calls_today: 0,
            ...(resetMonth ? { calls_month: 0 } : {}),
            last_reset: today,
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
    } catch (_) { /* Non-blocking */ }
  }

  const all = [];
  for (const zip of zipList) {
    const ck = `realtor_nc_${zip}`;
    let c = cache.get(ck);
    if (c) { all.push(...c); continue; }

    try {
      // v1.5: POST with JSON body for v3/list endpoint
      const body = JSON.stringify({
        postal_code: zip,
        type: ['single_family'],
        status: ['for_sale'],
        is_new_construction: true,
        limit: 50,
        sort: { direction: 'desc', field: 'list_date' },
      });

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': host,
        },
        body,
      });

      if (!resp.ok) {
        // Fallback: try GET with query params (older API versions)
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

      // Track usage
      if (supabase) {
        try {
          await supabase.rpc('increment_api_usage', { p_source: 'rapidapi_realtor' }).catch(async () => {
            // Fallback: manual increment if RPC doesn't exist
            const { data: cur } = await supabase.from('api_usage').select('calls_today, calls_month').eq('source', 'rapidapi_realtor').single();
            if (cur) {
              await supabase.from('api_usage').update({
                calls_today: (cur.calls_today || 0) + 1,
                calls_month: (cur.calls_month || 0) + 1,
              }).eq('source', 'rapidapi_realtor');
            }
          });
        } catch (_) {}
      }
    } catch (e) {
      console.warn(`Realtor ZIP ${zip}: ${e.message}`);
    }
  }
  return all;
}

/**
 * Supabase communities — manual/cached community data fallback
 * v1.5: New data source for when RapidAPI returns empty
 */
async function fetchSupabaseCommunities(supabase, zipList, city) {
  if (!supabase) return [];
  try {
    let query = supabase.from('communities').select('*');
    if (zipList.length > 0) {
      query = query.in('zip_code', zipList);
    } else if (city) {
      query = query.ilike('city', `%${city}%`);
    } else {
      return [];
    }
    const { data, error } = await query.limit(50);
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

async function fetchSECEdgar(config, cache) {
  const CACHE_KEY = 'sec_edgar_builders';
  const c = cache.get(CACHE_KEY);
  if (c) return c;

  const out = [];
  for (const b of PUBLIC_BUILDERS) {
    try {
      const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${b.cik}.json`;
      const data = await fetchJson(url, {
        headers: { 'User-Agent': 'InfinityMarkets/1.0 (aric@forbescaprettohomes.com)' }
      });
      const facts = data?.facts?.['us-gaap'] || {};
      const latest = (concept) => {
        const v = facts[concept]?.units?.USD;
        if (!v?.length) return null;
        const a = v.filter(x => x.form === '10-K').sort((x, y) => (y.end || '').localeCompare(x.end || ''));
        return a[0]?.val ?? null;
      };
      const rev = latest('Revenues') || latest('RevenueFromContractWithCustomerExcludingAssessedTax');
      const gp = latest('GrossProfit');
      out.push({
        ticker: b.ticker, name: b.name,
        grossMargin: rev && gp ? Math.round(gp / rev * 1000) / 10 : null,
        asp: null, cancelRate: null
      });
    } catch (_) {
      out.push({ ticker: b.ticker, name: b.name, grossMargin: null, asp: null, cancelRate: null });
    }
  }
  cache.set(CACHE_KEY, out, 24 * 3600 * 1000);
  return out;
}

function inferProduct(l) {
  const d = (l.description?.type || l.prop_type || l.property_type || '').toLowerCase();
  if (d.includes('town')) return 'TH';
  if (d.includes('condo')) return 'Condo';
  if (d.includes('55+') || d.includes('active adult')) return '55+';
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
