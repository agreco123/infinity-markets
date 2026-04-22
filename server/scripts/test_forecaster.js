/**
 * v3.0 Phase 2 Step 6 — Forecaster test harness
 * Runs without external deps. Exits non-zero on any assertion failure.
 */

'use strict';

const path = require('path');
const fc = require(path.join(__dirname, '..', 'lib', 'forecaster.js'));
const { project, projectFredSeries, _internals } = fc;
const { linearFit, ewmaFit, naiveFit, toTimeIndex, addYearsToDate, mean } = _internals;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL: ' + msg); }
}
function approx(a, b, eps, msg) {
  const ok = Math.abs(a - b) <= eps;
  assert(ok, msg + '  (got ' + a + ' vs expected ' + b + ' +/- ' + eps + ')');
}

// ── helpers ────────────────────────────────────────────────────────────
console.log('\n== Forecaster harness ==');

// mean
approx(mean([1, 2, 3, 4, 5]), 3, 1e-9, 'mean([1..5]) === 3');
approx(mean([]), 0, 1e-9, 'mean([]) === 0');

// addYearsToDate
assert(addYearsToDate('2026-04-21', 1).startsWith('2027-04'), 'addYearsToDate +1yr');
assert(addYearsToDate('2026-04-21', 5).startsWith('2031-04'), 'addYearsToDate +5yr');
assert(addYearsToDate('2026-04-21', 0.5).startsWith('2026-10'), 'addYearsToDate +0.5yr -> Oct');

// toTimeIndex
const ti = toTimeIndex([
  { date: '2021-01-01', value: 100 },
  { date: '2022-01-01', value: 110 },
  { date: '2023-01-01', value: 120 },
]);
approx(ti[0].t, 0, 1e-3, 'toTimeIndex first t=0');
approx(ti[1].t, 1.0, 5e-3, 'toTimeIndex 1yr -> ~1.0');
approx(ti[2].t, 2.0, 5e-3, 'toTimeIndex 2yr -> ~2.0');
assert(ti[0].y === 100, 'toTimeIndex preserves y');

// ── linearFit ──────────────────────────────────────────────────────────
// Perfect line y = 2 + 3t
const linPerfect = linearFit([
  { t: 0, y: 2 },
  { t: 1, y: 5 },
  { t: 2, y: 8 },
  { t: 3, y: 11 },
]);
approx(linPerfect.a, 2, 1e-6, 'linearFit a for perfect line');
approx(linPerfect.b, 3, 1e-6, 'linearFit b for perfect line');
approx(linPerfect.r2, 1, 1e-6, 'linearFit R²=1 for perfect');
approx(linPerfect.rmse, 0, 1e-6, 'linearFit RMSE=0 for perfect');

// Noisy linear: y = 10 + 2t + jitter
const linNoisy = linearFit([
  { t: 0, y: 10.2 },
  { t: 1, y: 11.8 },
  { t: 2, y: 14.1 },
  { t: 3, y: 16.0 },
  { t: 4, y: 18.2 },
]);
assert(linNoisy.r2 > 0.95, 'linearFit R² > 0.95 for noisy linear');
approx(linNoisy.b, 2, 0.3, 'linearFit b ~2 for noisy trend');

// Insufficient data
assert(linearFit([]) === null, 'linearFit([]) === null');
assert(linearFit([{ t: 0, y: 1 }]) === null, 'linearFit single point === null');

// Degenerate (all same t)
assert(linearFit([{ t: 1, y: 1 }, { t: 1, y: 2 }]) === null, 'linearFit denom≈0 => null');

// ── ewmaFit ────────────────────────────────────────────────────────────
const ew = ewmaFit([
  { t: 0, y: 10 }, { t: 1, y: 12 }, { t: 2, y: 11 },
  { t: 3, y: 13 }, { t: 4, y: 14 }, { t: 5, y: 15 },
], 0.3);
assert(ew !== null, 'ewmaFit returns non-null for 6 pts');
assert(typeof ew.lastSmoothed === 'number', 'ewmaFit lastSmoothed is number');
assert(ew.smoothed.length === 6, 'ewmaFit smoothed array length matches input');
assert(ew.smoothed[0] === 10, 'ewmaFit first smoothed = first obs');
// After smoothing a rising series alpha=0.3, lastSmoothed should be between obs[4] and obs[5]
assert(ew.lastSmoothed > 11 && ew.lastSmoothed < 15, 'ewmaFit lastSmoothed within sensible range');
assert(typeof ew.drift === 'number', 'ewmaFit drift numeric');
assert(ewmaFit([]) === null, 'ewmaFit([]) === null');

// ── naiveFit ───────────────────────────────────────────────────────────
// Exact 10% YoY
const nv = naiveFit([
  { t: 0, y: 100 }, { t: 1, y: 110 }, { t: 2, y: 121 }, { t: 3, y: 133.1 },
]);
assert(nv !== null, 'naiveFit returns non-null');
approx(nv.avgRate, 0.10, 1e-6, 'naiveFit avgRate ~= 0.10 for perfect 10% compound');
approx(nv.lastValue, 133.1, 1e-6, 'naiveFit lastValue');
assert(naiveFit([]) === null, 'naiveFit([]) === null');
assert(naiveFit([{ t: 0, y: 1 }]) === null, 'naiveFit single point === null');

