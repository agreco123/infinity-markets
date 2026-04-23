/**
 * Infinity Markets v4.1 — deliverables/xlsx.js
 *
 * Extracted from monolithic deliverables.js as part of V41-1 (H-6 refactor).
 * The ExcelJS workbook generation logic is preserved byte-exactly; only the
 * outer router-handler wrapper moved to deliverables.js proper.
 *
 * Exports:
 *   generateXLSX(study, res, supabase) — async. Builds the 13-tab workbook
 *     and streams it back to the client via uploadAndRespond().
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

async function generateXLSX(study, res, supabase) {
const ExcelJS = require('exceljs');
const wb = new ExcelJS.Workbook();
wb.creator = 'Infinity Markets'; wb.created = new Date();
const hdr = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial' },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: { bottom: { style: 'thin', color: { argb: 'FF374151' } } } };
const altRow = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } } };
const sectionTitle = (ws, label) => {
  ws.addRow([]);
  const r = ws.addRow([label]);
  r.font = { bold: true, size: 12, color: { argb: 'FF1F2937' } };
  return r;
};

/* ── 1. Executive Summary ───────────────────────────────────────── */
const ws1 = wb.addWorksheet('Executive Summary');
ws1.columns = [{ width: 32 }, { width: 22 }, { width: 22 }, { width: 40 }];
ws1.addRow(['INFINITY MARKETS — MARKET STUDY']).font = { bold: true, size: 18, name: 'Arial' };
ws1.addRow([study.targetArea || '']);
ws1.addRow([`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`]);
ws1.addRow([]);

const scorecard = study.scorecard || [];
const wtdAvg = scorecard.length ? scorecard.reduce((s, x) => s + (safeNum(x.score, 0) * safeNum(x.weight, 0)), 0) / 100 : 0;
const rec = recLabel(wtdAvg);
ws1.addRow(['COMPOSITE SCORE', wtdAvg.toFixed(1), rec.text]).font = { bold: true, size: 14 };
ws1.addRow([]);
const h1 = ws1.addRow(['Metric', 'Weight', 'Score', 'Rationale']);
h1.eachCell(c => { Object.assign(c, hdr); });
for (const s of scorecard) {
  const r = ws1.addRow([safeStr(s.metric), safeNum(s.weight, 0) / 100, safeNum(s.score, 0), safeStr(s.rationale)]);
  r.getCell(2).numFmt = '0%';
  r.getCell(3).font = { bold: true, color: { argb: safeNum(s.score, 0) >= 7 ? 'FF10B981' : safeNum(s.score, 0) >= 5 ? 'FFF59E0B' : 'FFEF4444' } };
}

/* ── 2. Geography & Market Area ─────────────────────────────────── */
const wsGeo = wb.addWorksheet('Geography');
wsGeo.columns = [{ width: 30 }, { width: 40 }];
const g = study.geo || {};
const gH = wsGeo.addRow(['Attribute', 'Value']); gH.eachCell(c => { Object.assign(c, hdr); });
const geoRows = [
  ['Target Area Name',   g.name || study.targetArea],
  ['State',              g.stateAbbr || g.state],
  ['County',             g.county],
  ['Subdivision / Township', g.subdivision || g.subdivName],
  ['State FIPS',         g.stateFips],
  ['County FIPS',        g.countyFips],
  ['Subdivision FIPS',   g.subdivFips],
  ['CBSA Code',          g.cbsa],
  ['CBSA Name',          g.cbsaName],
  ['ZIP Codes',          Array.isArray(g.zips) ? g.zips.join(', ') : g.zips],
  ['Latitude',           g.lat],
  ['Longitude',          g.lng ?? g.lon],
  ['Resolved By',        g.source || g.resolvedBy],
];
geoRows.forEach(([label, val], i) => {
  const r = wsGeo.addRow([label, safeStr(val)]);
  if (i % 2 === 1) r.eachCell(c => { Object.assign(c, altRow); });
});

