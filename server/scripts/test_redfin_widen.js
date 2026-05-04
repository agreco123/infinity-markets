/**
 * test_redfin_widen.js — v3.0 Phase 2 Step 4
 *
 * Textual extraction of fetchRedfin() from server/routes/housing.js + synthetic
 * Supabase mock. Exercises 13-month fixture and verifies:
 *   - widened latest-period fields populate
 *   - YoY deltas compute in both directions (growth + decline)
 *   - series[] arrays carry 13 points with numeric values
 *   - cache-hit round-trip returns the same object
 *   - empty / error paths return null (not throw)
 */

const fs = require('fs');
const path = require('path');

const HOUSING = path.resolve(__dirname, '../routes/housing.js');
const src = fs.readFileSync(HOUSING, 'utf8');

// --- Extract helpers and fetchRedfin body via regex ----------------------------
function cut(label, re) {
  const m = src.match(re);
  if (!m) { console.error('[extract-fail]', label); process.exit(2); }
  return m[0];
}

const safeNumSrc = cut('safeNum', /function safeNum\([\s\S]*?\n\}/);
const fetchSrc   = cut('fetchRedfin', /async function fetchRedfin\([\s\S]*?\n\}\n/);

// Build an executable closure. We provide safeNum via a prelude.
const fetchRedfin = new Function(
  'supabase', 'cache', 'zipList',
  safeNumSrc + '\n' +
  'return (async () => { ' +
  fetchSrc.replace(/^async function fetchRedfin\([^)]*\)\s*\{/, '').replace(/\}\n?$/, '') +
  ' })();'
);

// --- Mock Supabase query builder ----------------------------------------------
function makeSupabase(rows) {
  const builder = {
    _rows: rows,
    from()  { return this; },
    select(){ return this; },
    in(_col, list) { this._rows = this._rows.filter(r => list.includes(r.zip_code)); return this; },
    order(col, { ascending }) {
      this._rows = [...this._rows].sort((a, b) => ascending ? (a[col] > b[col] ? 1 : -1) : (a[col] < b[col] ? 1 : -1));
      return this;
    },
    limit(n) { this._rows = this._rows.slice(0, n); return Promise.resolve({ data: this._rows, error: null }); },
  };
  return { from: () => builder };
}
const nullCache = { get: () => null, set: () => {} };

// 13-month synthetic dataset for one ZIP
function genRows(zip = '16066') {
  const rows = [];
  // Months descending from 2026-04 back to 2025-04 (13 points)
  for (let i = 0; i < 13; i++) {
    const d = new Date(2026, 3 - i, 28); // April 2026 - i months
    const pe = d.toISOString().slice(0, 10);
    // Latest (i=0) numbers vs. prior (i=12) produce known deltas:
    //   median_sale_price: 500k latest vs 450k prior  -> +11.1%
    //   homes_sold:        25 latest vs 20 prior      -> +25.0%
    //   pending_sales:     30 latest vs 24 prior      -> +25.0%
    //   new_listings:      40 latest vs 50 prior      -> -20.0%
    //   median_list_price: 510k vs 460k               -> +10.9%
    const t = i === 0 ? 0 : (i === 12 ? 1 : 0.5); // stepped
    rows.push({
      zip_code: zip,
      period_end: pe,
      median_sale_price: i === 0 ? 500000 : (i === 12 ? 450000 : 475000),
      median_list_price: i === 0 ? 510000 : (i === 12 ? 460000 : 485000),
      median_ppsf:       i === 0 ? 210    : (i === 12 ? 195    : 200),
      median_list_ppsf:  i === 0 ? 215    : (i === 12 ? 198    : 205),
      median_dom:        i === 0 ? 22     : (i === 12 ? 40     : 30),
      avg_sale_to_list:  i === 0 ? 99.1   : (i === 12 ? 97.0   : 98.2),
      months_of_supply:  i === 0 ? 2.4    : (i === 12 ? 3.8    : 3.0),
      inventory:         i === 0 ? 35     : (i === 12 ? 50     : 42),
      new_listings:      i === 0 ? 40     : (i === 12 ? 50     : 45),
      homes_sold:        i === 0 ? 25     : (i === 12 ? 20     : 22),
      pending_sales:     i === 0 ? 30     : (i === 12 ? 24     : 26),
      price_drops_pct:   i === 0 ? 12.3   : (i === 12 ? 8.1    : 10.0),
      off_market_in_two_weeks_pct: i === 0 ? 55.0 : (i === 12 ? 40.0 : 48.0),
    });
  }
  return rows;
}

