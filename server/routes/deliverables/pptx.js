/**
 * Infinity Markets v4.1 — deliverables/pptx.js
 *
 * Extracted from monolithic deliverables.js as part of V41-1 (H-6 refactor).
 * PptxGenJS 25-slide deck generation. Body preserved byte-exactly.
 *
 * Exports:
 *   generatePPTX(study, res, supabase) — async. Builds the deck and
 *     streams it back to the client via uploadAndRespond().
 */
const path = require('path');
const os = require('os');
const {
  fmt, fmtD, fmtP, fmt1,
  safe, safeNum, safeStr,
  esc,
  scoreColor, recLabel, scopeLabel,
  uploadAndRespond,
} = require('./helpers');
const { collectSources } = require('./pdf');

async function generatePPTX(study, res, supabase) {
const PptxGenJS = require('pptxgenjs');
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Infinity Markets';
const bg = '0B1120', txt = 'F9FAFB', mut = '9CA3AF', acc = 'F59E0B', surf = '1F2937', grn = '10B981', red = 'EF4444', blu = '3B82F6';
const mo = { background: { color: bg } };
const headTxt = (sl, title) => sl.addText(title, { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });

/* Slide 1: Title */
let sl = pptx.addSlide(mo);
sl.addText('INFINITY MARKETS', { x: 0.5, y: 1.5, w: 12, fontSize: 40, bold: true, color: acc, fontFace: 'Arial' });
sl.addText('New Construction Market Study', { x: 0.5, y: 2.4, w: 12, fontSize: 24, color: txt, fontFace: 'Arial' });
sl.addText(safeStr(study.targetArea), { x: 0.5, y: 3.2, w: 12, fontSize: 20, color: mut, fontFace: 'Arial' });
sl.addText(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  { x: 0.5, y: 4.0, w: 12, fontSize: 14, color: mut, fontFace: 'Arial' });
sl.addText('Forbes Capretto Homes — Land Acquisition & Strategic Planning',
  { x: 0.5, y: 6.2, w: 12, fontSize: 11, color: mut, fontFace: 'Arial', align: 'center' });

/* Slide 2: Executive Summary / Recommendation */
const scorecard = study.scorecard || [];
const wtdAvg = scorecard.length ? scorecard.reduce((s, x) => s + safeNum(x.score, 0) * safeNum(x.weight, 0), 0) / 100 : 0;
const rec = recLabel(wtdAvg);
sl = pptx.addSlide(mo);
headTxt(sl, 'EXECUTIVE SUMMARY');
sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 1.0, w: 4, h: 2.5, fill: { color: surf }, rectRadius: 0.1 });
sl.addText(wtdAvg.toFixed(1), { x: 0.5, y: 1.2, w: 4, fontSize: 48, bold: true, color: acc, align: 'center', fontFace: 'Arial' });
sl.addText('COMPOSITE SCORE', { x: 0.5, y: 2.4, w: 4, fontSize: 11, color: mut, align: 'center', fontFace: 'Arial' });
sl.addText(rec.text, { x: 0.5, y: 2.8, w: 4, fontSize: 14, bold: true, color: rec.color.replace('#', ''), align: 'center', fontFace: 'Arial' });
const findings = scorecard.slice(0, 4).map(s => `${safeStr(s.metric)}: ${s.score}/10`).join('\n');
sl.addText('Top Scorecard Metrics:', { x: 5, y: 1.0, w: 8, fontSize: 14, bold: true, color: txt, fontFace: 'Arial' });
sl.addText(findings, { x: 5, y: 1.5, w: 8, fontSize: 12, color: mut, fontFace: 'Arial', lineSpacing: 24 });
const d = study.demographics || {};
const h2 = study.housing || {};
const abs = study.absorption || {};
const summKpis = [
  ['Population', fmt(d.population)], ['Median HHI', fmtD(d.mhi)],
  ['Monthly Abs', safeStr(abs.marketWideMonthly)], ['Demand Gap', safeStr(abs.demandGap)],
];
summKpis.forEach(([label, val], i) => {
  sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + i * 3.15, y: 4.2, w: 2.8, h: 1.6, fill: { color: surf }, rectRadius: 0.1 });
  sl.addText(String(val), { x: 0.5 + i * 3.15, y: 4.35, w: 2.8, fontSize: 22, bold: true, color: acc, align: 'center', fontFace: 'Arial' });
  sl.addText(label, { x: 0.5 + i * 3.15, y: 5.05, w: 2.8, fontSize: 10, color: mut, align: 'center', fontFace: 'Arial' });
});

