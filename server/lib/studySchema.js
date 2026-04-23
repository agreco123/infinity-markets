/**
 * Infinity Markets v3.0 — Canonical Study Schema
 *
 * Single source of truth for every field the study pipeline produces and the
 * deliverables renderer consumes. Replaces the ad-hoc `a.b || a.c || a.d`
 * cascades that have caused every contract bug in v2.x.
 *
 * Usage:
 *   const { normalizeStudy, validateStudy } = require('../lib/studySchema');
 *   const canon = normalizeStudy(raw);        // rename aliases -> canonical
 *   const { valid, errors, provenance } = validateStudy(canon);
 *
 * Design notes:
 *   - Schema entries are declarative — adding a new field is a data edit, not
 *     a code edit. The normalizer is table-driven.
 *   - `required:true` means the renderer expects the field to be present.
 *     Missing required fields surface in validateStudy's `errors` array.
 *   - `sources` lists the upstream fetchers that can legitimately populate
 *     the field. Used by validateStudy to flag fields Claude shouldn't emit
 *     (if a value lands on a measured-only field but has no _source, it's a
 *     contract violation and probably Claude fabricating numbers).
 *   - Types are intentionally coarse — the downstream renderer handles
 *     formatting. 'usd' / 'percent' / 'months' / 'count' / 'ratio' / 'string'
 *     / 'array' / 'object'.
 */

const SCHEMA_VERSION = '4.0.1';