// --- Assertion harness ---------------------------------------------------------
let passed = 0, failed = 0;
function ok(label, cond, info = '') {
  if (cond) { passed++; console.log('  OK   ' + label); }
  else      { failed++; console.log('  FAIL ' + label + (info ? '  ::  ' + info : '')); }
}
function near(label, got, want, eps = 0.5) {
  ok(label + ` (got=${got}, want≈${want}±${eps})`, typeof got === 'number' && Math.abs(got - want) <= eps);
}

// --- Tests ---------------------------------------------------------------------
(async () => {
  // 1. Null / empty guards
  {
    const r = await fetchRedfin(makeSupabase([]), nullCache, []);
    ok('empty zipList returns null', r === null);
  }
  {
    const r = await fetchRedfin(makeSupabase([]), nullCache, ['16066']);
    ok('empty data returns null', r === null);
  }

  // 2. Widened output — full 13-month fixture
  const rows = genRows('16066');
  const r = await fetchRedfin(makeSupabase(rows), nullCache, ['16066']);
  ok('result is object', r && typeof r === 'object');
  ok('_schema tag present', r && r._schema === 'v3.0-step4');

  // v2.x surface preserved
  ok('medianSalePrice present', r.medianSalePrice === 500000);
  ok('medianDOM present',       r.medianDOM === 22);
  ok('monthsSupply present',    Math.abs(r.monthsSupply - 2.4) < 0.01);
  ok('totalInventory present',  r.totalInventory === 35);
  ok('saleToList normalized <2',r.saleToList > 0 && r.saleToList < 2);
  near('priceGrowthYoY',        r.priceGrowthYoY, 11.1, 0.3);

  // Widened latest-period fields
  ok('medianListPrice',         r.medianListPrice === 510000);
  ok('medianPpsf',              r.medianPpsf === 210);
  ok('medianListPpsf',          r.medianListPpsf === 215);
  ok('homesSold',               r.homesSold === 25);
  ok('newListings',             r.newListings === 40);
  ok('pendingSales',            r.pendingSales === 30);
  near('priceDropsPct',         r.priceDropsPct, 12.3, 0.05);
  near('offMarketTwoWeeksPct',  r.offMarketTwoWeeksPct, 55.0, 0.05);

  // YoY deltas (growth direction)
  near('medianListPriceYoY',    r.medianListPriceYoY, 10.9, 0.3);
  near('medianPpsfYoY',         r.medianPpsfYoY, 7.7, 0.3);
  near('medianListPpsfYoY',     r.medianListPpsfYoY, 8.6, 0.3);
  near('homesSoldYoY',          r.homesSoldYoY, 25.0, 0.3);
  near('pendingSalesYoY',       r.pendingSalesYoY, 25.0, 0.3);

  // YoY deltas (decline direction)
  near('newListingsYoY',        r.newListingsYoY, -20.0, 0.3);
  near('inventoryYoY',          r.inventoryYoY, -30.0, 0.3);

  // Series arrays
  ok('series is object',                 r.series && typeof r.series === 'object');
  ok('series.medianSalePrice has 13',    Array.isArray(r.series.medianSalePrice) && r.series.medianSalePrice.length === 13);
  ok('series.homesSold has 13',          Array.isArray(r.series.homesSold) && r.series.homesSold.length === 13);
  ok('series.pendingSales has 13',       Array.isArray(r.series.pendingSales) && r.series.pendingSales.length === 13);
  ok('series row has {period, value}',   r.series.medianSalePrice[0].period && typeof r.series.medianSalePrice[0].value === 'number');
  ok('series ordered ascending by period',
     r.series.medianSalePrice.every((row, i, a) => i === 0 || row.period >= a[i-1].period));

  // 3. Cache round-trip: second fetch with a real cache should hit
  const cacheStore = new Map();
  const cache = {
    get: (k) => cacheStore.get(k) || null,
    set: (k, v) => cacheStore.set(k, v),
  };
  const r1 = await fetchRedfin(makeSupabase(rows), cache, ['16066']);
  const r2 = await fetchRedfin(makeSupabase(rows), cache, ['16066']);
  ok('cache hit returns identity', r1 === r2);

  // 4. Short-window (only 6 months) — YoY must degrade to null, core values still populate
  const shortRows = genRows('16066').slice(0, 6);
  const rs = await fetchRedfin(makeSupabase(shortRows), nullCache, ['16066']);
  ok('short window: core field present',    rs.medianSalePrice === 500000);
  ok('short window: YoY returns null',      rs.priceGrowthYoY === null);
  ok('short window: homesSoldYoY null',     rs.homesSoldYoY === null);
  ok('short window: newListingsYoY null',   rs.newListingsYoY === null);
  ok('short window: series length 6',       rs.series.medianSalePrice.length === 6);

  // 5. Sparse field: pending_sales all null -> latest pendingSales is null AND YoY null
  const sparseRows = genRows('16066').map(r => ({ ...r, pending_sales: null }));
  const rsp = await fetchRedfin(makeSupabase(sparseRows), nullCache, ['16066']);
  ok('sparse pending: latest null',   rsp.pendingSales === null);
  ok('sparse pending: YoY null',      rsp.pendingSalesYoY === null);

  // 6. Multi-zip averaging
  const multi = [...genRows('16066'), ...genRows('16046').map(r => ({ ...r, median_sale_price: r.median_sale_price + 100000 }))];
  const rm = await fetchRedfin(makeSupabase(multi), nullCache, ['16066', '16046']);
  ok('multi-zip avg sale price (550k)', rm.medianSalePrice === 550000);
  ok('multi-zip latest homesSold avg',  rm.homesSold === 25);

  // 7. Sanity: no NaN / undefined leaks in primitives
  const hasBadPrimitive = Object.entries(r).some(([k, v]) => {
    if (v === null || typeof v === 'object') return false;
    if (typeof v === 'number' && !Number.isFinite(v)) return true;
    return false;
  });
  ok('no NaN/Infinity in flat output', !hasBadPrimitive);

  // 8. Schema surface — new fields must all exist as own keys
  const REQUIRED_KEYS = [
    'medianSalePrice','medianDOM','saleToList','monthsSupply','totalInventory','priceGrowthYoY',
    'medianListPrice','medianPpsf','medianListPpsf',
    'homesSold','newListings','pendingSales',
    'priceDropsPct','offMarketTwoWeeksPct',
    'medianListPriceYoY','medianPpsfYoY','medianListPpsfYoY',
    'homesSoldYoY','newListingsYoY','pendingSalesYoY','inventoryYoY',
    'series','_schema',
  ];
  REQUIRED_KEYS.forEach(k => ok('key present: ' + k, Object.prototype.hasOwnProperty.call(r, k)));

  console.log(`\n[test_redfin_widen] ${passed}/${passed+failed} passed${failed ? ' -- FAILED' : ''}`);
  process.exit(failed ? 1 : 0);
})().catch(err => {
  console.error('UNCAUGHT:', err);
  process.exit(99);
});