/* ── 3. Demographics ────────────────────────────────────────────── */
const ws2 = wb.addWorksheet('Demographics');
ws2.columns = [{ width: 30 }, { width: 20 }];
const d = study.demographics || {};
const dh = ws2.addRow(['Indicator', 'Value']); dh.eachCell(c => { Object.assign(c, hdr); });
const demoRows = [
  // v2.6 Step 6: ACS geography-level provenance
  ['ACS Level', d._acsLevel || 'subdivision'],
  ['ACS Note',  d._acsNote || ''],
  ['Population', d.population], ['5-Year Growth', d.popGrowth5yr ? d.popGrowth5yr / 100 : null],
  ['Median Age', d.medianAge], ['Households', d.households],
  ['Avg HH Size', d.avgHouseholdSize], ['Median HH Income', d.mhi],
  ['MHI Growth YoY', d.mhiGrowth ? d.mhiGrowth / 100 : null],
  ['Per Capita Income', d.perCapitaIncome],
  ['Homeownership Rate', d.homeownershipRate ? d.homeownershipRate / 100 : null],
  ['Poverty Rate', d.povertyRate ? d.povertyRate / 100 : null],
  ['Unemployment Rate', d.unemploymentRate ? d.unemploymentRate / 100 : null],
  ['Vacancy Rate', d.vacancyRate ? d.vacancyRate / 100 : null],
  ['Affordable Ceiling', d.affordableCeiling],
  ['Commute Inflow', d.commuteInflow], ['Commute Outflow', d.commuteOutflow],
];
demoRows.forEach(([label, val], i) => {
  const r = ws2.addRow([label, val]);
  if (i % 2 === 1) r.eachCell(c => { Object.assign(c, altRow); });
  if (typeof val === 'number' && val < 1 && val > -1) r.getCell(2).numFmt = '0.0%';
  else if (label.includes('Income') || label.includes('Per Capita') || label.includes('Ceiling')) r.getCell(2).numFmt = '$#,##0';
  else if (typeof val === 'number') r.getCell(2).numFmt = '#,##0';
});

if (d.popTrend?.length) {
  sectionTitle(ws2, `POPULATION TREND (${d.popTrendScope || scopeLabel(study, d.popTrendLevel || 'county')})`);
  const pth = ws2.addRow(['Year', 'Population']); pth.eachCell(c => { Object.assign(c, hdr); });
  for (const pt of d.popTrend) ws2.addRow([pt.yr || pt.year, safeNum(pt.v ?? pt.pop ?? pt.value)]);
}
if (d.incomeDist?.length) {
  sectionTitle(ws2, 'INCOME DISTRIBUTION');
  const idh = ws2.addRow(['Bracket', 'Percent']); idh.eachCell(c => { Object.assign(c, hdr); });
  for (const b of d.incomeDist) {
    const r = ws2.addRow([safeStr(b.bracket), safeNum(b.pct) / 100]);
    r.getCell(2).numFmt = '0.0%';
  }
}
if (d.topEmployers?.length) {
  sectionTitle(ws2, 'TOP EMPLOYMENT SECTORS');
  const teh = ws2.addRow(['Sector', 'Employment']); teh.eachCell(c => { Object.assign(c, hdr); });
  for (const e of d.topEmployers) ws2.addRow([safeStr(e.sector || e.name), safeNum(e.emp ?? e.employment)]);
}
if (d.vintage?.length) {
  sectionTitle(ws2, 'HOUSING VINTAGE (YEAR BUILT)');
  const vh = ws2.addRow(['Era', 'Percent']); vh.eachCell(c => { Object.assign(c, hdr); });
  for (const v of d.vintage) {
    const r = ws2.addRow([safeStr(v.era || v.label), safeNum(v.pct) / 100]);
    r.getCell(2).numFmt = '0.0%';
  }
}

/* ── 4. Housing Market ──────────────────────────────────────────── */
const ws3 = wb.addWorksheet('Housing');
ws3.columns = [{ width: 30 }, { width: 20 }];
const h2 = study.housing || {};
const hh = ws3.addRow(['Metric', 'Value']); hh.eachCell(c => { Object.assign(c, hdr); });
// v2.6 Step 3: cascade DOM in case housing.medianDOM is null but
// competition carried it — ensures Housing tab "Median DOM" isn't blank.
const _xlsxDOM = h2.medianDOM != null ? h2.medianDOM
  : (study.competition && study.competition.marketKPIs && study.competition.marketKPIs.daysOnMarket != null
      ? study.competition.marketKPIs.daysOnMarket
      : (study.competition && study.competition.daysOnMarket != null
          ? study.competition.daysOnMarket
          : null));
