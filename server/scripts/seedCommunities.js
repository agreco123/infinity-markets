#!/usr/bin/env node
/**
 * Infinity Markets v2.5 — communities seed CLI
 *
 * Usage:
 *   node server/scripts/seedCommunities.js 16066 16046 16002 16033 16059
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env (same as server).
 * Scrapes NewHomeSource for each ZIP and upserts into public.communities.
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { scrapeZips } = require('../services/nhsScraper');

(async () => {
  const zips = process.argv.slice(2).map(z => z.trim()).filter(Boolean);
  if (!zips.length) {
    console.error('Usage: node server/scripts/seedCommunities.js <zip1> <zip2> ...');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  console.log(`[seedCommunities] Scraping ${zips.length} ZIP(s) from NewHomeSource...`);
  const summary = await scrapeZips(supabase, zips);
  console.log('[seedCommunities] Done:');
  for (const row of summary) {
    console.log(`  ZIP ${row.zip}: found ${row.found}, inserted ${row.inserted}, updated ${row.updated}, errors ${row.errors.length}`);
    for (const err of row.errors) console.log(`    ! ${err.row}: ${err.error}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
