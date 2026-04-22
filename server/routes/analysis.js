/**
 * Infinity Markets v1.5 — Analysis Route
 *
 * POST /api/analysis
 * Body: { targetArea, demographics, housing, competition }
 *
 * Sends all collected data to Claude API with system prompt for structured output.
 * Returns: { absorption, pricing, land, proforma, regulatory, scorecard, swot }
 *
 * v1.5 enhancements:
 * - Added system prompt for more reliable structured JSON output
 * - Added temperature control (0.3) for consistency
 * - Data quality summary tells Claude which fields are null vs populated
 * - Geography-agnostic fallback text (no hardcoded Buffalo MSA)
 * - Added _sources reference in prompt for citation context
 */

const express = require('express');
// v3.0 Step 3: canonical schema normalizer + validator
const { normalizeStudy, validateStudy, SCHEMA_VERSION } = require('../lib/studySchema');
// v3.0 Step 6: 5-year forward projections from FRED time series
const { projectFredSeries } = require('../lib/forecaster');
const router = express.Router();

router.post('/', async (req, res) => {
  const { targetArea, demographics, housing, competition } = req.body;

  if (!targetArea) {
    return res.status(400).json({ error: 'targetArea required' });
  }
  if (!demographics && !housing && !competition) {
    return res.status(400).json({ error: 'At least one data source (demographics, housing, or competition) is required' });
  }

  const { config, sourceLog, dataCache } = req.app.locals;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const schema = buildOutputSchema();
  const dataQuality = summarizeDataQuality(demographics, housing, competition);
  const prompt = buildPrompt(targetArea, demographics, housing, competition, schema, dataQuality);
  const systemPrompt = buildSystemPrompt();

  try {
    let analysis;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 16384,
          temperature: 0.3,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Claude API ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      const text = data.content?.map(c => c.text || '').join('') || '';
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      try {
        analysis = JSON.parse(cleaned);
        break;
      } catch (parseErr) {
        if (attempt >= 1) throw new Error(`JSON parse failed after 2 attempts: ${parseErr.message}`);
      }
    }

    await sourceLog.log({
      source: 'Anthropic Claude API',
      tier: 'primary',
      url: 'https://api.anthropic.com/v1/messages',
      status: 'success',
      confidence: 'high',
    });

    // v2.5: enrich Claude output with deliverables-friendly aliases so PDF/XLSX/PPTX render cleanly.
    // Passes competition so absorption.byPriceBand can be derived from live listings when Claude omits it.
    enrichAnalysisForDeliverables(analysis, housing, competition);

    // v3.0 Step 3: normalize the enriched analysis through the canonical schema.
    // The normalizer is additive — it writes canonical keys alongside existing
    // aliases, so deliverables.js cascades keep working. Attaches _schema.provenance
    // for downstream /api/debug/provenance and future PDF provenance glyphs.
    try {
      const canon = normalizeStudy({ analysis });
      if (canon && canon.analysis) Object.assign(analysis, canon.analysis);
      const val = validateStudy({
        geo: targetArea || {},
        demographics: demographics || {},
        housing: housing || {},
        competition: competition || {},
        analysis,
      });
      analysis._schema = {
        version: SCHEMA_VERSION,
        valid: val.valid,
        errorCount: val.errors.length,
        errors: val.errors.slice(0, 10),
        provenance: val.provenance,
        fieldCount: val.fieldCount,
      };
      if (!val.valid) {
        console.warn('[analysis v3.0] schema validation:', val.errors.length, 'required fields missing');
      }
    } catch (schemaErr) {
      console.warn('[analysis v3.0] normalize/validate failed:', schemaErr.message);
    }

    // v3.0 Step 6: attach 5-year forward projections built from market_study.fred_timeseries.
    // Non-blocking: if Supabase unavailable or series empty, project*() returns null and we skip that slot.
    try {
      const supabase = req.app.locals.supabase;
      if (supabase) {
        const seriesToProject = [
          { key: 'mortgageRate30yr', id: 'MORTGAGE30US' },
          { key: 'housingStarts',    id: 'HOUST' },
          { key: 'buildingPermits',  id: 'PERMIT' },
          { key: 'population',       id: 'PITPOP' },
          { key: 'hpiPittsburgh',    id: 'ATNHPIUS38300Q' },
          { key: 'medianSalePriceUS',id: 'MSPUS' },
          { key: 'unemploymentPitt', id: 'PITT342UR' },
          { key: 'cpi',              id: 'CPIAUCSL' },
          { key: 'lumberPPI',        id: 'WPUSI012011' },
        ];
        const fwd = {};
        await Promise.all(seriesToProject.map(async ({ key, id }) => {
          const f = await projectFredSeries(supabase, id, { horizonYears: 5 });
          if (f && f.forecast && f.forecast.length) fwd[key] = f;
        }));
        if (Object.keys(fwd).length) {
          analysis.forward = fwd;
          analysis._forwardStepTag = 'v3.0-step6';
        }
      }
    } catch (fwdErr) {
      console.warn('[analysis v3.0-step6] forward projection failed:', fwdErr.message);
    }

    if (dataCache) await dataCache.cacheAnalysis(targetArea, analysis).catch(() => {});
    return res.json(analysis);
  } catch (err) {
    await sourceLog.log({
      source: 'Anthropic Claude API',
      tier: 'primary',
      url: 'https://api.anthropic.com/v1/messages',
      status: 'error',
      error_message: err.message,
      confidence: 'none',
    });
    return res.status(500).json({ error: 'Analysis generation failed', detail: err.message });
  }
});

// ── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt() {
  return `You are an institutional-grade new construction market research analyst working for a national home builder's land acquisition team. You produce detailed, quantitative market studies that drive multi-million-dollar land purchase decisions.

Rules:
1. Respond ONLY with valid JSON — no markdown, no explanation, no preamble, no trailing text.
2. Every numeric field must contain a realistic, defensible number — never null, never 0 unless truly zero.
3. Where source data has gaps (null values), use professional judgment based on comparable markets, regional benchmarks, and the data that IS available.
4. All dollar amounts must be realistic for the specific geography provided.
5. Scorecard rationale must reference specific data points from the input data.
6. SWOT items must be specific and data-driven, referencing actual numbers.
7. Price bands, segments, and scenarios must be internally consistent (totals should add up, percentages should sum correctly).`;
}

// ── Data quality summary ──────────────────────────────────────────────────

function summarizeDataQuality(demographics, housing, competition) {
  const summary = [];

  if (demographics) {
    const demoFields = ['population', 'mhi', 'medianAge', 'unemploymentRate', 'popGrowth5yr', 'homeownershipRate', 'vacancyRate'];
    const populated = demoFields.filter(f => demographics[f] != null && demographics[f] !== 0);
    const missing = demoFields.filter(f => demographics[f] == null || demographics[f] === 0);
    summary.push(`Demographics: ${populated.length}/${demoFields.length} key fields populated.${missing.length > 0 ? ' Missing: ' + missing.join(', ') + '.' : ''}`);
    if (demographics.topEmployers?.length > 0) summary.push(`Top employers: ${demographics.topEmployers.length} sectors available.`);
    if (demographics.popTrend?.length > 0) summary.push(`Population trend: ${demographics.popTrend.length} years of data.`);
    if (demographics.incomeDist?.length > 0) summary.push('Income distribution: available.');
    if (demographics._sources) summary.push(`Sources: ${JSON.stringify(demographics._sources)}`);
  } else {
    summary.push('Demographics: NOT AVAILABLE — use professional estimates for this geography.');
  }

  if (housing) {
    const housingFields = ['medianValue', 'medianDOM', 'saleToList', 'monthsSupply', 'medianRent', 'mortgageRate'];
    const populated = housingFields.filter(f => housing[f] != null && housing[f] !== 0);
    const missing = housingFields.filter(f => housing[f] == null || housing[f] === 0);
    summary.push(`Housing: ${populated.length}/${housingFields.length} key fields populated.${missing.length > 0 ? ' Missing: ' + missing.join(', ') + '.' : ''}`);
    if (housing.permitsSF?.length > 0) summary.push(`Building permits: ${housing.permitsSF.length} years of SF data.`);
    if (housing.priceTrend?.length > 0) summary.push(`Price trend: ${housing.priceTrend.length} data points.`);
    if (housing.fmrByBedroom?.length > 0) summary.push('HUD FMR by bedroom: available.');
    if (housing._sources) summary.push(`Sources: ${JSON.stringify(housing._sources)}`);
  } else {
    summary.push('Housing: NOT AVAILABLE — use professional estimates for this geography.');
  }

  if (competition) {
    const comms = competition.communities || [];
    const bldrs = competition.builders || [];
    const bench = competition.publicBenchmarks || [];
    summary.push(`Competition: ${comms.length} communities, ${bldrs.length} builders, ${bench.length} public benchmarks.`);
    if (comms.length === 0) summary.push('No community data — estimate based on typical new construction activity for this market.');
    if (competition._sources) summary.push(`Sources: ${JSON.stringify(competition._sources)}`);
  } else {
    summary.push('Competition: NOT AVAILABLE — estimate based on typical new construction activity for this market.');
  }

  return summary.join('\n');
}

// ── Prompt builder ─────────────────────────────────────────────────────────