const housingRows = [
  ['Median Value', h2.medianValue], ['YoY Growth', h2.valueGrowthYoY ? h2.valueGrowthYoY / 100 : null],
  ['Median DOM', _xlsxDOM], ['Sale-to-List Ratio', h2.saleToList],
  ['Months Supply', h2.monthsSupply], ['Median Rent (2BR)', h2.medianRent],
  ['Mortgage Rate', h2.mortgageRate ? h2.mortgageRate / 100 : null],
  ['Vacancy Rate', h2.vacancyRate ? h2.vacancyRate / 100 : null],
  ['Total Units', h2.totalUnits],
  ['Affordable Ceiling', h2.affordableCeiling],
];
housingRows.forEach(([label, val], i) => {
  const r = ws3.addRow([label, val]);
  if (i % 2 === 1) r.eachCell(c => { Object.assign(c, altRow); });
  if (label.includes('Rate') || label.includes('Growth') || label.includes('Ratio')) r.getCell(2).numFmt = '0.0%';
  else if (label.includes('Value') || label.includes('Rent') || label.includes('Ceiling')) r.getCell(2).numFmt = '$#,##0';
  else if (typeof val === 'number') r.getCell(2).numFmt = '#,##0';
});

if (h2.fmrByBedroom?.length) {
  sectionTitle(ws3, 'HUD FAIR MARKET RENT');
  const fh = ws3.addRow(['Bedrooms', 'FMR']); fh.eachCell(c => { Object.assign(c, hdr); });
  for (const f of h2.fmrByBedroom) {
    const r = ws3.addRow([safeStr(f.label || f.bedrooms), safeNum(f.fmr ?? f.value)]);
    r.getCell(2).numFmt = '$#,##0';
  }
}
if (h2.priceTrend?.length) {
  sectionTitle(ws3, 'PRICE TREND (Zillow ZHVI)');
  const pth = ws3.addRow(['Month', 'Value']); pth.eachCell(c => { Object.assign(c, hdr); });
  for (const p of h2.priceTrend) {
    const r = ws3.addRow([safeStr(p.month || p.date), safeNum(p.v ?? p.value)]);
    r.getCell(2).numFmt = '$#,##0';
  }
}

/* ── 5. Permits ─────────────────────────────────────────────────── */
const ws4 = wb.addWorksheet('Permits');
ws4.columns = [{ width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }];
ws4.addRow([`Building Permits — ${scopeLabel(study, 'county')} (Census BPS)`]).font = { bold: true, size: 12 };
const ph = ws4.addRow(['Year', 'SF Units', 'MF Units', 'Total']);
ph.eachCell(c => { Object.assign(c, hdr); });
const sfArr = h2.permitsSF || []; const mfArr = h2.permitsMF || [];
const years = [...new Set([...sfArr.map(p => p.yr), ...mfArr.map(p => p.yr)])].sort();
for (const yr of years) {
  const sf = safeNum(sfArr.find(p => p.yr === yr)?.v, 0);
  const mf = safeNum(mfArr.find(p => p.yr === yr)?.v, 0);
  ws4.addRow([yr, sf, mf, sf + mf]);
}

/* ── 6. Competition ─────────────────────────────────────────────── */
const ws5 = wb.addWorksheet('Competition');
const cc = ['Name', 'Builder', 'Product', 'Plans', 'SF Low', 'SF High', 'Price Low', 'Price High', '$/SF', 'Lots Total', 'Lots Remain', 'Monthly Abs', 'HOA', 'School Dist'];
ws5.columns = cc.map(() => ({ width: 16 }));
const ch = ws5.addRow(cc); ch.eachCell(c => { Object.assign(c, hdr); });
for (const c of (study.competition?.communities || [])) {
  ws5.addRow([
    safeStr(c.name), safeStr(c.builder), safeStr(c.product),
    safeNum(c.plans), safeNum(c.sfLow), safeNum(c.sfHigh),
    safeNum(c.priceLow), safeNum(c.priceHigh), safeNum(c.psfAvg),
    safeNum(c.lotsTotal ?? c.totalLots), safeNum(c.lotsRemain ?? c.lotsRemaining),
    safeNum(c.monthlyAbs), safeNum(c.hoa), safeStr(c.schoolDist),
  ]);
}
if (study.competition?.builders?.length) {
  sectionTitle(ws5, 'ACTIVE BUILDERS');
  const bh = ws5.addRow(['Builder', 'Communities', 'Share %', 'Notes']); bh.eachCell(c => { Object.assign(c, hdr); });
  for (const b of study.competition.builders) {
    ws5.addRow([safeStr(b.name || b.builder), safeNum(b.communities ?? b.count), safeNum(b.share), safeStr(b.note || b.notes)]);
  }
}