/* Slide 3: Market Area / Geography */
sl = pptx.addSlide(mo);
headTxt(sl, 'MARKET AREA');
const g = study.geo || {};
const geoKvs = [
  ['Subdivision', safeStr(g.subdivision || g.name)],
  ['County', safeStr(g.county)],
  ['State', safeStr(g.stateAbbr || g.state)],
  ['CBSA', safeStr(g.cbsaName || g.cbsa)],
  ['ZIP Codes', Array.isArray(g.zips) ? g.zips.join(', ') : safeStr(g.zips)],
  ['Coordinates', (g.lat != null && (g.lng != null || g.lon != null)) ? Number(g.lat).toFixed(4) + ', ' + Number(g.lng ?? g.lon).toFixed(4) : '—'],
];
geoKvs.forEach(([label, val], i) => {
  const col = i % 2, row = Math.floor(i / 2);
  sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + col * 6.25, y: 1.2 + row * 1.5, w: 6, h: 1.3, fill: { color: surf }, rectRadius: 0.1 });
  sl.addText(label, { x: 0.8 + col * 6.25, y: 1.3 + row * 1.5, w: 5.7, fontSize: 11, color: mut, fontFace: 'Arial' });
  sl.addText(String(val), { x: 0.8 + col * 6.25, y: 1.65 + row * 1.5, w: 5.7, fontSize: 18, bold: true, color: txt, fontFace: 'Arial' });
});

/* Slide 4: Market Scorecard */
if (scorecard.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'MARKET SCORECARD');
  const scRows = [[
    { text: 'Metric', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: 'Weight', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Score', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Rationale', options: { bold: true, color: txt, fill: { color: surf } } },
  ]];
  for (const s of scorecard) {
    scRows.push([
      { text: safeStr(s.metric), options: { color: txt } },
      { text: String(s.weight ?? ''), options: { color: mut, align: 'center' } },
      { text: String(s.score ?? ''), options: { color: acc, align: 'center', bold: true } },
      { text: safeStr(s.rationale), options: { color: mut, fontSize: 9 } },
    ]);
  }
  sl.addTable(scRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.5, 1, 1, 7.5] });
}

/* Slide 5: Demographics */
sl = pptx.addSlide(mo);
headTxt(sl, 'DEMOGRAPHICS');
const dKpis = [
  // v2.6 Step 6: PPTX gets an ACS level row so audience sees county-level disclaimer
  ['ACS Level', d._acsLevel || 'subdivision'],
  ['Population', fmt(d.population)], ['5yr Growth', fmtP(d.popGrowth5yr)],
  ['Median HHI', fmtD(d.mhi)], ['Homeownership', fmtP(d.homeownershipRate)],
  ['Households', fmt(d.households)], ['Unemployment', fmtP(d.unemploymentRate)],
];
dKpis.forEach(([label, val], i) => {
  const col = i % 3, row = Math.floor(i / 3);
  sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + col * 4, y: 1.2 + row * 2.2, w: 3.5, h: 1.8, fill: { color: surf }, rectRadius: 0.1 });
  sl.addText(String(val), { x: 0.5 + col * 4, y: 1.4 + row * 2.2, w: 3.5, fontSize: 28, bold: true, color: acc, align: 'center', fontFace: 'Arial' });
  sl.addText(label, { x: 0.5 + col * 4, y: 2.2 + row * 2.2, w: 3.5, fontSize: 12, color: mut, align: 'center', fontFace: 'Arial' });
});