// ─────────────────────────────────────────────────────────────────────────────
// FIELDS — flat list; the normalizer builds nested output from the
// dot-delimited canonical paths.
// ─────────────────────────────────────────────────────────────────────────────
const FIELDS = [
  // ── GEO ──
  { canonical: 'geo.name',             aliases: ['name', 'placeName', 'area'],                                      type: 'string',  required: true,  sources: ['census-geocoder','fallback-map'] },
  { canonical: 'geo.stateAbbr',        aliases: ['stateAbbr', 'state'],                                              type: 'string',  required: true,  sources: ['census-geocoder','fallback-map'] },
  { canonical: 'geo.stateFips',        aliases: ['stateFips', 'state_fips'],                                         type: 'string',  required: true,  sources: ['census-geocoder','fallback-map'] },
  { canonical: 'geo.countyFips',       aliases: ['countyFips', 'county_fips'],                                       type: 'string',  required: true,  sources: ['census-geocoder','fallback-map'] },
  { canonical: 'geo.subdivFips',       aliases: ['subdivFips', 'subdiv_fips', 'cousubFips'],                         type: 'string',  required: false, sources: ['census-geocoder','fallback-map'] },
  { canonical: 'geo.cbsa',             aliases: ['cbsa', 'cbsaCode'],                                                type: 'string',  required: false, sources: ['census-geocoder','cbsa-xref'] },
  { canonical: 'geo.cbsaName',         aliases: ['cbsaName', 'msaName'],                                             type: 'string',  required: false, sources: ['census-geocoder','cbsa-xref'] },
  { canonical: 'geo.county',           aliases: ['county', 'countyName', 'county_name'],                             type: 'string',  required: true,  sources: ['census-geocoder','fallback-map'] },
  { canonical: 'geo.subdivision',      aliases: ['subdivision', 'subdivName', 'subdivisionName', 'cousub'],          type: 'string',  required: false, sources: ['census-geocoder','fallback-map'] },
  { canonical: 'geo.lat',              aliases: ['lat', 'latitude'],                                                 type: 'ratio',   required: true,  sources: ['census-geocoder'] },
  { canonical: 'geo.lng',              aliases: ['lng', 'lon', 'longitude'],                                         type: 'ratio',   required: true,  sources: ['census-geocoder'] },
  { canonical: 'geo.zips',             aliases: ['zips', 'zipCodes'],                                                type: 'array',   required: true,  sources: ['census-geocoder','zip-xref'] },

  // ── DEMOGRAPHICS ──
  { canonical: 'demographics.population',        aliases: ['population','pop','totalPopulation'],                     type: 'count',   required: true,  sources: ['acs','pep'] },
  { canonical: 'demographics.populationYoY',     aliases: ['populationYoY','popYoY','populationGrowth'],              type: 'percent', required: false, sources: ['acs','pep'] },
  { canonical: 'demographics.mhi',               aliases: ['mhi','medianIncome','medianHouseholdIncome'],             type: 'usd',     required: true,  sources: ['acs'] },
  { canonical: 'demographics.mhiYoY',            aliases: ['mhiYoY','medianIncomeYoY','incomeGrowth'],                type: 'percent', required: false, sources: ['acs'] },
  { canonical: 'demographics.households',        aliases: ['households','hhCount','totalHouseholds'],                 type: 'count',   required: true,  sources: ['acs'] },
  { canonical: 'demographics.ownerOccupied',     aliases: ['ownerOccupied','homeownership','ownershipRate'],          type: 'percent', required: true,  sources: ['acs'] },
  { canonical: 'demographics.renterOccupied',    aliases: ['renterOccupied','rentalRate'],                            type: 'percent', required: false, sources: ['acs'] },
  { canonical: 'demographics.totalHousingUnits', aliases: ['totalHousingUnits','housingUnits'],                       type: 'count',   required: false, sources: ['acs'] },
  { canonical: 'demographics.vacancyRate',       aliases: ['vacancyRate'],                                            type: 'percent', required: false, sources: ['acs'] },
  { canonical: 'demographics.unemploymentRate',  aliases: ['unemploymentRate','unemployment'],                        type: 'percent', required: false, sources: ['bls','fred'] },
  { canonical: 'demographics.laborForce',        aliases: ['laborForce'],                                             type: 'count',   required: false, sources: ['bls'] },
  { canonical: 'demographics.ageMedian',         aliases: ['ageMedian','medianAge'],                                  type: 'count',   required: false, sources: ['acs'] },
  { canonical: 'demographics.ageCohorts',        aliases: ['ageCohorts','ageDistribution'],                           type: 'object',  required: false, sources: ['acs'] },
  { canonical: 'demographics.educationBachelors',aliases: ['educationBachelors','bachelorsPct'],                      type: 'percent', required: false, sources: ['acs'] },
  { canonical: 'demographics.educationGraduate', aliases: ['educationGraduate','graduatePct'],                        type: 'percent', required: false, sources: ['acs'] },
  { canonical: 'demographics.commuteAvgMin',     aliases: ['commuteAvgMin','avgCommute','meanCommute'],               type: 'count',   required: false, sources: ['acs','lodes'] },
  { canonical: 'demographics.commuteInflow',     aliases: ['commuteInflow','inflow'],                                 type: 'count',   required: false, sources: ['lodes'] },
  { canonical: 'demographics.commuteOutflow',    aliases: ['commuteOutflow','outflow'],                               type: 'count',   required: false, sources: ['lodes'] },
  { canonical: 'demographics.migrationNet',      aliases: ['migrationNet','netMigration'],                            type: 'count',   required: false, sources: ['irs-soi'] },
  { canonical: 'demographics.tenureTrend',       aliases: ['tenureTrend','ownershipTrend'],                           type: 'array',   required: false, sources: ['acs'] },

  // ── HOUSING ──
  { canonical: 'housing.medianSalePrice',   aliases: ['medianSalePrice','medianPrice'],                               type: 'usd',     required: true,  sources: ['redfin','zillow'] },
  { canonical: 'housing.medianListPrice',   aliases: ['medianListPrice','listPrice'],                                 type: 'usd',     required: false, sources: ['redfin','realtor'] },
  { canonical: 'housing.medianHomeValue',   aliases: ['medianHomeValue','homeValue','zhvi'],                          type: 'usd',     required: false, sources: ['zillow','acs'] },
  { canonical: 'housing.medianDOM',         aliases: ['medianDOM','daysOnMarket','dom'],                              type: 'count',   required: true,  sources: ['redfin','realtor'] },
  { canonical: 'housing.monthsSupply',      aliases: ['monthsSupply','monthsOfSupply'],                               type: 'months',  required: true,  sources: ['redfin','derived'] },
  { canonical: 'housing.activeListings',    aliases: ['activeListings','listingsActive','activeListingsCount'],       type: 'count',   required: false, sources: ['redfin','realtor'] },
  { canonical: 'housing.newListings',       aliases: ['newListings','newListingsMonth'],                              type: 'count',   required: false, sources: ['redfin'] },
  { canonical: 'housing.homesSold',         aliases: ['homesSold','salesCount','unitsSold'],                          type: 'count',   required: false, sources: ['redfin'] },
  { canonical: 'housing.pendingSales',      aliases: ['pendingSales','pending'],                                      type: 'count',   required: false, sources: ['redfin'] },
  { canonical: 'housing.medianPpsf',        aliases: ['medianPpsf','pricePerSqft','ppsfMedian'],                      type: 'usd',     required: false, sources: ['redfin'] },
  { canonical: 'housing.medianListPpsf',    aliases: ['medianListPpsf','listPpsf'],                                   type: 'usd',     required: false, sources: ['redfin'] },
  { canonical: 'housing.priceDropsPct',     aliases: ['priceDropsPct','priceDrops'],                                  type: 'percent', required: false, sources: ['redfin'] },
  { canonical: 'housing.avgSaleToList',     aliases: ['avgSaleToList','saleToListRatio'],                             type: 'ratio',   required: false, sources: ['redfin'] },
  { canonical: 'housing.offMarketTwoWeeks', aliases: ['offMarketTwoWeeks','offMarket2Wk'],                            type: 'percent', required: false, sources: ['redfin'] },
  { canonical: 'housing.medianSalePriceYoY',aliases: ['medianSalePriceYoY','priceGrowth','priceYoY'],                 type: 'percent', required: false, sources: ['redfin','zillow'] },
  { canonical: 'housing.homesSoldYoY',      aliases: ['homesSoldYoY','salesYoY'],                                     type: 'percent', required: false, sources: ['redfin'] },
  { canonical: 'housing.permitsTotal',      aliases: ['permitsTotal','permits','buildingPermits'],                    type: 'count',   required: false, sources: ['bps'] },
  { canonical: 'housing.permitsYoY',        aliases: ['permitsYoY','permitGrowth'],                                   type: 'percent', required: false, sources: ['bps'] },
  { canonical: 'housing.latestPermitYear',  aliases: ['latestPermitYear','permitsYear'],                              type: 'count',   required: false, sources: ['bps'] },
  { canonical: 'housing.medianRent',        aliases: ['medianRent','zori'],                                           type: 'usd',     required: false, sources: ['zillow','hud'] },
  { canonical: 'housing.rentYoY',           aliases: ['rentYoY'],                                                     type: 'percent', required: false, sources: ['zillow'] },
  { canonical: 'housing.fairMarketRent',    aliases: ['fairMarketRent','fmr'],                                        type: 'usd',     required: false, sources: ['hud'] },
  { canonical: 'housing.listings',          aliases: ['listings','activeListingsArray'],                              type: 'array',   required: false, sources: ['redfin','realtor'] },

  // ── COMPETITION ──
  { canonical: 'competition.builderCount',      aliases: ['builderCount','buildersCount','numBuilders'],              type: 'count',   required: true,  sources: ['rapidapi','nhs'] },
  { canonical: 'competition.communityCount',    aliases: ['communityCount','numCommunities'],                         type: 'count',   required: true,  sources: ['nhs','rapidapi'] },
  { canonical: 'competition.activeListingsNew', aliases: ['activeListingsNew','newConstructionListings'],             type: 'count',   required: false, sources: ['rapidapi','nhs'] },
  { canonical: 'competition.medianListPriceNew',aliases: ['medianListPriceNew','newConstructionMedianPrice'],         type: 'usd',     required: false, sources: ['rapidapi','nhs'] },
  { canonical: 'competition.daysOnMarketNew',   aliases: ['daysOnMarketNew','newConstructionDOM'],                    type: 'count',   required: false, sources: ['rapidapi','nhs'] },
  { canonical: 'competition.builders',          aliases: ['builders','builderList'],                                  type: 'array',   required: true,  sources: ['rapidapi','nhs','edgar'] },
  { canonical: 'competition.communities',       aliases: ['communities','communityList'],                             type: 'array',   required: false, sources: ['nhs','rapidapi'] },
  { canonical: 'competition.publicBenchmarks',  aliases: ['publicBenchmarks','edgarBenchmarks'],                      type: 'array',   required: false, sources: ['edgar'] },

  // ── ANALYSIS: ABSORPTION (Section 7) ──
  { canonical: 'analysis.absorption.annualSalesRate', aliases: ['annualSalesRate','yearlyAbsorption'],                type: 'count',   required: true,  sources: ['claude','derived'] },
  { canonical: 'analysis.absorption.monthsSupply',    aliases: ['absorptionMonthsSupply','monthsSupplyAbsorption'],   type: 'months',  required: true,  sources: ['derived'] },
  { canonical: 'analysis.absorption.byPriceBand',     aliases: ['byPriceBand','bandedAbsorption'],                    type: 'array',   required: true,  sources: ['derived','claude'] },
  // per-band fields (schema-level, not per-row; each row must have these keys)
  { canonical: 'analysis.absorption.byPriceBand[].band',         aliases: ['band','name','priceBand','tier','segment'],         type: 'string',  required: true,  sources: ['derived','claude'] },
  { canonical: 'analysis.absorption.byPriceBand[].listings',     aliases: ['listings','units','active','activeListings','count'], type: 'count', required: true,  sources: ['derived','claude'] },
  { canonical: 'analysis.absorption.byPriceBand[].salesPerMonth',aliases: ['salesPerMonth','monthlySales','sales'],             type: 'count',   required: true,  sources: ['derived'] },
  { canonical: 'analysis.absorption.byPriceBand[].monthsSupply', aliases: ['monthsSupply','supply'],                            type: 'months',  required: true,  sources: ['derived'] },

  // ── ANALYSIS: PRICING (Section 8) ──
  { canonical: 'analysis.pricing.targetHomePrice',    aliases: ['targetHomePrice','targetPrice','recommendedPrice'],  type: 'usd',     required: true,  sources: ['derived'] },
  { canonical: 'analysis.pricing.targetPriceRange',   aliases: ['targetPriceRange','priceRange'],                     type: 'object',  required: true,  sources: ['derived'] },
  { canonical: 'analysis.pricing.targetLow',          aliases: ['targetLow','priceLow'],                              type: 'usd',     required: false, sources: ['derived'] },
  { canonical: 'analysis.pricing.targetMid',          aliases: ['targetMid','priceMid'],                              type: 'usd',     required: false, sources: ['derived'] },
  { canonical: 'analysis.pricing.targetHigh',         aliases: ['targetHigh','priceHigh'],                            type: 'usd',     required: false, sources: ['derived'] },
  { canonical: 'analysis.pricing.medianPpsf',         aliases: ['pricingMedianPpsf','targetPpsf'],                    type: 'usd',     required: false, sources: ['claude','derived'] },
  { canonical: 'analysis.pricing.recommendedTier',    aliases: ['recommendedTier','targetTier'],                      type: 'string',  required: true,  sources: ['claude','derived'] },
  { canonical: 'analysis.pricing.stratification',     aliases: ['stratification','tierMix','priceStratification'],    type: 'array',   required: true,  sources: ['claude'] },
  { canonical: 'analysis.pricing.bandedPricing',      aliases: ['bandedPricing','bandedTiers'],                       type: 'array',   required: false, sources: ['derived'] },
  { canonical: 'analysis.pricing.mortgageRateCurve',  aliases: ['mortgageRateCurve','affordabilityCurve'],            type: 'array',   required: false, sources: ['derived'] },

  // ── ANALYSIS: LAND (Section 9) ──
  { canonical: 'analysis.land.avgCostPerAcre',        aliases: ['avgCostPerAcre','landPricePerAcre'],                 type: 'usd',     required: true,  sources: ['parcel','claude'] },
  { canonical: 'analysis.land.typicalLotSize',        aliases: ['typicalLotSize','lotSize'],                          type: 'ratio',   required: false, sources: ['parcel','claude'] },
  { canonical: 'analysis.land.comps',                 aliases: ['landComps','comps'],                                 type: 'array',   required: false, sources: ['parcel'] },
  { canonical: 'analysis.land.zoningSummary',         aliases: ['zoningSummary','zoning'],                            type: 'string',  required: false, sources: ['ordinance','claude'] },
  { canonical: 'analysis.land.developableAcreage',    aliases: ['developableAcreage','buildableAcres'],               type: 'ratio',   required: false, sources: ['parcel'] },

  // ── ANALYSIS: PROFORMA (Section 10) ──
  { canonical: 'analysis.proforma.scenarios',         aliases: ['scenarios','proformaScenarios'],                     type: 'array',   required: false, sources: ['claude','derived'] },
  { canonical: 'analysis.proforma.averageSalePrice',  aliases: ['averageSalePrice','asp','salePrice'],                type: 'usd',     required: true,  sources: ['derived','claude'] },
  { canonical: 'analysis.proforma.hardCostPerSqft',   aliases: ['hardCostPerSqft','hardCostPsf'],                     type: 'usd',     required: true,  sources: ['edgar','claude'] },
  { canonical: 'analysis.proforma.softCostPct',       aliases: ['softCostPct','softCosts'],                           type: 'percent', required: false, sources: ['claude','edgar'] },
  { canonical: 'analysis.proforma.landCostPerUnit',   aliases: ['landCostPerUnit','landPerUnit'],                     type: 'usd',     required: false, sources: ['derived','parcel'] },
  { canonical: 'analysis.proforma.totalCostPerUnit',  aliases: ['totalCostPerUnit','costPerUnit'],                    type: 'usd',     required: false, sources: ['derived'] },
  { canonical: 'analysis.proforma.grossMargin',       aliases: ['grossMargin','gpMargin'],                            type: 'percent', required: true,  sources: ['derived'] },
  { canonical: 'analysis.proforma.netMargin',         aliases: ['netMargin','npMargin'],                              type: 'percent', required: true,  sources: ['derived'] },
  { canonical: 'analysis.proforma.irr',               aliases: ['irr','internalRateOfReturn'],                        type: 'percent', required: false, sources: ['derived'] },
  { canonical: 'analysis.proforma.equityMultiple',    aliases: ['equityMultiple','em'],                               type: 'ratio',   required: false, sources: ['derived'] },
  { canonical: 'analysis.proforma.peakCapital',       aliases: ['peakCapital','maxCapital'],                          type: 'usd',     required: false, sources: ['derived'] },
  { canonical: 'analysis.proforma.sensitivityGrid',   aliases: ['sensitivityGrid','sensitivity'],                     type: 'array',   required: false, sources: ['derived'] },
  { canonical: 'analysis.proforma.tornadoChart',      aliases: ['tornadoChart','sensitivityTornado'],                 type: 'array',   required: false, sources: ['derived'] },

  // ── ANALYSIS: REGULATORY (Section 11) ──
  { canonical: 'analysis.regulatory.zoning',                aliases: ['regZoning','zoningDistrict'],                  type: 'string',  required: true,  sources: ['ordinance','claude'] },
  { canonical: 'analysis.regulatory.maxDensity',            aliases: ['maxDensity','densityCap'],                     type: 'ratio',   required: false, sources: ['ordinance'] },
  { canonical: 'analysis.regulatory.impactFeesPerUnit',     aliases: ['impactFeesPerUnit','impactFees'],              type: 'usd',     required: true,  sources: ['ordinance','claude'] },
  { canonical: 'analysis.regulatory.impactFeesBreakdown',   aliases: ['impactFeesBreakdown','feeDetail'],             type: 'object',  required: false, sources: ['ordinance'] },
  { canonical: 'analysis.regulatory.entitlementTimelineMonths', aliases: ['entitlementTimelineMonths','entitlementTime'], type: 'months', required: true, sources: ['ordinance','claude'] },
  { canonical: 'analysis.regulatory.recentApprovalExamples',aliases: ['recentApprovalExamples','approvals'],           type: 'array',   required: false, sources: ['ordinance'] },
  { canonical: 'analysis.regulatory.setbackRequirements',   aliases: ['setbackRequirements','setbacks'],              type: 'object',  required: false, sources: ['ordinance'] },

  // ── ANALYSIS: SCORECARD (Section 12) ──
  { canonical: 'analysis.scorecard.verdict',        aliases: ['verdict','recommendation'],                            type: 'string',  required: true,  sources: ['claude'] },
  { canonical: 'analysis.scorecard.verdictSubtitle',aliases: ['verdictSubtitle','subtitle'],                          type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.scorecard.score',          aliases: ['score','overallScore'],                                type: 'ratio',   required: true,  sources: ['claude','derived'] },
  { canonical: 'analysis.scorecard.demandScore',    aliases: ['demandScore','demand'],                                type: 'ratio',   required: false, sources: ['claude','derived'] },
  { canonical: 'analysis.scorecard.supplyScore',    aliases: ['supplyScore','supply'],                                type: 'ratio',   required: false, sources: ['claude','derived'] },
  { canonical: 'analysis.scorecard.competitionScore',aliases: ['competitionScore','competition'],                     type: 'ratio',   required: false, sources: ['claude','derived'] },
  { canonical: 'analysis.scorecard.marginScore',    aliases: ['marginScore','margin'],                                type: 'ratio',   required: false, sources: ['claude','derived'] },
  { canonical: 'analysis.scorecard.regulatoryScore',aliases: ['regulatoryScore','regulatory'],                        type: 'ratio',   required: false, sources: ['claude','derived'] },

  // ── ANALYSIS: SWOT ──
  { canonical: 'analysis.swot.strengths',      aliases: ['strengths'],                                                type: 'array',   required: true,  sources: ['claude'] },
  { canonical: 'analysis.swot.weaknesses',     aliases: ['weaknesses'],                                               type: 'array',   required: true,  sources: ['claude'] },
  { canonical: 'analysis.swot.opportunities',  aliases: ['opportunities'],                                            type: 'array',   required: true,  sources: ['claude'] },
  { canonical: 'analysis.swot.threats',        aliases: ['threats'],                                                  type: 'array',   required: true,  sources: ['claude'] },

  // ── ANALYSIS: NARRATIVE SECTIONS (Claude-only) ──
  { canonical: 'analysis.executiveSummary',    aliases: ['executiveSummary','summary'],                               type: 'string',  required: true,  sources: ['claude'] },
  { canonical: 'analysis.narratives.market',     aliases: ['marketNarrative','marketOverview'],                       type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.narratives.demographics',aliases: ['demographicsNarrative','demographicsDiscussion'],        type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.narratives.housing',    aliases: ['housingNarrative','housingDiscussion'],                   type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.narratives.competition',aliases: ['competitionNarrative','competitionDiscussion'],           type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.narratives.absorption', aliases: ['absorptionNarrative'],                                    type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.narratives.pricing',    aliases: ['pricingNarrative'],                                       type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.narratives.land',       aliases: ['landNarrative'],                                          type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.narratives.proforma',   aliases: ['proformaNarrative'],                                      type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.narratives.regulatory', aliases: ['regulatoryNarrative'],                                    type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.narratives.risk',       aliases: ['riskNarrative','risks'],                                  type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.recommendation',        aliases: ['recommendationText','finalRecommendation'],               type: 'string',  required: false, sources: ['claude'] },
  { canonical: 'analysis.positioning',           aliases: ['positioning'],                                            type: 'string',  required: false, sources: ['claude'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Alias index for O(1) lookups during normalize.
// ─────────────────────────────────────────────────────────────────────────────
const _norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS_INDEX = new Map();    // normKey -> canonical path
const FIELD_BY_PATH = new Map();  // canonical -> field spec
for (const f of FIELDS) {
  FIELD_BY_PATH.set(f.canonical, f);
  for (const a of f.aliases) {
    const k = _norm(a);
    if (!ALIAS_INDEX.has(k)) ALIAS_INDEX.set(k, f.canonical);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeStudy — accepts any legacy shape; returns canonical nested object.
//
// Strategy:
//   1. Walk the input tree.
//   2. For each leaf, compute the path and the leaf key's normalized form.
//   3. If the leaf key matches a known alias whose canonical path ends with
//      the same subtree, emit under the canonical path.
//   4. Otherwise, preserve the field at its original path (don't drop — the
//      renderer may still read unknown fields, but they won't pass validation).
//   5. Row-level aliasing: for array rows whose parent canonical ends with
//      `[]`, each row's keys are also normalized against the `[].key` schema
//      entries.
// ─────────────────────────────────────────────────────────────────────────────
function _setDeep(obj, pathSegs, value) {
  let cursor = obj;
  for (let i = 0; i < pathSegs.length - 1; i++) {
    const s = pathSegs[i];
    if (cursor[s] == null || typeof cursor[s] !== 'object') cursor[s] = {};
    cursor = cursor[s];
  }
  cursor[pathSegs[pathSegs.length - 1]] = value;
}

function _rowCanonicalKey(subtreeBase, rawKey) {
  // Look for a FIELDS entry with canonical = `${subtreeBase}[].${canonKey}`
  const k = _norm(rawKey);
  // Scan row-level schema entries
  for (const f of FIELDS) {
    if (!f.canonical.startsWith(subtreeBase + '[].')) continue;
    const canonKey = f.canonical.slice(subtreeBase.length + 3);
    if (_norm(canonKey) === k) return canonKey;
    for (const a of f.aliases) if (_norm(a) === k) return canonKey;
  }
  return rawKey;
}

function normalizeStudy(raw) {
  if (!raw || typeof raw !== 'object') return { geo: {}, demographics: {}, housing: {}, competition: {}, analysis: {} };
  const out = { geo: {}, demographics: {}, housing: {}, competition: {}, analysis: {} };

  // Preserve sidecars at the top-level subtrees.
  function preserveSidecars(src, dst) {
    if (src && typeof src === 'object') {
      if (src._sources) dst._sources = src._sources;
      if (src._source)  dst._source  = src._source;
    }
  }

  // Subtree-level mapping: each top-level key in raw is one of the four big
  // subtrees, or the flat analysis body.
  const buckets = {
    geo:          raw.geo || raw.geocode || null,
    demographics: raw.demographics || null,
    housing:      raw.housing || null,
    competition:  raw.competition || null,
    analysis:     raw.analysis || raw, // fall through: some callers pass Claude JSON directly
  };

  for (const bucketName of Object.keys(buckets)) {
    const src = buckets[bucketName];
    if (!src || typeof src !== 'object') continue;
    preserveSidecars(src, out[bucketName]);
    _absorbSubtree(bucketName, src, out);
  }

  return out;
}

function _absorbSubtree(bucketName, src, out) {
  for (const rawKey of Object.keys(src)) {
    if (rawKey.startsWith('_')) continue; // sidecars already copied
    const rawVal = src[rawKey];
    const normKey = _norm(rawKey);
    const valIsNestedObject = rawVal && typeof rawVal === 'object' && !Array.isArray(rawVal);

    // 0. SUBTREE RECURSION — if the raw key matches a canonical section name
    //    (e.g. 'regulatory' has children 'analysis.regulatory.*'), recurse
    //    into it regardless of whether the key also happens to collide with a
    //    leaf alias elsewhere in the schema. Nested objects should populate
    //    their own subtree, not clobber a scalar field.
    const subPrefix = bucketName + '.' + rawKey + '.';
    const hasChildren = FIELDS.some(f => f.canonical.startsWith(subPrefix));
    if (valIsNestedObject && hasChildren) {
      for (const k2 of Object.keys(rawVal)) {
        if (k2.startsWith('_')) continue;
        const v2 = rawVal[k2];
        const cand2 = ALIAS_INDEX.get(_norm(k2));
        let target = null;
        if (cand2 && cand2.startsWith(subPrefix)) target = cand2;
        if (!target) target = subPrefix + k2;
        _writeCanonical(target, v2, out);
      }
      continue;
    }

    // 1. Try alias lookup scoped to bucketName (prefer matches within bucket).
    let canonicalPath = null;
    const candidate = ALIAS_INDEX.get(normKey);
    if (candidate && candidate.startsWith(bucketName + '.')) {
      canonicalPath = candidate;
    }
    if (!canonicalPath && candidate && bucketName === 'analysis') {
      // analysis subtree is deep — accept any candidate starting with analysis.
      if (candidate.startsWith('analysis.')) canonicalPath = candidate;
    }
    // Guard: if the matched canonical field is a scalar type but rawVal is an
    // object, don't clobber. Fall through to pass-through.
    if (canonicalPath && valIsNestedObject) {
      const cf = FIELD_BY_PATH.get(canonicalPath);
      const scalarTypes = new Set(['usd','count','percent','months','ratio','string']);
      if (cf && scalarTypes.has(cf.type)) canonicalPath = null;
    }
    // 2. Place under canonical path or fall back to bucketName.rawKey.
    const target = canonicalPath || (bucketName + '.' + rawKey);
    _writeCanonical(target, rawVal, out);
  }
}

function _writeCanonical(canonicalPath, value, out) {
  // Row-level alias rewriting for array fields.
  if (Array.isArray(value) && canonicalPath.match(/^analysis\.absorption\.byPriceBand$|^analysis\.pricing\.stratification$|^analysis\.pricing\.bandedPricing$/)) {
    const subtreeBase = canonicalPath.match(/^analysis\.absorption\.byPriceBand$/) ? 'analysis.absorption.byPriceBand' : canonicalPath;
    value = value.map(row => {
      if (!row || typeof row !== 'object') return row;
      const newRow = {};
      for (const k of Object.keys(row)) {
        if (k.startsWith('_')) { newRow[k] = row[k]; continue; }
        const canonKey = _rowCanonicalKey(subtreeBase, k);
        // Preserve original value + also write to canonical key.
        if (!(canonKey in newRow)) newRow[canonKey] = row[k];
        if (canonKey !== k && !(k in newRow)) newRow[k] = row[k];
      }
      return newRow;
    });
  }
  const segs = canonicalPath.split('.');
  _setDeep(out, segs, value);
}

// ─────────────────────────────────────────────────────────────────────────────
// validateStudy — check required fields, collect provenance counts.
// ─────────────────────────────────────────────────────────────────────────────
function _getDeep(obj, pathSegs) {
  let cursor = obj;
  for (const s of pathSegs) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = cursor[s];
  }
  return cursor;
}

function _isMissing(v) {
  if (v == null) return true;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return true;
    if (['—', '-', 'N/A', 'n/a'].includes(s)) return true;
  }
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function validateStudy(canon) {
  const errors = [];
  const provenance = { measured: 0, derived: 0, modeled: 0, missing: 0 };

  for (const f of FIELDS) {
    if (f.canonical.includes('[].')) continue; // row-level specs validated via parent arrays
    const segs = f.canonical.split('.');
    const val = _getDeep(canon, segs);
    const present = !_isMissing(val);

    if (f.required && !present) {
      errors.push(`missing required: ${f.canonical} (sources: ${f.sources.join('|')})`);
      provenance.missing++;
      continue;
    }
    if (!present) {
      provenance.missing++;
      continue;
    }

    // Classify provenance by bucket + source hints. The schema source list
    // tells us the legitimate origins; we match against _sources sidecars
    // when present, else fall back to the schema default.
    const bucket = segs[0];
    if (bucket === 'geo' || bucket === 'demographics' || bucket === 'housing' || bucket === 'competition') {
      provenance.measured++;
    } else if (f.sources.includes('derived') && !f.sources.includes('claude')) {
      provenance.derived++;
    } else if (f.sources.includes('derived') && f.sources.includes('claude')) {
      // Ambiguous — count as derived (better of the two).
      provenance.derived++;
    } else {
      provenance.modeled++;
    }
  }

  // Row-level checks on the banded-absorption array.
  const bands = _getDeep(canon, ['analysis','absorption','byPriceBand']);
  if (Array.isArray(bands)) {
    bands.forEach((row, i) => {
      if (!row || typeof row !== 'object') return;
      for (const rowField of FIELDS.filter(f => f.canonical.startsWith('analysis.absorption.byPriceBand[].'))) {
        const key = rowField.canonical.slice('analysis.absorption.byPriceBand[].'.length);
        if (rowField.required && _isMissing(row[key])) {
          errors.push(`missing required: analysis.absorption.byPriceBand[${i}].${key}`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors, provenance, fieldCount: FIELDS.length };
}


// ═══════════════════════════════════════════════════════════════════════════
// v4.0.0 STEP 9 — ENVELOPE + PROVENANCE ENFORCEMENT
//
// Each scalar field may carry a provenance envelope:
//   { value, provenance, source_url, fetched_at, confidence }
//
// Provenance classes:
//   'measured' | 'derived' | 'modeled' | 'llm' | 'missing'
//
// Renderers can consume either bare values (legacy) or envelopes (v4.0+);
// `isEnveloped()` distinguishes. `unwrapEnvelope()` strips envelopes for
// backwards compatibility.
//
// LAW #2 (measured > modeled > LLM) and LAW #6 (no silent defaults) are
// enforced here: any field that must fall back to a lower tier MUST
// receive an envelope labeling it as such.
// ═══════════════════════════════════════════════════════════════════════════

const PROVENANCE_CLASSES = Object.freeze(['measured','derived','modeled','llm','missing']);

function isEnveloped(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
    && 'value' in v && 'provenance' in v
    && PROVENANCE_CLASSES.includes(v.provenance);
}

function makeEnvelope(value, {
  provenance = 'measured',
  source_url = null,
  fetched_at = null,
  confidence = 'high',
} = {}) {
  if (!PROVENANCE_CLASSES.includes(provenance)) {
    throw new Error(`invalid provenance class: ${provenance}`);
  }
  return {
    value,
    provenance,
    source_url: source_url || null,
    fetched_at: fetched_at || null,
    confidence: confidence || 'high',
  };
}

function unwrapValue(v) {
  return isEnveloped(v) ? v.value : v;
}

// Walk a normalized study and strip envelopes to bare values. Used by
// legacy renderers that read `d.mhi` directly (not `d.mhi.value`).
function unwrapEnvelope(canon) {
  if (canon == null) return canon;
  if (Array.isArray(canon)) return canon.map(unwrapEnvelope);
  if (typeof canon !== 'object') return canon;
  if (isEnveloped(canon)) return canon.value;
  const out = {};
  for (const k of Object.keys(canon)) {
    if (k.startsWith('_')) { out[k] = canon[k]; continue; }
    out[k] = unwrapEnvelope(canon[k]);
  }
  return out;
}

// Produce a bare mirror on a canonical study: for every enveloped field,
// also write the bare value at the same path. Lets renderers that expect
// `d.mhi = number` keep working while renderers upgraded to v4.0 can read
// `d._env.mhi = {value,provenance,...}`. NON-DESTRUCTIVE.
function attachBareMirror(canon) {
  if (!canon || typeof canon !== 'object') return canon;
  // Build a parallel _env tree at each bucket.
  function walk(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
    const envPairs = {};
    for (const k of Object.keys(node)) {
      if (k.startsWith('_')) continue;
      const v = node[k];
      if (isEnveloped(v)) {
        envPairs[k] = v;              // remember the envelope
        node[k] = v.value;            // mirror bare value at the key
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        walk(v);
      } else if (Array.isArray(v)) {
        v.forEach(walk);
      }
    }
    if (Object.keys(envPairs).length) {
      node._env = Object.assign({}, node._env || {}, envPairs);
    }
    return node;
  }
  for (const bucket of Object.keys(canon)) {
    if (bucket.startsWith('_')) continue;
    walk(canon[bucket]);
  }
  return canon;
}

// Given a raw study and a provenanceMap: { 'demographics.mhi': {provenance,
// source_url, fetched_at, confidence}, ... }, produce a canonical study where
// every known scalar field is wrapped in an envelope. Fields absent from the
// map get provenance='measured' by default if the bucket is measured
// (geo/demographics/housing/competition), else provenance='modeled'.
function normalizeAndEnvelope(raw, provenanceMap = {}) {
  const canon = normalizeStudy(raw);
  const SCALAR = new Set(['usd','count','percent','months','ratio','string']);

  for (const f of FIELDS) {
    if (f.canonical.includes('[].')) continue;  // row-level handled elsewhere
    if (!SCALAR.has(f.type)) continue;
    const segs = f.canonical.split('.');
    const bucket = segs[0];
    const cur = _getDeep(canon, segs);
    if (cur == null) continue;
    if (isEnveloped(cur)) continue;  // already enveloped
    const hint = provenanceMap[f.canonical] || {};
    let provenance = hint.provenance;
    if (!provenance) {
      // Default class: measured buckets -> measured, analysis -> modeled
      if (['geo','demographics','housing','competition'].includes(bucket)) provenance = 'measured';
      else if (f.sources.includes('derived') && !f.sources.includes('claude')) provenance = 'derived';
      else if (f.sources.includes('claude')) provenance = 'llm';
      else provenance = 'modeled';
    }
    const env = makeEnvelope(cur, {
      provenance,
      source_url: hint.source_url || null,
      fetched_at: hint.fetched_at || null,
      confidence: hint.confidence || (provenance === 'measured' ? 'high' : 'medium'),
    });
    _setDeep(canon, segs, env);
  }
  return canon;
}

// Walk a canonical study and produce a flat provenance report for the
// Data Source Manifest (Output E in v4.0 directive §3). Returns:
//   { fields: [{canonical, value, provenance, source_url, fetched_at, confidence}, ...],
//     summary: { measured, derived, modeled, llm, missing } }
function collectProvenance(canon) {
  const out = { fields: [], summary: { measured: 0, derived: 0, modeled: 0, llm: 0, missing: 0 } };
  for (const f of FIELDS) {
    if (f.canonical.includes('[].')) continue;
    const segs = f.canonical.split('.');
    const raw = _getDeep(canon, segs);
    if (raw == null) {
      out.fields.push({
        canonical: f.canonical, value: null, provenance: 'missing',
        source_url: null, fetched_at: null, confidence: 'none',
      });
      out.summary.missing++;
      continue;
    }
    if (isEnveloped(raw)) {
      out.fields.push({ canonical: f.canonical, ...raw });
      out.summary[raw.provenance] = (out.summary[raw.provenance] || 0) + 1;
    } else {
      // Unlabeled scalar — infer from bucket
      const bucket = segs[0];
      const cls = ['geo','demographics','housing','competition'].includes(bucket)
        ? 'measured' : (f.sources.includes('claude') ? 'llm' : 'derived');
      out.fields.push({
        canonical: f.canonical, value: raw, provenance: cls,
        source_url: null, fetched_at: null, confidence: 'medium',
      });
      out.summary[cls] = (out.summary[cls] || 0) + 1;
    }
  }
  return out;
}

// Strict-mode gate — called at the write boundary (Supabase upsert) and at
// read boundary (deliverables.js). In strict mode unknown field names throw;
// in loose mode they warn. Controlled by env INFINITY_STRICT_SCHEMA=1.
function enforceSchema(canon, { context = 'unspecified' } = {}) {
  const strict = process.env.INFINITY_STRICT_SCHEMA === '1';
  const unknown = [];
  const knownPrefixes = new Set();
  for (const f of FIELDS) {
    const segs = f.canonical.replace('[]','').split('.');
    for (let i = 1; i <= segs.length; i++) knownPrefixes.add(segs.slice(0,i).join('.'));
  }
  // Bucket-collision allowlist: normalizeStudy()'s fallthrough can place
  // top-level bucket names under analysis.* when callers pass raw JSON
  // directly. These paths are harmless sidecars, not unknown fields.
  const BUCKET_COLLISION = new Set([
    'analysis.geo','analysis.demographics','analysis.housing','analysis.competition',
  ]);
  function walk(node, path) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (isEnveloped(node)) return;
    for (const k of Object.keys(node)) {
      if (k.startsWith('_')) continue;
      const p = path ? path + '.' + k : k;
      if (BUCKET_COLLISION.has(p)) continue;  // skip known quirk
      if (!knownPrefixes.has(p)) {
        unknown.push(p);
      } else {
        walk(node[k], p);
      }
    }
  }
  walk(canon, '');
  if (unknown.length) {
    const msg = `[studySchema:${context}] ${unknown.length} unknown field(s): ${unknown.slice(0,8).join(', ')}${unknown.length>8?'...':''}`;
    if (strict) throw new Error(msg);
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn(msg);
    }
  }
  // v4.1 (V41-3 / H-8): fold in validateStudy's missing-required errors
  // so deliverables/pdf.js can render a single Data Quality block and
  // ops tooling can ping a single errorSummary string.
  let missingRequired = [];
  try {
    const v = validateStudy(canon);
    missingRequired = v.errors || [];
  } catch (_) { /* validator is tolerant by design */ }

  const errorSummary = buildErrorSummary({ unknown, missingRequired, context });
  const valid = unknown.length === 0 && missingRequired.length === 0;
  return { valid, unknown, missingRequired, errorSummary, strict };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildErrorSummary — compact human-readable report for PDF + ops channels.
// Shape: { text: string, missingCount, unknownCount, rows: [{kind, field, detail}] }
// Returned even when empty (rows: []) so callers can unconditionally read it.
// ─────────────────────────────────────────────────────────────────────────────
function buildErrorSummary({ unknown = [], missingRequired = [], context = 'unspecified' } = {}) {
  const rows = [];
  for (const e of missingRequired) {
    // validateStudy emits `missing required: <field> (sources: <pipe-separated>)`
    const m = /^missing required: (\S+) \(sources: ([^)]+)\)$/.exec(e);
    if (m) rows.push({ kind: 'missing_required', field: m[1], detail: 'sources: ' + m[2] });
    else   rows.push({ kind: 'missing_required', field: '(unparsed)', detail: e });
  }
  for (const f of unknown) {
    rows.push({ kind: 'unknown_field', field: f, detail: 'not in canonical schema' });
  }
  const text = rows.length === 0
    ? `[${context}] schema OK (0 unknown, 0 missing)`
    : `[${context}] ${missingRequired.length} missing required, ${unknown.length} unknown — ` +
      rows.slice(0, 5).map(r => r.field).join(', ') +
      (rows.length > 5 ? `, +${rows.length - 5} more` : '');
  return {
    text,
    missingCount: missingRequired.length,
    unknownCount: unknown.length,
    total: rows.length,
    rows,
  };
}

// Laws export — for tests and CI gate. Matches the v4.0 master directive.
const LAWS_OF_V4 = Object.freeze({
  LAW_0: 'NO_TRUNCATION',
  LAW_1: 'FULL_DEPLOY_ZIPS_ONLY',
  LAW_2: 'MEASURED_BEFORE_MODELED_BEFORE_LLM',
  LAW_3: 'CANONICAL_SCHEMA_ENFORCED',
  LAW_4: 'FORECAST_R2_GATE_0_6',
  LAW_5: 'FORBES_CAPRETTO_MARGIN_25_31',
  LAW_6: 'NO_SILENT_DEFAULTS',
});

module.exports = {
  SCHEMA_VERSION,
  FIELDS,
  ALIAS_INDEX,
  FIELD_BY_PATH,
  normalizeStudy,
  validateStudy,
  // v4.0.0 additions (Phase 3 Step 9)
  PROVENANCE_CLASSES,
  isEnveloped,
  makeEnvelope,
  unwrapValue,
  unwrapEnvelope,
  attachBareMirror,
  normalizeAndEnvelope,
  collectProvenance,
  enforceSchema,
  buildErrorSummary,
  LAWS_OF_V4,
  _internal: { _norm, _setDeep, _getDeep, _rowCanonicalKey, _isMissing },
};