/* ── 7. Absorption ──────────────────────────────────────────────── */
const ws6 = wb.addWorksheet('Absorption');
ws6.columns = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 14 }];
const abs = study.absorption || {};
ws6.addRow(['ABSORPTION SUMMARY']).font = { bold: true, size: 13 };
ws6.addRow(['Market-Wide Monthly', safeNum(abs.marketWideMonthly)]);
ws6.addRow(['Annual Closings', safeNum(abs.annualClosings)]);
ws6.addRow(['Demand Gap', safeNum(abs.demandGap)]);
ws6.addRow(['HH Formation/Year', safeNum(abs.hhFormationAnnual)]);
ws6.addRow(['New Supply/Year', safeNum(abs.newSupplyAnnual)]);
if (abs.byPriceBand?.length) {
  sectionTitle(ws6, 'BY PRICE BAND');
  const bh = ws6.addRow(['Band', 'Units', '%']); bh.eachCell(c => { Object.assign(c, hdr); });
  for (const b of abs.byPriceBand) {
    const r = ws6.addRow([safeStr(b.band), safeNum(b.units), safeNum(b.pct) / 100]);
    r.getCell(3).numFmt = '0.0%';
  }
}
if (abs.byCommunity?.length) {
  sectionTitle(ws6, 'BY COMMUNITY');
  const bch = ws6.addRow(['Community', 'Monthly Abs', 'Annual', 'Status']); bch.eachCell(c => { Object.assign(c, hdr); });
  for (const b of abs.byCommunity) {
    ws6.addRow([safeStr(b.name || b.community), safeNum(b.monthlyAbs ?? b.abs), safeNum(b.annualAbs ?? b.annual), safeStr(b.status)]);
  }
}
if (abs.selloutPace?.length) {
  sectionTitle(ws6, 'SELLOUT PACE');
  const sh = ws6.addRow(['Community', 'Remaining', 'Abs/Mo', 'Months']); sh.eachCell(c => { Object.assign(c, hdr); });
  for (const s of abs.selloutPace) ws6.addRow([safeStr(s.name), safeNum(s.remain), safeNum(s.abs), safeNum(s.months)]);
}
if (abs.seasonality?.length) {
  sectionTitle(ws6, 'SEASONALITY (MONTHLY INDEX, 100 = AVG)');
  const sh = ws6.addRow(['Month', 'Index', 'Note']); sh.eachCell(c => { Object.assign(c, hdr); });
  for (const s of abs.seasonality) ws6.addRow([safeStr(s.month), safeNum(s.index ?? s.v), safeStr(s.note)]);
}

/* ── 8. Pricing ─────────────────────────────────────────────────── */
const ws7 = wb.addWorksheet('Pricing');
ws7.columns = [{ width: 18 }, { width: 22 }, { width: 18 }, { width: 16 }, { width: 30 }];
if (study.pricing?.stratification?.length) {
  const prh = ws7.addRow(['Segment', 'Price Range', '$/SF Range', 'Share', 'Builders']);
  prh.eachCell(c => { Object.assign(c, hdr); });
  for (const s of study.pricing.stratification) {
    const r = ws7.addRow([safeStr(s.segment), safeStr(s.priceRange), safeStr(s.psfRange), safeNum(s.shareOfSales) / 100, safeStr(s.builders)]);
    r.getCell(4).numFmt = '0.0%';
  }
}
if (study.pricing?.psfByProduct?.length) {
  sectionTitle(ws7, 'PRICE PER SQUARE FOOT BY PRODUCT TYPE');
  const ph = ws7.addRow(['Product', '$/SF', 'Sample Size']); ph.eachCell(c => { Object.assign(c, hdr); });
  for (const p of study.pricing.psfByProduct) ws7.addRow([safeStr(p.type || p.product), safeNum(p.psf), safeNum(p.n)]);
}
if (study.pricing?.incentives?.length) {
  sectionTitle(ws7, 'ACTIVE INCENTIVES');
  const ih = ws7.addRow(['Builder', 'Type', 'Value', 'Note']); ih.eachCell(c => { Object.assign(c, hdr); });
  for (const inc of study.pricing.incentives) {
    ws7.addRow([safeStr(inc.builder), safeStr(inc.type), safeStr(inc.value), safeStr(inc.note)]);
  }
}
if (study.pricing?.affordability) {
  sectionTitle(ws7, 'AFFORDABILITY ANALYSIS');
  const aff = study.pricing.affordability;
  ws7.addRow(['Median HH Income', safeNum(aff.mhi)]).getCell(2).numFmt = '$#,##0';
  ws7.addRow(['Mortgage Rate', aff.mortgageRate ? aff.mortgageRate / 100 : null]).getCell(2).numFmt = '0.00%';
  ws7.addRow(['Max Affordable Price', safeNum(aff.maxAffordable)]).getCell(2).numFmt = '$#,##0';
  ws7.addRow(['Price-to-Income Ratio', safeNum(aff.priceToIncome)]).getCell(2).numFmt = '0.00';
  ws7.addRow(['PITI-to-Income Ratio', aff.pitiToIncome ? aff.pitiToIncome / 100 : null]).getCell(2).numFmt = '0.0%';
  ws7.addRow(['Buyer Pool (100% MHI)', safeNum(aff.buyerPool100)]);
  ws7.addRow(['Buyer Pool (125% MHI)', safeNum(aff.buyerPool125)]);
}