/* Slide 6: Employment Mix */
if (d.topEmployers?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'EMPLOYMENT MIX');
  const eRows = [[
    { text: 'Sector', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: 'Employment', options: { bold: true, color: txt, fill: { color: surf }, align: 'right' } },
  ]];
  for (const e of d.topEmployers.slice(0, 15)) {
    eRows.push([
      { text: safeStr(e.sector || e.name), options: { color: txt } },
      { text: fmt(e.emp ?? e.employment), options: { color: acc, align: 'right', bold: true } },
    ]);
  }
  sl.addTable(eRows, { x: 0.5, y: 1.0, w: 12, fontSize: 11, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [8, 4] });
}

/* Slide 7: Housing Market */
sl = pptx.addSlide(mo);
headTxt(sl, 'HOUSING MARKET');
// v2.6 Step 3: PPTX DOM cascade (mirrors XLSX patch above)
const _pptxDOM = h2.medianDOM != null ? h2.medianDOM
  : (study.competition && study.competition.marketKPIs && study.competition.marketKPIs.daysOnMarket != null
      ? study.competition.marketKPIs.daysOnMarket
      : (study.competition && study.competition.daysOnMarket != null
          ? study.competition.daysOnMarket
          : null));
const hKpis = [
  ['Median Value', fmtD(h2.medianValue)], ['YoY Growth', fmtP(h2.valueGrowthYoY)],
  ['Median DOM', safeStr(_pptxDOM)], ['Months Supply', safeStr(h2.monthsSupply)],
  ['Mortgage Rate', fmtP(h2.mortgageRate)], ['Median Rent', fmtD(h2.medianRent)],
];
hKpis.forEach(([label, val], i) => {
  const col = i % 3, row = Math.floor(i / 3);
  sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + col * 4, y: 1.2 + row * 2.2, w: 3.5, h: 1.8, fill: { color: surf }, rectRadius: 0.1 });
  sl.addText(String(val), { x: 0.5 + col * 4, y: 1.4 + row * 2.2, w: 3.5, fontSize: 28, bold: true, color: blu, align: 'center', fontFace: 'Arial' });
  sl.addText(label, { x: 0.5 + col * 4, y: 2.2 + row * 2.2, w: 3.5, fontSize: 12, color: mut, align: 'center', fontFace: 'Arial' });
});

/* Slide 8: Price Trend (Zillow ZHVI) */
if (h2.priceTrend?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'PRICE TREND — ZILLOW ZHVI');
  const tRows = [[
    { text: 'Month', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: 'Value', options: { bold: true, color: txt, fill: { color: surf }, align: 'right' } },
  ]];
  for (const p of h2.priceTrend) {
    tRows.push([
      { text: safeStr(p.month || p.date), options: { color: txt } },
      { text: fmtD(p.v ?? p.value), options: { color: acc, align: 'right', bold: true } },
    ]);
  }
  sl.addTable(tRows, { x: 3, y: 1.0, w: 7, fontSize: 11, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [3.5, 3.5] });
}

