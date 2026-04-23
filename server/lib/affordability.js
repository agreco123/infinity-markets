/**
 * Infinity Markets v4.1 / V41-6 (R-3) — DTI-based affordability ceiling.
 *
 * Replaces the naive "MHI × 3.5" heuristic with a PITI-based DTI calculation
 * that actually reflects what a lender will underwrite.
 *
 *   monthlyIncome       = MHI / 12
 *   allowedPITI         = monthlyIncome × dtiFrontEnd             (default 28%)
 *   monthlyTaxes        = (homePrice × annualTaxRate) / 12
 *   monthlyInsurance    = (homePrice × annualInsRate) / 12
 *   monthlyPI           = allowedPITI − monthlyTaxes − monthlyInsurance
 *   principal (amount financed) = monthlyPI / PMT_FACTOR(rate_monthly, n)
 *   homePrice           = principal / (1 − downPct)
 *
 * The tax + insurance terms are proportional to homePrice → we close on
 * homePrice with a single algebraic step rather than iterating:
 *
 *   monthlyPI  = monthlyIncome × dtiFront − homePrice × (annualTaxRate + annualInsRate) / 12
 *   principal  = monthlyPI / PMT_FACTOR
 *   homePrice  = principal / (1 − downPct)
 *
 *   Let K = (annualTaxRate + annualInsRate) / 12   (monthly T+I as fraction of price)
 *   Let F = PMT_FACTOR
 *   Let D = 1 − downPct                             (principal as fraction of price)
 *
 *   monthlyPI  = monthlyIncome × dtiFront − homePrice × K
 *   homePrice × D × F = monthlyIncome × dtiFront − homePrice × K
 *   homePrice × (D × F + K) = monthlyIncome × dtiFront
 *   homePrice = (monthlyIncome × dtiFront) / (D × F + K)
 *
 * Inputs:
 *   { mhi, rate, taxRate, insRate, dtiFrontEnd, downPct, termYears }
 *
 * All rates are DECIMAL fractions (0.068, not 6.8), and annual (except
 * rate which is converted to monthly inside).
 *
 * Sane defaults:
 *   dtiFrontEnd = 0.28   — Fannie/Freddie conforming front-end DTI ceiling.
 *   downPct     = 0.10   — 10% down is the typical target for new-build.
 *   termYears   = 30
 *   taxRate     = 0.015  — PA statewide median effective property-tax rate
 *                          (Butler County = 1.16%; Erie = 1.91%).
 *   insRate     = 0.0035 — ~0.35% of home value annually (PA average).
 *   rate        = 0.068  — fallback when no live FRED MORTGAGE30US value.
 *
 * The test harness verifies a Cranberry-like case (MHI=112,345, rate=6.82%)
 * produces ~$442K — a plausible DTI-ceiling price in the actual market
 * (actual Cranberry median home value = $367,500, so the ceiling is
 * above median → consistent with the township's affordability).
 */

'use strict';

const DEFAULTS = Object.freeze({
  dtiFrontEnd: 0.28,
  downPct:     0.10,
  termYears:   30,
  taxRate:     0.015,   // PA median effective
  insRate:     0.0035,
  rate:        0.068,
});

/**
 * Standard amortization PMT factor:
 *   PMT = principal × [r(1+r)^n] / [(1+r)^n − 1]
 *   factor = r(1+r)^n / ((1+r)^n − 1)
 *
 * @param {number} monthlyRate  e.g. 0.068/12
 * @param {number} n            number of monthly payments, e.g. 360
 * @returns {number} factor
 */
function pmtFactor(monthlyRate, n) {
  if (!Number.isFinite(monthlyRate) || monthlyRate < 0) return NaN;
  if (!Number.isFinite(n) || n <= 0) return NaN;
  if (monthlyRate === 0) return 1 / n;
  const pow = Math.pow(1 + monthlyRate, n);
  return (monthlyRate * pow) / (pow - 1);
}

/**
 * Compute the DTI-based maximum affordable home price.
 *
 * @param {Object} inp
 * @returns {{ homePrice:number|null, monthlyIncome:number, monthlyPITI:number,
 *             monthlyPI:number, monthlyTaxes:number, monthlyInsurance:number,
 *             principal:number, inputs:Object } | { homePrice:null, reason:string }}
 */
function maxAffordablePrice(inp) {
  const args = inp || {};
  const mhi         = Number(args.mhi);
  const rate        = num(args.rate,        DEFAULTS.rate);
  const taxRate     = num(args.taxRate,     DEFAULTS.taxRate);
  const insRate     = num(args.insRate,     DEFAULTS.insRate);
  const dtiFrontEnd = num(args.dtiFrontEnd, DEFAULTS.dtiFrontEnd);
  const downPct     = num(args.downPct,     DEFAULTS.downPct);
  const termYears   = num(args.termYears,   DEFAULTS.termYears);

  if (!Number.isFinite(mhi) || mhi <= 0) {
    return { homePrice: null, reason: 'invalid_mhi' };
  }
  if (rate < 0 || rate > 0.3) return { homePrice: null, reason: 'rate_out_of_range' };
  if (downPct < 0 || downPct >= 1) return { homePrice: null, reason: 'downPct_out_of_range' };

  const monthlyIncome = mhi / 12;
  const allowedPITI   = monthlyIncome * dtiFrontEnd;
  const n = termYears * 12;
  const F = pmtFactor(rate / 12, n);
  if (!Number.isFinite(F) || F <= 0) return { homePrice: null, reason: 'pmt_factor_invalid' };
  const D = 1 - downPct;
  const K = (taxRate + insRate) / 12;

  // homePrice = allowedPITI / (D*F + K)
  const homePriceRaw = allowedPITI / (D * F + K);
  if (!Number.isFinite(homePriceRaw) || homePriceRaw <= 0) {
    return { homePrice: null, reason: 'homePrice_invalid' };
  }
  const homePrice = Math.round(homePriceRaw);
  const principal = Math.round(homePrice * D);
  const monthlyTaxes     = +(homePrice * taxRate / 12).toFixed(2);
  const monthlyInsurance = +(homePrice * insRate / 12).toFixed(2);
  const monthlyPI        = +(principal * F).toFixed(2);
  const monthlyPITI      = +(monthlyPI + monthlyTaxes + monthlyInsurance).toFixed(2);

  return {
    homePrice,
    monthlyIncome: +monthlyIncome.toFixed(2),
    monthlyPITI,
    monthlyPI,
    monthlyTaxes,
    monthlyInsurance,
    principal,
    inputs: { mhi, rate, taxRate, insRate, dtiFrontEnd, downPct, termYears },
  };
}

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

module.exports = {
  DEFAULTS,
  pmtFactor,
  maxAffordablePrice,
};
