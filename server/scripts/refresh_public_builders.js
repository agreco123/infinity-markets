#!/usr/bin/env node
/**
 * V41P-4 / W-4 — refresh public-builder EDGAR cache.
 *
 * Forces a fresh walk of the current V41-8 + V41-10 + V41P-6 cascade logic
 * against every canonical public builder, clearing stale builder_profiles
 * rows. Run post-deploy whenever the cascade logic changes.
 *
 * CLI:
 *   node server/scripts/refresh_public_builders.js [flags]
 *
 * Flags:
 *   --dry-run          Fetch + extract, print table; no Supabase write.
 *   --verbose          Per-builder progress.
 *   --ticker=<sym>     Limit to one builder (e.g. --ticker=TOL).
 *   --no-sleep         Skip the SEC-mandated 100ms rate-limit sleep.
 *
 * Env required (unless --dry-run):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Exit code: 0 on success (even if some builders 10-K fetch fails),
 *            1 on hard error (can't reach Supabase, etc).
 *
 * Programmatic entry (for tests):
 *   const { runRefresh, CANONICAL_BUILDERS } = require('./refresh_public_builders');
 *   await runRefresh({ supabase, fetchImpl, flags });
 */
'use strict';

// Canonical 10 public homebuilders — superset of PUBLIC_BUILDERS in
// competition.js (which only lists 5). Expanded here to the full Forbes
// Capretto peer set per master directive §4.
const CANONICAL_BUILDERS = Object.freeze([
  { ticker: 'NVR',  cik: '0000906163', name: 'NVR Inc.'                    },
  { ticker: 'LEN',  cik: '0000920760', name: 'Lennar'                      },
  { ticker: 'DHI',  cik: '0000882184', name: 'D.R. Horton'                 },
  { ticker: 'PHM',  cik: '0000822416', name: 'PulteGroup'                  },
  { ticker: 'TOL',  cik: '0000794170', name: 'Toll Brothers'               },
  { ticker: 'KBH',  cik: '0000795266', name: 'KB Home'                     },
  { ticker: 'MDC',  cik: '0000773141', name: 'MDC Holdings'                },
  { ticker: 'TMHC', cik: '0001562476', name: 'Taylor Morrison Home Corp.'  },
  { ticker: 'MHO',  cik: '0000799292', name: 'M/I Homes'                   },
  { ticker: 'LGIH', cik: '0001580669', name: 'LGI Homes'                   },
]);

const SEC_UA = 'InfinityMarkets/4.1.2 (aric@forbescaprettohomes.com)';
const SEC_RATE_LIMIT_MS = 100;  // SEC guidance: <=10 req/sec

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseFlags(argv) {
  const flags = { dryRun: false, verbose: false, ticker: null, noSleep: false };
  for (const a of argv) {
    if (a === '--dry-run')        flags.dryRun = true;
    else if (a === '--verbose')   flags.verbose = true;
    else if (a === '--no-sleep')  flags.noSleep = true;
    else if (a.startsWith('--ticker=')) flags.ticker = a.slice(9).toUpperCase();
  }
  return flags;
}

async function fetchCompanyFacts(cik, { fetchImpl }) {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const fx = fetchImpl || globalThis.fetch;
  const res = await fx(url, {
    headers: { 'User-Agent': SEC_UA, 'Accept': 'application/json' },
  });
  if (!res || !res.ok) {
    const status = res ? res.status : 0;
    throw new Error('SEC EDGAR fetch failed: ' + status + ' ' + url);
  }
  return { data: await res.json(), url };
}

function rowFromProfile(p) {
  return {
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
    // V41-10 audit surface — persisted so downstream reads carry it forward.
    homes_delivered_end:   p.homesDeliveredEnd || null,
    asp_source:            p._aspSource || null,
    asp_reason:            p._aspReason || null,
    asp_rev_end:           p._aspRevEnd || null,
    asp_del_end:           p._aspDelEnd || null,
    _step_tag:             p._stepTag || 'v4.1.2.V41P-4.refresh',
  };
}