/* Slide 9: Permits */
const sfArr = h2.permitsSF || []; const mfArr = h2.permitsMF || [];
const permitYears = [...new Set([...sfArr.map(p => p.yr), ...mfArr.map(p => p.yr)])].sort();
if (permitYears.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, `BUILDING PERMITS — ${scopeLabel(study, 'county').toUpperCase()}`);
  const pRows = [[
    { text: 'Year', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'SF', options: { bold: true, color: txt, fill: { color: surf }, align: 'right' } },
    { text: 'MF', options: { bold: true, color: txt, fill: { color: surf }, align: 'right' } },
    { text: 'Total', options: { bold: true, color: txt, fill: { color: surf }, align: 'right' } },
  ]];
  for (const yr of permitYears) {
    const sf = safeNum(sfArr.find(p => p.yr === yr)?.v, 0);
    const mf = safeNum(mfArr.find(p => p.yr === yr)?.v, 0);
    pRows.push([
      { text: String(yr), options: { color: txt, align: 'center' } },
      { text: fmt(sf), options: { color: blu, align: 'right' } },
      { text: fmt(mf), options: { color: acc, align: 'right' } },
      { text: fmt(sf + mf), options: { color: grn, align: 'right', bold: true } },
    ]);
  }
  sl.addTable(pRows, { x: 2, y: 1.0, w: 9, fontSize: 11, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.25, 2.25, 2.25, 2.25] });
}

/* Slide 10: Competition Table */
if (study.competition?.communities?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'COMPETITIVE LANDSCAPE');
  const cRows = [[
    { text: 'Community', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: 'Builder', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: 'Product', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Price Range', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: '$/SF', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Lots Rem', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
  ]];
  for (const c of study.competition.communities.slice(0, 10)) {
    const pr = c.priceLow && c.priceHigh ? `$${fmt(c.priceLow)}-$${fmt(c.priceHigh)}` : '—';
    cRows.push([
      { text: safeStr(c.name), options: { color: txt } },
      { text: safeStr(c.builder), options: { color: mut } },
      { text: safeStr(c.product), options: { color: mut, align: 'center' } },
      { text: pr, options: { color: txt, align: 'center' } },
      { text: c.psfAvg ? `$${c.psfAvg}` : '—', options: { color: acc, align: 'center' } },
      { text: String(c.lotsRemain ?? c.lotsRemaining ?? '—'), options: { color: mut, align: 'center' } },
    ]);
  }
  sl.addTable(cRows, { x: 0.3, y: 1.0, w: 12.5, fontSize: 9, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.5, 2, 1, 2.5, 1, 1.2] });
}

/* Slide 11: Active Builders */
if (study.competition?.builders?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'ACTIVE BUILDERS');
  const bRows = [[
    { text: 'Builder', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: 'Communities', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Share', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Notes', options: { bold: true, color: txt, fill: { color: surf } } },
  ]];
  for (const b of study.competition.builders.slice(0, 12)) {
    bRows.push([
      { text: safeStr(b.name || b.builder), options: { color: txt } },
      { text: String(b.communities ?? b.count ?? '—'), options: { color: mut, align: 'center' } },
      { text: b.share != null ? `${b.share}%` : '—', options: { color: acc, align: 'center', bold: true } },
      { text: safeStr(b.note || b.notes), options: { color: mut, fontSize: 9 } },
    ]);
  }
  sl.addTable(bRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [3, 2, 1.5, 5.5] });
}