// Zero guard
const nvZero = naiveFit([{ t: 0, y: 0 }, { t: 1, y: 10 }, { t: 2, y: 20 }]);
// First pair is zero => only 1 usable pair, which is (10 -> 20) => 100%
// But we need avgRate computed from remaining pairs
assert(nvZero === null || nvZero.avgRate > 0, 'naiveFit zero-guard safe');

// ── project() with auto on linear trend ────────────────────────────────
const annualLinear = [];
for (let y = 2020; y <= 2025; y++) {
  annualLinear.push({ date: y + '-01-01', value: 100 + (y - 2020) * 5 });
}
const pLin = project(annualLinear, { horizonYears: 5, stepMonths: 12, seriesId: 'TEST_LIN' });
assert(pLin.method === 'linear', 'project auto -> linear for clean trend');
assert(pLin.forecast.length === 5, 'project 5-year horizon, 12-mo step = 5 points');
assert(pLin.r2 >= 0.99, 'project clean linear R² >= 0.99');
assert(pLin.source === 'derived', 'project source = derived');
assert(pLin._stepTag === 'v3.0-step6', 'project stepTag = v3.0-step6');
assert(pLin.seriesId === 'TEST_LIN', 'project preserves seriesId');
assert(pLin.formula.includes('y ='), 'project formula string present');
assert(pLin.formula.includes('R²'), 'project formula includes R²');
// Forecast values should extrapolate: 2026 ≈ 130, 2030 ≈ 150
approx(pLin.forecast[0].value, 130, 2, 'project linear first forecast ~130');
approx(pLin.forecast[4].value, 150, 2, 'project linear final forecast ~150');
assert(pLin.forecast[0].lo <= pLin.forecast[0].value, 'project linear lo <= value');
assert(pLin.forecast[0].hi >= pLin.forecast[0].value, 'project linear hi >= value');

// ── project() with noisy data -> ewma path ─────────────────────────────
const noisy = [
  { date: '2020-01-01', value: 10 },
  { date: '2021-01-01', value: 12 },
  { date: '2022-01-01', value: 9 },
  { date: '2023-01-01', value: 14 },
  { date: '2024-01-01', value: 8 },
  { date: '2025-01-01', value: 13 },
];
const pEw = project(noisy, { horizonYears: 3, stepMonths: 12, method: 'auto' });
// Noisy should have R² < 0.6, fallback to ewma
assert(pEw.method === 'ewma' || pEw.method === 'linear', 'project noisy auto picks a method');
if (pEw.method === 'ewma') {
  assert(pEw.forecast.length === 3, 'ewma horizon 3 yields 3 points');
  assert(pEw.formula.includes('EWMA'), 'ewma formula mentions EWMA');
  // Bands should widen with horizon (sqrt(i) scaling)
  const span0 = pEw.forecast[0].hi - pEw.forecast[0].lo;
  const span2 = pEw.forecast[2].hi - pEw.forecast[2].lo;
  assert(span2 > span0, 'ewma bands widen with horizon');
}

// ── project() explicit method=naive ────────────────────────────────────
const pNv = project(annualLinear, { horizonYears: 3, stepMonths: 12, method: 'naive', seriesId: 'NVTEST' });
assert(pNv.method === 'naive', 'project explicit naive method preserved');
assert(pNv.forecast.length === 3, 'naive 3-year horizon => 3 points');
assert(pNv.forecast[0].lo === null, 'naive lo is null (no bands)');
assert(pNv.forecast[0].hi === null, 'naive hi is null (no bands)');
assert(pNv.formula.includes('%'), 'naive formula mentions percentage');

// ── project() insufficient data ────────────────────────────────────────
const pIns = project([{ date: '2024-01-01', value: 5 }], { seriesId: 'TOOSHORT' });
assert(pIns.method === 'insufficient_data', 'n=1 => insufficient_data');
assert(pIns.forecast.length === 0, 'insufficient => empty forecast');
assert(pIns.formula.includes('TOOSHORT'), 'insufficient preserves seriesId in formula');

const pIns0 = project([], {});
assert(pIns0.method === 'insufficient_data', 'empty input => insufficient_data');

const pIns2 = project(null, {});
assert(pIns2.method === 'insufficient_data', 'null input => insufficient_data');

// ── project() filters invalid entries ──────────────────────────────────
const dirty = [
  { date: '2020-01-01', value: 10 },
  { date: '2021-01-01', value: null },
  { date: null, value: 12 },
  { date: '2023-01-01', value: 'banana' },
  { date: '2024-01-01', value: 14 },
  { date: '2025-01-01', value: 15 },
];
const pDirty = project(dirty, { horizonYears: 2, stepMonths: 12 });
// Only 3 clean rows -> should succeed
assert(pDirty.method !== 'insufficient_data', 'project filters dirty rows but keeps 3 clean');
assert(pDirty.observed.length === 3, 'observed array reflects cleaned input');

