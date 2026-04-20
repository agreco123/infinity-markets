/**
 * Infinity Markets v1.0 — ETL Route (Sprint 5)
 *
 * POST /api/etl/redfin   — Download Redfin Data Center TSV, filter by ZIPs, upsert
 * POST /api/etl/zillow    — Download Zillow ZHVI CSV, filter by ZIPs, upsert
 * POST /api/etl/parcl     — Fetch Parcl Labs new construction data
 * GET  /api/etl/status    — Last ETL run timestamps
 *
 * Data sources:
 *   Redfin Data Center: https://redfin-public-data.s3.us-west-2.amazonaws.com/
 *   Zillow Research:    https://files.zillowstatic.com/research/public_csvs/
 *   Parcl Labs API:     https://api.parcllabs.com/v1/
 *
 * All endpoints stream large files and filter in-memory to keep
 * RAM usage manageable on Render free tier (~512MB).
 */
const express = require('express');
const router  = express.Router();
const { Readable } = require('stream');
const zlib = require('zlib');

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function safeNum(v) {
  if (v == null || v === '' || v === '-' || v === 'NA') return null;
  const n = Number(String(v).replace(/[,$%]/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * Stream-download a URL and process each line via callback.
 * Handles gzipped and plain text responses.
 */
async function streamLines(url, onLine, { signal } = {}) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'InfinityMarkets/1.0 ETL' },
    signal,
  });
  if (!resp.ok) throw new Error(`${resp.status} — ${url}`);

  const contentType = resp.headers.get('content-type') || '';
  const isGzip = url.endsWith('.gz') || contentType.includes('gzip');

  let stream = Readable.fromWeb(resp.body);
  if (isGzip) stream = stream.pipe(zlib.createGunzip());

  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk.toString('utf-8');
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete last line
    for (const line of lines) {
      if (line.trim()) onLine(line);
    }
  }
  if (buffer.trim()) onLine(buffer);
}

/* ═══════════════════════════════════════════════════════════════════════════
   REDFIN Data Center ETL
   Downloads: zip_code_market_tracker.tsv000.gz (~400MB compressed)
   Filters for target ZIPs, upserts into market_study.redfin_monthly
   ═══════════════════════════════════════════════════════════════════════════ */
const REDFIN_URL = 'https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/zip_code_market_tracker.tsv000.gz';