/* Slide 12: Absorption KPIs + By Price Band */
if (study.absorption) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'ABSORPTION & DEMAND');
  const aKpis = [
    ['Monthly Abs.', safeStr(abs.marketWideMonthly)],
    ['Annual Closings', safeStr(abs.annualClosings)],
    ['Demand Gap', safeStr(abs.demandGap)],
  ];
  aKpis.forEach(([label, val], i) => {
    sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + i * 4, y: 1.2, w: 3.5, h: 1.8, fill: { color: surf }, rectRadius: 0.1 });
    sl.addText(String(val), { x: 0.5 + i * 4, y: 1.4, w: 3.5, fontSize: 32, bold: true, color: grn, align: 'center', fontFace: 'Arial' });
    sl.addText(label, { x: 0.5 + i * 4, y: 2.3, w: 3.5, fontSize: 12, color: mut, align: 'center', fontFace: 'Arial' });
  });
  if (abs.byPriceBand?.length) {
    const bRows = [[
      { text: 'Price Band', options: { bold: true, color: txt, fill: { color: surf } } },
      { text: 'Units', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
      { text: 'Share', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    ]];
    for (const b of abs.byPriceBand) {
      bRows.push([
        { text: safeStr(b.band), options: { color: txt } },
        { text: String(b.units ?? '—'), options: { color: mut, align: 'center' } },
        { text: b.pct != null ? `${b.pct}%` : '—', options: { color: acc, align: 'center', bold: true } },
      ]);
    }
    sl.addTable(bRows, { x: 0.5, y: 3.5, w: 12, fontSize: 10, fontFace: 'Arial',
      border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [5, 3.5, 3.5] });
  }
}

/* Slide 13: Absorption by Community */
if (abs.byCommunity?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'ABSORPTION BY COMMUNITY');
  const bcRows = [[
    { text: 'Community', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: 'Monthly Abs', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Annual', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Status', options: { bold: true, color: txt, fill: { color: surf } } },
  ]];
  for (const b of abs.byCommunity.slice(0, 12)) {
    bcRows.push([
      { text: safeStr(b.name || b.community), options: { color: txt } },
      { text: String(b.monthlyAbs ?? b.abs ?? '—'), options: { color: grn, align: 'center', bold: true } },
      { text: String(b.annualAbs ?? b.annual ?? '—'), options: { color: mut, align: 'center' } },
      { text: safeStr(b.status), options: { color: mut, fontSize: 9 } },
    ]);
  }
  sl.addTable(bcRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [4, 2.5, 2.5, 3] });
}

/* Slide 14: Seasonality */
if (abs.seasonality?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'SEASONALITY — MONTHLY ABSORPTION INDEX');
  sl.addText('Index 100 = annual average', { x: 0.5, y: 0.9, w: 12, fontSize: 11, color: mut, fontFace: 'Arial' });
  const sRows = [[
    { text: 'Month', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Index', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Note', options: { bold: true, color: txt, fill: { color: surf } } },
  ]];
  for (const s of abs.seasonality) {
    const idx = safeNum(s.index ?? s.v, 100);
    const color = idx >= 110 ? grn : idx <= 90 ? red : acc;
    sRows.push([
      { text: safeStr(s.month), options: { color: txt, align: 'center' } },
      { text: String(idx), options: { color, align: 'center', bold: true } },
      { text: safeStr(s.note), options: { color: mut, fontSize: 9 } },
    ]);
  }
  sl.addTable(sRows, { x: 2, y: 1.3, w: 9, fontSize: 10, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2, 2, 5] });
}

/* Slide 15: Pricing Stratification */
if (study.pricing?.stratification?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'PRICING STRATIFICATION');
  const pRows = [[
    { text: 'Segment', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: 'Price Range', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: '$/SF', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Share', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Builders', options: { bold: true, color: txt, fill: { color: surf } } },
  ]];
  for (const s of study.pricing.stratification) {
    pRows.push([
      { text: safeStr(s.segment), options: { color: txt } },
      { text: safeStr(s.priceRange), options: { color: txt } },
      { text: safeStr(s.psfRange), options: { color: mut, align: 'center' } },
      { text: s.shareOfSales != null ? `${s.shareOfSales}%` : '—', options: { color: acc, align: 'center', bold: true } },
      { text: safeStr(s.builders), options: { color: mut } },
    ]);
  }
  sl.addTable(pRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.5, 2.5, 1.5, 1.2, 4.3] });
}

/* Slide 16: PSF by Product */
if (study.pricing?.psfByProduct?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'PRICE PER SQUARE FOOT BY PRODUCT');
  const pRows = [[
    { text: 'Product', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: '$/SF', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Sample', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
  ]];
  for (const p of study.pricing.psfByProduct) {
    pRows.push([
      { text: safeStr(p.type || p.product), options: { color: txt } },
      { text: fmtD(p.psf), options: { color: acc, align: 'center', bold: true } },
      { text: String(p.n ?? '—'), options: { color: mut, align: 'center' } },
    ]);
  }
  sl.addTable(pRows, { x: 2, y: 1.0, w: 9, fontSize: 11, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [4, 2.5, 2.5] });
}