/* ── 9. Land Economics ──────────────────────────────────────────── */
const ws8 = wb.addWorksheet('Land');
ws8.columns = [{ width: 30 }, { width: 20 }, { width: 20 }];
const land = study.land || {};
ws8.addRow(['Lot-to-Home Ratio', land.lotToHomeRatio ? land.lotToHomeRatio / 100 : null]).getCell(2).numFmt = '0.0%';
ws8.addRow(['Est Finished Lot Value', safeNum(land.estFinishedLotValue)]).getCell(2).numFmt = '$#,##0';
ws8.addRow(['Raw Land Per Acre', safeNum(land.rawLandPerAcre)]).getCell(2).numFmt = '$#,##0';
ws8.addRow(['Est Site Dev Per Lot', safeNum(land.estSiteDev)]).getCell(2).numFmt = '$#,##0';
ws8.addRow(['Lot Inventory (months)', safeNum(land.lotInventoryMonths)]);
if (land.comps?.length) {
  sectionTitle(ws8, 'LAND COMPS');
  const lch = ws8.addRow(['Address', 'Acres', 'Ask Price', '$/Acre', 'Zoning', 'Status', 'Est Lots']);
  lch.eachCell(c => { Object.assign(c, hdr); });
  for (const c of land.comps) {
    ws8.addRow([safeStr(c.address), safeNum(c.acres), safeNum(c.askPrice), safeNum(c.perAcre), safeStr(c.zoning), safeStr(c.status), safeNum(c.estLots)]);
  }
}
if (land.devCostBreakdown?.length) {
  sectionTitle(ws8, 'DEVELOPMENT COST BREAKDOWN');
  const dch = ws8.addRow(['Item', 'Cost']); dch.eachCell(c => { Object.assign(c, hdr); });
  for (const dc of land.devCostBreakdown) ws8.addRow([safeStr(dc.item), safeNum(dc.cost)]).getCell(2).numFmt = '$#,##0';
}

/* ── 10. Proforma ───────────────────────────────────────────────── */
const ws9 = wb.addWorksheet('Proforma');
const scenarios = study.proforma?.scenarios || [];
ws9.columns = [{ width: 22 }, ...scenarios.map(() => ({ width: 18 }))];
const pfh = ws9.addRow(['Line Item', ...scenarios.map(s => safeStr(s.label))]);
pfh.eachCell(c => { Object.assign(c, hdr); });
const pfItems = [
  ['Avg Selling Price', 'asp'], ['Land/Lot', 'landLot'], ['Hard Cost', 'hardCost'],
  ['Soft Cost', 'softCost'], ['Selling', 'selling'], ['G&A', 'ga'],
  ['Financing', 'financing'], ['Total Cost', 'totalCost'],
  ['Margin ($)', 'margin'], ['Margin (%)', 'marginPct'],
];
for (const [label, key] of pfItems) {
  const row = ws9.addRow([label, ...scenarios.map(s => safeNum(s[key]))]);
  if (key === 'marginPct') row.eachCell((c, i) => { if (i > 1) c.numFmt = '0.0"%"'; });
  else row.eachCell((c, i) => { if (i > 1) c.numFmt = '$#,##0'; });
  if (key === 'margin' || key === 'marginPct') row.font = { bold: true };
}
if (study.proforma?.ppiTrend?.length) {
  sectionTitle(ws9, 'PRODUCER PRICE INDEX TREND (BLS PPI — CONSTRUCTION)');
  const th = ws9.addRow(['Year', 'Index', 'YoY']); th.eachCell(c => { Object.assign(c, hdr); });
  for (const p of study.proforma.ppiTrend) {
    const r = ws9.addRow([safeStr(p.yr || p.year), safeNum(p.index ?? p.v), safeNum(p.yoy) / 100]);
    r.getCell(3).numFmt = '0.0%';
  }
  if (study.proforma.ppiYoY != null) {
    ws9.addRow(['Latest YoY', null, safeNum(study.proforma.ppiYoY) / 100]).getCell(3).numFmt = '0.0%';
  }
}
if (study.proforma?.publicBenchmarks?.length) {
  sectionTitle(ws9, 'PUBLIC BUILDER BENCHMARKS (SEC EDGAR)');
  const bmh = ws9.addRow(['Builder', 'Gross Margin', 'ASP', 'Cancel Rate']);
  bmh.eachCell(c => { Object.assign(c, hdr); });
  for (const b of study.proforma.publicBenchmarks) {
    const r = ws9.addRow([safeStr(b.builder), safeNum(b.grossMargin) / 100, safeNum(b.asp), safeNum(b.cancelRate) / 100]);
    r.getCell(2).numFmt = '0.0%'; r.getCell(3).numFmt = '$#,##0'; r.getCell(4).numFmt = '0.0%';
  }
}