router.post('/redfin', async (req, res) => {
  const { zips } = req.body;
  if (!zips?.length) return res.status(400).json({ error: 'zips array required' });

  const { supabase } = req.app.locals;
  const zipSet = new Set(zips.map(z => String(z).trim()));
  const rows = [];
  let headers = null;
  let lineCount = 0;
  let matchCount = 0;

  console.log(`[etl/redfin] Starting download for ZIPs: ${[...zipSet].join(', ')}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min timeout

    await streamLines(REDFIN_URL, (line) => {
      lineCount++;
      const cols = line.split('\t');

      // First line = headers
      if (!headers) {
        headers = cols.map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
        return;
      }

      // Build row object
      const row = {};
      headers.forEach((h, i) => { row[h] = cols[i]?.trim() ?? ''; });

      // Filter: region_type must be 'zip_code', and must match target ZIPs
      if (row.region_type !== 'zip_code') return;

      // Extract ZIP from region field (could be "Zip Code: 16066" or just "16066")
      const zipMatch = (row.region || row.zip_code || '').match(/(\d{5})/);
      if (!zipMatch) return;
      const zip = zipMatch[1];
      if (!zipSet.has(zip)) return;

      matchCount++;

      // Map Redfin columns to our schema
      rows.push({
        zip_code:                zip,
        period_begin:            row.period_begin || null,
        period_end:              row.period_end || null,
        region_name:             row.region || zip,
        median_sale_price:       safeNum(row.median_sale_price),
        median_list_price:       safeNum(row.median_list_price),
        median_dom:              safeNum(row.median_dom) != null ? Math.round(safeNum(row.median_dom)) : null,
        avg_sale_to_list:        safeNum(row.avg_sale_to_list) || safeNum(row.sale_to_list_ratio),
        homes_sold:              safeNum(row.homes_sold) != null ? Math.round(safeNum(row.homes_sold)) : null,
        inventory:               safeNum(row.inventory) != null ? Math.round(safeNum(row.inventory)) : null,
        new_listings:            safeNum(row.new_listings) != null ? Math.round(safeNum(row.new_listings)) : null,
        months_of_supply:        safeNum(row.months_of_supply),
        median_ppsf:             safeNum(row.median_ppsf) || safeNum(row.median_price_per_sqft),
        price_drops_pct:         safeNum(row.price_drops) || safeNum(row.price_drops_pct),
        off_market_in_two_weeks_pct: safeNum(row.off_market_in_two_weeks) || safeNum(row.off_market_in_two_weeks_pct),
        ingested_at:             new Date().toISOString(),
      });
    }, { signal: controller.signal });

    clearTimeout(timeout);

    console.log(`[etl/redfin] Processed ${lineCount} lines, found ${matchCount} matches for ${zipSet.size} ZIPs`);

    if (rows.length === 0) {
      return res.json({ status: 'ok', message: 'No data found for requested ZIPs', zips: [...zipSet], linesScanned: lineCount });
    }

    // Upsert in batches of 100
    let upserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);

      // Delete existing rows for this ZIP + period_begin combo to avoid duplicates
      for (const r of batch) {
        await supabase
          .from('redfin_monthly')
          .delete()
          .eq('zip_code', r.zip_code)
          .eq('period_begin', r.period_begin);
      }

      const { error } = await supabase.from('redfin_monthly').insert(batch);
      if (error) {
        console.error(`[etl/redfin] Batch insert error at row ${i}:`, error.message);
      } else {
        upserted += batch.length;
      }
    }

    // Log ETL run
    await supabase.from('source_log').insert({
      source: 'Redfin Data Center ETL',
      tier: 'primary',
      url: REDFIN_URL,
      status: 'success',
      confidence: 'high',
      error_message: null,
    }).catch(() => {});

    return res.json({
      status: 'ok',
      zips: [...zipSet],
      rowsFound: rows.length,
      rowsUpserted: upserted,
      linesScanned: lineCount,
    });

  } catch (err) {
    console.error('[etl/redfin] Failed:', err.message);
    return res.status(500).json({ error: 'Redfin ETL failed', detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   ZILLOW ZHVI ETL
   Downloads: Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv
   Filters for target ZIPs, upserts into market_study.zillow_zhvi
   ═══════════════════════════════════════════════════════════════════════════ */
const ZILLOW_ZHVI_URL = 'https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv';
const ZILLOW_ZORI_URL = 'https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_sa_month.csv';

router.post('/zillow', async (req, res) => {
  const { zips } = req.body;
  if (!zips?.length) return res.status(400).json({ error: 'zips array required' });

  const { supabase } = req.app.locals;
  const zipSet = new Set(zips.map(z => String(z).trim()));
  const rows = [];
  let headers = null;
  let matchCount = 0;

  console.log(`[etl/zillow] Starting ZHVI download for ZIPs: ${[...zipSet].join(', ')}`);

  try {
    // ZHVI CSV is wide format: each column after metadata is a date (YYYY-MM-DD)
    // We need to pivot to long format for our schema
    await streamLines(ZILLOW_ZHVI_URL, (line) => {
      // Parse CSV (handle quoted fields)
      const cols = parseCSVLine(line);

      if (!headers) {
        headers = cols.map(h => h.trim());
        return;
      }

      const row = {};
      headers.forEach((h, i) => { row[h] = cols[i]?.trim() ?? ''; });

      // Filter by ZIP
      const regionName = row['RegionName'] || row['regionname'] || '';
      if (!zipSet.has(String(regionName))) return;

      matchCount++;

      // Find date columns (format: YYYY-MM-DD)
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const regionId   = row['RegionID']   || row['regionid'] || '';
      const regionType = 'zip';
      const state      = row['State']      || row['state'] || row['StateName'] || '';
      const metro      = row['Metro']      || row['metro'] || row['CountyName'] || '';
      const county     = row['CountyName'] || row['county'] || '';

      for (const h of headers) {
        if (!datePattern.test(h)) continue;
        const val = safeNum(row[h]);
        if (val == null || val <= 0) continue;

        rows.push({
          region_id:   regionId,
          region_name: String(regionName),
          region_type: regionType,
          state:       state,
          metro:       metro,
          county:      county,
          period_date: h,
          zhvi_value:  val,
          ingested_at: new Date().toISOString(),
        });
      }
    });

    console.log(`[etl/zillow] Found ${matchCount} matching ZIPs, ${rows.length} data points`);

    if (rows.length === 0) {
      return res.json({ status: 'ok', message: 'No ZHVI data found for requested ZIPs', zips: [...zipSet] });
    }

    // Delete existing Zillow data for these ZIPs
    for (const zip of zipSet) {
      await supabase.from('zillow_zhvi').delete().eq('region_name', zip).eq('region_type', 'zip');
    }

    // Insert in batches of 200
    let upserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { error } = await supabase.from('zillow_zhvi').insert(batch);
      if (error) {
        console.error(`[etl/zillow] Batch insert error at row ${i}:`, error.message);
      } else {
        upserted += batch.length;
      }
    }

    await supabase.from('source_log').insert({
      source: 'Zillow ZHVI ETL',
      tier: 'primary',
      url: ZILLOW_ZHVI_URL,
      status: 'success',
      confidence: 'high',
      error_message: null,
    }).catch(() => {});

    return res.json({
      status: 'ok',
      zips: [...zipSet],
      rowsFound: rows.length,
      rowsUpserted: upserted,
    });

  } catch (err) {
    console.error('[etl/zillow] Failed:', err.message);
    return res.status(500).json({ error: 'Zillow ETL failed', detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   PARCL LABS API — New Construction Data
   Free tier: 1,000 credits/month
   Endpoints: /v1/search, /v1/price_feed, /v1/new_construction
   ═══════════════════════════════════════════════════════════════════════════ */
const PARCL_BASE = 'https://api.parcllabs.com/v1';

router.post('/parcl', async (req, res) => {
  const { zips } = req.body;
  if (!zips?.length) return res.status(400).json({ error: 'zips array required' });

  const { config, supabase, cache } = req.app.locals;
  const parclKey = config.parcl_labs_key || process.env.PARCL_LABS_KEY;

  if (!parclKey) {
    return res.status(400).json({
      error: 'Parcl Labs API key not configured',
      setup: 'Add PARCL_LABS_KEY to environment variables. Free tier at https://dashboard.parcllabs.com'
    });
  }

  try {
    const results = [];

    for (const zip of zips) {
      // Step 1: Search for the Parcl market ID for this ZIP
      const searchResp = await fetch(`${PARCL_BASE}/search?query=${zip}&limit=1`, {
        headers: { 'Authorization': parclKey, 'Accept': 'application/json' },
      });
      if (!searchResp.ok) {
        console.warn(`[etl/parcl] Search failed for ZIP ${zip}: ${searchResp.status}`);
        continue;
      }
      const searchData = await searchResp.json();
      const market = searchData?.items?.[0];
      if (!market?.parcl_id) {
        console.warn(`[etl/parcl] No market found for ZIP ${zip}`);
        continue;
      }

      const parclId = market.parcl_id;

      // Step 2: Fetch new construction metrics
      const [priceFeed, ncSales] = await Promise.allSettled([
        fetch(`${PARCL_BASE}/price_feed/${parclId}?property_type=SINGLE_FAMILY`, {
          headers: { 'Authorization': parclKey },
        }).then(r => r.ok ? r.json() : null),
        fetch(`${PARCL_BASE}/new_construction_metrics/${parclId}`, {
          headers: { 'Authorization': parclKey },
        }).then(r => r.ok ? r.json() : null),
      ]);

      const priceData = priceFeed.status === 'fulfilled' ? priceFeed.value : null;
      const ncData    = ncSales.status === 'fulfilled' ? ncSales.value : null;

      results.push({
        zip,
        parcl_id: parclId,
        market_name: market.name || market.location_name,
        price_feed: priceData ? {
          price_per_sqft: priceData?.price_per_sqft || priceData?.ppsf,
          price_per_sqft_change: priceData?.price_per_sqft_change,
          median_price: priceData?.median_sale_price,
        } : null,
        new_construction: ncData || null,
      });
    }

    // Cache results
    const ck = `parcl_${zips.join(',')}`;
    if (cache) cache.set(ck, results, 7 * 24 * 3600 * 1000);

    await supabase.from('source_log').insert({
      source: 'Parcl Labs API',
      tier: 'secondary',
      url: PARCL_BASE,
      status: 'success',
      confidence: results.length > 0 ? 'high' : 'none',
      error_message: null,
    }).catch(() => {});

    return res.json({
      status: 'ok',
      zips,
      results,
    });

  } catch (err) {
    console.error('[etl/parcl] Failed:', err.message);
    return res.status(500).json({ error: 'Parcl Labs ETL failed', detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   MANUAL SEED — Direct data insert for areas where streaming fails
   POST /api/etl/seed/redfin  — { rows: [{zip_code, period_begin, ...}] }
   POST /api/etl/seed/zillow  — { rows: [{region_name, period_date, ...}] }
   ═══════════════════════════════════════════════════════════════════════════ */
router.post('/seed/redfin', async (req, res) => {
  const { rows } = req.body;
  if (!rows?.length) return res.status(400).json({ error: 'rows array required' });

  const { supabase } = req.app.locals;
  try {
    const cleaned = rows.map(r => ({
      zip_code:           String(r.zip_code),
      period_begin:       r.period_begin,
      period_end:         r.period_end || null,
      region_name:        r.region_name || r.zip_code,
      median_sale_price:  safeNum(r.median_sale_price),
      median_list_price:  safeNum(r.median_list_price),
      median_dom:         safeNum(r.median_dom) != null ? Math.round(safeNum(r.median_dom)) : null,
      avg_sale_to_list:   safeNum(r.avg_sale_to_list),
      homes_sold:         safeNum(r.homes_sold) != null ? Math.round(safeNum(r.homes_sold)) : null,
      inventory:          safeNum(r.inventory) != null ? Math.round(safeNum(r.inventory)) : null,
      new_listings:       safeNum(r.new_listings) != null ? Math.round(safeNum(r.new_listings)) : null,
      months_of_supply:   safeNum(r.months_of_supply),
      median_ppsf:        safeNum(r.median_ppsf),
      price_drops_pct:    safeNum(r.price_drops_pct),
      off_market_in_two_weeks_pct: safeNum(r.off_market_in_two_weeks_pct),
      ingested_at:        new Date().toISOString(),
    }));

    const { error } = await supabase.from('redfin_monthly').insert(cleaned);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ status: 'ok', rowsInserted: cleaned.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/seed/zillow', async (req, res) => {
  const { rows } = req.body;
  if (!rows?.length) return res.status(400).json({ error: 'rows array required' });

  const { supabase } = req.app.locals;
  try {
    const cleaned = rows.map(r => ({
      region_id:    r.region_id || null,
      region_name:  String(r.region_name),
      region_type:  r.region_type || 'zip',
      state:        r.state || null,
      metro:        r.metro || null,
      county:       r.county || null,
      period_date:  r.period_date,
      zhvi_value:   safeNum(r.zhvi_value),
      ingested_at:  new Date().toISOString(),
    }));

    const { error } = await supabase.from('zillow_zhvi').insert(cleaned);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ status: 'ok', rowsInserted: cleaned.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   STATUS — Last ETL run info
   ═══════════════════════════════════════════════════════════════════════════ */
router.get('/status', async (req, res) => {
  const { supabase } = req.app.locals;
  try {
    const sources = ['Redfin Data Center ETL', 'Zillow ZHVI ETL', 'Parcl Labs API'];
    const status = {};

    for (const src of sources) {
      const { data } = await supabase
        .from('source_log')
        .select('created_at, status, error_message')
        .eq('source', src)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      status[src] = data || { lastRun: null };
    }

    // Row counts
    const [redfin, zillow] = await Promise.all([
      supabase.from('redfin_monthly').select('zip_code', { count: 'exact', head: true }),
      supabase.from('zillow_zhvi').select('region_name', { count: 'exact', head: true }),
    ]);

    return res.json({
      etlRuns: status,
      dataCounts: {
        redfin_monthly: redfin.count || 0,
        zillow_zhvi: zillow.count || 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ── CSV Parser ──────────────────────────────────────────────────────────── */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

module.exports = router;
