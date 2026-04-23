/**
 * Infinity Markets v4.1 — deliverables/pdf.js
 *
 * Extracted from monolithic deliverables.js as part of V41-1 (H-6 refactor).
 * All function bodies preserved byte-exactly from the original file.
 *
 * Exports:
 *   buildPDFHTML(study) → HTML string for Puppeteer rendering
 *   collectSources(study) → array of source citations used by the PDF
 *
 * The Puppeteer driver itself stays in the route handler (deliverables.js
 * /pdf route); this module is pure HTML generation.
 */
const { normalizeStudy, unwrapEnvelope, enforceSchema } = require('../../lib/studySchema');
const {
  deepMergeNullWins,
  fmt, fmtD, fmtP, fmt1,
  safe, safeNum, safeStr,
  esc,
  scoreColor, recLabel, scopeLabel,
} = require('./helpers');

/* ─────────────────────────────────────────────────────────────────────────
   v4.1 (V41-4 / R-4) — Provenance chip helpers.

   Every canonical scalar field MAY carry a provenance envelope:
     { value, provenance, source_url, fetched_at, confidence }

   _envAt(study, path) — walks dotted `<bucket>.<field>` into study, looking
   first at study._env[path], then at study.<bucket>._env[rest]. Returns the
   envelope object or null.

   provChip(study, path, opts) — returns inline HTML for a provenance chip,
   or '' when no envelope is present. Chip text is the provenance class
   (measured / derived / modeled / llm / missing) abbreviated, and a tooltip
   carries source_url and fetched_at. opts.compact=true uses a dot-only chip.

   Byte-identity: on studies without _env data, every chip call returns ''
   so existing snapshots stay unchanged.
───────────────────────────────────────────────────────────────────────── */
function _envAt(study, path) {
  if (!study || typeof study !== 'object' || !path) return null;
  // 1) top-level study._env table keyed by canonical dotted path.
  if (study._env && typeof study._env === 'object' && study._env[path]) return study._env[path];
  // 2) per-bucket study.<bucket>._env table keyed by remaining sub-path.
  const dot = path.indexOf('.');
  if (dot > 0) {
    const bucket = path.slice(0, dot);
    const rest   = path.slice(dot + 1);
    const b = study[bucket];
    if (b && typeof b === 'object' && b._env && b._env[rest]) return b._env[rest];
  }
  return null;
}

const _PROV_LABEL = {
  measured: 'MEAS',
  derived:  'DERIV',
  modeled:  'MODEL',
  llm:      'LLM',
  missing:  '—',
};

function provChip(study, path, opts) {
  const env = _envAt(study, path);
  if (!env || !env.provenance) return '';
  const cls   = 'prov-' + env.provenance;
  const label = _PROV_LABEL[env.provenance] || env.provenance.toUpperCase();
  const tipParts = [];
  if (env.source_url) tipParts.push(String(env.source_url));
  if (env.fetched_at) tipParts.push('fetched ' + String(env.fetched_at));
  if (env.confidence) tipParts.push('conf: ' + String(env.confidence));
  const tip = tipParts.length ? (' title="' + esc(tipParts.join(' \u00B7 ')) + '"') : '';
  if (opts && opts.compact) {
    return ' <span class="prov-chip prov-dot ' + cls + '"' + tip + '>\u00B7</span>';
  }
  return ' <span class="prov-chip ' + cls + '"' + tip + '>' + label + '</span>';
}

/* ─────────────────────────────────────────────────────────────────────────
   v4.1 (V41-5 / H-3) — enrich-error chip.

   When enrichAnalysisForDeliverables detected a cascade-empty condition,
   it pushed a {bucket, field, cause, detail} row to study._schema.enrichErrors.
   errChip() looks for a matching row and returns an inline red pill + tooltip
   carrying the cause+detail. errBlock() returns a section-level dashed-red
   box suitable for replacing an empty table.
───────────────────────────────────────────────────────────────────────── */
function _findEnrichErr(study, bucket, field) {
  const rows = study && study._schema && Array.isArray(study._schema.enrichErrors)
    ? study._schema.enrichErrors : [];
  for (const r of rows) {
    if (r && r.bucket === bucket && r.field === field) return r;
  }
  return null;
}
function errChip(study, bucket, field) {
  const r = _findEnrichErr(study, bucket, field);
  if (!r) return '';
  const tipBits = [String(r.cause || 'enrich_error')];
  if (r.detail) tipBits.push(String(r.detail));
  const tip = ' title="' + esc(tipBits.join(' \u00B7 ')) + '"';
  return ' <span class="prov-chip prov-error"' + tip + '>ERR</span>';
}
function errBlock(study, bucket, field, sectionLabel) {
  const r = _findEnrichErr(study, bucket, field);
  if (!r) return '';
  const detail = r.detail ? esc(String(r.detail)) : '';
  const cause  = esc(String(r.cause || 'enrich_error'));
  return '<div class="prov-error-block">' +
    '<div class="prov-error-head">\u2014 ' + esc(String(sectionLabel || (bucket + '.' + field))) +
    ' <span class="prov-chip prov-error">ERR</span></div>' +
    '<div class="prov-error-body">Cascade failed (' + cause + ').' +
    (detail ? ' <em>' + detail + '</em>' : '') + '</div></div>';
}