function buildPrompt(targetArea, demographics, housing, competition, schema, dataQuality) {
  return `Analyze the following market data for ${targetArea} and produce a comprehensive new construction market study.

=== DATA QUALITY SUMMARY ===
${dataQuality}

=== DEMOGRAPHICS ===
${demographics ? JSON.stringify(demographics, null, 2) : 'No demographic data available — use professional estimates for this geography based on your knowledge.'}

=== HOUSING MARKET ===
${housing ? JSON.stringify(housing, null, 2) : 'No housing data available — use professional estimates for this geography based on your knowledge.'}

=== COMPETITION ===
${competition ? JSON.stringify(competition, null, 2) : 'No competition data available — provide estimates based on typical new construction activity in comparable markets.'}

Produce a comprehensive analysis covering ALL of the following. Every field must be populated with reasonable, data-driven values. Where source data has gaps (null values) or entire sections are missing, use professional judgment to estimate based on comparable markets, regional benchmarks, and the data that IS available. All dollar amounts should be realistic for the specific geography.

1. ABSORPTION (Phase 4):
- marketWideMonthly: estimated total new construction closings per month across the PMA
- annualClosings: marketWideMonthly x 12
- demandGap: annual household formation minus new supply
- hhFormationAnnual: from population growth and household size
- newSupplyAnnual: from building permits
- byPriceBand: array of { band, units, pct } — 5 price bands
- byCommunity: array of { name, abs, method } — one per community from competition data
- seasonality: array of { mo, idx } — 12 months, index centered on 1.0
- selloutPace: array of { name, remain, abs, months } — remaining lot runway per community

2. PRICING (Phase 5):
- stratification: array of { segment, priceRange, psfRange, shareOfSales, builders, color } — 4-5 segments
- psfByProduct: array of { type, psf } — 5-6 product types
- affordability: { mhi, mortgageRate, maxAffordable, priceToIncome, pitiToIncome, buyerPool100, buyerPool125 }
- incentives: array of { builder, type, value, note } — one per active builder

3. LAND ECONOMICS (Phase 6):
- lotToHomeRatio: finished lot value as % of ASP
- estFinishedLotValue: dollar amount
- rawLandPerAcre: dollar amount
- estSiteDev: per-lot site development cost
- lotInventoryMonths: remaining lot supply in months
- comps: array of { address, acres, askPrice, perAcre, zoning, status, estLots } — 4-5 parcels
- devCostBreakdown: array of { item, cost } — 8-9 line items

4. PROFORMA (Phase 7):
- scenarios: array of 3 objects { label, asp, landLot, hardCost, softCost, selling, ga, financing, totalCost, margin, marginPct } for Base Case, Downside, Upside
- publicBenchmarks: array of { builder, grossMargin, asp, cancelRate } for NVR, Lennar, D.R. Horton, PulteGroup, Toll Brothers
- ppiTrend: array of { yr, v } — PPI index, 5 years, base 100
- ppiYoY: latest year-over-year PPI change %

5. REGULATORY (Phase 8):
- zoning: string description of primary zoning classifications
- maxDensity: string with units/acre
- entitlementTimeline: string with months range
- fees: array of { fee, amount, note } — 6-7 common fee types
- totalFeesPerUnit: sum of all fees as integer
- utilities: array of { utility, provider, status, note } — 5 utilities
- schoolDistrict: { name, rating, enrollment, trend, note }

6. SCORECARD (Phase 9):
- Array of 8 objects: { metric, weight, score, rationale }
- Metrics: Population & HH Growth (15), Income & Affordability (10), Employment Strength (10), Supply/Demand Balance (15), Competitive Intensity (10), Land Availability & Cost (15), Margin Potential (15), Regulatory Environment (10)
- Weights must sum to 100. Scores 1-10. Rationale must reference specific data points.

7. SWOT:
- { strengths: [5 strings], weaknesses: [4 strings], opportunities: [4 strings], threats: [4 strings] }
- Each item must be specific and data-driven, referencing actual numbers.

For the color field in pricing stratification, use these hex values in order: "#3B82F6", "#F59E0B", "#8B5CF6", "#F97316", "#10B981".

Respond ONLY with valid JSON matching this exact structure:
${schema}

No markdown, no explanation, no preamble. Only the JSON object.`;
}
function buildOutputSchema() {
  return `{
  "absorption": {
    "marketWideMonthly": number,
    "annualClosings": number,
    "demandGap": number,
    "hhFormationAnnual": number,
    "newSupplyAnnual": number,
    "byPriceBand": [{ "band": string, "units": number, "pct": number }],
    "byCommunity": [{ "name": string, "abs": number, "method": string }],
    "seasonality": [{ "mo": string, "idx": number }],
    "selloutPace": [{ "name": string, "remain": number, "abs": number, "months": number }]
  },
  "pricing": {
    "stratification": [{ "segment": string, "priceRange": string, "psfRange": string, "shareOfSales": number, "builders": string, "color": string }],
    "psfByProduct": [{ "type": string, "psf": number }],
    "affordability": {
      "mhi": number,
      "mortgageRate": number,
      "maxAffordable": number,
      "priceToIncome": number,
      "pitiToIncome": number,
      "buyerPool100": number,
      "buyerPool125": number
    },
    "incentives": [{ "builder": string, "type": string, "value": string, "note": string }]
  },
  "land": {
    "lotToHomeRatio": number,
    "estFinishedLotValue": number,
    "rawLandPerAcre": number,
    "estSiteDev": number,
    "lotInventoryMonths": number,
    "comps": [{ "address": string, "acres": number, "askPrice": number, "perAcre": number, "zoning": string, "status": string, "estLots": number }],
    "devCostBreakdown": [{ "item": string, "cost": number }]
  },
  "proforma": {
    "scenarios": [{ "label": string, "asp": number, "landLot": number, "hardCost": number, "softCost": number, "selling": number, "ga": number, "financing": number, "totalCost": number, "margin": number, "marginPct": number }],
    "publicBenchmarks": [{ "builder": string, "grossMargin": number, "asp": number, "cancelRate": number }],
    "ppiTrend": [{ "yr": string, "v": number }],
    "ppiYoY": number
  },
  "regulatory": {
    "zoning": string,
    "maxDensity": string,
    "entitlementTimeline": string,
    "fees": [{ "fee": string, "amount": string, "note": string }],
    "totalFeesPerUnit": number,
    "utilities": [{ "utility": string, "provider": string, "status": string, "note": string }],
    "schoolDistrict": { "name": string, "rating": string, "enrollment": number, "trend": string, "note": string }
  },
  "scorecard": [{ "metric": string, "weight": number, "score": number, "rationale": string }],
  "swot": {
    "strengths": [string],
    "weaknesses": [string],
    "opportunities": [string],
    "threats": [string]
  }
}`;
}