/* ── 11. Regulatory ─────────────────────────────────────────────── */
const ws10 = wb.addWorksheet('Regulatory');
ws10.columns = [{ width: 28 }, { width: 22 }, { width: 40 }];
const reg = study.regulatory || {};
ws10.addRow(['Zoning', safeStr(reg.zoning)]);
ws10.addRow(['Max Density', safeStr(reg.maxDensity)]);
ws10.addRow(['Entitlement Timeline', safeStr(reg.entitlementTimeline)]);
ws10.addRow(['Total Fees/Unit', safeNum(reg.totalFeesPerUnit)]).getCell(2).numFmt = '$#,##0';
if (reg.fees?.length) {
  sectionTitle(ws10, 'FEES');
  const fh2 = ws10.addRow(['Fee', 'Amount', 'Note']); fh2.eachCell(c => { Object.assign(c, hdr); });
  for (const f of reg.fees) ws10.addRow([safeStr(f.fee), safeNum(f.amount), safeStr(f.note)]).getCell(2).numFmt = '$#,##0';
}
if (reg.utilities?.length) {
  sectionTitle(ws10, 'UTILITIES');
  const uh = ws10.addRow(['Utility', 'Provider', 'Status', 'Note']); uh.eachCell(c => { Object.assign(c, hdr); });
  for (const u of reg.utilities) ws10.addRow([safeStr(u.utility), safeStr(u.provider), safeStr(u.status), safeStr(u.note)]);
}
if (reg.schoolDistrict) {
  sectionTitle(ws10, 'SCHOOL DISTRICT');
  const sd = reg.schoolDistrict;
  ws10.addRow(['Name', safeStr(sd.name)]);
  ws10.addRow(['Rating', safeStr(sd.rating)]);
  ws10.addRow(['Enrollment', safeNum(sd.enrollment)]);
  ws10.addRow(['Trend', safeStr(sd.trend)]);
  if (sd.note) ws10.addRow(['Note', safeStr(sd.note)]);
}

/* ── 12. SWOT ───────────────────────────────────────────────────── */
const ws11 = wb.addWorksheet('SWOT');
ws11.columns = [{ width: 16 }, { width: 70 }];
const swot = study.swot || {};
for (const cat of ['strengths', 'weaknesses', 'opportunities', 'threats']) {
  ws11.addRow([cat.charAt(0).toUpperCase() + cat.slice(1)]).font = { bold: true };
  for (const item of (swot[cat] || [])) ws11.addRow(['', safeStr(item)]);
  ws11.addRow([]);
}

/* ── 13. Sources ────────────────────────────────────────────────── */
const ws12 = wb.addWorksheet('Sources');
ws12.columns = [{ width: 20 }, { width: 32 }, { width: 60 }];
const srh = ws12.addRow(['Category', 'Source', 'Details']); srh.eachCell(c => { Object.assign(c, hdr); });
const allSources = collectSources(study);
for (const src of allSources) ws12.addRow([src.category, src.name, src.detail]);

const fileName = `infinity-markets-${(study.targetArea || 'data').replace(/\s+/g, '-')}-${Date.now()}.xlsx`;
const filePath = path.join(os.tmpdir(), fileName);
await wb.xlsx.writeFile(filePath);
await uploadAndRespond(res, filePath, fileName,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', req.app.locals.supabase);
}

module.exports = { generateXLSX };