// Exactly 2 clean rows -> insufficient
const twoClean = [
  { date: '2020-01-01', value: 10 },
  { date: '2021-01-01', value: null },
  { date: '2022-01-01', value: 12 },
];
const pTwo = project(twoClean, {});
assert(pTwo.method === 'insufficient_data', 'n=2 after filter => insufficient_data');

// ── project() sorts by date ────────────────────────────────────────────
const unsorted = [
  { date: '2023-01-01', value: 30 },
  { date: '2020-01-01', value: 10 },
  { date: '2022-01-01', value: 20 },
  { date: '2021-01-01', value: 15 },
  { date: '2024-01-01', value: 40 },
];
const pSort = project(unsorted, { horizonYears: 1, stepMonths: 12 });
assert(pSort.observed[0].date === '2020-01-01', 'project sorts observations ascending');
assert(pSort.observed[4].date === '2024-01-01', 'project last obs is latest date');

// ── project() quarterly step ───────────────────────────────────────────
const quarterly = [];
for (let q = 0; q < 12; q++) {
  const y = 2023 + Math.floor(q / 4);
  const m = String(1 + (q % 4) * 3).padStart(2, '0');
  quarterly.push({ date: y + '-' + m + '-01', value: 200 + q * 2 });
}
const pQ = project(quarterly, { horizonYears: 2, stepMonths: 3 });
assert(pQ.forecast.length === 8, 'quarterly step over 2yr horizon = 8 points');

// ── projectFredSeries: mock Supabase success ───────────────────────────
function makeMockSupabase(rows) {
  return {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  };
}

(async () => {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push({
      observation_date: '202' + i + '-01-01',
      value: 4.5 + i * 0.1,
      frequency: 'Monthly',
      series_title: 'Mock Mortgage Rate',
    });
  }
  // Wait — years 2020-2029 needed to be well-formed dates. Rebuild.
  rows.length = 0;
  for (let i = 0; i < 10; i++) {
    const y = 2020 + i;
    rows.push({
      observation_date: y + '-01-01',
      value: 4.5 + i * 0.1,
      frequency: 'Monthly',
      series_title: 'Mock Mortgage Rate',
    });
  }
  const mock = makeMockSupabase(rows);
  const fr = await projectFredSeries(mock, 'MORTGAGE30US', { horizonYears: 2 });
  assert(fr !== null, 'projectFredSeries with mock returns non-null');
  assert(fr.seriesId === 'MORTGAGE30US', 'projectFredSeries preserves seriesId');
  assert(fr.forecast.length > 0, 'projectFredSeries yields forecast');
  assert(fr.source === 'derived', 'projectFredSeries source=derived');

  // Null supabase
  const frNull = await projectFredSeries(null, 'X', {});
  assert(frNull === null, 'projectFredSeries null supabase -> null');

  // Error path
  const errMock = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: null, error: { message: 'boom' } }),
        }),
      }),
    }),
  };
  const frErr = await projectFredSeries(errMock, 'X', {});
  assert(frErr === null, 'projectFredSeries error -> null');

  // Empty data
  const emptyMock = makeMockSupabase([]);
  const frEmpty = await projectFredSeries(emptyMock, 'X', {});
  assert(frEmpty === null, 'projectFredSeries empty data -> null');

  // Throwing supabase
  const throwMock = {
    from: () => { throw new Error('network dead'); },
  };
  const frThrow = await projectFredSeries(throwMock, 'X', {});
  assert(frThrow === null, 'projectFredSeries throw -> null (caught)');

  // Frequency-based step selection (quarterly)
  const qRows = [];
  for (let i = 0; i < 8; i++) {
    const y = 2022 + Math.floor(i / 4);
    const m = String(1 + (i % 4) * 3).padStart(2, '0');
    qRows.push({ observation_date: y + '-' + m + '-01', value: 300 + i, frequency: 'Quarterly', series_title: 'Q' });
  }
  const qMock = makeMockSupabase(qRows);
  const frQ = await projectFredSeries(qMock, 'MSPUS', { horizonYears: 2 });
  assert(frQ !== null, 'projectFredSeries quarterly ok');
  assert(frQ.forecast.length >= 2, 'projectFredSeries quarterly yields >=2 points');

  // Annual
  const aRows = [];
  for (let i = 0; i < 6; i++) {
    aRows.push({ observation_date: (2020 + i) + '-01-01', value: 380000 + i * 2000, frequency: 'Annual', series_title: 'A' });
  }
  const aMock = makeMockSupabase(aRows);
  const frA = await projectFredSeries(aMock, 'PITPOP', { horizonYears: 5 });
  assert(frA !== null, 'projectFredSeries annual ok');
  assert(frA.forecast.length >= 3, 'projectFredSeries annual yields forecast');

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exit(1); }
  console.log('  [OK] forecaster harness green\n');
})();
