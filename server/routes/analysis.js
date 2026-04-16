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
          model: 'claude-sonnet-4-20250514',
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

module.exports = router;