/* Slide 17: Incentives */
if (study.pricing?.incentives?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'ACTIVE BUILDER INCENTIVES');
  const iRows = [[
    { text: 'Builder', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: 'Type', options: { bold: true, color: txt, fill: { color: surf } } },
    { text: 'Value', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Note', options: { bold: true, color: txt, fill: { color: surf } } },
  ]];
  for (const inc of study.pricing.incentives) {
    iRows.push([
      { text: safeStr(inc.builder), options: { color: txt } },
      { text: safeStr(inc.type), options: { color: mut } },
      { text: safeStr(inc.value), options: { color: acc, align: 'center', bold: true } },
      { text: safeStr(inc.note), options: { color: mut, fontSize: 9 } },
    ]);
  }
  sl.addTable(iRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.5, 2.5, 2, 5] });
}

/* Slide 18: Affordability */
if (study.pricing?.affordability) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'AFFORDABILITY ANALYSIS');
  const aff = study.pricing.affordability;
  const affKpis = [
    ['Median HHI', fmtD(aff.mhi)],
    ['Max Affordable', fmtD(aff.maxAffordable)],
    ['Mortgage Rate', fmtP(aff.mortgageRate)],
    ['P/I Ratio', aff.priceToIncome != null ? `${aff.priceToIncome}x` : '—'],
    ['Buyer Pool @100%', fmt(aff.buyerPool100)],
    ['Buyer Pool @125%', fmt(aff.buyerPool125)],
  ];
  affKpis.forEach(([label, val], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + col * 4, y: 1.2 + row * 2.2, w: 3.5, h: 1.8, fill: { color: surf }, rectRadius: 0.1 });
    sl.addText(String(val), { x: 0.5 + col * 4, y: 1.4 + row * 2.2, w: 3.5, fontSize: 26, bold: true, color: grn, align: 'center', fontFace: 'Arial' });
    sl.addText(label, { x: 0.5 + col * 4, y: 2.3 + row * 2.2, w: 3.5, fontSize: 12, color: mut, align: 'center', fontFace: 'Arial' });
  });
}

/* Slide 19: Land Economics */
const land = study.land || {};
sl = pptx.addSlide(mo);
headTxt(sl, 'LAND ECONOMICS');
const lKpis = [
  ['Lot-to-Home', land.lotToHomeRatio != null ? `${land.lotToHomeRatio}%` : '—'],
  ['Finished Lot', fmtD(land.estFinishedLotValue)],
  ['Raw Land/Acre', fmtD(land.rawLandPerAcre)],
  ['Site Dev/Lot', fmtD(land.estSiteDev)],
  ['Lot Inventory', land.lotInventoryMonths != null ? `${land.lotInventoryMonths} mo` : '—'],
  ['Land Comps', String((land.comps || []).length)],
];
lKpis.forEach(([label, val], i) => {
  const col = i % 3, row = Math.floor(i / 3);
  sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + col * 4, y: 1.2 + row * 2.2, w: 3.5, h: 1.8, fill: { color: surf }, rectRadius: 0.1 });
  sl.addText(String(val), { x: 0.5 + col * 4, y: 1.4 + row * 2.2, w: 3.5, fontSize: 26, bold: true, color: acc, align: 'center', fontFace: 'Arial' });
  sl.addText(label, { x: 0.5 + col * 4, y: 2.3 + row * 2.2, w: 3.5, fontSize: 12, color: mut, align: 'center', fontFace: 'Arial' });
});

