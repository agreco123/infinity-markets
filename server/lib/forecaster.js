/**
 * Infinity Markets v3.0 Phase 2 Step 6 — Forecaster
 *
 * Pure Node, no dependencies. Given a time series of {date, value} observations,
 * emit a 5-year (or arbitrary-horizon) forward projection using one of three
 * methods and return the result with uncertainty bands + a formula string
 * suitable for display in the PDF footnote.
 *
 * Methods:
 *   - 'linear'   : least-squares regression on (t, y) with t in years since first obs
 *   - 'ewma'     : exponentially-weighted moving average with alpha=0.3, projected
 *                  forward by holding last-smoothed value + linear drift of last N points
 *   - 'naive'    : last-value + average YoY change compounded
 *
 * Every projection returns { observed:[{date,value}], forecast:[{date,value,lo,hi}],
 *                            method, formula, r2, rmse, source:'derived' }
 * so the provenance probe classifies these as `derived` and deliverables.js
 * can footnote the formula.
 */

'use strict';

// ── helpers ──────────────────────────────────────────────────────────────

function toTimeIndex(points) {
  // Convert dates to year-fractions since the first observation.
  if (!points.length) return [];
  const first = new Date(points[0].date).getTime();
  const ms_per_year = 365.25 * 24 * 3600 * 1000;
  return points.map(p => ({
    t: (new Date(p.date).getTime() - first) / ms_per_year,
    y: Number(p.value),
    date: p.date,
  }));
}

function addYearsToDate(dateStr, years) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + Math.floor(years));
  const remMonths = Math.round((years - Math.floor(years)) * 12);
  d.setMonth(d.getMonth() + remMonths);
  return d.toISOString().slice(0, 10);
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

// ── linear regression ────────────────────────────────────────────────────

function linearFit(pts) {
  // Least-squares: y = a + b*t
  if (pts.length < 2) return null;
  const n = pts.length;
  const sumT = pts.reduce((s, p) => s + p.t, 0);
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumTT = pts.reduce((s, p) => s + p.t * p.t, 0);
  const sumTY = pts.reduce((s, p) => s + p.t * p.y, 0);
  const denom = n * sumTT - sumT * sumT;
  if (Math.abs(denom) < 1e-9) return null;
  const b = (n * sumTY - sumT * sumY) / denom;
  const a = (sumY - b * sumT) / n;

  // R² and RMSE
  const yMean = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (const p of pts) {
    const yHat = a + b * p.t;
    ssRes += (p.y - yHat) * (p.y - yHat);
    ssTot += (p.y - yMean) * (p.y - yMean);
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const rmse = Math.sqrt(ssRes / n);
  return { a, b, r2, rmse };
}

// ── EWMA (exponentially weighted moving average) ─────────────────────────

function ewmaFit(pts, alpha = 0.3) {
  if (!pts.length) return null;
  let s = pts[0].y;
  const smoothed = [s];
  for (let i = 1; i < pts.length; i++) {
    s = alpha * pts[i].y + (1 - alpha) * s;
    smoothed.push(s);
  }
  // Drift: slope of linear fit over last min(6, N) points
  const tail = pts.slice(Math.max(0, pts.length - 6));
  const lin = linearFit(tail);
  return {
    lastSmoothed: s,
    drift: lin ? lin.b : 0,
    smoothed,
  };
}

// ── naive YoY-compounded ─────────────────────────────────────────────────

function naiveFit(pts) {
  if (pts.length < 2) return null;
  // Average YoY change as fraction
  const yoys = [];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    if (prev.y > 0 && cur.t - prev.t > 0) {
      const annualRate = Math.pow(cur.y / prev.y, 1 / (cur.t - prev.t)) - 1;
      yoys.push(annualRate);
    }
  }
  if (!yoys.length) return null;
  const avgRate = mean(yoys);
  return { lastValue: pts[pts.length - 1].y, avgRate };
}

// ── public API ───────────────────────────────────────────────────────────

/**
 * Project a time series forward. Returns a full forecast object.
 *
 * @param {Array<{date: string, value: number}>} observations
 * @param {Object} opts
 *   - horizonYears  (default 5)
 *   - stepMonths    (default 12 for annual, 3 for quarterly, 1 for monthly)
 *   - method        'linear' | 'ewma' | 'naive' | 'auto' (default 'auto')
 *   - seriesId      optional label for source string
 */