async function runRefresh({ supabase, extractEdgarMetrics, buildEmptyBuilderProfile, fetchImpl, flags }) {
  if (!extractEdgarMetrics || !buildEmptyBuilderProfile) {
    throw new Error('extractEdgarMetrics + buildEmptyBuilderProfile required');
  }
  const targets = flags.ticker
    ? CANONICAL_BUILDERS.filter(b => b.ticker === flags.ticker)
    : CANONICAL_BUILDERS.slice();
  if (!targets.length) {
    throw new Error('no builders match filter; available: ' + CANONICAL_BUILDERS.map(b => b.ticker).join(', '));
  }

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const b = targets[i];
    const profile = buildEmptyBuilderProfile(b);
    try {
      if (flags.verbose) console.log(`[refresh] fetching ${b.ticker} (${b.name}) CIK=${b.cik}`);
      const { data, url } = await fetchCompanyFacts(b.cik, { fetchImpl });
      Object.assign(profile, extractEdgarMetrics(data, b));
      profile._stepTag = 'v4.1.2.V41P-4.refresh';
      profile.sourceUrl = url;
      results.push({ builder: b, profile, ok: true });
    } catch (err) {
      profile._error = err && err.message ? err.message : String(err);
      results.push({ builder: b, profile, ok: false, error: profile._error });
      if (flags.verbose) console.log(`[refresh] ${b.ticker} FAIL: ${profile._error}`);
    }
    if (!flags.noSleep && i < targets.length - 1) await sleep(SEC_RATE_LIMIT_MS);
  }

  // Persist (skip when --dry-run or no supabase).
  let persisted = 0;
  if (!flags.dryRun && supabase) {
    const persistable = results
      .filter(r => r.ok && r.profile && (r.profile.revenueUsd != null || r.profile.grossMarginPct != null))
      .map(r => rowFromProfile(r.profile));
    if (persistable.length) {
      try {
        // Delete only the builders we're updating (not the whole global row set),
        // so a --ticker=X run leaves the other 9 rows intact.
        const tickers = persistable.map(r => r.ticker_symbol).filter(Boolean);
        if (tickers.length) {
          await supabase.from('builder_profiles')
            .delete()
            .eq('study_target', 'global_public_builders')
            .in('ticker_symbol', tickers);
        }
        const { error } = await supabase.from('builder_profiles').insert(persistable);
        if (error) throw new Error('upsert failed: ' + error.message);
        persisted = persistable.length;
      } catch (err) {
        throw new Error('Supabase write failed: ' + (err.message || err));
      }
    }
  }

  return { results, persisted, dryRun: !!flags.dryRun };
}

function formatTable(results) {
  const lines = [];
  lines.push(['Ticker', 'Name', 'Revenue', 'GP%', 'Delivered', 'ASP', 'Cancel%', 'Filing'].join(' | '));
  lines.push('-'.repeat(100));
  for (const r of results) {
    const p = r.profile;
    lines.push([
      (p.ticker || '').padEnd(5),
      (p.name || '').padEnd(28).slice(0, 28),
      p.revenueUsd ? ('$' + Math.round(p.revenueUsd / 1e6) + 'M').padStart(10) : '         —',
      p.grossMarginPct != null ? (p.grossMarginPct.toFixed(1) + '%').padStart(6) : '     —',
      p.homesDelivered != null ? String(p.homesDelivered).padStart(9) : '        —',
      p.asp ? ('$' + Number(p.asp).toLocaleString()).padStart(9) : '        —',
      p.cancelRate != null ? (Number(p.cancelRate).toFixed(1) + '%').padStart(7) : '      —',
      p.filingPeriodEnd || '—',
    ].join(' | '));
  }
  return lines.join('\n');
}

// ── CLI entry ────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    const flags = parseFlags(process.argv.slice(2));
    const { extractEdgarMetrics, buildEmptyBuilderProfile } = require('../routes/competition');
    let supabase = null;
    if (!flags.dryRun) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
        if (!url || !key) {
          console.error('[refresh] env missing: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or --dry-run)');
          process.exit(1);
        }
        supabase = createClient(url, key);
      } catch (e) {
        console.error('[refresh] Supabase init failed:', e.message);
        process.exit(1);
      }
    }
    try {
      const out = await runRefresh({
        supabase, extractEdgarMetrics, buildEmptyBuilderProfile,
        fetchImpl: globalThis.fetch, flags,
      });
      console.log('\n' + formatTable(out.results));
      const fetched = out.results.filter(r => r.ok).length;
      const failed  = out.results.filter(r => !r.ok).length;
      console.log(`\n[refresh] summary: ${fetched} fetched, ${failed} failed, ${out.persisted} persisted to Supabase` +
                  (out.dryRun ? ' (DRY-RUN — no writes)' : ''));
      if (failed > 0 && flags.verbose) {
        for (const r of out.results.filter(x => !x.ok)) {
          console.log(`  [FAIL] ${r.builder.ticker}: ${r.error}`);
        }
      }
      process.exit(0);
    } catch (e) {
      console.error('[refresh] fatal:', e.stack || e);
      process.exit(1);
    }
  })();
}

module.exports = {
  CANONICAL_BUILDERS, SEC_RATE_LIMIT_MS, SEC_UA,
  parseFlags, fetchCompanyFacts, rowFromProfile,
  runRefresh, formatTable,
};