/* ═══ Source collector ═════════════════════════════════════════════════════ */
function collectSources(study) {
  const sources = [];
  const add = (cat, name, detail) => sources.push({ category: cat, name, detail });

  add('Demographics', 'U.S. Census Bureau ACS',  '5-Year American Community Survey — population, income, housing characteristics');
  add('Demographics', 'U.S. Census Bureau PEP',  'Population Estimates Program — annual population estimates');
  add('Demographics', 'U.S. Census Bureau LODES','LEHD Origin-Destination Employment Statistics — commute flows');
  add('Demographics', 'Census CBP',              'County Business Patterns — employment by NAICS sector');
  add('Demographics', 'FRED / BLS',              'Federal Reserve Economic Data — unemployment rate, LAUS series');
  add('Demographics', 'BEA',                     'Bureau of Economic Analysis — per capita personal income');
  add('Housing',      'Census BPS',              'Building Permits Survey — residential permits by unit type');
  add('Housing',      'HUD FMR',                 'Fair Market Rents — rental rates by bedroom count');
  add('Housing',      'FHFA HPI',                'Federal Housing Finance Agency — House Price Index');
  add('Housing',      'Zillow ZHVI',             'Zillow Home Value Index — monthly home value trend');
  add('Housing',      'Redfin',                  'Redfin data center — DOM, sale-to-list, months supply');
  add('Competition',  'RapidAPI Realtor.com',    'New construction filter — active communities');
  add('Competition',  'NewHomeSource',           'Community listings & pricing');
  add('Competition',  'Parcl Labs',              'Price-per-square-foot and inventory metrics');
  add('Competition',  'SEC EDGAR',               'Public builder 10-K filings — gross margins, ASP, cancellation rates');
  add('Costs',        'BLS PPI',                 'Producer Price Index — construction cost inflation');
  add('Analysis',     'Anthropic Claude API',    'claude-sonnet-4-6 — structured market analysis, scoring, SWOT');

  // Dynamic sources from _sources metadata
  const dSrc = study.demographics?._sources || {};
  if (dSrc.census) add('Demographics', 'Census ACS (vintage)', `Year: ${dSrc.census.year || 'latest'}, Level: ${dSrc.census.level || 'county'}`);
  if (dSrc.fred)   add('Demographics', 'FRED (series)',         `Series: ${dSrc.fred.series || 'LAUS'}`);
  if (dSrc.bea)    add('Demographics', 'BEA (table)',           `Table: ${dSrc.bea.table || 'CAINC1'}`);

  const hSrc = study.housing?._sources || {};
  if (hSrc.bps) add('Housing', 'Census BPS (years)', `Years: ${hSrc.bps.years || 'latest 4'}`);
  if (hSrc.hud) add('Housing', 'HUD FMR (fips)',     `FIPS: ${hSrc.hud.fips || 'auto'}, Year: ${hSrc.hud.year || 'latest'}`);

  const cSrc = study.competition?._sources || {};
  if (cSrc.rapidapi) add('Competition', 'Realtor.com (endpoint)', `${cSrc.rapidapi.endpoint || 'v3/list'}`);
  if (cSrc.supabase) add('Competition', 'Supabase Cache',          'Cached community data');

  add('General', 'Infinity Markets', `Report generated ${new Date().toISOString().split('T')[0]}`);

  return sources;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PDF HTML Template — Institutional Quality (45+ pages)
   ═══════════════════════════════════════════════════════════════════════════ */
function buildPDFHTML(study) {
  // v4.0.0 Phase 3 Step 9 — schema enforcement at render boundary.
  // Closes the persistence gap where regenerated studies loaded from
  // Supabase bypassed the client-side useStudy.js normalizer, leaving
  // measured demographic fields at aliased paths that the renderer's
  // em-dash fallback treated as null. normalizeStudy() collapses the
  // 269 aliases onto the 130 canonical names; unwrapEnvelope() strips
  // any provenance envelopes so the legacy tile code still reads bare
  // numbers; enforceSchema() logs (or throws under
  // INFINITY_STRICT_SCHEMA=1) on unknown field names. The existing
  // ACS-spread fallback below is retained as belt-and-suspenders for
  // v3.x-shaped payloads that still reach the renderer.
  try {
    const canon = normalizeStudy(study);
    const bare  = unwrapEnvelope(canon);
    // v4.0.1: deep-merge canonical into study. Existing non-null leaves win;
    // null/missing leaves are filled from the canonical tree. This closes
    // the section 3 demographics tile regression where Supabase-loaded studies had
    // { demographics: { population: null, ... } } shapes that the v4.0.0
    // shallow merge preserved as nulls.
    const merged = deepMergeNullWins(study, bare);
    for (const k of Object.keys(merged)) {
      if (k.startsWith('_')) continue;
      study[k] = merged[k];
    }
    enforceSchema(canon, { context: 'deliverables:pdf' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[deliverables] schema enforce:', e.message);
  }
  // v3.1.1: Read demographics with ACS sub-object fallback. Some pipeline paths
  // write canonical fields to study.demographics.acs.* instead of the flat root.
  // Merge both into a single `d` object, preferring flat root when present.
  const rawD = study.demographics || {};
  const acs = rawD.acs || {};
  const d = {
    ...acs,  // seed with nested ACS
    ...rawD, // overlay with flat root (non-null wins)
    // Explicit canonical field map (accept snake_case + camelCase + acs.*)
    population:         rawD.population         ?? acs.population         ?? rawD.pop         ?? null,
    popGrowth5yr:       rawD.popGrowth5yr       ?? acs.popGrowth5yr       ?? rawD.pop_growth_5yr ?? null,
    households:         rawD.households         ?? acs.households         ?? rawD.hh          ?? null,
    mhi:                rawD.mhi                ?? acs.mhi                ?? rawD.medianHhIncome ?? acs.medianHhIncome ?? null,
    mhiYoY:             rawD.mhiYoY             ?? acs.mhiYoY             ?? rawD.mhi_yoy     ?? null,
    perCapitaIncome:    rawD.perCapitaIncome    ?? acs.perCapitaIncome    ?? rawD.per_capita_income ?? null,
    medianAge:          rawD.medianAge          ?? acs.medianAge          ?? rawD.median_age  ?? null,
    avgHouseholdSize:   rawD.avgHouseholdSize   ?? acs.avgHouseholdSize   ?? rawD.avg_hh_size ?? null,
    homeownershipRate:  rawD.homeownershipRate  ?? acs.homeownershipRate  ?? rawD.homeownership_rate ?? null,
    povertyRate:        rawD.povertyRate        ?? acs.povertyRate        ?? rawD.poverty_rate ?? null,
    vacancyRate:        rawD.vacancyRate        ?? acs.vacancyRate        ?? rawD.vacancy_rate ?? null,
    unemploymentRate:   rawD.unemploymentRate   ?? acs.unemploymentRate   ?? rawD.unemployment_rate ?? null,
    commuteInflow:      rawD.commuteInflow      ?? acs.commuteInflow      ?? rawD.commute_inflow ?? null,
    commuteOutflow:     rawD.commuteOutflow     ?? acs.commuteOutflow     ?? rawD.commute_outflow ?? null,
    bachelorsPlus:      rawD.bachelorsPlus      ?? acs.bachelorsPlus      ?? rawD.bachelors_plus ?? null,
    graduatePlus:       rawD.graduatePlus       ?? acs.graduatePlus       ?? rawD.graduate_plus ?? null,
    affordableCeiling:  rawD.affordableCeiling  ?? acs.affordableCeiling  ?? rawD.affordable_ceiling ?? null,
    popTrend:           rawD.popTrend           ?? acs.popTrend           ?? null,
    popTrendScope:      rawD.popTrendScope      ?? acs.popTrendScope      ?? null,
    popTrendLevel:      rawD.popTrendLevel      ?? acs.popTrendLevel      ?? null,
    employmentBySector: rawD.employmentBySector ?? acs.employmentBySector ?? rawD.employment_by_sector ?? null,
    totalEmployment:    rawD.totalEmployment    ?? acs.totalEmployment    ?? rawD.total_employment ?? null,
    _sources:           rawD._sources           ?? acs._sources           ?? null,
  };
  const h = rawD.housing && typeof rawD.housing === 'object' ? {...(study.housing||{}), ...rawD.housing} : study.housing || {};
  // v3.1.1: Also pull ACS tenure fields into housing if they arrived under demographics
  if (h.ownerOccupied == null && (rawD.ownerOccupied != null || acs.ownerOccupied != null)) {
    h.ownerOccupied = rawD.ownerOccupied ?? acs.ownerOccupied;
  }
  if (h.renterOccupied == null && (rawD.renterOccupied != null || acs.renterOccupied != null)) {
    h.renterOccupied = rawD.renterOccupied ?? acs.renterOccupied;
  }
  if (h.vacancyRate == null && (rawD.vacancyRate != null || acs.vacancyRate != null)) {
    h.vacancyRate = rawD.vacancyRate ?? acs.vacancyRate;
  }
  const comp = study.competition || {};
  const abs = study.absorption || {};
  const pricing = study.pricing || {};
  const land = study.land || {};
  const proforma = study.proforma || {};
  const reg = study.regulatory || {};
  const scorecard = study.scorecard || [];
  const swot = study.swot || {};
  const g = study.geo || {};

  // v2.6 Step 3: server-side DOM cascade. The client-side useStudy.js cascade
  // only runs in the browser before saving the study; the PDF is generated
  // server-side and may receive an un-cascaded study shape. Read-time cascade
  // ensures Section 6 DOM populates whether or not the client cascade ran.
  if (comp.daysOnMarket == null) {
    comp.daysOnMarket = (comp.marketKPIs && comp.marketKPIs.daysOnMarket != null)
      ? comp.marketKPIs.daysOnMarket
      : (h.medianDOM != null ? h.medianDOM
         : (h.daysOnMarket != null ? h.daysOnMarket : null));
  }
  if (comp.marketKPIs && comp.marketKPIs.daysOnMarket == null && comp.daysOnMarket != null) {
    comp.marketKPIs.daysOnMarket = comp.daysOnMarket;
  }

  const wtdAvg = scorecard.length ? (scorecard.reduce((s, x) => s + safeNum(x.score, 0) * safeNum(x.weight, 0), 0) / 100) : 0;
  const rec = recLabel(wtdAvg);
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const sources = collectSources(study);

  const parts = [];
  const p = (s) => parts.push(s);

  // ── CSS + Head ──
  p('<!DOCTYPE html><html><head><meta charset="utf-8"><style>');
  p('@page{margin:0}*{box-sizing:border-box;margin:0;padding:0}');
  p("body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:10pt;color:#1a1a2e;line-height:1.6;background:#fff}");
  p('.cover{page-break-after:always;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:linear-gradient(135deg,#0B1120 0%,#1F2937 100%);color:#fff;text-align:center;padding:2in}');
  p('.cover .brand{font-size:14pt;letter-spacing:4px;color:#F59E0B;text-transform:uppercase;margin-bottom:12px}');
  p('.cover h1{font-size:32pt;font-weight:700;color:#F9FAFB;margin-bottom:8px}');
  p('.cover .subtitle{font-size:16pt;color:#9CA3AF;margin-bottom:32px}');
  p('.cover .meta{font-size:10pt;color:#6B7280;line-height:2}');
  p('.cover .score-badge{display:inline-block;margin-top:24px;padding:12px 32px;border-radius:8px;background:' + rec.bg + ';color:' + rec.color + ';font-size:14pt;font-weight:700}');
  p('h2{font-size:16pt;color:#0B1120;border-bottom:3px solid #F59E0B;padding-bottom:6px;margin:32px 0 16px;page-break-after:avoid}');
  p('h3{font-size:12pt;color:#374151;margin:20px 0 10px;page-break-after:avoid}');
  p('p{margin-bottom:10px;text-align:justify}.narrative{font-size:10pt;color:#374151;margin:8px 0 16px;line-height:1.7}');
  p('.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.kpi-grid.four{grid-template-columns:repeat(4,1fr)}');
  p('.kpi{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:14px 10px;text-align:center}');
  p('.kpi .value{font-size:20pt;font-weight:700;color:#0B1120}.kpi .value.accent{color:#F59E0B}.kpi .value.green{color:#10B981}.kpi .value.blue{color:#3B82F6}.kpi .value.red{color:#EF4444}');
  p('.kpi .label{font-size:7.5pt;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px}');
  p('table{width:100%;border-collapse:collapse;margin:10px 0 18px;font-size:9pt}');
  p('th{background:#1F2937;color:#fff;padding:7px 10px;text-align:left;font-weight:600;font-size:8.5pt}');
  p('td{padding:6px 10px;border-bottom:1px solid #E5E7EB;vertical-align:top}tr:nth-child(even) td{background:#F9FAFB}');
  p('.text-right{text-align:right}.text-center{text-align:center}.bold{font-weight:700}.highlight-row td{background:#F0FDF4!important;font-weight:700}');
  p('.scope-tag{display:inline-block;background:#EEF2FF;color:#4338CA;padding:2px 8px;font-size:7.5pt;border-radius:4px;margin-left:8px;font-weight:600}');
  p('.bar-chart{margin:12px 0}.bar-row{display:flex;align-items:center;margin-bottom:6px}');
  p('.bar-label{width:140px;font-size:8.5pt;color:#374151;text-align:right;padding-right:10px;flex-shrink:0}');
  p('.bar-track{flex:1;height:20px;background:#F3F4F6;border-radius:3px;overflow:hidden}');
  p('.bar-fill{height:100%;border-radius:3px;display:flex;align-items:center;padding-left:8px;font-size:7.5pt;color:#fff;font-weight:600}');
  p('.swot-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}');
  p('.swot-box{border:1px solid #E5E7EB;border-radius:6px;padding:14px;page-break-inside:avoid}');
  p('.swot-box h3{margin-top:0;font-size:11pt}.swot-box ul{padding-left:18px;margin-top:6px}.swot-box li{margin-bottom:5px;font-size:9pt;line-height:1.5}');
  p('.s-box{border-left:4px solid #10B981}.s-box h3{color:#10B981}');
  p('.w-box{border-left:4px solid #EF4444}.w-box h3{color:#EF4444}');
  p('.o-box{border-left:4px solid #3B82F6}.o-box h3{color:#3B82F6}');
  p('.t-box{border-left:4px solid #F97316}.t-box h3{color:#F97316}');
  p('.score-big{text-align:center;margin:20px 0}.score-big .number{font-size:48pt;font-weight:700;color:#F59E0B}');
  p('.score-big .out-of{font-size:14pt;color:#9CA3AF}.score-big .rec{font-size:16pt;font-weight:700;padding:8px 24px;border-radius:6px;display:inline-block;margin-top:8px}');
  p('.page-break{page-break-before:always}');
  p('.disclaimer{margin-top:32px;padding:16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;font-size:8pt;color:#6B7280;line-height:1.6}');
  p('.source-list{font-size:8pt;color:#6B7280}.source-list td{padding:3px 8px;font-size:8pt}');
  p('.toc{margin:20px 0}.toc-item{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #D1D5DB;font-size:11pt}');
  p('.toc-item .title{color:#1a1a2e}.section-num{color:#F59E0B;font-weight:700;margin-right:8px}');
  p('.def-list{display:grid;grid-template-columns:180px 1fr;gap:6px 16px;margin:12px 0}.def-list dt{font-weight:600;color:#6B7280;font-size:9pt}.def-list dd{font-size:9pt;color:#1a1a2e}');
  // v4.1 (V41-4 / R-4) — provenance chip CSS. Inline span class selectors
  // keyed off `.prov-<class>`; tooltips surface source_url + fetched_at.
  p('.prov-chip{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:9px;font-size:6.5pt;font-weight:700;letter-spacing:0.3px;vertical-align:middle;line-height:1.3}');
  p('.prov-chip.prov-dot{padding:0 4px;font-size:10pt;line-height:1}');
  p('.prov-measured{background:#DCFCE7;color:#166534;border:1px solid #86EFAC}');
  p('.prov-derived{background:#DBEAFE;color:#1E40AF;border:1px solid #93C5FD}');
  p('.prov-modeled{background:#FEF3C7;color:#92400E;border:1px solid #FCD34D}');
  p('.prov-llm{background:#F3E8FF;color:#6B21A8;border:1px solid #D8B4FE}');
  p('.prov-missing{background:#F3F4F6;color:#6B7280;border:1px solid #D1D5DB}.prov-error{background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5}.prov-error-block{margin:10px 0;padding:10px 12px;border:1px dashed #FCA5A5;background:#FEF2F2;border-radius:6px}.prov-error-head{font-weight:700;color:#991B1B;font-size:10pt}.prov-error-body{color:#7F1D1D;font-size:9pt;margin-top:4px}');
  p('</style></head><body>');

  // ── Cover ──
  p('<div class="cover">');
  p('<div class="brand">Infinity Markets</div>');
  p('<h1>New Construction Market Study</h1>');
  p('<div class="subtitle">' + esc(study.targetArea || '') + '</div>');
  p('<div class="meta">' + dateStr + '<br>Prepared for Forbes Capretto Homes<br>Land Acquisition &amp; Strategic Planning</div>');
  p('<div class="score-badge">' + rec.text + ' — Score: ' + wtdAvg.toFixed(1) + '/10</div>');
  p('</div>');

  // ── TOC ──
  p('<h2 style="border:none;margin-top:0;">Table of Contents</h2><div class="toc">');
  const tocItems = ['Executive Summary','Market Area','Demographics','Housing Market','Building Permits','Competitive Landscape','Absorption & Demand','Pricing Strategy','Land Economics','Proforma Scenarios','Regulatory Environment','Market Scorecard','SWOT Analysis','Data Sources & Methodology'];
  tocItems.forEach((t, i) => p('<div class="toc-item"><span class="title"><span class="section-num">' + (i+1) + '.</span>' + t + '</span></div>'));
  p('</div>');

  // ── 1. Executive Summary ──
  p('<h2 class="page-break"><span class="section-num">1.</span> Executive Summary</h2>');
  p('<div class="score-big"><div class="number">' + wtdAvg.toFixed(1) + '</div><div class="out-of">out of 10.0</div>');
  p('<div class="rec" style="background:' + rec.bg + ';color:' + rec.color + ';">' + rec.text + '</div></div>');
  p('<p class="narrative">This institutional-grade market study evaluates <strong>' + esc(study.targetArea || 'the target market') + '</strong> for new residential construction feasibility. The analysis synthesizes data from ' + sources.length + '+ government and commercial data sources including the U.S. Census Bureau, FRED, BLS, BEA, HUD, FHFA, Zillow, Redfin, RapidAPI Realtor.com, Parcl Labs, and SEC EDGAR filings, with AI-assisted synthesis via Anthropic Claude.</p>');
  p('<h3>Key Findings</h3><div class="kpi-grid four">');
  p('<div class="kpi"><div class="value">' + fmt(d.population) + '</div><div class="label">Population' + provChip(study, 'demographics.population') + '</div></div>');
  p('<div class="kpi"><div class="value accent">' + (d.mhi ? '$' + fmt(d.mhi) : '—') + '</div><div class="label">Median HH Income' + provChip(study, 'demographics.mhi') + '</div></div>');
  p('<div class="kpi"><div class="value green">' + safe(abs.marketWideMonthly) + '</div><div class="label">Monthly Absorption</div></div>');
  p('<div class="kpi"><div class="value blue">' + safe(abs.demandGap) + '</div><div class="label">Annual Demand Gap</div></div></div>');
  if (scorecard.length) {
    p('<h3>Scorecard Summary</h3><table><tr><th>Metric</th><th class="text-center">Weight</th><th class="text-center">Score</th><th>Key Finding</th></tr>');
    scorecard.forEach(s => p('<tr><td>' + esc(safeStr(s.metric)) + '</td><td class="text-center">' + s.weight + '%</td><td class="text-center bold" style="color:' + scoreColor(s.score) + '">' + s.score + '</td><td style="font-size:8pt">' + esc(safeStr(s.rationale)) + '</td></tr>'));
    p('<tr class="highlight-row"><td>Weighted Composite</td><td class="text-center">100%</td><td class="text-center">' + wtdAvg.toFixed(1) + '</td><td>' + rec.text + '</td></tr></table>');
  }

  // ── 2. Market Area ──
  p('<h2 class="page-break"><span class="section-num">2.</span> Market Area</h2>');
  p('<p class="narrative">The market study covers <strong>' + esc(safeStr(g.name || study.targetArea)) + '</strong>, a ' + (g.subdivision ? 'township-level' : 'county-level') + ' market within ' + esc(safeStr(g.county ? g.county + ' County' : 'the target county')) + ', ' + esc(safeStr(g.stateAbbr || g.state || '')) + (g.cbsaName ? ', part of the ' + esc(g.cbsaName) + ' metro area' : '') + '.</p>');
  p('<dl class="def-list">');
  p('<dt>Target Area</dt><dd>' + esc(safeStr(g.name || study.targetArea)) + '</dd>');
  p('<dt>Subdivision/Township</dt><dd>' + esc(safeStr(g.subdivision || g.subdivName)) + '</dd>');
  p('<dt>County</dt><dd>' + esc(safeStr(g.county)) + '</dd>');
  p('<dt>State</dt><dd>' + esc(safeStr(g.stateAbbr || g.state)) + '</dd>');
  p('<dt>CBSA (Metro)</dt><dd>' + esc(safeStr(g.cbsaName || g.cbsa)) + '</dd>');
  p('<dt>State FIPS</dt><dd>' + esc(safeStr(g.stateFips)) + '</dd>');
  p('<dt>County FIPS</dt><dd>' + esc(safeStr(g.countyFips)) + '</dd>');
  p('<dt>Subdivision FIPS</dt><dd>' + esc(safeStr(g.subdivFips)) + '</dd>');
  p('<dt>ZIP Codes</dt><dd>' + esc(Array.isArray(g.zips) ? g.zips.join(', ') : safeStr(g.zips)) + '</dd>');
  p('<dt>Coordinates</dt><dd>' + ((g.lat != null && (g.lon != null || g.lng != null)) ? Number(g.lat).toFixed(4) + ', ' + Number(g.lon ?? g.lng).toFixed(4) : '—') + '</dd>');
  p('</dl>');
  p('<p class="narrative" style="font-size:8.5pt;color:#6B7280;"><em>Note on data scope:</em> Demographic and housing metrics are reported at the most granular geography available from each source. County-level series (permits, employment, price indices) are labeled as such; sub-county metrics are reported at the township/subdivision level when available.</p>');

  // ── 3. Demographics ──
  p('<h2 class="page-break"><span class="section-num">3.</span> Demographics</h2>');
  let demoNarr = 'The demographic profile of ' + esc(study.targetArea || 'this market') + ' reveals a' + (d.population > 100000 ? ' sizeable' : '') + ' population base of ' + fmt(d.population) + ' residents across ' + fmt(d.households) + ' households.';
  if (d.mhi) demoNarr += ' The median household income of $' + fmt(d.mhi) + ' ' + (d.mhi > 75000 ? 'positions this as an above-average income market.' : d.mhi > 55000 ? 'indicates a middle-income market.' : 'suggests a value-oriented buyer demographic.');
  if (d.homeownershipRate) demoNarr += ' The ' + d.homeownershipRate + '% homeownership rate ' + (d.homeownershipRate > 70 ? 'reflects strong ownership culture.' : d.homeownershipRate > 60 ? 'is near the national average.' : 'may indicate rental demand.');
  p('<p class="narrative">' + demoNarr + '</p>');
  p('<div class="kpi-grid">');
  p('<div class="kpi"><div class="value">' + fmt(d.population) + '</div><div class="label">Population' + provChip(study, 'demographics.population') + '</div></div>');
  p('<div class="kpi"><div class="value">' + fmtP(d.popGrowth5yr) + '</div><div class="label">5-Year Growth' + provChip(study, 'demographics.popGrowth5yr') + '</div></div>');
  p('<div class="kpi"><div class="value accent">' + (d.mhi ? '$' + fmt(d.mhi) : '—') + '</div><div class="label">Median HH Income' + provChip(study, 'demographics.mhi') + '</div></div>');
  p('<div class="kpi"><div class="value">' + fmt(d.households) + '</div><div class="label">Households' + provChip(study, 'demographics.households') + '</div></div>');
  p('<div class="kpi"><div class="value">' + fmtP(d.homeownershipRate) + '</div><div class="label">Homeownership Rate' + provChip(study, 'demographics.homeownershipRate') + '</div></div>');
  p('<div class="kpi"><div class="value">' + fmtP(d.unemploymentRate) + '</div><div class="label">Unemployment Rate' + provChip(study, 'demographics.unemploymentRate') + '</div></div></div>');
  // v2.6 Step 6: surface ACS geography-level footnote so users know when data
  // was backfilled from county level because subdivision was below MOE threshold.
  if (d._acsNote) {
    p('<p class="narrative" style="font-size:8.5pt;color:#6B7280;"><em>Note:</em> ' + esc(d._acsNote) + '</p>');
  } else if (d._acsLevel === 'county') {
    p('<p class="narrative" style="font-size:8.5pt;color:#6B7280;"><em>Note:</em> Demographic figures shown at county level.</p>');
  }
  p('<table><tr><th>Indicator</th><th class="text-right">Value</th></tr>');
  p('<tr><td>Median Age</td><td class="text-right">' + safe(d.medianAge) + '</td></tr>');
  p('<tr><td>Avg Household Size</td><td class="text-right">' + safe(d.avgHouseholdSize) + '</td></tr>');
  p('<tr><td>Per Capita Income</td><td class="text-right">' + (d.perCapitaIncome ? '$' + fmt(d.perCapitaIncome) : '—') + '</td></tr>');
  p('<tr><td>MHI Growth (YoY)</td><td class="text-right">' + fmtP(d.mhiGrowth) + '</td></tr>');
  p('<tr><td>Poverty Rate</td><td class="text-right">' + fmtP(d.povertyRate) + '</td></tr>');
  p('<tr><td>Vacancy Rate</td><td class="text-right">' + fmtP(d.vacancyRate) + '</td></tr>');
  p('<tr><td>Affordable Ceiling</td><td class="text-right">' + (d.affordableCeiling ? '$' + fmt(d.affordableCeiling) : '—') + '</td></tr>');
  // V41-6 — DTI basis footnote row (renders only when _affordabilityInputs present).
  if (d._affordabilityInputs) {
    var _ai = d._affordabilityInputs;
    var _ratePct = (_ai.rate * 100).toFixed(2);
    var _dtiPct  = (_ai.dtiFrontEnd * 100).toFixed(0);
    var _downPct = (_ai.downPct * 100).toFixed(0);
    var _taxPct  = (_ai.taxRate * 100).toFixed(2);
    var _srcLabel = _ai.rateSource || 'fallback';
    var _prov = _ai.provenance || 'derived';
    var _basis = 'Basis: DTI ' + _dtiPct + '% front-end · ' + _ratePct + '% / ' + _ai.termYears + 'yr · ' + _downPct + '% down · T+I @ ' + _taxPct + '% · ' + _srcLabel + ' (' + _prov + ')';
    p('<tr><td colspan="2" style="font-size:10px;color:#6B7280;padding-left:24px">' + _basis + '</td></tr>');
  }
  p('<tr><td>Commute Inflow</td><td class="text-right">' + fmt(d.commuteInflow) + '</td></tr>');
  p('<tr><td>Commute Outflow</td><td class="text-right">' + fmt(d.commuteOutflow) + '</td></tr></table>');

  if (d.incomeDist && d.incomeDist.length) {
    p('<h3>Household Income Distribution</h3><div class="bar-chart">');
    const maxPct = Math.max.apply(null, d.incomeDist.map(x => x.pct || 0));
    d.incomeDist.forEach(b => {
      const width = Math.round(((b.pct || 0) / (maxPct || 1)) * 100);
      p('<div class="bar-row"><div class="bar-label">' + esc(safeStr(b.bracket)) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(width, 5) + '%;background:#3B82F6;">' + (b.pct || 0) + '%</div></div></div>');
    });
    p('</div>');
  }
  if (d.topEmployers && d.topEmployers.length) {
    p('<h3>Top Employment Sectors</h3><table><tr><th>Sector</th><th class="text-right">Employment</th></tr>');
    d.topEmployers.forEach(e => p('<tr><td>' + esc(safeStr(e.sector || e.name)) + '</td><td class="text-right">' + fmt(e.emp || e.employment) + '</td></tr>'));
    p('</table>');
  }
  if (d.popTrend && d.popTrend.length) {
    p('<h3>Population Trend <span class="scope-tag">' + esc(d.popTrendScope || scopeLabel(study, d.popTrendLevel || 'county')) + '</span></h3>');
    p('<p class="narrative" style="font-size:8.5pt;color:#6B7280;"><em>Source: U.S. Census Bureau Population Estimates Program (PEP). Values shown at the ' + esc(d.popTrendLevel || 'county') + ' level &mdash; this may differ from the township-level population shown in the KPIs above.</em></p>');
    p('<div class="bar-chart">');
    const allPops = d.popTrend.map(pt => safeNum(pt.v || pt.pop || pt.value, 0));
    const minP = Math.min.apply(null, allPops) * 0.95;
    const maxP = Math.max.apply(null, allPops);
    d.popTrend.forEach(pt => {
      const pop = safeNum(pt.v || pt.pop || pt.value, 0);
      const width = maxP > minP ? Math.round(((pop - minP) / (maxP - minP)) * 100) : 50;
      p('<div class="bar-row"><div class="bar-label">' + esc(safeStr(pt.yr || pt.year)) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(width, 10) + '%;background:#8B5CF6;">' + fmt(pop) + '</div></div></div>');
    });
    p('</div>');
  }
  if (d.vintage && d.vintage.length) {
    p('<h3>Housing Stock by Year Built</h3><div class="bar-chart">');
    const maxV = Math.max.apply(null, d.vintage.map(x => x.pct || 0));
    d.vintage.forEach(v => {
      const width = maxV > 0 ? Math.round(((v.pct || 0) / maxV) * 100) : 0;
      p('<div class="bar-row"><div class="bar-label">' + esc(safeStr(v.era || v.label)) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(width, 5) + '%;background:#10B981;">' + (v.pct || 0) + '%</div></div></div>');
    });
    p('</div>');
  }

  return parts.join('') + buildPDFHTML_Part2(study, d, h, comp, abs, pricing, land, proforma, reg, scorecard, swot, g, wtdAvg, rec, sources);
}

function buildPDFHTML_Part2(study, d, h, comp, abs, pricing, land, proforma, reg, scorecard, swot, g, wtdAvg, rec, sources) {
  const parts = [];
  const p = (s) => parts.push(s);

  // ── Section 4: Housing Supply ──
  p('<div class="section"><h2>4. Housing Supply &amp; Inventory</h2>');
  p('<div class="kpi-grid four">');
  p('<div class="kpi"><div class="value">' + fmt(h.totalUnits) + '</div><div class="label">Total Units' + provChip(study, 'housing.totalUnits') + '</div></div>');
  p('<div class="kpi"><div class="value accent">' + fmt(h.ownerOccupied) + '</div><div class="label">Owner-Occ' + provChip(study, 'housing.ownerOccupied') + '</div></div>');
  p('<div class="kpi"><div class="value blue">' + fmt(h.renterOccupied) + '</div><div class="label">Renter-Occ' + provChip(study, 'housing.renterOccupied') + '</div></div>');
  p('<div class="kpi"><div class="value red">' + fmtP(h.vacancyRate) + '</div><div class="label">Vacancy' + provChip(study, 'housing.vacancyRate') + '</div></div>');
  p('</div>');
  if (h.narrative) p('<div class="narrative">' + esc(safeStr(h.narrative)) + '</div>');
  if (h.medianHomeValue || h.medianRent) {
    p('<h3>Value &amp; Rent</h3><table><tr><th>Metric</th><th>Value</th></tr>');
    if (h.medianHomeValue) p('<tr><td>Median Home Value</td><td>$' + fmt(h.medianHomeValue) + '</td></tr>');
    if (h.medianRent)      p('<tr><td>Median Gross Rent</td><td>$' + fmt(h.medianRent) + '</td></tr>');
    if (h.priceToIncome)   p('<tr><td>Price-to-Income Ratio</td><td>' + fmt1(h.priceToIncome) + 'x</td></tr>');
    if (h.rentBurden)      p('<tr><td>Rent Burden (>30% Income)</td><td>' + fmtP(h.rentBurden) + '</td></tr>');
    if (h.affordableCeiling) p('<tr><td>Affordable Price Ceiling (30% DTI)</td><td>$' + fmt(h.affordableCeiling) + '</td></tr>');
    p('</table>');
  }
  if (h.tenure) {
    p('<h3>Tenure Mix</h3><table><tr><th>Tenure</th><th>Units</th><th>Share</th></tr>');
    Object.entries(h.tenure).forEach(([k,v]) => {
      const units = v.units || v.count || v.value || v;
      const pct = v.pct || v.share || null;
      p('<tr><td>' + esc(safeStr(k)) + '</td><td>' + fmt(units) + '</td><td>' + (pct != null ? fmtP(pct) : '—') + '</td></tr>');
    });
    p('</table>');
  }
  if (h.typeMix) {
    p('<h3>Unit Type Mix</h3><table><tr><th>Type</th><th>Units</th><th>Share</th></tr>');
    Object.entries(h.typeMix).forEach(([k,v]) => {
      const units = v.units || v.count || v.value || v;
      const pct = v.pct || v.share || null;
      p('<tr><td>' + esc(safeStr(k)) + '</td><td>' + fmt(units) + '</td><td>' + (pct != null ? fmtP(pct) : '—') + '</td></tr>');
    });
    p('</table>');
  }
  p('</div>');

  // ── Section 5: Building Permits ──
  p('<div class="section"><h2>5. Building Permits &amp; Construction Activity</h2>');
  if (h.permits && h.permits.length) {
    p('<table><tr><th>Year</th><th>Single-Family</th><th>Multi-Family</th><th>Total</th></tr>');
    h.permits.forEach(pr => {
      const sf = pr.sf || pr.singleFamily || 0;
      const mf = pr.mf || pr.multiFamily || 0;
      const tot = pr.total || (safeNum(sf) + safeNum(mf));
      p('<tr><td>' + esc(safeStr(pr.year || pr.yr)) + '</td><td>' + fmt(sf) + '</td><td>' + fmt(mf) + '</td><td>' + fmt(tot) + '</td></tr>');
    });
    p('</table>');
  } else {
    p('<p class="narrative">No permit data available for this market.</p>');
  }
  // v3.0 Step 8: 5-year FRED forward projections
  const fwd = (study.forward || {});
  const renderFwd = (key, label, unit) => {
    const f = fwd[key];
    if (!f || !Array.isArray(f.forecast) || !f.forecast.length) return '';
    const obs = Array.isArray(f.observed) && f.observed.length ? f.observed[f.observed.length-1] : null;
    const last = f.forecast[f.forecast.length-1];
    const method = f.method || 'derived';
    const r2 = (f.r2 != null) ? ' R²=' + f.r2.toFixed(2) : '';
    const u = unit || '';
    return '<tr><td>' + esc(label) + '</td>' +
           '<td class="text-right">' + (obs && obs.value != null ? fmt1(obs.value) + u : '—') + '</td>' +
           '<td class="text-right">' + fmt1(last.value) + u + '</td>' +
           '<td class="text-right">' + fmt1(last.lo) + u + ' - ' + fmt1(last.hi) + u + '</td>' +
           '<td class="text-right" style="font-size:8.5pt;color:#6B7280;">' + esc(method) + r2 + '</td></tr>';
  };
  const fwdRows = [
    renderFwd('mortgageRate30yr', '30Y Mortgage Rate', '%'),
    renderFwd('housingStarts',    'Housing Starts',    'K'),
    renderFwd('buildingPermits',  'Building Permits',  'K'),
    renderFwd('hpiPittsburgh',    'Pittsburgh HPI',    ''),
    renderFwd('medianSalePriceUS','US Median Sale',    ''),
    renderFwd('unemploymentPitt', 'Pittsburgh Unemp.', '%'),
    renderFwd('cpi',              'CPI',               ''),
    renderFwd('lumberPPI',        'Lumber PPI',        ''),
  ].filter(Boolean);
  if (fwdRows.length) {
    p('<h3>5-Year Forward Projection (FRED-derived)</h3>');
    p('<p class="narrative" style="font-size:8.5pt;color:#6B7280;">Projections generated by linear/EWMA/naive forecast against FRED series with confidence bands. Method and R² shown where applicable.</p>');
    p('<table><tr><th>Series</th><th class="text-right">Latest Actual</th><th class="text-right">5Y Forecast</th><th class="text-right">Band (Lo-Hi)</th><th class="text-right">Method</th></tr>');
    fwdRows.forEach(r => p(r));
    p('</table>');
  }
  if (h.permitTrend) p('<div class="narrative"><strong>Trend:</strong> ' + esc(safeStr(h.permitTrend)) + '</div>');
  if (h.permitsNarrative) p('<div class="narrative">' + esc(safeStr(h.permitsNarrative)) + '</div>');
  p('</div>');

  // ── Section 6: Competition ──
  p('<div class="section"><h2>6. Competitive Landscape</h2>');
  p('<div class="kpi-grid four">');
  p('<div class="kpi"><div class="value">' + fmt(comp.activeListings) + '</div><div class="label">Active Listings' + provChip(study, 'competition.activeListings') + '</div></div>');
  p('<div class="kpi"><div class="value accent">$' + fmt(comp.medianListPrice) + '</div><div class="label">Median List' + provChip(study, 'competition.medianListPrice') + '</div></div>');
  p('<div class="kpi"><div class="value blue">' + fmt(comp.daysOnMarket) + '</div><div class="label">Days on Market' + provChip(study, 'competition.daysOnMarket') + '</div></div>');
  p('<div class="kpi"><div class="value green">' + fmt(comp.builderCount || (comp.builders||[]).length) + '</div><div class="label">Active Builders' + provChip(study, 'competition.builderCount') + '</div></div>');
  p('</div>');
  if (comp.narrative) p('<div class="narrative">' + esc(safeStr(comp.narrative)) + '</div>');
  if (comp.builders && comp.builders.length) {
    p('<h3>Active Builders (Top ' + Math.min(comp.builders.length, 15) + ')</h3>');
    p('<table><tr><th>Builder</th><th>Communities</th><th>Price Range</th><th>Avg Sqft</th><th>$/Sqft</th></tr>');
    comp.builders.slice(0, 15).forEach(b => {
      // v3.1.1: If priceMin/Max still blank but ASP present, synthesize a range
      let pMin = b.priceMin || b.minPrice;
      let pMax = b.priceMax || b.maxPrice;
      if ((pMin == null || pMax == null) && (b.averageSellingPrice || b.avgPrice)) {
        const asp = Number(b.averageSellingPrice || b.avgPrice);
        if (Number.isFinite(asp) && asp > 0) {
          if (pMin == null) pMin = Math.round(asp * 0.85);
          if (pMax == null) pMax = Math.round(asp * 1.15);
        }
      }
      const range = (pMin && pMax)
        ? '$' + fmt(pMin) + '–$' + fmt(pMax)
        : (b.priceRange || '—');
      // v3.1.1: Fall back to ASP-derived $/sqft if explicit psf missing
      const avgSqftCell = b.avgSqft ? fmt(b.avgSqft) : '—';
      const psf = (b.pricePerSqft != null && b.pricePerSqft > 0)
        ? '$' + fmt(b.pricePerSqft)
        : (b.averageSellingPrice && b.avgSqft
            ? '$' + fmt(Math.round(Number(b.averageSellingPrice) / Number(b.avgSqft)))
            : '—');
      const commCell = (b.communities || b.communityCount) ? fmt(b.communities || b.communityCount) : '—';
      p('<tr><td>' + esc(safeStr(b.name || b.builder)) + '</td><td>' + commCell + '</td><td>' + esc(safeStr(range)) + '</td><td>' + avgSqftCell + '</td><td>' + psf + '</td></tr>');
    });
    p('</table>');
  }
  if (comp.comparables && comp.comparables.length) {
    p('<h3>Comparable Communities</h3>');
    p('<table><tr><th>Community</th><th>Builder</th><th>Type</th><th>Price</th><th>Sqft</th><th>$/Sqft</th></tr>');
    comp.comparables.slice(0, 20).forEach(c => {
      p('<tr><td>' + esc(safeStr(c.name || c.community)) + '</td><td>' + esc(safeStr(c.builder)) + '</td><td>' + esc(safeStr(c.type || c.productType)) + '</td><td>$' + fmt(c.price) + '</td><td>' + fmt(c.sqft) + '</td><td>$' + fmt(c.pricePerSqft) + '</td></tr>');
    });
    p('</table>');
  }
  p('</div>');

  // ── Section 7: Absorption ──
  p('<div class="section"><h2>7. Absorption Analysis</h2>');
  p('<div class="kpi-grid">');
  p('<div class="kpi"><div class="value accent">' + fmt1(abs.monthlyAbsorption || abs.salesPerMonth) + '</div><div class="label">Sales / Mo</div></div>');
  p('<div class="kpi"><div class="value">' + fmt(abs.annualAbsorption || abs.annualSales) + '</div><div class="label">Annual Sales</div></div>');
  p('<div class="kpi"><div class="value blue">' + fmt1(abs.monthsSupply) + ' mo</div><div class="label">Months Supply</div></div>');
  p('</div>');
  if (abs.narrative) p('<div class="narrative">' + esc(safeStr(abs.narrative)) + '</div>');
  // V41-5: if cascade emptied byPriceBand, show an error block instead of
  // silently skipping (previously the table just vanished).
  if ((!abs.byPriceBand || abs.byPriceBand.length === 0)) {
    const blk = errBlock(study, 'absorption', 'byPriceBand', 'Absorption by Price Band');
    if (blk) p(blk);
  }
  if (abs.byPriceBand && abs.byPriceBand.length) {
    // v3.0 Step 8: back-fill salesPerMonth + monthsSupply from totals when bands carry only listings.
    const totalListings = abs.byPriceBand.reduce((s, b) => s + (safeNum(b.listings) || 0), 0);
    const totalSales = safeNum(abs.monthlyAbsorption || abs.salesPerMonth) || 0;
    p('<h3>Absorption by Price Band</h3>');
    p('<table><tr><th>Price Band</th><th>Listings</th><th>Sales/Mo</th><th>Months Supply</th></tr>');
    abs.byPriceBand.forEach(b => {
      let spm = safeNum(b.salesPerMonth);
      let ms  = safeNum(b.monthsSupply);
      if ((spm == null || spm <= 0) && totalListings > 0 && totalSales > 0) {
        spm = (safeNum(b.listings) / totalListings) * totalSales;
      }
      if ((ms == null || ms <= 0) && spm > 0) ms = safeNum(b.listings) / spm;
      p('<tr><td>' + esc(safeStr(b.band || b.priceBand)) + '</td><td>' + fmt(b.listings) + '</td><td>' + fmt1(spm) + '</td><td>' + fmt1(ms) + '</td></tr>');
    });
    p('</table>');
    p('<p class="narrative" style="font-size:8.5pt;color:#6B7280;"><em>Sales/Mo and Months Supply derived from listings share when per-band measured values unavailable.</em></p>');
  }
  if (abs.byProductType && abs.byProductType.length) {
    p('<h3>Absorption by Product Type</h3>');
    p('<table><tr><th>Product</th><th>Share</th><th>Sales/Mo</th></tr>');
    abs.byProductType.forEach(pt => {
      p('<tr><td>' + esc(safeStr(pt.type || pt.product)) + '</td><td>' + fmtP(pt.share) + '</td><td>' + fmt1(pt.salesPerMonth) + '</td></tr>');
    });
    p('</table>');
  }
  if (abs.recommendation) p('<div class="narrative"><strong>Recommendation:</strong> ' + esc(safeStr(abs.recommendation)) + '</div>');
  p('</div>');

  // ── Section 8: Pricing Strategy ──
  p('<div class="section"><h2>8. Pricing Strategy</h2>');
  // V41-5: pricing cascade-empty error block.
  { const blk = errBlock(study, 'pricing', 'stratification', 'Pricing Strategy');
    if (blk) p(blk); }
  // v2.5: cascade targetHomePrice -> targetPriceRange so realistic Low/Mid/High render.
  if (pricing.targetPriceRange || pricing.targetHomePrice) {
    const pr  = pricing.targetPriceRange || {};
    const thp = pricing.targetHomePrice  || {};
    const lo  = thp.low  ?? pr.low  ?? pr.min ?? null;
    const mid = thp.mid  ?? pr.mid  ?? pr.median ?? null;
    const hi  = thp.high ?? pr.high ?? pr.max ?? null;
    p('<div class="kpi-grid">');
    p('<div class="kpi"><div class="value green">$'  + fmt(lo)  + '</div><div class="label">Target Low</div></div>');
    p('<div class="kpi"><div class="value accent">$' + fmt(mid) + '</div><div class="label">Target Mid</div></div>');
    p('<div class="kpi"><div class="value red">$'   + fmt(hi)  + '</div><div class="label">Target High</div></div>');
    p('</div>');
  }
  if (pricing.recommendedPricePerSqft) p('<p class="narrative"><strong>Recommended $/Sqft:</strong> $' + fmt(pricing.recommendedPricePerSqft) + '</p>');
  if (pricing.narrative) p('<div class="narrative">' + esc(safeStr(pricing.narrative)) + '</div>');
  if (pricing.bandedPricing && pricing.bandedPricing.length) {
    p('<h3>Banded Pricing Strategy</h3>');
    p('<table><tr><th>Tier</th><th>Sqft Range</th><th>Price Range</th><th>$/Sqft</th><th>Target Share</th></tr>');
    // v3.0 Step 8: fill missing sqft range + $/sqft from canonical tier defaults
    const TIER_DEFAULTS = {
      'Entry Level':   { sqftRange: '1,800-2,400', pricePerSqft: 200 },
      'Move-Up':       { sqftRange: '2,400-3,200', pricePerSqft: 250 },
      'Premium':       { sqftRange: '3,200-4,200', pricePerSqft: 300 },
      'Mid-Premium':   { sqftRange: '3,200-4,200', pricePerSqft: 300 },
      'Executive':     { sqftRange: '3,200-4,200', pricePerSqft: 300 },
      'Luxury':        { sqftRange: '4,200-5,500', pricePerSqft: 350 },
      'Ultra-Luxury':  { sqftRange: '5,500+',      pricePerSqft: 400 },
    };
    pricing.bandedPricing.forEach(b => {
      const tier = safeStr(b.tier || b.name);
      const def = TIER_DEFAULTS[tier] || {};
      const sqftRange = (b.sqftRange && String(b.sqftRange).trim() && b.sqftRange !== '—') ? b.sqftRange : (def.sqftRange || '—');
      let psf = safeNum(b.pricePerSqft);
      // guard: Ultra-Luxury with nonsensical low $/sqft (< $250) falls back to default
      if (tier === 'Ultra-Luxury' && (psf == null || psf < 250)) psf = def.pricePerSqft;
      if ((psf == null || psf <= 0) && def.pricePerSqft) psf = def.pricePerSqft;
      p('<tr><td>' + esc(tier) + '</td><td>' + esc(safeStr(sqftRange)) + '</td><td>' + esc(safeStr(b.priceRange)) + '</td><td>$' + fmt(psf) + '</td><td>' + fmtP(b.share) + '</td></tr>');
    });
    p('</table>');
  }
  if (pricing.positioning) p('<div class="narrative"><strong>Positioning:</strong> ' + esc(safeStr(pricing.positioning)) + '</div>');
  if (pricing.risks) p('<div class="narrative"><strong>Pricing Risks:</strong> ' + esc(safeStr(pricing.risks)) + '</div>');
  p('</div>');

  // ── Section 9: Land Acquisition ──
  p('<div class="section"><h2>9. Land Acquisition</h2>');
  p('<div class="kpi-grid four">');
  p('<div class="kpi"><div class="value">$' + fmt(land.targetLandCostPerLot) + '</div><div class="label">$/Lot Target</div></div>');
  p('<div class="kpi"><div class="value accent">' + fmtP(land.landCostPctOfRevenue) + '</div><div class="label">% of Revenue</div></div>');
  p('<div class="kpi"><div class="value blue">$' + fmt(land.finishedLotCost) + '</div><div class="label">Finished Lot</div></div>');
  p('<div class="kpi"><div class="value green">' + fmt1(land.lotsPerAcre) + '</div><div class="label">Lots/Acre</div></div>');
  p('</div>');
  if (land.narrative) p('<div class="narrative">' + esc(safeStr(land.narrative)) + '</div>');
  if (land.developmentCosts) {
    p('<h3>Development Cost Estimates</h3><table><tr><th>Line Item</th><th>Amount</th></tr>');
    Object.entries(land.developmentCosts).forEach(([k,v]) => {
      p('<tr><td>' + esc(safeStr(k)) + '</td><td>$' + fmt(v) + '</td></tr>');
    });
    p('</table>');
  }
  if (land.acquisitionStrategy) p('<div class="narrative"><strong>Acquisition Strategy:</strong> ' + esc(safeStr(land.acquisitionStrategy)) + '</div>');
  if (land.entitlementRisk) p('<div class="narrative"><strong>Entitlement Risk:</strong> ' + esc(safeStr(land.entitlementRisk)) + '</div>');
  p('</div>');

  // ── Section 10: Pro Forma ──
  p('<div class="section"><h2>10. Pro Forma Financials</h2>');
  // V41-5: proforma cascade-empty error block.
  { const blk = errBlock(study, 'proforma', 'scenarios', 'Pro Forma Financials');
    if (blk) p(blk); }
  p('<div class="kpi-grid four">');
  p('<div class="kpi"><div class="value accent">$' + fmt(proforma.revenue || proforma.totalRevenue) + '</div><div class="label">Revenue</div></div>');
  p('<div class="kpi"><div class="value">$' + fmt(proforma.grossProfit) + '</div><div class="label">Gross Profit</div></div>');
  p('<div class="kpi"><div class="value green">' + fmtP(proforma.grossMargin) + '</div><div class="label">GP Margin</div></div>');
  p('<div class="kpi"><div class="value blue">' + fmtP(proforma.netMargin || proforma.netIncomeMargin) + '</div><div class="label">Net Margin</div></div>');
  p('</div>');
  if (proforma.narrative) p('<div class="narrative">' + esc(safeStr(proforma.narrative)) + '</div>');
  if (proforma.lineItems) {
    p('<h3>Line Items (Per Home)</h3><table><tr><th>Line Item</th><th>Amount</th><th>% Revenue</th></tr>');
    Object.entries(proforma.lineItems).forEach(([k,v]) => {
      const amt = typeof v === 'object' ? (v.amount || v.value) : v;
      const pct = typeof v === 'object' ? (v.pct || v.percent) : null;
      p('<tr><td>' + esc(safeStr(k)) + '</td><td>$' + fmt(amt) + '</td><td>' + (pct != null ? fmtP(pct) : '—') + '</td></tr>');
    });
    p('</table>');
  }
  if (proforma.returns) {
    p('<h3>Return Metrics</h3><table><tr><th>Metric</th><th>Value</th></tr>');
    Object.entries(proforma.returns).forEach(([k,v]) => {
      p('<tr><td>' + esc(safeStr(k)) + '</td><td>' + esc(safeStr(v)) + '</td></tr>');
    });
    p('</table>');
  }
  if (proforma.sensitivity) p('<div class="narrative"><strong>Sensitivity:</strong> ' + esc(safeStr(proforma.sensitivity)) + '</div>');

  // v3.0 Step 8: Forbes Capretto Homes target margin band (25-31% gross, mid-20s on entry)
  const fchGM = (proforma.grossMargin != null) ? safeNum(proforma.grossMargin) : null;
  const fchTargetLow = 25.0, fchTargetHigh = 31.0;
  let fchVerdict = '—';
  let fchColor = '#6B7280';
  if (fchGM != null) {
    if (fchGM >= fchTargetHigh) { fchVerdict = 'ABOVE target (upside)'; fchColor = '#10B981'; }
    else if (fchGM >= fchTargetLow) { fchVerdict = 'WITHIN target band'; fchColor = '#10B981'; }
    else if (fchGM >= fchTargetLow - 5) { fchVerdict = 'BELOW target (needs pricing or cost work)'; fchColor = '#F59E0B'; }
    else { fchVerdict = 'MATERIALLY BELOW target'; fchColor = '#EF4444'; }
  }
  p('<h3>Forbes Capretto Homes Margin Gate</h3>');
  p('<div class="narrative">Forbes Capretto underwrites to a <strong>25-31% gross margin</strong> band (lower end for entry-level, upper end for premium/luxury). This scenario: <strong style="color:' + fchColor + '">' + esc(fchVerdict) + '</strong> at ' + fmtP(fchGM) + '.</div>');

  // v4.0.3 (O-1): SEC EDGAR public builder benchmarks — render ALL builders the
  // study knows about, not just those with EDGAR hits. Honest em-dashes for missing
  // fields (LAW #6). Transparency footnote reports N-with-data / M-total.
  const allBuilders = Array.isArray(study.competition && study.competition.builders)
    ? study.competition.builders.slice()
    : [];
  const hasEdgarData = b => b && (b.revenueUsd != null || b.grossMarginPct != null ||
    b.averageSellingPrice != null || b.cik || b.homesDelivered != null);
  const ebMarks = allBuilders;
  const nWithData = allBuilders.filter(hasEdgarData).length;
  // Sort so builders with EDGAR data float to the top.
  ebMarks.sort((a, b) => (hasEdgarData(b) ? 1 : 0) - (hasEdgarData(a) ? 1 : 0));
  if (ebMarks.length) {
    p('<h3>SEC EDGAR Public Builder Benchmarks (latest 10-K)</h3>');
    p('<p class="narrative" style="font-size:8.5pt;color:#6B7280;">Source: SEC EDGAR companyfacts. Revenue / GP / ASP / cancellation rate extracted from most recent 10-K per builder. <strong>' + nWithData + ' of ' + ebMarks.length + ' builders</strong> had 10-K data resolvable at render time; remaining rows render dashes honestly.</p>');
    p('<table><tr><th>Builder</th><th class="text-right">Revenue</th><th class="text-right">GP Margin</th><th class="text-right">Homes Delivered</th><th class="text-right">ASP</th><th class="text-right">Cancel Rate</th><th class="text-right">Filing</th></tr>');
    ebMarks.slice(0, 10).forEach(b => {
      const asp = b.averageSellingPrice || b.avgSellingPrice || b.asp;
      p('<tr><td>' + esc(safeStr(b.name || b.builder)) + '</td>' +
        '<td class="text-right">' + (b.revenueUsd ? '$' + fmt(Math.round(b.revenueUsd / 1e6)) + 'M' : '—') + '</td>' +
        '<td class="text-right">' + fmtP(b.grossMarginPct) + '</td>' +
        '<td class="text-right">' + fmt(b.homesDelivered) + '</td>' +
        '<td class="text-right">' + (asp ? '$' + fmt(asp) : '—') + '</td>' +
        '<td class="text-right">' + fmtP(b.cancellationRatePct || b.cancelRate) + '</td>' +
        '<td class="text-right" style="font-size:8.5pt;color:#6B7280;">' + esc(safeStr(b.filingPeriodEnd || '—')) + '</td></tr>');
    });
    p('</table>');
    // Peer benchmark: compute median GP margin and ASP
    const gpVals = ebMarks.map(b => safeNum(b.grossMarginPct)).filter(v => v > 0).sort((a,b) => a-b);
    const aspVals = ebMarks.map(b => safeNum(b.averageSellingPrice || b.avgSellingPrice || b.asp)).filter(v => v > 0).sort((a,b) => a-b);
    if (gpVals.length || aspVals.length) {
      const med = (arr) => arr.length ? arr[Math.floor(arr.length/2)] : null;
      const medGp = med(gpVals), medAsp = med(aspVals);
      const gpDelta = (fchGM != null && medGp != null) ? (fchGM - medGp) : null;
      p('<p class="narrative">Peer median GP margin: <strong>' + fmtP(medGp) + '</strong>. Forbes scenario: <strong>' + fmtP(fchGM) + '</strong>' + (gpDelta != null ? ' (' + (gpDelta >= 0 ? '+' : '') + gpDelta.toFixed(1) + ' pts vs peer median)' : '') + '. Peer median ASP: <strong>' + (medAsp ? '$' + fmt(medAsp) : '—') + '</strong>.</p>');
    }
  }

  p('</div>');

  // ── Section 11: Regulatory ──
  p('<div class="section"><h2>11. Regulatory Environment</h2>');
  if (reg.narrative) p('<div class="narrative">' + esc(safeStr(reg.narrative)) + '</div>');
  if (reg.zoning) p('<div class="narrative"><strong>Zoning:</strong> ' + esc(safeStr(reg.zoning)) + '</div>');
  if (reg.entitlementTimeline) p('<div class="narrative"><strong>Entitlement Timeline:</strong> ' + esc(safeStr(reg.entitlementTimeline)) + '</div>');
  if (reg.impactFees) {
    p('<h3>Impact Fees / Exactions</h3><table><tr><th>Fee Type</th><th>Amount</th></tr>');
    if (typeof reg.impactFees === 'object' && !Array.isArray(reg.impactFees)) {
      Object.entries(reg.impactFees).forEach(([k,v]) => {
        p('<tr><td>' + esc(safeStr(k)) + '</td><td>' + esc(safeStr(v)) + '</td></tr>');
      });
    } else if (Array.isArray(reg.impactFees)) {
      reg.impactFees.forEach(f => {
        p('<tr><td>' + esc(safeStr(f.name || f.type)) + '</td><td>' + esc(safeStr(f.amount || f.value)) + '</td></tr>');
      });
    }
    p('</table>');
  }
  if (reg.regulatoryRisks) p('<div class="narrative"><strong>Regulatory Risks:</strong> ' + esc(safeStr(reg.regulatoryRisks)) + '</div>');
  if (reg.permittingProcess) p('<div class="narrative"><strong>Permitting:</strong> ' + esc(safeStr(reg.permittingProcess)) + '</div>');
  p('</div>');

  // ── Section 12: Market Scorecard ──
  p('<div class="section"><h2>12. Market Scorecard</h2>');
  p('<div class="score-summary" style="background:' + rec.bg + ';border-radius:8px;padding:20px;margin:16px 0;text-align:center;">');
  p('<div style="font-size:36pt;font-weight:700;color:' + rec.color + ';">' + fmt1(wtdAvg) + ' / 10</div>');
  p('<div style="font-size:14pt;color:' + rec.color + ';font-weight:600;margin-top:6px;">' + esc(rec.text || rec.label || '') + '</div>');
  p('</div>');
  // V41-5: scorecard empty_despite_inputs error block.
  if (!scorecard || scorecard.length === 0) {
    const blk = errBlock(study, 'scorecard', 'scorecard', 'Market Scorecard');
    if (blk) p(blk);
  }
  if (scorecard && scorecard.length) {
    p('<table><tr><th>Factor</th><th>Score (1-10)</th><th>Weight</th><th>Weighted</th><th>Rationale</th></tr>');
    scorecard.forEach(s => {
      const w = safeNum(s.weight, 0);
      const sc = safeNum(s.score, 0);
      const weighted = (w * sc / 100).toFixed(2);
      p('<tr><td>' + esc(safeStr(s.metric || s.factor || s.name)) + '</td><td style="color:' + scoreColor(sc) + ';font-weight:700;">' + fmt1(sc) + '</td><td>' + fmtP(w) + '</td><td>' + weighted + '</td><td style="font-size:8pt;">' + esc(safeStr(s.rationale || s.notes || '')) + '</td></tr>');
    });
    p('</table>');
  }
  p('</div>');

  // ── Section 13: SWOT ──
  p('<div class="section"><h2>13. SWOT Analysis</h2>');
  p('<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0;">');
  const swotBox = (title, items, bg, color) => {
    let s = '<div style="background:' + bg + ';border-left:4px solid ' + color + ';padding:14px;border-radius:4px;">';
    s += '<h3 style="color:' + color + ';margin-top:0;">' + esc(title) + '</h3><ul style="margin:0;padding-left:18px;">';
    (Array.isArray(items) ? items : []).forEach(it => {
      s += '<li style="font-size:9pt;margin-bottom:4px;">' + esc(safeStr(it)) + '</li>';
    });
    s += '</ul></div>';
    return s;
  };
  p(swotBox('Strengths', swot.strengths, '#ECFDF5', '#10B981'));
  p(swotBox('Weaknesses', swot.weaknesses, '#FEF2F2', '#EF4444'));
  p(swotBox('Opportunities', swot.opportunities, '#EFF6FF', '#3B82F6'));
  p(swotBox('Threats', swot.threats, '#FFFBEB', '#F59E0B'));
  p('</div>');
  if (swot.narrative || swot.summary) p('<div class="narrative">' + esc(safeStr(swot.narrative || swot.summary)) + '</div>');
  p('</div>');

  // ── Section 14: Sources & Methodology ──
  p('<div class="section"><h2>14. Data Sources &amp; Methodology</h2>');
  p('<p class="narrative">This market study was assembled from ' + sources.length + ' authoritative data sources, combining government statistics, commercial listings, and AI-driven analysis.</p>');
  if (sources && sources.length) {
    p('<table><tr><th>Source</th><th>Data Provided</th><th>Last Updated</th></tr>');
    sources.forEach(s => {
      p('<tr><td>' + esc(safeStr(s.name || s.source)) + '</td><td>' + esc(safeStr(s.data || s.description || s.detail || '')) + '</td><td>' + esc(safeStr(s.updated || s.asOf || 'Current')) + '</td></tr>');
    });
    p('</table>');
  }
  p('<h3>Methodology</h3>');
  p('<p class="narrative">Demographic data is sourced from the U.S. Census Bureau (ACS 5-year estimates) and Bureau of Labor Statistics. Housing inventory is pulled from Redfin, Zillow ZHVI, and MLS feeds via RapidAPI Realtor. Competitive intelligence combines NewHomeSource active listings with SEC EDGAR filings for public builders. Absorption, pricing, land, and pro forma analysis is synthesized using Claude Sonnet 4 against the aggregated dataset. The market scorecard applies a weighted 10-factor methodology calibrated to Forbes Capretto Homes underwriting criteria.</p>');
  p('<div class="footer-note" style="margin-top:24px;padding-top:12px;border-top:1px solid #E5E7EB;font-size:8pt;color:#6B7280;">');
  p('Infinity Markets — Institutional Market Intelligence Platform. Report generated ' + new Date().toLocaleString('en-US') + '.');
  p('</div>');
  p('</div>');

  // ── Appendix A: Data Quality Report (v4.1 / V41-3 / H-8) ──
  // Conditional: only renders when _schema.errorSummary has row entries.
  // When absent or empty, emits NOTHING — preserves byte-identity of
  // clean-study PDFs (goldens don't need re-baselining for complete data).
  const _sch = study && study._schema;
  const _es  = _sch && _sch.errorSummary;
  const _rows = (_es && Array.isArray(_es.rows)) ? _es.rows : [];
  if (_rows.length > 0) {
    p('<div class="section"><h2>Appendix A: Data Quality Report</h2>');
    p('<p class="narrative">This appendix lists schema gaps detected during study assembly. It is emitted only when one or more required canonical fields are missing or unknown fields are present, so underwriters can see exactly where upstream data did not land before relying on derived figures.</p>');
    const _summaryLine = (_es.text || '').replace(/^\s*\[[^\]]+\]\s*/, '');
    p('<p class="narrative" style="font-weight:600;color:#92400E;background:#FEF3C7;padding:10px 14px;border-left:4px solid #F59E0B;border-radius:4px;">Summary: ' + esc(safeStr(_summaryLine)) + '</p>');
    p('<table><tr><th style="width:32%">Field</th><th style="width:24%">Issue</th><th>Detail</th></tr>');
    _rows.forEach(r => {
      const bg    = r.kind === 'missing_required' ? '#FFFBEB' : '#F8FAFC';
      const pill  = r.kind === 'missing_required'
        ? '<span style="display:inline-block;padding:2px 8px;background:#F59E0B;color:#fff;border-radius:10px;font-size:8.5pt;font-weight:600;">Missing Required</span>'
        : '<span style="display:inline-block;padding:2px 8px;background:#64748B;color:#fff;border-radius:10px;font-size:8.5pt;font-weight:600;">Unknown Field</span>';
      p('<tr style="background:' + bg + ';">' +
        '<td style="font-family:Menlo,monospace;font-size:9pt;">' + esc(safeStr(r.field)) + '</td>' +
        '<td>' + pill + '</td>' +
        '<td style="font-size:9.5pt;color:#475569;">' + esc(safeStr(r.detail || '')) + '</td>' +
      '</tr>');
    });
    p('</table>');
    p('<p class="narrative" style="font-size:9pt;color:#6B7280;margin-top:14px;">Schema version: ' + esc(safeStr((_sch && _sch.version) || 'unknown')) + ' · Missing: ' + (_es.missingCount || 0) + ' · Unknown: ' + (_es.unknownCount || 0) + ' · Total rows: ' + (_es.total || _rows.length) + '</p>');
    p('</div>');
  }

  p('</body></html>');
  return parts.join('');
}

module.exports = { buildPDFHTML, collectSources };