function project(observations, opts = {}) {
  const horizonYears = opts.horizonYears ?? 5;
  const stepMonths   = opts.stepMonths   ?? 12;
  const seriesId     = opts.seriesId     ?? 'series';
  const method       = opts.method       ?? 'auto';

  if (!Array.isArray(observations) || observations.length < 3) {
    return {
      observed: observations || [],
      forecast: [],
      method: 'insufficient_data',
      formula: `n<3; no forecast for ${seriesId}`,
      r2: null, rmse: null,
      source: 'derived',
    };
  }

  // Sort by date ascending
  const obs = [...observations]
    .filter(o => o.date && o.value != null && Number.isFinite(Number(o.value)))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (obs.length < 3) {
    return {
      observed: obs,
      forecast: [],
      method: 'insufficient_data',
      formula: `n<3 after filter; no forecast for ${seriesId}`,
      r2: null, rmse: null,
      source: 'derived',
    };
  }

  const pts = toTimeIndex(obs);
  let chosen = method;
  if (method === 'auto') {
    // Pick linear if R² >= 0.6, else ewma
    const lin = linearFit(pts);
    chosen = (lin && lin.r2 >= 0.6) ? 'linear' : 'ewma';
  }

  const forecast = [];
  const lastDate = obs[obs.length - 1].date;
  const lastT    = pts[pts.length - 1].t;
  const stepYears = stepMonths / 12;
  const nSteps   = Math.max(1, Math.round(horizonYears / stepYears));

  let formula = '', r2 = null, rmse = null;

  if (chosen === 'linear') {
    const lin = linearFit(pts);
    if (!lin) return { observed: obs, forecast: [], method: 'linear_failed', formula: 'denom≈0', r2: null, rmse: null, source: 'derived' };
    r2 = Math.round(lin.r2 * 1000) / 1000;
    rmse = Math.round(lin.rmse * 100) / 100;
    formula = `y = ${lin.a.toFixed(2)} + ${lin.b.toFixed(4)} × t   (t in years since ${obs[0].date}; R²=${r2}, RMSE=${rmse})`;
    for (let i = 1; i <= nSteps; i++) {
      const t = lastT + i * stepYears;
      const y = lin.a + lin.b * t;
      const band = 1.96 * lin.rmse;
      forecast.push({
        date: addYearsToDate(lastDate, i * stepYears),
        value: Math.round(y * 100) / 100,
        lo: Math.round((y - band) * 100) / 100,
        hi: Math.round((y + band) * 100) / 100,
      });
    }
  } else if (chosen === 'ewma') {
    const ew = ewmaFit(pts, 0.3);
    if (!ew) return { observed: obs, forecast: [], method: 'ewma_failed', formula: 'no data', r2: null, rmse: null, source: 'derived' };
    // RMSE over in-sample smoothing
    let ss = 0;
    for (let i = 0; i < pts.length; i++) ss += (pts[i].y - ew.smoothed[i]) * (pts[i].y - ew.smoothed[i]);
    rmse = Math.round(Math.sqrt(ss / pts.length) * 100) / 100;
    formula = `EWMA(α=0.3, s_t = 0.3·y_t + 0.7·s_{t-1}); forward drift from OLS of last 6 points (slope=${ew.drift.toFixed(4)}/yr; RMSE=${rmse})`;
    for (let i = 1; i <= nSteps; i++) {
      const dy = ew.drift * (i * stepYears);
      const y = ew.lastSmoothed + dy;
      const band = 1.96 * rmse * Math.sqrt(i); // widening band
      forecast.push({
        date: addYearsToDate(lastDate, i * stepYears),
        value: Math.round(y * 100) / 100,
        lo: Math.round((y - band) * 100) / 100,
        hi: Math.round((y + band) * 100) / 100,
      });
    }
  } else if (chosen === 'naive') {
    const nv = naiveFit(pts);
    if (!nv) return { observed: obs, forecast: [], method: 'naive_failed', formula: 'no YoY pairs', r2: null, rmse: null, source: 'derived' };
    formula = `y_t = y_0 × (1 + ${(nv.avgRate * 100).toFixed(2)}%)^t   (avg compound YoY across ${pts.length - 1} intervals)`;
    for (let i = 1; i <= nSteps; i++) {
      const y = nv.lastValue * Math.pow(1 + nv.avgRate, i * stepYears);
      forecast.push({
        date: addYearsToDate(lastDate, i * stepYears),
        value: Math.round(y * 100) / 100,
        lo: null, hi: null,
      });
    }
  }

  return {
    observed: obs,
    forecast,
    method: chosen,
    formula,
    r2, rmse,
    seriesId,
    source: 'derived',
    _stepTag: 'v3.0-step6',
  };
}

// ── Supabase convenience: fetch a series from fred_timeseries then project ──

async function projectFredSeries(supabase, seriesId, opts = {}) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('fred_timeseries')
      .select('observation_date, value, frequency, series_title')
      .eq('series_id', seriesId)
      .order('observation_date', { ascending: true });
    if (error || !data?.length) return null;
    const obs = data.map(r => ({ date: r.observation_date, value: Number(r.value) }))
                    .filter(r => r.date && Number.isFinite(r.value));
    const stepMonths = opts.stepMonths ?? (
      data[0]?.frequency === 'Monthly'   ? 6  :
      data[0]?.frequency === 'Quarterly' ? 6  :
      data[0]?.frequency === 'Annual'    ? 12 : 6
    );
    return project(obs, { ...opts, seriesId, stepMonths });
  } catch (_) {
    return null;
  }
}

module.exports = {
  project,
  projectFredSeries,
  _internals: { linearFit, ewmaFit, naiveFit, toTimeIndex, addYearsToDate, mean },
};