/* Slide 20: Proforma Scenarios */
if (study.proforma?.scenarios?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'PROFORMA SCENARIOS');
  const scen = study.proforma.scenarios;
  const pfRows = [
    [{ text: '', options: { fill: { color: surf } } },
     ...scen.map(s => ({ text: safeStr(s.label), options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } }))],
  ];
  const pfLines = [['Avg Selling Price', 'asp'], ['Land/Lot', 'landLot'], ['Hard Cost', 'hardCost'],
    ['Soft Cost', 'softCost'], ['Selling', 'selling'], ['G&A', 'ga'], ['Financing', 'financing'],
    ['Total Cost', 'totalCost'], ['Margin ($)', 'margin'], ['Margin (%)', 'marginPct']];
  for (const [label, key] of pfLines) {
    const highlight = key === 'margin' || key === 'marginPct';
    const row = [{ text: label, options: { color: txt, bold: highlight } }];
    for (const s of scen) {
      const v = s[key];
      const val = key === 'marginPct' ? (v != null ? `${v}%` : '—') : fmtD(v);
      const color = highlight ? grn : mut;
      row.push({ text: val, options: { color, align: 'center', bold: highlight } });
    }
    pfRows.push(row);
  }
  const colW = [3, ...scen.map(() => 9 / scen.length)];
  sl.addTable(pfRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW });
}

/* Slide 21: PPI (Cost Inflation) */
if (study.proforma?.ppiTrend?.length) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'CONSTRUCTION COST INDEX (BLS PPI)');
  if (study.proforma.ppiYoY != null) {
    sl.addText(`Latest YoY: ${study.proforma.ppiYoY}%`, { x: 0.5, y: 0.9, w: 12, fontSize: 14, color: acc, fontFace: 'Arial' });
  }
  const pRows = [[
    { text: 'Year', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'Index', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
    { text: 'YoY', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
  ]];
  for (const p of study.proforma.ppiTrend) {
    pRows.push([
      { text: safeStr(p.yr || p.year), options: { color: txt, align: 'center' } },
      { text: fmt1(p.index ?? p.v), options: { color: mut, align: 'center' } },
      { text: p.yoy != null ? `${p.yoy}%` : '—', options: { color: p.yoy > 0 ? red : grn, align: 'center', bold: true } },
    ]);
  }
  sl.addTable(pRows, { x: 3, y: 1.5, w: 7, fontSize: 11, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.3, 2.3, 2.4] });
}

/* Slide 22: Regulatory */
const reg = study.regulatory || {};
sl = pptx.addSlide(mo);
headTxt(sl, 'REGULATORY ENVIRONMENT');
const regKvs = [
  ['Zoning', safeStr(reg.zoning)],
  ['Max Density', safeStr(reg.maxDensity)],
  ['Entitlement Timeline', safeStr(reg.entitlementTimeline)],
  ['Total Fees/Unit', fmtD(reg.totalFeesPerUnit)],
  ['School District', safeStr(reg.schoolDistrict?.name)],
  ['District Rating', safeStr(reg.schoolDistrict?.rating)],
];
regKvs.forEach(([label, val], i) => {
  const col = i % 2, row = Math.floor(i / 2);
  sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + col * 6.25, y: 1.2 + row * 1.4, w: 6, h: 1.2, fill: { color: surf }, rectRadius: 0.1 });
  sl.addText(label, { x: 0.8 + col * 6.25, y: 1.25 + row * 1.4, w: 5.7, fontSize: 10, color: mut, fontFace: 'Arial' });
  sl.addText(String(val), { x: 0.8 + col * 6.25, y: 1.55 + row * 1.4, w: 5.7, fontSize: 14, bold: true, color: txt, fontFace: 'Arial' });
});
if (reg.fees?.length) {
  const fRows = [[
    { text: 'Fee', options: { bold: true, color: txt, fill: { color: surf }, fontSize: 9 } },
    { text: 'Amount', options: { bold: true, color: txt, fill: { color: surf }, align: 'right', fontSize: 9 } },
  ]];
  for (const f of reg.fees.slice(0, 6)) {
    fRows.push([
      { text: safeStr(f.fee), options: { color: txt, fontSize: 9 } },
      { text: fmtD(f.amount), options: { color: acc, align: 'right', bold: true, fontSize: 9 } },
    ]);
  }
  sl.addTable(fRows, { x: 0.5, y: 5.6, w: 12, fontSize: 9, fontFace: 'Arial',
    border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [8, 4] });
}

