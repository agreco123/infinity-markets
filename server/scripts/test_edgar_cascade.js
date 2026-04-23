#!/usr/bin/env node
// v4.0.2 — EDGAR cascade-aware latest resolver test.
// Covers the Toll Brothers / PulteGroup "stale 10-K" regression where a filer
// migrating from `us-gaap:Revenues` to `us-gaap:RFCCE` (FY2019+) caused the
// OR-cascade to lock onto the deprecated concept's last row (Toll's 2018
// final Revenues filing) instead of the 2024 RFCCE. v4.0.2 picks the concept
// whose latest row is globally most recent.
//
// Uses the same express-intercept pattern as test_demographics_cascade.js so
// we can require('../routes/competition.js') without pulling real deps.

const Module = require('module');
const path = require('path');

const fakeRouter = { get() {}, post() {}, use() {} };
const fakeExpress = { Router: () => fakeRouter };
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === 'express') return fakeExpress;
  return origLoad.call(this, request, parent, ...rest);
};

const { extractEdgarMetrics, buildEmptyBuilderProfile } =
  require(path.join(__dirname, '..', 'routes', 'competition.js'));

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  [PASS] ${label}`); pass++; }
  else { console.log(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

// Fixture 1: Filer who switched concepts in FY2018. `Revenues` stops at 2018,
// `RFCCE` runs 2019-2025. Cascade-aware resolver must pick the 2025 RFCCE.
const fixt_switched = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { end: '2016-10-31', val: 5170400000, form: '10-K' },
        { end: '2017-10-31', val: 5820900000, form: '10-K' },
        { end: '2018-10-31', val: 7143258000, form: '10-K' },
      ]}},
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
        { end: '2019-10-31', val:  7223971000, form: '10-K' },
        { end: '2020-10-31', val:  7080970000, form: '10-K' },
        { end: '2023-10-31', val:  9995100000, form: '10-K' },
        { end: '2024-10-31', val: 10847200000, form: '10-K' },
        { end: '2025-10-31', val: 11234500000, form: '10-K' },
      ]}},
      GrossProfit: { units: { USD: [
        { end: '2024-10-31', val: 2700000000, form: '10-K' },
        { end: '2025-10-31', val: 2820000000, form: '10-K' },
      ]}},
    },
  },
};
const m1 = extractEdgarMetrics(fixt_switched, { name: 'Toll', cik: '794170', ticker: 'TOL' });
ok('switched-concept: revenue is 2025 RFCCE, not 2018 Revenues', m1.revenueUsd === 11234500000, `got ${m1.revenueUsd}`);
ok('switched-concept: filingPeriodEnd = 2025-10-31', m1.filingPeriodEnd === '2025-10-31', `got ${m1.filingPeriodEnd}`);
ok('switched-concept: filingForm = 10-K', m1.filingForm === '10-K');
ok('switched-concept: grossProfitUsd = 2,820,000,000', m1.grossProfitUsd === 2820000000, `got ${m1.grossProfitUsd}`);
ok('switched-concept: gross margin ≈ 25.1%', Math.abs(m1.grossMarginPct - 25.1) < 0.2, `got ${m1.grossMarginPct}`);

// Fixture 2: Filer who only ever used `Revenues`.
const fixt_legacy = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { end: '2023-12-31', val: 30000000000, form: '10-K' },
        { end: '2024-12-31', val: 34250400000, form: '10-K' },
      ]}},
      GrossProfit: { units: { USD: [
        { end: '2024-12-31', val: 7700000000, form: '10-K' },
      ]}},
    },
  },
};
const m2 = extractEdgarMetrics(fixt_legacy, { name: 'DHI', cik: '882184', ticker: 'DHI' });
ok('legacy-revenues: revenue is 2024 value', m2.revenueUsd === 34250400000);
ok('legacy-revenues: filingPeriodEnd = 2024-12-31', m2.filingPeriodEnd === '2024-12-31');
ok('legacy-revenues: gross margin ≈ 22.5%', Math.abs(m2.grossMarginPct - 22.5) < 0.2, `got ${m2.grossMarginPct}`);

// Fixture 3: No GrossProfit line, but CostOfGoodsAndServicesSold — GP computed as Rev - CGS.
const fixt_cgs = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-12-31', val: 10000000000, form: '10-K' }]}},
      CostOfGoodsAndServicesSold: { units: { USD: [{ end: '2024-12-31', val: 7500000000, form: '10-K' }]}},
    },
  },
};
const m3 = extractEdgarMetrics(fixt_cgs, { name: 'NVR', cik: '906163', ticker: 'NVR' });
ok('cgs-fallback: GP computed as Rev - CGS = 2,500,000,000', m3.grossProfitUsd === 2500000000, `got ${m3.grossProfitUsd}`);
ok('cgs-fallback: gross margin = 25.0%', Math.abs(m3.grossMarginPct - 25.0) < 0.1, `got ${m3.grossMarginPct}`);

// Fixture 4: Empty input. All fields null.
const m4 = extractEdgarMetrics({ facts: { 'us-gaap': {} } }, { name: 'X', cik: '0', ticker: 'X' });
ok('empty: revenueUsd null', m4.revenueUsd === null);
ok('empty: grossMarginPct null', m4.grossMarginPct === null);
ok('empty: filingPeriodEnd null', m4.filingPeriodEnd === null);

// Fixture 5: Cascade picks latest across concepts where SalesRevenueNet is newest.
const fixt_srn = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2015-12-31', val: 1e9, form: '10-K' }]}},
      SalesRevenueNet: { units: { USD: [{ end: '2024-12-31', val: 5e9, form: '10-K' }]}},
    },
  },
};
const m5 = extractEdgarMetrics(fixt_srn, { name: 'Y', cik: '1', ticker: 'Y' });
ok('cascade-SRN: picks 2024 SalesRevenueNet over 2015 Revenues', m5.revenueUsd === 5e9, `got ${m5.revenueUsd}`);
ok('cascade-SRN: filingPeriodEnd = 2024-12-31', m5.filingPeriodEnd === '2024-12-31');

// Fixture 6: buildEmptyBuilderProfile returns all-null canonical shape.
const empty = buildEmptyBuilderProfile({ name: 'Z', cik: '2', ticker: 'Z' });
const requiredNullKeys = ['revenueUsd','grossProfitUsd','grossMarginPct','netIncomeUsd',
  'homesDelivered','asp','cancelRate','backlogUnits','backlogValueUsd',
  'filingPeriodEnd','filingForm','sourceUrl','_stepTag','_error'];
ok('buildEmpty: all required fields null', requiredNullKeys.every(k => empty[k] === null));

// Fixture 7: Cascade with misordered end-dates — still picks globally latest.
const fixt_mixed = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { end: '2022-12-31', val: 1e9, form: '10-K' },
        { end: '2023-12-31', val: 2e9, form: '10-K' },
      ]}},
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
        { end: '2021-12-31', val: 3e9, form: '10-K' },
      ]}},
    },
  },
};
const m7 = extractEdgarMetrics(fixt_mixed, { name: 'W', cik: '3', ticker: 'W' });
ok('mixed: picks 2023 Revenues over 2021 RFCCE', m7.revenueUsd === 2e9, `got ${m7.revenueUsd}`);
ok('mixed: filingPeriodEnd = 2023-12-31', m7.filingPeriodEnd === '2023-12-31');

// ────────────────────────────────────────────────────────────────────
// V41-8 / O-2 — XBRL homebuilding gross-margin cascade expansion
// ────────────────────────────────────────────────────────────────────

// Fixture 8 (NVR-style): no us-gaap revenue, only custom nvr:HomebuildingRevenue +
// nvr:HomebuildingCostOfSales. Cascade must reach both across namespace walk.
const fixt_nvr_hb = {
  facts: {
    'us-gaap': {
      NetIncomeLoss: { units: { USD: [{ end: '2024-12-31', val: 1e9, form: '10-K' }]}},
    },
    'nvr': {
      HomebuildingRevenue: { units: { USD: [
        { end: '2023-12-31', val: 9500000000, form: '10-K' },
        { end: '2024-12-31', val: 9940000000, form: '10-K' },
      ]}},
      HomebuildingCostOfSales: { units: { USD: [
        { end: '2024-12-31', val: 7200000000, form: '10-K' },
      ]}},
    },
  },
};
const m8 = extractEdgarMetrics(fixt_nvr_hb, { name: 'NVR', cik: '906163', ticker: 'NVR' });
ok('V41-8 nvr-hb: revenue from any-ns HomebuildingRevenue = 9,940,000,000',
   m8.revenueUsd === 9940000000, `got ${m8.revenueUsd}`);
ok('V41-8 nvr-hb: filingPeriodEnd = 2024-12-31',
   m8.filingPeriodEnd === '2024-12-31', `got ${m8.filingPeriodEnd}`);
ok('V41-8 nvr-hb: GP = 9940 - 7200 = 2,740,000,000 via HB-COGS cascade',
   m8.grossProfitUsd === 2740000000, `got ${m8.grossProfitUsd}`);
ok('V41-8 nvr-hb: gross margin ≈ 27.6%',
   Math.abs(m8.grossMarginPct - 27.6) < 0.2, `got ${m8.grossMarginPct}`);

// Fixture 9 (Toll-style OpIncome fallback): revenue present, NO GrossProfit,
// NO CGS, NO HomebuildingCostOfSales. Must fall back to OpIncomeLoss + OpExpenses
// computation and match end-date alignment.
const fixt_toll_opinc = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-10-31', val: 10850000000, form: '10-K' }]}},
      OperatingIncomeLoss:  { units: { USD: [{ end: '2024-10-31', val: 1800000000, form: '10-K' }]}},
      OperatingExpenses:    { units: { USD: [{ end: '2024-10-31', val: 1090000000, form: '10-K' }]}},
    },
  },
};
const m9 = extractEdgarMetrics(fixt_toll_opinc, { name: 'Toll', cik: '794170', ticker: 'TOL' });
ok('V41-8 toll-opinc: revenueUsd = 10,850,000,000',
   m9.revenueUsd === 10850000000, `got ${m9.revenueUsd}`);
ok('V41-8 toll-opinc: GP = OpInc + OpEx = 2,890,000,000',
   m9.grossProfitUsd === 2890000000, `got ${m9.grossProfitUsd}`);
ok('V41-8 toll-opinc: gross margin ≈ 26.6%',
   Math.abs(m9.grossMarginPct - 26.6) < 0.2, `got ${m9.grossMarginPct}`);

// Fixture 10 (DHI-style belt-and-suspenders): BOTH us-gaap GP and HB-COGS available.
// GP wins because it's in the primary cascade; HB cascade is not invoked.
const fixt_dhi_both = {
  facts: {
    'us-gaap': {
      Revenues:     { units: { USD: [{ end: '2024-09-30', val: 36000000000, form: '10-K' }]}},
      GrossProfit:  { units: { USD: [{ end: '2024-09-30', val:  8100000000, form: '10-K' }]}},
    },
    'dhi': {
      HomebuildingRevenue:    { units: { USD: [{ end: '2024-09-30', val: 34100000000, form: '10-K' }]}},
      HomebuildingCostOfSales:{ units: { USD: [{ end: '2024-09-30', val: 27000000000, form: '10-K' }]}},
    },
  },
};
const m10 = extractEdgarMetrics(fixt_dhi_both, { name: 'DHI', cik: '882184', ticker: 'DHI' });
ok('V41-8 dhi-both: us-gaap Revenues wins over dhi:HomebuildingRevenue',
   m10.revenueUsd === 36000000000, `got ${m10.revenueUsd}`);
ok('V41-8 dhi-both: us-gaap GrossProfit wins over HB-COGS derivation',
   m10.grossProfitUsd === 8100000000, `got ${m10.grossProfitUsd}`);
ok('V41-8 dhi-both: gross margin = 22.5%',
   Math.abs(m10.grossMarginPct - 22.5) < 0.2, `got ${m10.grossMarginPct}`);

// Fixture 11 (KB Home-style custom kbh namespace): only kbh:HomebuildingRevenue
// and kbh:HomebuildingCostOfSales are populated. Cascade must find both.
const fixt_kbh = {
  facts: {
    'us-gaap': {
      NetIncomeLoss: { units: { USD: [{ end: '2024-11-30', val: 590000000, form: '10-K' }]}},
    },
    'kbh': {
      HomebuildingRevenues:     { units: { USD: [{ end: '2024-11-30', val: 6800000000, form: '10-K' }]}},
      HomebuildingCostOfSales:  { units: { USD: [{ end: '2024-11-30', val: 5400000000, form: '10-K' }]}},
    },
  },
};
const m11 = extractEdgarMetrics(fixt_kbh, { name: 'KB', cik: '795266', ticker: 'KBH' });
ok('V41-8 kbh: any-ns revenue resolved from kbh:HomebuildingRevenues',
   m11.revenueUsd === 6800000000, `got ${m11.revenueUsd}`);
ok('V41-8 kbh: GP via kbh:HomebuildingCostOfSales = 1,400,000,000',
   m11.grossProfitUsd === 1400000000, `got ${m11.grossProfitUsd}`);
ok('V41-8 kbh: gross margin ≈ 20.6%',
   Math.abs(m11.grossMarginPct - 20.6) < 0.2, `got ${m11.grossMarginPct}`);

// Fixture 12 (end-date misalignment guard): HB-COGS reports a different end date
// than revenue. Cascade must NOT compute GP from mismatched ends.
const fixt_misaligned = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-12-31', val: 10000000000, form: '10-K' }]}},
    },
    'xyz': {
      HomebuildingCostOfSales: { units: { USD: [{ end: '2023-12-31', val: 7000000000, form: '10-K' }]}},
    },
  },
};
const m12 = extractEdgarMetrics(fixt_misaligned, { name: 'Misaligned', cik: '999999', ticker: 'MIS' });
ok('V41-8 misaligned: GP stays null when HB-COGS end-date mismatches revenue',
   m12.grossProfitUsd === null, `got ${m12.grossProfitUsd}`);
ok('V41-8 misaligned: grossMarginPct stays null',
   m12.grossMarginPct === null, `got ${m12.grossMarginPct}`);


// ────────────────────────────────────────────────────────────────────
// V41-10 / O-5 — ASP alignment: require end-date match
// ────────────────────────────────────────────────────────────────────

// Fixture 13: revenue 2025, homes delivered 2024 → derived ASP must NOT set.
// _aspReason must record 'end_date_mismatch' with both end dates exposed.
const fixt_asp_misaligned = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { end: '2024-12-31', val: 12000000000, form: '10-K' },
        { end: '2025-12-31', val: 14000000000, form: '10-K' },
      ]}},
    },
    'nvr': {
      HomesSettled: { units: { 'pure': [
        // No 2025 delivered row — last one is 2024.
        { end: '2024-12-31', val: 30000, form: '10-K' },
      ]}},
    },
  },
};
const m13 = extractEdgarMetrics(fixt_asp_misaligned, { name: 'Mis', cik: '1', ticker: 'M' });
ok('V41-10 asp-mis: revenueUsd = 2025 value',
   m13.revenueUsd === 14000000000, `got ${m13.revenueUsd}`);
ok('V41-10 asp-mis: homesDelivered = 2024 value',
   m13.homesDelivered === 30000, `got ${m13.homesDelivered}`);
ok('V41-10 asp-mis: asp stays null (end-date mismatch)',
   m13.asp === null, `got ${m13.asp}`);
ok('V41-10 asp-mis: _aspReason = end_date_mismatch',
   m13._aspReason === 'end_date_mismatch', `got ${m13._aspReason}`);
ok('V41-10 asp-mis: _aspRevEnd = 2025-12-31',
   m13._aspRevEnd === '2025-12-31', `got ${m13._aspRevEnd}`);
ok('V41-10 asp-mis: _aspDelEnd = 2024-12-31',
   m13._aspDelEnd === '2024-12-31', `got ${m13._aspDelEnd}`);

// Fixture 14: aligned end dates → ASP derives correctly.
const fixt_asp_aligned = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-12-31', val: 12000000000, form: '10-K' }]}},
    },
    'nvr': {
      HomesSettled: { units: { 'pure': [{ end: '2024-12-31', val: 30000, form: '10-K' }]}},
    },
  },
};
const m14 = extractEdgarMetrics(fixt_asp_aligned, { name: 'Al', cik: '2', ticker: 'A' });
ok('V41-10 asp-aligned: asp = 12e9/30000 = 400,000',
   m14.asp === 400000, `got ${m14.asp}`);
ok('V41-10 asp-aligned: _aspSource = derived:rev/homesDelivered',
   m14._aspSource === 'derived:rev/homesDelivered', `got ${m14._aspSource}`);
ok('V41-10 asp-aligned: _aspReason stays null',
   m14._aspReason === null, `got ${m14._aspReason}`);
ok('V41-10 asp-aligned: homesDeliveredEnd = 2024-12-31',
   m14.homesDeliveredEnd === '2024-12-31', `got ${m14.homesDeliveredEnd}`);

// Fixture 15: explicit filer-reported ASP concept (nvr:AverageSellingPrice)
// at same end date as revenue → Tier-1 wins over Tier-2 derivation.
const fixt_asp_explicit = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-12-31', val: 12000000000, form: '10-K' }]}},
    },
    'nvr': {
      HomesSettled: { units: { 'pure': [{ end: '2024-12-31', val: 30000, form: '10-K' }]}},
      AverageSellingPrice: { units: { USD: [{ end: '2024-12-31', val: 425000, form: '10-K' }]}},
    },
  },
};
const m15 = extractEdgarMetrics(fixt_asp_explicit, { name: 'Ex', cik: '3', ticker: 'E' });
ok('V41-10 asp-explicit: Tier-1 filer concept wins — asp = 425000 (not 400k derived)',
   m15.asp === 425000, `got ${m15.asp}`);
ok('V41-10 asp-explicit: _aspSource carries concept path',
   typeof m15._aspSource === 'string' && /AverageSellingPrice/i.test(m15._aspSource),
   `got ${m15._aspSource}`);

// Fixture 16: explicit filer ASP at MISALIGNED end date → skipped, falls back
// to aligned derivation (or null).
const fixt_asp_explicit_mis = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2025-12-31', val: 14000000000, form: '10-K' }]}},
    },
    'nvr': {
      // Explicit ASP is stale (2023); revenue is 2025; cannot trust.
      AverageSellingPrice: { units: { USD: [{ end: '2023-12-31', val: 380000, form: '10-K' }]}},
      HomesSettled: { units: { 'pure': [{ end: '2025-12-31', val: 35000, form: '10-K' }]}},
    },
  },
};
const m16 = extractEdgarMetrics(fixt_asp_explicit_mis, { name: 'ExM', cik: '4', ticker: 'X' });
ok('V41-10 asp-explicit-mis: Tier-1 stale concept is skipped, Tier-2 derives from aligned rev/delivered',
   m16.asp === Math.round(14000000000 / 35000), `got ${m16.asp}`);
ok('V41-10 asp-explicit-mis: _aspSource = derived:rev/homesDelivered',
   m16._aspSource === 'derived:rev/homesDelivered', `got ${m16._aspSource}`);

// Fixture 17: no revenue → _aspReason = 'no_revenue'.
const fixt_asp_norev = {
  facts: {
    'us-gaap': {
      NetIncomeLoss: { units: { USD: [{ end: '2024-12-31', val: 1e8, form: '10-K' }]}},
    },
  },
};
const m17 = extractEdgarMetrics(fixt_asp_norev, { name: 'NR', cik: '5', ticker: 'N' });
ok('V41-10 asp-norev: asp null + _aspReason = no_revenue',
   m17.asp === null && m17._aspReason === 'no_revenue', `got asp=${m17.asp} reason=${m17._aspReason}`);


// ────────────────────────────────────────────────────────────────────
// V41P-6 / W-6 — Widened delivery + cancel regex fixtures
// ────────────────────────────────────────────────────────────────────

// Fixture 21: NVR-style 'HomesSettled' concept — must resolve via new regex.
const fixt_nvr_settled = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-12-31', val: 9500000000, form: '10-K' }]}},
    },
    'nvr': {
      HomesSettled: { units: { 'pure': [{ end: '2024-12-31', val: 22100, form: '10-K' }]}},
    },
  },
};
const m21 = extractEdgarMetrics(fixt_nvr_settled, { name: 'NVR', cik: '906163', ticker: 'NVR' });
ok('V41P-6 nvr-settled: homesDelivered resolved from HomesSettled = 22,100',
   m21.homesDelivered === 22100, `got ${m21.homesDelivered}`);
ok('V41P-6 nvr-settled: ASP derives from aligned rev/delivered',
   m21.asp === Math.round(9500000000 / 22100), `got ${m21.asp}`);

// Fixture 22: Toll-style 'UnitsDelivered' (no 'home' prefix) — must resolve.
const fixt_toll_units = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-10-31', val: 10850000000, form: '10-K' }]}},
    },
    'tol': {
      UnitsDelivered: { units: { 'pure': [{ end: '2024-10-31', val: 9855, form: '10-K' }]}},
    },
  },
};
const m22 = extractEdgarMetrics(fixt_toll_units, { name: 'Toll', cik: '794170', ticker: 'TOL' });
ok('V41P-6 toll-units: homesDelivered resolved from UnitsDelivered (no "home" root) = 9,855',
   m22.homesDelivered === 9855, `got ${m22.homesDelivered}`);

// Fixture 23: KBH-style 'HomesSold' (no deliver/settl/closed) — must resolve.
const fixt_kbh_sold = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-11-30', val: 6800000000, form: '10-K' }]}},
    },
    'kbh': {
      HomesSold: { units: { 'pure': [{ end: '2024-11-30', val: 14500, form: '10-K' }]}},
    },
  },
};
const m23 = extractEdgarMetrics(fixt_kbh_sold, { name: 'KB', cik: '795266', ticker: 'KBH' });
ok('V41P-6 kbh-sold: homesDelivered resolved from HomesSold = 14,500',
   m23.homesDelivered === 14500, `got ${m23.homesDelivered}`);

// Fixture 24: Backlog concept name contains 'home' + 'closed' — must be excluded.
const fixt_backlog_excluded = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-12-31', val: 5000000000, form: '10-K' }]}},
    },
    'xyz': {
      HomesClosedInBacklog: { units: { 'pure': [{ end: '2024-12-31', val: 999999, form: '10-K' }]}},
      HomesDelivered:       { units: { 'pure': [{ end: '2024-12-31', val: 12000, form: '10-K' }]}},
    },
  },
};
const m24 = extractEdgarMetrics(fixt_backlog_excluded, { name: 'X', cik: '1', ticker: 'X' });
ok('V41P-6 backlog-excluded: homesDelivered picks HomesDelivered, not HomesClosedInBacklog',
   m24.homesDelivered === 12000, `got ${m24.homesDelivered}`);

// Fixture 25: Cancel — rate-shaped concept wins over raw count at same end-date.
const fixt_cancel_rate_shaped = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [{ end: '2024-12-31', val: 1e10, form: '10-K' }]}},
    },
    'nvr': {
      // Raw count — would produce a nonsensical rate if picked.
      OrdersCancelled:                 { units: { 'pure': [{ end: '2024-12-31', val: 450,  form: '10-K' }]}},
      // Rate-shaped — should win on same end-date.
      CancellationRatePercent:         { units: { 'pure': [{ end: '2024-12-31', val: 0.148, form: '10-K' }]}},
    },
  },
};
const m25 = extractEdgarMetrics(fixt_cancel_rate_shaped, { name: 'RC', cik: '9', ticker: 'RC' });
// Rate value 0.148 should be treated as decimal (<1 → multiplied by 1000 / 10 → 14.8%)
ok('V41P-6 cancel-rate-shaped: rate concept wins over raw count, value = 14.8%',
   Math.abs(m25.cancelRate - 14.8) < 0.1, `got ${m25.cancelRate}`);

// Fixture 26: Cancel — only raw count available, still resolves (backward compat).
const fixt_cancel_count_only = {
  facts: {
    'us-gaap': {
      OrdersCancelled: { units: { 'pure': [{ end: '2024-12-31', val: 450, form: '10-K' }]}},
    },
  },
};
const m26 = extractEdgarMetrics(fixt_cancel_count_only, { name: 'CC', cik: '10', ticker: 'CC' });
ok('V41P-6 cancel-count-only: raw count still resolves (no regression)',
   m26.cancelRate != null, `got ${m26.cancelRate}`);


console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASS');