// ---- v2.5: deliverables enrichment ----

function safeNumA(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function _normTierKey(s) {
  if (!s) return '';
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// v2.5: default sqft ranges per tier (used when Claude omits them)
const DEFAULT_SQFT_RANGES = {
  'entrylevel':   '1,800-2,400',
  'moveup':       '2,400-3,200',
  'executive':    '3,200-4,200',
  'luxury':       '4,200-5,500',
  'ultraluxury':  '4,500+',
};

// v2.5: default $/sqft per tier (filled only when missing)
const DEFAULT_PSF_PER_TIER = {
  'entrylevel':  220,
  'moveup':      260,
  'executive':   320,
  'luxury':      400,
  'ultraluxury': 500,
};

const TIER_ORDER = ['Entry-Level', 'Move-Up', 'Executive', 'Luxury', 'Ultra-Luxury'];

/**
 * v2.5: When Claude's byPriceBand is missing or names don't match the 5 standard tiers,
 * derive bands from the raw competition list + overall absorption rate.
 */
function deriveBandsFromCompetition(competition, absorption) {
  if (!competition || !Array.isArray(competition.communities)) return null;
  const tiers = [
    { name: 'Entry-Level',  min: 0,        max: 450000  },
    { name: 'Move-Up',      min: 450000,   max: 650000  },
    { name: 'Executive',    min: 650000,   max: 900000  },
    { name: 'Luxury',       min: 900000,   max: 1400000 },
    { name: 'Ultra-Luxury', min: 1400000,  max: Infinity},
  ];
  const avgMonthly = absorption?.monthlyAbsorption || absorption?.marketWideMonthly || 0;
  const globalAbsRate = avgMonthly > 0 ? avgMonthly / Math.max(competition.communities.length, 1) : 0;

  return tiers.map(t => {
    const members = competition.communities.filter(c => {
      const mid = c.priceLow && c.priceHigh ? (c.priceLow + c.priceHigh) / 2 : 0;
      return mid >= t.min && mid < t.max;
    });
    const listings = members.reduce((a, c) => a + (c.plans || 0), 0);
    const salesPerMonth = +(globalAbsRate * members.length).toFixed(2);
    const monthsSupply = salesPerMonth > 0 ? +(listings / salesPerMonth).toFixed(1) : null;
    return {
      name: t.name, tier: t.name,
      listings, salesPerMonth, monthsSupply,
      communityCount: members.length,
    };
  });
}

/**
 * v2.6 Step 7: Tertiary fallback for absorption.byPriceBand.
 *
 * When deriveBandsFromCompetition returns nothing (e.g. NHS unseeded AND
 * RapidAPI Realtor filtered out all brokerage-listed rows), synthesize a
 * 5-band distribution from housing-level aggregates alone:
 *   - medianValue (Redfin median_sale_price)
 *   - inventoryActive (Redfin inventory)
 *   - monthsSupply (Redfin months_of_supply)
 *
 * Band cuts are relative to the median; weights are empirical averages for
 * Western-PA new-construction markets. Returns null if median or inventory
 * are missing — never fabricate where we have zero signal.
 */
function deriveBandsFromListings(housing) {
  if (!housing) return null;
  const median = housing.medianValue || housing.medianHomeValue || housing.medianSalePrice;
  const inventory = housing.inventoryActive || housing.totalUnits || housing.totalInventory;
  const monthsSupply = housing.monthsSupply;
  if (!median || median <= 0) return null;
  if (!inventory || inventory <= 0) return null;

  const tiers = [
    { name: 'Entry-Level',  weight: 0.15, minRatio: 0.00, maxRatio: 0.70 },
    { name: 'Move-Up',      weight: 0.32, minRatio: 0.70, maxRatio: 1.00 },
    { name: 'Executive',    weight: 0.28, minRatio: 1.00, maxRatio: 1.40 },
    { name: 'Luxury',       weight: 0.17, minRatio: 1.40, maxRatio: 2.00 },
    { name: 'Ultra-Luxury', weight: 0.08, minRatio: 2.00, maxRatio: Infinity },
  ];

  // v4.0.2: do not fabricate a 6-month fallback. When Redfin months_of_supply
  // is unavailable, leave the per-band monthsSupply null so the renderer shows
  // an honest em-dash rather than a cloned default that looks like a measurement.
  const supply = monthsSupply && monthsSupply > 0 ? monthsSupply : null;

  return tiers.map(t => {
    const listings = Math.round(inventory * t.weight);
    const bandMonthsSupply = supply;
    const salesPerMonth = bandMonthsSupply && bandMonthsSupply > 0
      ? +(listings / bandMonthsSupply).toFixed(2)
      : null;
    return {
      name: t.name,
      tier: t.name,
      listings,
      salesPerMonth,
      monthsSupply: bandMonthsSupply != null ? +bandMonthsSupply.toFixed(1) : null,
      communityCount: null,
      _derivedFrom: 'housing-listings',
      _stepTag: 'v4.0.2-no-fallback',
    };
  });
}

function enrichAnalysisForDeliverables(a, housing, competition) {
  if (!a || typeof a !== 'object') return;

  // v2.6 DIAGNOSTIC: dump raw inbound keys so Render logs reveal what the LLM produced
  try {
    const prKeys = a.pricing ? Object.keys(a.pricing) : [];
    const stratLen = a.pricing && Array.isArray(a.pricing.stratification) ? a.pricing.stratification.length : 0;
    const absKeys = a.absorption ? Object.keys(a.absorption) : [];
    const bandsLen = a.absorption && Array.isArray(a.absorption.byPriceBand) ? a.absorption.byPriceBand.length : 0;
    console.log('[enrich v2.6] pricing.keys=', JSON.stringify(prKeys),
                'stratification.len=', stratLen,
                'absorption.keys=', JSON.stringify(absKeys),
                'byPriceBand.len=', bandsLen);
    if (a.pricing && Array.isArray(a.pricing.stratification)) {
      console.log('[enrich v2.6] stratification=', JSON.stringify(a.pricing.stratification.map(s => ({
        tier: s.tier || s.name || s.segment,
        priceRange: s.priceRange,
        recommended: !!s.recommended,
      }))));
    }
  } catch (e) { /* diag only */ }

  if (a.absorption) {
    const ab = a.absorption;
    ab.monthlyAbsorption = ab.monthlyAbsorption ?? ab.marketWideMonthly ?? null;
    ab.salesPerMonth     = ab.salesPerMonth     ?? ab.marketWideMonthly ?? null;
    ab.annualAbsorption  = ab.annualAbsorption  ?? ab.annualClosings    ?? null;
    ab.annualSales       = ab.annualSales       ?? ab.annualClosings    ?? null;
    if (ab.monthsSupply == null) {
      const supplyFromHousing = housing && housing.monthsSupply != null ? housing.monthsSupply : null;
      if (supplyFromHousing != null) ab.monthsSupply = supplyFromHousing;
      else if (ab.newSupplyAnnual && ab.annualClosings) {
        ab.monthsSupply = +(ab.newSupplyAnnual / Math.max(ab.annualClosings, 1) * 12).toFixed(1);
      }
    }

    // v2.5: if byPriceBand missing or empty, derive from competition.
    // v2.6 Step 7: then fall back to housing-listings-derived bands when
    // competition is empty (NHS unseeded + brokerage filter zeroed out realtor).
    // v2.6.1: a "has bands" result from Claude isn't useful if every row is
    // name-only (units/listings/salesPerMonth all null). Treat name-only rows as
    // empty and fall through to listings-derived.
    const _rowHasNumbers = (b) => {
      if (!b) return false;
      const u = b.listings ?? b.units ?? b.active ?? b.activeListings ?? b.count;
      const s = b.salesPerMonth ?? b.monthlyAbsorption ?? b.absorption;
      const m = b.monthsSupply ?? b.supply;
      return [u, s, m].some(v => typeof v === 'number' && !Number.isNaN(v));
    };
    const hasBands = Array.isArray(ab.byPriceBand)
      && ab.byPriceBand.length > 0
      && ab.byPriceBand.some(_rowHasNumbers);
    if (!hasBands) {
      let derived = deriveBandsFromCompetition(competition, ab);
      if (!derived || !derived.length || derived.every(b => !b.listings && !b.salesPerMonth)) {
        const listingsDerived = deriveBandsFromListings(housing);
        if (listingsDerived && listingsDerived.length) {
          derived = listingsDerived;
          ab._bandsDerivedFrom = 'housing-listings';
          console.log('[enrich v2.6.1] absorption.byPriceBand derived from housing listings (competition empty / Claude name-only)');
        }
      } else {
        ab._bandsDerivedFrom = 'competition-communities';
      }
      if (derived && derived.length) {
        ab.byPriceBand = derived;
      }
    }
    // Normalize entries: each band should have listings / salesPerMonth / monthsSupply populated.
    // v2.6.1: emit every name alias (name/tier/band/priceBand) and map
    // Claude-returned `units` into `listings`.
    if (Array.isArray(ab.byPriceBand)) {
      ab.byPriceBand = ab.byPriceBand.map(b => {
        const label = b.name || b.tier || b.band || b.priceBand || null;
        return {
          ...b,
          name: label,
          tier: label,
          band: label,
          priceBand: label,
          listings: safeNumA(b.listings ?? b.units ?? b.active ?? b.activeListings ?? b.count),
          salesPerMonth: safeNumA(b.salesPerMonth ?? b.monthlyAbsorption ?? b.absorption),
          monthsSupply: safeNumA(b.monthsSupply ?? b.supply),
        };
      });
    }
    // Mutual alias for downstream renderers
    if (Array.isArray(ab.byPriceBand)) {
      ab.byBand = ab.byBand || ab.byPriceBand;
      ab.priceBands = ab.priceBands || ab.byPriceBand;
    }
  }

  if (a.pricing) {
    const pr = a.pricing;

    // v2.6: derive targetHomePrice {low, mid, high} as MAINSTREAM NEW-CONSTRUCTION
    // bands only. Low = Entry-Level midpoint; Mid = Move-Up / recommended midpoint;
    // High = Executive midpoint. Luxury and Ultra-Luxury are EXCLUDED from High
    // because the target builder does not build at those price points and PDF Section 8
    // should reflect the recommended program, not the full market envelope.
    if (!pr.targetHomePrice && Array.isArray(pr.stratification) && pr.stratification.length) {
      const _norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // v2.6.1 Fix C: Claude's free-form tier labels need a canonical resolver.
      // Accept Premium/Mid-Premium/Upper-Mid as Executive; First-Time/Starter as
      // Entry-Level; etc. Also fall back to priceRange-based inference when the
      // label is unrecognized — a band covering $500-750K is Executive whatever
      // it's called.
      const TIER_ALIASES = {
        entrylevel:  ['entrylevel','entry','firsttime','starter','firsthome','affordable','value','economy'],
        moveup:      ['moveup','moveupbuyer','secondhome','tradeup','midrange','middle'],
        executive:   ['executive','premium','midpremium','uppermiddle','upper','upscale','highend','move-up-plus','uppermove','above-move-up'],
        luxury:      ['luxury','highluxury','primeluxury','estate'],
        ultraluxury: ['ultraluxury','ultra','superluxury','trophyhome','top'],
      };
      const CANONICAL_KEYS = Object.keys(TIER_ALIASES);
      const ALIAS_INDEX = {};
      for (const canon of CANONICAL_KEYS) for (const a of TIER_ALIASES[canon]) ALIAS_INDEX[_norm(a)] = canon;

      // Price-range buckets for inference when label is non-canonical.
      // Relative to each band's midpoint, which canonical tier best fits?
      function inferByMid(mid) {
        if (mid == null) return null;
        if (mid < 350000) return 'entrylevel';
        if (mid < 500000) return 'moveup';
        if (mid < 800000) return 'executive';
        if (mid < 1200000) return 'luxury';
        return 'ultraluxury';
      }

      function resolveTierKey(row, mid) {
        const raw = _norm(row.tier || row.name || row.segment || row.band);
        if (raw && ALIAS_INDEX[raw]) return ALIAS_INDEX[raw];
        // check if raw contains any alias as substring
        if (raw) {
          for (const a of Object.keys(ALIAS_INDEX)) {
            if (raw.includes(a) || a.includes(raw)) return ALIAS_INDEX[a];
          }
        }
        // fall back to price-range inference
        return inferByMid(mid);
      }

      const byTier = {};
      for (const row of pr.stratification) {
        const r = parsePriceRange(row.priceRange);
        if (!r || r.min == null) continue;
        const mid = r.max != null ? Math.round((r.min + r.max) / 2) : r.min;
        const k = resolveTierKey(row, mid);
        if (!k) continue;
        // If multiple rows resolve to the same canonical key, keep the first.
        if (!byTier[k]) byTier[k] = { row, mid, range: r };
      }
      const entry    = byTier['entrylevel'];
      const moveup   = byTier['moveup'];
      const executive = byTier['executive'];
      const luxury    = byTier['luxury'];
      const recRow = pr.stratification.find(s => s.recommended || /recommend|target/i.test(s.tag || s.segment || ''));
      const recRange = recRow ? parsePriceRange(recRow.priceRange) : null;
      const recMid = recRange && recRange.min != null
        ? (recRange.max != null ? Math.round((recRange.min + recRange.max) / 2) : recRange.min)
        : null;

      let low  = entry ? entry.mid : (moveup ? moveup.mid : null);
      let mid  = recMid != null ? recMid : (moveup ? moveup.mid : (executive ? executive.mid : low));
      let high = executive ? executive.mid : (moveup ? moveup.mid : (entry ? entry.mid : mid));

      // Mainstream-only fallback: if Executive is missing, cap High at Move-Up.
      // Never promote Luxury/Ultra-Luxury into High automatically.
      if (low != null && mid != null && high != null) {
        pr.targetHomePrice = { low, mid, high };
      }
    }

    // v2.6 housing-based fallback: if stratification absent but we have median home
    // value, emit a reasonable target band (mhv * 0.85 / 1.05 / 1.40).
    if (!pr.targetHomePrice) {
      const mhv = (housing && (housing.medianHomeValue || housing.medianValue)) ||
                  (pr.medianHomeValue || null);
      if (mhv && mhv > 0) {
        pr.targetHomePrice = {
          low:  Math.round(mhv * 0.85),
          mid:  Math.round(mhv * 1.05),
          high: Math.round(mhv * 1.40),
        };
      }
    }

    // Keep legacy targetPriceRange too, but derive from stratification when missing.
    if (!pr.targetPriceRange && Array.isArray(pr.stratification) && pr.stratification.length) {
      const ranges = pr.stratification.map(s => parsePriceRange(s.priceRange)).filter(r => r && r.min && r.max);
      if (ranges.length) {
        const min = Math.min.apply(null, ranges.map(r => r.min));
        const max = Math.max.apply(null, ranges.map(r => r.max));
        pr.targetPriceRange = { min, max, mid: Math.round((min + max) / 2) };
      }
    }

    // v2.5: overlay targetHomePrice values onto targetPriceRange so Section 8 shows
    // realistic Low/Mid/High rather than band extremes.
    if (pr.targetHomePrice) {
      pr.targetPriceRange = pr.targetPriceRange || {};
      if (pr.targetHomePrice.low  != null) pr.targetPriceRange.low  = pr.targetHomePrice.low;
      if (pr.targetHomePrice.mid  != null) pr.targetPriceRange.mid  = pr.targetHomePrice.mid;
      if (pr.targetHomePrice.high != null) pr.targetPriceRange.high = pr.targetHomePrice.high;
    }

    if (pr.recommendedPricePerSqft == null && Array.isArray(pr.psfByProduct) && pr.psfByProduct.length) {
      const psfs = pr.psfByProduct.map(p => +p.psf).filter(Number.isFinite);
      if (psfs.length) pr.recommendedPricePerSqft = Math.round(psfs.reduce((a, b) => a + b, 0) / psfs.length);
    }

    if (!pr.bandedPricing && Array.isArray(pr.stratification)) {
      pr.bandedPricing = pr.stratification.map(s => ({
        tier: s.segment, name: s.segment, sqftRange: s.sqftRange || null,
        priceRange: s.priceRange, pricePerSqft: parsePsfRangeMid(s.psfRange),
        share: s.shareOfSales,
      }));
    }

    // v2.5: backfill missing sqftRange + pricePerSqft with per-tier defaults.
    if (Array.isArray(pr.bandedPricing)) {
      pr.bandedPricing = pr.bandedPricing.map(b => {
        const key = _normTierKey(b.tier || b.name);
        const out = { ...b };
        if (!out.sqftRange || out.sqftRange === '-' || out.sqftRange === '—') {
          out.sqftRange = DEFAULT_SQFT_RANGES[key] || out.sqftRange || null;
        }
        if (out.pricePerSqft == null || !Number.isFinite(Number(out.pricePerSqft))) {
          out.pricePerSqft = DEFAULT_PSF_PER_TIER[key] || null;
        }
        return out;
      });
    }
  }

  if (a.land) {
    const ln = a.land;
    ln.targetLandCostPerLot   = ln.targetLandCostPerLot   ?? ln.estFinishedLotValue ?? null;
    ln.finishedLotCost        = ln.finishedLotCost        ?? ln.estFinishedLotValue ?? null;
    ln.landCostPctOfRevenue   = ln.landCostPctOfRevenue   ?? ln.lotToHomeRatio       ?? null;
    if (ln.lotsPerAcre == null && Array.isArray(ln.comps) && ln.comps.length) {
      const samples = ln.comps.map(c => (c.estLots && c.acres ? c.estLots / c.acres : null)).filter(Boolean);
      if (samples.length) ln.lotsPerAcre = +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2);
    }
    if (!ln.developmentCosts && Array.isArray(ln.devCostBreakdown)) {
      ln.developmentCosts = Object.fromEntries(ln.devCostBreakdown.map(d => [d.item, d.cost]));
    }
  }

  if (a.proforma) {
    const pf = a.proforma;
    const base = Array.isArray(pf.scenarios) ? (pf.scenarios.find(s => /base/i.test(s.label || '')) || pf.scenarios[0]) : null;
    if (base) {
      pf.revenue       = pf.revenue       ?? base.asp        ?? null;
      pf.totalRevenue  = pf.totalRevenue  ?? base.asp        ?? null;
      pf.grossProfit   = pf.grossProfit   ?? base.margin     ?? null;
      pf.grossMargin   = pf.grossMargin   ?? base.marginPct  ?? null;
      pf.netMargin     = pf.netMargin     ?? (base.marginPct != null ? +(base.marginPct * 0.65).toFixed(1) : null);
      if (!pf.lineItems) {
        pf.lineItems = {
          'Land + Lot':        { amount: base.landLot,    pct: pctOfAsp(base.landLot, base.asp) },
          'Hard Cost':         { amount: base.hardCost,   pct: pctOfAsp(base.hardCost, base.asp) },
          'Soft Cost':         { amount: base.softCost,   pct: pctOfAsp(base.softCost, base.asp) },
          'Sales & Marketing': { amount: base.selling,    pct: pctOfAsp(base.selling, base.asp) },
          'G&A':               { amount: base.ga,         pct: pctOfAsp(base.ga, base.asp) },
          'Financing':         { amount: base.financing,  pct: pctOfAsp(base.financing, base.asp) },
          'Total Cost':        { amount: base.totalCost,  pct: pctOfAsp(base.totalCost, base.asp) },
          'Gross Profit':      { amount: base.margin,     pct: base.marginPct },
        };
      }
      if (!pf.returns) {
        pf.returns = {
          'Gross Margin %':     fmtPct(base.marginPct),
          'Net Margin % (est)': fmtPct(pf.netMargin),
          'ASP':                '$' + Math.round(base.asp || 0).toLocaleString(),
          'Total Cost':         '$' + Math.round(base.totalCost || 0).toLocaleString(),
        };
      }
    }
  }

  if (a.regulatory) {
    const rg = a.regulatory;
    if (!rg.impactFees && Array.isArray(rg.fees)) {
      rg.impactFees = rg.fees.map(f => ({
        name: f.fee, type: f.fee, amount: typeof f.amount === 'number' ? '$' + f.amount.toLocaleString() : f.amount,
      }));
    }
  }

  if (Array.isArray(a.scorecard)) {
    a.scorecard = a.scorecard.map(s => ({
      ...s,
      factor: s.factor != null ? s.factor : (s.metric != null ? s.metric : null),
      name:   s.name   != null ? s.name   : (s.metric != null ? s.metric : null),
    }));
  }
}

function parsePriceRange(s) {
  if (!s || typeof s !== 'string') return null;
  const nums = s.match(/\$?[\d,]+(?:\.\d+)?[Kk]?M?/g);
  if (!nums || nums.length === 0) return null;
  // v2.5: if first number has no K/M suffix but later number does, inherit it.
  const lastSuffix = /M/i.test(nums[nums.length - 1]) ? 'M'
                   : /K/i.test(nums[nums.length - 1]) ? 'K' : '';
  const toNum = (t, inheritSuffix) => {
    let raw = String(t).replace(/[\$,]/g, '');
    let n = parseFloat(raw);
    const hasM = /M/i.test(t);
    const hasK = /K/i.test(t);
    if (hasM) n *= 1000000;
    else if (hasK) n *= 1000;
    else if (inheritSuffix === 'M') n *= 1000000;
    else if (inheritSuffix === 'K') n *= 1000;
    return Math.round(n);
  };
  // v2.6: single-number + open-ended suffix like "$1.5M+" or "$850K+"
  if (nums.length === 1) {
    const openEnded = /\+/.test(s);
    return { min: toNum(nums[0], lastSuffix), max: null, openEnded };
  }
  return { min: toNum(nums[0], lastSuffix), max: toNum(nums[1], lastSuffix) };
}
function parsePsfRangeMid(s) {
  const r = parsePriceRange(s);
  return r ? Math.round((r.min + r.max) / 2) : null;
}
function pctOfAsp(v, asp) {
  if (!v || !asp) return null;
  return +((v / asp) * 100).toFixed(1);
}
function fmtPct(v) {
  if (v == null) return '-';
  return v.toFixed(1) + '%';
}

module.exports = router;
module.exports.enrichAnalysisForDeliverables = enrichAnalysisForDeliverables;
// v2.6 Step 7: export deriveBandsFromListings for test_listings_bands.js
module.exports.deriveBandsFromListings = deriveBandsFromListings;

// v2.6.1 Fix C: expose tier-resolution constants for test harness.
module.exports._v261_TIER_ALIASES = {
  entrylevel:  ['entrylevel','entry','firsttime','starter','firsthome','affordable','value','economy'],
  moveup:      ['moveup','moveupbuyer','secondhome','tradeup','midrange','middle'],
  executive:   ['executive','premium','midpremium','uppermiddle','upper','upscale','highend','move-up-plus','uppermove','above-move-up'],
  luxury:      ['luxury','highluxury','primeluxury','estate'],
  ultraluxury: ['ultraluxury','ultra','superluxury','trophyhome','top'],
};