/* Slide 23: SWOT */
if (study.swot) {
  sl = pptx.addSlide(mo);
  headTxt(sl, 'SWOT ANALYSIS');
  const quads = [
    { label: 'STRENGTHS', items: study.swot.strengths, color: grn, x: 0.5, y: 1.0 },
    { label: 'WEAKNESSES', items: study.swot.weaknesses, color: red, x: 6.7, y: 1.0 },
    { label: 'OPPORTUNITIES', items: study.swot.opportunities, color: blu, x: 0.5, y: 4.0 },
    { label: 'THREATS', items: study.swot.threats, color: 'F97316', x: 6.7, y: 4.0 },
  ];
  for (const q of quads) {
    sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: q.x, y: q.y, w: 5.8, h: 2.8, fill: { color: surf }, rectRadius: 0.1 });
    sl.addText(q.label, { x: q.x + 0.3, y: q.y + 0.15, w: 5.2, fontSize: 12, bold: true, color: q.color, fontFace: 'Arial' });
    const bullets = (q.items || []).map(item => `• ${safeStr(item)}`).join('\n');
    sl.addText(bullets, { x: q.x + 0.3, y: q.y + 0.6, w: 5.2, h: 2, fontSize: 9, color: txt, fontFace: 'Arial', valign: 'top' });
  }
}

/* Slide 24: Recommendation */
sl = pptx.addSlide(mo);
headTxt(sl, 'RECOMMENDATION');
sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 3, y: 1.5, w: 7, h: 3, fill: { color: surf }, rectRadius: 0.1 });
sl.addText(wtdAvg.toFixed(1), { x: 3, y: 1.7, w: 7, fontSize: 80, bold: true, color: scoreColor(wtdAvg).replace('#', ''), align: 'center', fontFace: 'Arial' });
sl.addText('WEIGHTED COMPOSITE SCORE', { x: 3, y: 3.5, w: 7, fontSize: 11, color: mut, align: 'center', fontFace: 'Arial' });
sl.addText(rec.text, { x: 3, y: 4.0, w: 7, fontSize: 22, bold: true, color: rec.color.replace('#', ''), align: 'center', fontFace: 'Arial' });
sl.addText('Based on 8-metric weighted scorecard analysis of demographics, supply/demand, pricing, land economics, regulatory environment, and builder competition.',
  { x: 1.5, y: 5.0, w: 10, fontSize: 12, color: mut, fontFace: 'Arial', align: 'center' });

/* Slide 25: Disclaimer */
sl = pptx.addSlide(mo);
sl.addText('DISCLAIMER', { x: 0.5, y: 1.5, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
sl.addText('This market study is generated by Infinity Markets using publicly available data from government and commercial sources. It is intended for informational purposes and should not be construed as investment advice. All projections are estimates and actual results may vary. Past performance is not indicative of future results.',
  { x: 0.5, y: 2.5, w: 12, fontSize: 12, color: mut, fontFace: 'Arial' });
sl.addText('Powered by Infinity Markets — Forbes Capretto Homes',
  { x: 0.5, y: 5.5, w: 12, fontSize: 14, color: acc, fontFace: 'Arial', align: 'center' });

const fileName = `infinity-markets-${(study.targetArea || 'deck').replace(/\s+/g, '-')}-${Date.now()}.pptx`;
const filePath = path.join(os.tmpdir(), fileName);
await pptx.writeFile({ fileName: filePath });
await uploadAndRespond(res, filePath, fileName,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', req.app.locals.supabase);
}

module.exports = { generatePPTX };
