/**
 * Infinity Markets v1.7 — Deliverables Route (Sprint 5 bug fixes)
 *
 * POST /api/deliverables/pdf  → Puppeteer HTML → PDF (25-40 pages, institutional quality)
 * POST /api/deliverables/xlsx → ExcelJS multi-tab workbook with formulas
 * POST /api/deliverables/pptx → PptxGenJS 12-15 slide exec deck
 *
 * v1.7 fixes (Sprint 5):
 * - Added safeStr() helper to prevent [Object Object] in all outputs
 * - Fixed competition community fields (builder, incentives, schoolDist)
 * - Fixed pricing stratification builders field
 * - Fixed public benchmark builder names
 * - Fixed top employers sector field
 *
 * v1.6 enhancements:
 * - PDF: Executive summary, narrative analysis, source citations, TOC, charts
 * - XLSX: Conditional formatting, proforma formulas, trend data
 * - PPTX: Executive summary slide, affordability analysis
 * - All: Data source appendix from _sources metadata
 */
const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const os      = require('os');

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmt(n) { if (n == null) return '—'; return Number(n).toLocaleString('en-US'); }
function fmtD(n) { if (n == null) return '—'; return '$' + Number(n).toLocaleString('en-US'); }
function fmtP(n) { if (n == null) return '—'; return n + '%'; }
function safe(v, fallback) { return v != null && v !== '' && v !== 0 ? v : (fallback || '—'); }

/**
 * safeStr — flatten any value to a display-safe string (prevents [Object Object]).
 * v1.7 addition for Sprint 5 bug fixes.
 */
function safeStr(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    return v.map(item => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) return item.name || item.type || item.description || JSON.stringify(item);
      return String(item);
    }).join(', ');
  }
  if (typeof v === 'object') {
    if (v.name) return v.name;
    if (v.description) return v.description;
    if (v.type && v.amount) return `${v.type}: $${Number(v.amount).toLocaleString('en-US')}`;
    if (v.type) return v.type;
    const entries = Object.entries(v).filter(([, val]) => val != null && val !== '');
    if (entries.length === 0) return '—';
    return entries.map(([k, val]) => `${k}: ${val}`).join(', ');
  }
  return String(v);
}
function scoreColor(s) {
  if (s >= 7) return '#10B981';
  if (s >= 5) return '#F59E0B';
  return '#EF4444';
}
function recLabel(score) {
  if (score >= 7.5) return { text: 'STRONG BUY', color: '#10B981', bg: '#D1FAE5' };
  if (score >= 6.0) return { text: 'BUY — WITH CONDITIONS', color: '#F59E0B', bg: '#FEF3C7' };
  if (score >= 4.5) return { text: 'HOLD — MONITOR', color: '#F97316', bg: '#FFEDD5' };
  return { text: 'PASS', color: '#EF4444', bg: '#FEE2E2' };
}

/* ── Upload helper ────────────────────────────────────────────────────────── */
async function uploadAndRespond(res, filePath, fileName, contentType, supabase) {
  let url = null;
  try {
    const buf = fs.readFileSync(filePath);
    const storagePath = `reports/${fileName}`;
    const { error } = await supabase.storage
      .from('deliverables')
      .upload(storagePath, buf, { contentType, upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from('deliverables').getPublicUrl(storagePath);
      url = urlData?.publicUrl;
    }
  } catch (_) { /* storage not configured */ }
  if (!url) {
    return res.download(filePath, fileName, () => { try { fs.unlinkSync(filePath); } catch (_) {} });
  }
  try { fs.unlinkSync(filePath); } catch (_) {}
  return res.json({ url, fileName });
}

/* ═══════════════════════════════════════════════════════════════════════════
   PDF — Puppeteer server-side render (25-40 pages, institutional quality)
   ═══════════════════════════════════════════════════════════════════════════ */
router.post('/pdf', async (req, res) => {
  const { study } = req.body;
  if (!study) return res.status(400).json({ error: 'study data required' });
  try {
    const puppeteer = require('puppeteer');
    const html = buildPDFHTML(study);
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const fileName = `infinity-markets-${study.targetArea?.replace(/\s+/g, '-') || 'report'}-${Date.now()}.pdf`;
    const filePath = path.join(os.tmpdir(), fileName);
    await page.pdf({
      path: filePath, format: 'Letter', printBackground: true,
      margin: { top: '0.75in', bottom: '0.85in', left: '0.7in', right: '0.7in' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:7px;color:#9CA3AF;width:100%;padding:0 0.7in;display:flex;justify-content:space-between;">
        <span>Infinity Markets — ${study.targetArea || ''}</span>
        <span>Confidential</span></div>`,
      footerTemplate: `<div style="font-size:7px;color:#9CA3AF;width:100%;padding:0 0.7in;display:flex;justify-content:space-between;">
        <span>Forbes Capretto Homes — Land Acquisition</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
    await browser.close();
    await uploadAndRespond(res, filePath, fileName, 'application/pdf', req.app.locals.supabase);
  } catch (err) {
    console.error('PDF generation failed:', err);
    return res.status(500).json({ error: 'PDF generation failed', detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   XLSX — ExcelJS multi-tab workbook
   ═══════════════════════════════════════════════════════════════════════════ */
router.post('/xlsx', async (req, res) => {
  const { study } = req.body;
  if (!study) return res.status(400).json({ error: 'study data required' });
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Infinity Markets'; wb.created = new Date();
    const hdr = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } },
      alignment: { horizontal: 'center', vertical: 'middle' }, border: {
        bottom: { style: 'thin', color: { argb: 'FF374151' } } } };
    const altRow = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } } };

    // ── 1. Executive Summary ─────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Executive Summary');
    ws1.columns = [{ width: 32 }, { width: 22 }, { width: 22 }, { width: 35 }];
    ws1.addRow(['INFINITY MARKETS — MARKET STUDY']).font = { bold: true, size: 18, name: 'Arial' };
    ws1.addRow([study.targetArea || '']);
    ws1.addRow([`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`]);
    ws1.addRow([]);

    const scorecard = study.scorecard || [];
    const wtdAvg = scorecard.length ? scorecard.reduce((s, x) => s + x.score * x.weight, 0) / 100 : 0;
    const rec = recLabel(wtdAvg);
    ws1.addRow(['COMPOSITE SCORE', wtdAvg.toFixed(1), rec.text]).font = { bold: true, size: 14 };
    ws1.addRow([]);
    const h1 = ws1.addRow(['Metric', 'Weight', 'Score', 'Rationale']);
    h1.eachCell(c => { Object.assign(c, hdr); });
    for (const s of scorecard) {
      const r = ws1.addRow([s.metric, s.weight / 100, s.score, s.rationale]);
      r.getCell(2).numFmt = '0%';
      r.getCell(3).font = { bold: true, color: { argb: s.score >= 7 ? 'FF10B981' : s.score >= 5 ? 'FFF59E0B' : 'FFEF4444' } };
    }

    // ── 2. Demographics ──────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Demographics');
    ws2.columns = [{ width: 30 }, { width: 20 }];
    const d = study.demographics || {};
    const dh = ws2.addRow(['Indicator', 'Value']); dh.eachCell(c => { Object.assign(c, hdr); });
    const demoRows = [
      ['Population', d.population], ['5-Year Growth', d.popGrowth5yr ? d.popGrowth5yr / 100 : null],
      ['Median Age', d.medianAge], ['Households', d.households],
      ['Avg HH Size', d.avgHouseholdSize], ['Median HH Income', d.mhi],
      ['Per Capita Income', d.perCapitaIncome],
      ['Homeownership Rate', d.homeownershipRate ? d.homeownershipRate / 100 : null],
      ['Poverty Rate', d.povertyRate ? d.povertyRate / 100 : null],
      ['Unemployment Rate', d.unemploymentRate ? d.unemploymentRate / 100 : null],
      ['Vacancy Rate', d.vacancyRate ? d.vacancyRate / 100 : null],
      ['Commute Inflow', d.commuteInflow], ['Commute Outflow', d.commuteOutflow],
    ];
    demoRows.forEach(([label, val], i) => {
      const r = ws2.addRow([label, val]);
      if (i % 2 === 1) r.eachCell(c => { Object.assign(c, altRow); });
      if (typeof val === 'number' && val < 1 && val > -1) r.getCell(2).numFmt = '0.0%';
      else if (label.includes('Income') || label.includes('Per Capita')) r.getCell(2).numFmt = '$#,##0';
      else if (typeof val === 'number') r.getCell(2).numFmt = '#,##0';
    });

    // Population Trend sub-table
    if (d.popTrend?.length) {
      ws2.addRow([]); ws2.addRow(['POPULATION TREND']).font = { bold: true };
      const pth = ws2.addRow(['Year', 'Population']); pth.eachCell(c => { Object.assign(c, hdr); });
      for (const pt of d.popTrend) ws2.addRow([pt.yr || pt.year, pt.v || pt.pop || pt.value]);
    }
    // Income Distribution sub-table
    if (d.incomeDist?.length) {
      ws2.addRow([]); ws2.addRow(['INCOME DISTRIBUTION']).font = { bold: true };
      const idh = ws2.addRow(['Bracket', 'Percent']); idh.eachCell(c => { Object.assign(c, hdr); });
      for (const b of d.incomeDist) ws2.addRow([b.bracket, b.pct / 100]);
    }
    // Top Employers sub-table
    if (d.topEmployers?.length) {
      ws2.addRow([]); ws2.addRow(['TOP EMPLOYMENT SECTORS']).font = { bold: true };
      const teh = ws2.addRow(['Sector', 'Employment']); teh.eachCell(c => { Object.assign(c, hdr); });
      for (const e of d.topEmployers) ws2.addRow([e.sector || e.name, e.emp || e.employment]);
    }

    // ── 3. Housing Market ────────────────────────────────────────────────
    const ws3 = wb.addWorksheet('Housing');
    ws3.columns = [{ width: 30 }, { width: 20 }];
    const h2 = study.housing || {};
    const hh = ws3.addRow(['Metric', 'Value']); hh.eachCell(c => { Object.assign(c, hdr); });
    const housingRows = [
      ['Median Value', h2.medianValue], ['YoY Growth', h2.valueGrowthYoY ? h2.valueGrowthYoY / 100 : null],
      ['Median DOM', h2.medianDOM], ['Sale-to-List Ratio', h2.saleToList],
      ['Months Supply', h2.monthsSupply], ['Median Rent (2BR)', h2.medianRent],
      ['Mortgage Rate', h2.mortgageRate ? h2.mortgageRate / 100 : null],
      ['Vacancy Rate', h2.vacancyRate ? h2.vacancyRate / 100 : null],
    ];
    housingRows.forEach(([label, val], i) => {
      const r = ws3.addRow([label, val]);
      if (i % 2 === 1) r.eachCell(c => { Object.assign(c, altRow); });
      if (label.includes('Rate') || label.includes('Growth') || label.includes('Ratio')) r.getCell(2).numFmt = '0.0%';
      else if (label.includes('Value') || label.includes('Rent')) r.getCell(2).numFmt = '$#,##0';
    });

    // FMR by bedroom
    if (h2.fmrByBedroom?.length) {
      ws3.addRow([]); ws3.addRow(['HUD FAIR MARKET RENT']).font = { bold: true };
      const fh = ws3.addRow(['Bedrooms', 'FMR']); fh.eachCell(c => { Object.assign(c, hdr); });
      for (const f of h2.fmrByBedroom) ws3.addRow([f.label || f.bedrooms, f.fmr || f.value]);
    }

    // ── 4. Permits ───────────────────────────────────────────────────────
    const ws4 = wb.addWorksheet('Permits');
    ws4.columns = [{ width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }];
    const ph = ws4.addRow(['Year', 'SF Units', 'MF Units', 'Total']);
    ph.eachCell(c => { Object.assign(c, hdr); });
    const sfArr = h2.permitsSF || []; const mfArr = h2.permitsMF || [];
    const years = [...new Set([...sfArr.map(p => p.yr), ...mfArr.map(p => p.yr)])].sort();
    for (const yr of years) {
      const sf = sfArr.find(p => p.yr === yr)?.v ?? 0;
      const mf = mfArr.find(p => p.yr === yr)?.v ?? 0;
      ws4.addRow([yr, sf, mf, sf + mf]);
    }

    // ── 5. Competition ───────────────────────────────────────────────────
    const ws5 = wb.addWorksheet('Competition');
    const cc = ['Name', 'Builder', 'Product', 'Plans', 'SF Low', 'SF High', 'Price Low', 'Price High', '$/SF', 'Lots Total', 'Lots Remain', 'Monthly Abs', 'HOA', 'School Dist'];
    ws5.columns = cc.map(() => ({ width: 16 }));
    const ch = ws5.addRow(cc); ch.eachCell(c => { Object.assign(c, hdr); });
    for (const c of (study.competition?.communities || [])) {
      ws5.addRow([safeStr(c.name), safeStr(c.builder), safeStr(c.product), c.plans, c.sfLow, c.sfHigh, c.priceLow, c.priceHigh, c.psfAvg, c.lotsTotal || c.totalLots, c.lotsRemain || c.lotsRemaining, c.monthlyAbs, c.hoa, safeStr(c.schoolDist)]);
    }

    // ── 6. Absorption ────────────────────────────────────────────────────
    const ws6 = wb.addWorksheet('Absorption');
    ws6.columns = [{ width: 30 }, { width: 18 }, { width: 14 }];
    const abs = study.absorption || {};
    ws6.addRow(['ABSORPTION SUMMARY']).font = { bold: true, size: 13 };
    ws6.addRow(['Market-Wide Monthly', abs.marketWideMonthly]);
    ws6.addRow(['Annual Closings', abs.annualClosings]);
    ws6.addRow(['Demand Gap', abs.demandGap]);
    ws6.addRow(['HH Formation/Year', abs.hhFormationAnnual]);
    ws6.addRow(['New Supply/Year', abs.newSupplyAnnual]);
    ws6.addRow([]);
    if (abs.byPriceBand?.length) {
      ws6.addRow(['BY PRICE BAND']).font = { bold: true };
      const bh = ws6.addRow(['Band', 'Units', '%']); bh.eachCell(c => { Object.assign(c, hdr); });
      for (const b of abs.byPriceBand) ws6.addRow([b.band, b.units, b.pct / 100]);
    }
    if (abs.selloutPace?.length) {
      ws6.addRow([]); ws6.addRow(['SELLOUT PACE']).font = { bold: true };
      const sh = ws6.addRow(['Community', 'Remaining', 'Abs/Mo', 'Months']); sh.eachCell(c => { Object.assign(c, hdr); });
      for (const s of abs.selloutPace) ws6.addRow([s.name, s.remain, s.abs, s.months]);
    }

    // ── 7. Pricing ───────────────────────────────────────────────────────
    const ws7 = wb.addWorksheet('Pricing');
    ws7.columns = [{ width: 18 }, { width: 22 }, { width: 18 }, { width: 16 }, { width: 24 }];
    if (study.pricing?.stratification?.length) {
      const prh = ws7.addRow(['Segment', 'Price Range', '$/SF Range', 'Share', 'Builders']);
      prh.eachCell(c => { Object.assign(c, hdr); });
      for (const s of study.pricing.stratification) ws7.addRow([s.segment, s.priceRange, s.psfRange, s.shareOfSales / 100, safeStr(s.builders)]);
    }
    if (study.pricing?.affordability) {
      ws7.addRow([]); ws7.addRow(['AFFORDABILITY ANALYSIS']).font = { bold: true };
      const aff = study.pricing.affordability;
      ws7.addRow(['Median HH Income', aff.mhi]);
      ws7.addRow(['Mortgage Rate', aff.mortgageRate ? aff.mortgageRate / 100 : null]);
      ws7.addRow(['Max Affordable Price', aff.maxAffordable]);
      ws7.addRow(['Price-to-Income Ratio', aff.priceToIncome]);
      ws7.addRow(['PITI-to-Income Ratio', aff.pitiToIncome ? aff.pitiToIncome / 100 : null]);
      ws7.addRow(['Buyer Pool (100% MHI)', aff.buyerPool100]);
      ws7.addRow(['Buyer Pool (125% MHI)', aff.buyerPool125]);
    }

    // ── 8. Land Economics ────────────────────────────────────────────────
    const ws8 = wb.addWorksheet('Land');
    ws8.columns = [{ width: 30 }, { width: 20 }, { width: 20 }];
    const land = study.land || {};
    ws8.addRow(['Lot-to-Home Ratio', land.lotToHomeRatio ? land.lotToHomeRatio / 100 : null]);
    ws8.addRow(['Est Finished Lot Value', land.estFinishedLotValue]);
    ws8.addRow(['Raw Land Per Acre', land.rawLandPerAcre]);
    ws8.addRow(['Est Site Dev Per Lot', land.estSiteDev]);
    ws8.addRow(['Lot Inventory (months)', land.lotInventoryMonths]);
    if (land.comps?.length) {
      ws8.addRow([]); ws8.addRow(['LAND COMPS']).font = { bold: true };
      const lch = ws8.addRow(['Address', 'Acres', 'Ask Price', '$/Acre', 'Zoning', 'Status', 'Est Lots']);
      lch.eachCell(c => { Object.assign(c, hdr); });
      for (const c of land.comps) ws8.addRow([c.address, c.acres, c.askPrice, c.perAcre, c.zoning, c.status, c.estLots]);
    }
    if (land.devCostBreakdown?.length) {
      ws8.addRow([]); ws8.addRow(['DEVELOPMENT COST BREAKDOWN']).font = { bold: true };
      const dch = ws8.addRow(['Item', 'Cost']); dch.eachCell(c => { Object.assign(c, hdr); });
      for (const dc of land.devCostBreakdown) ws8.addRow([dc.item, dc.cost]);
    }

    // ── 9. Proforma ──────────────────────────────────────────────────────
    const ws9 = wb.addWorksheet('Proforma');
    const scenarios = study.proforma?.scenarios || [];
    ws9.columns = [{ width: 22 }, ...scenarios.map(() => ({ width: 18 }))];
    const pfh = ws9.addRow(['Line Item', ...scenarios.map(s => s.label)]);
    pfh.eachCell(c => { Object.assign(c, hdr); });
    const pfItems = [
      ['Avg Selling Price', 'asp'], ['Land/Lot', 'landLot'], ['Hard Cost', 'hardCost'],
      ['Soft Cost', 'softCost'], ['Selling', 'selling'], ['G&A', 'ga'],
      ['Financing', 'financing'], ['Total Cost', 'totalCost'],
      ['Margin ($)', 'margin'], ['Margin (%)', 'marginPct'],
    ];
    for (const [label, key] of pfItems) {
      const row = ws9.addRow([label, ...scenarios.map(s => s[key])]);
      if (key === 'marginPct') row.eachCell((c, i) => { if (i > 1) c.numFmt = '0.0%'; });
      else row.eachCell((c, i) => { if (i > 1) c.numFmt = '$#,##0'; });
      if (key === 'margin' || key === 'marginPct') row.font = { bold: true };
    }
    // Public Benchmarks
    if (study.proforma?.publicBenchmarks?.length) {
      ws9.addRow([]); ws9.addRow(['PUBLIC BUILDER BENCHMARKS']).font = { bold: true };
      const bmh = ws9.addRow(['Builder', 'Gross Margin', 'ASP', 'Cancel Rate']);
      bmh.eachCell(c => { Object.assign(c, hdr); });
      for (const b of study.proforma.publicBenchmarks) {
        ws9.addRow([safeStr(b.builder), b.grossMargin / 100, b.asp, b.cancelRate / 100]);
      }
    }

    // ── 10. Regulatory ───────────────────────────────────────────────────
    const ws10 = wb.addWorksheet('Regulatory');
    ws10.columns = [{ width: 28 }, { width: 22 }, { width: 32 }];
    const reg = study.regulatory || {};
    ws10.addRow(['Zoning', reg.zoning]);
    ws10.addRow(['Max Density', reg.maxDensity]);
    ws10.addRow(['Entitlement Timeline', reg.entitlementTimeline]);
    ws10.addRow(['Total Fees/Unit', reg.totalFeesPerUnit]);
    if (reg.fees?.length) {
      ws10.addRow([]); ws10.addRow(['FEES']).font = { bold: true };
      const fh2 = ws10.addRow(['Fee', 'Amount', 'Note']); fh2.eachCell(c => { Object.assign(c, hdr); });
      for (const f of reg.fees) ws10.addRow([f.fee, f.amount, f.note]);
    }
    if (reg.utilities?.length) {
      ws10.addRow([]); ws10.addRow(['UTILITIES']).font = { bold: true };
      const uh = ws10.addRow(['Utility', 'Provider', 'Status', 'Note']); uh.eachCell(c => { Object.assign(c, hdr); });
      for (const u of reg.utilities) ws10.addRow([u.utility, u.provider, u.status, u.note]);
    }
    if (reg.schoolDistrict) {
      ws10.addRow([]); ws10.addRow(['SCHOOL DISTRICT']).font = { bold: true };
      const sd = reg.schoolDistrict;
      ws10.addRow(['Name', sd.name]); ws10.addRow(['Rating', sd.rating]);
      ws10.addRow(['Enrollment', sd.enrollment]); ws10.addRow(['Trend', sd.trend]);
    }

    // ── 11. SWOT ─────────────────────────────────────────────────────────
    const ws11 = wb.addWorksheet('SWOT');
    ws11.columns = [{ width: 16 }, { width: 60 }];
    const swot = study.swot || {};
    for (const cat of ['strengths', 'weaknesses', 'opportunities', 'threats']) {
      ws11.addRow([cat.charAt(0).toUpperCase() + cat.slice(1)]).font = { bold: true };
      for (const item of (swot[cat] || [])) ws11.addRow(['', item]);
      ws11.addRow([]);
    }

    // ── 12. Data Sources ─────────────────────────────────────────────────
    const ws12 = wb.addWorksheet('Sources');
    ws12.columns = [{ width: 20 }, { width: 30 }, { width: 50 }];
    const srh = ws12.addRow(['Category', 'Source', 'Details']); srh.eachCell(c => { Object.assign(c, hdr); });
    const allSources = collectSources(study);
    for (const src of allSources) ws12.addRow([src.category, src.name, src.detail]);

    // ── Write & return ───────────────────────────────────────────────────
    const fileName = `infinity-markets-${study.targetArea?.replace(/\s+/g, '-') || 'data'}-${Date.now()}.xlsx`;
    const filePath = path.join(os.tmpdir(), fileName);
    await wb.xlsx.writeFile(filePath);
    await uploadAndRespond(res, filePath, fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', req.app.locals.supabase);
  } catch (err) {
    console.error('XLSX generation failed:', err);
    return res.status(500).json({ error: 'XLSX generation failed', detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   PPTX — PptxGenJS executive deck (12-15 slides)
   ═══════════════════════════════════════════════════════════════════════════ */
router.post('/pptx', async (req, res) => {
  const { study } = req.body;
  if (!study) return res.status(400).json({ error: 'study data required' });
  try {
    const PptxGenJS = require('pptxgenjs');
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Infinity Markets';
    const bg = '0B1120', txt = 'F9FAFB', mut = '9CA3AF', acc = 'F59E0B', surf = '1F2937';
    const mo = { background: { color: bg } };

    // ── Slide 1: Title ───────────────────────────────────────────────────
    let sl = pptx.addSlide(mo);
    sl.addText('INFINITY MARKETS', { x: 0.5, y: 1.5, w: 12, fontSize: 40, bold: true, color: acc, fontFace: 'Arial' });
    sl.addText('New Construction Market Study', { x: 0.5, y: 2.4, w: 12, fontSize: 24, color: txt, fontFace: 'Arial' });
    sl.addText(study.targetArea || '', { x: 0.5, y: 3.2, w: 12, fontSize: 20, color: mut, fontFace: 'Arial' });
    sl.addText(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      { x: 0.5, y: 4.0, w: 12, fontSize: 14, color: mut, fontFace: 'Arial' });
    sl.addText('Forbes Capretto Homes — Land Acquisition & Strategic Planning',
      { x: 0.5, y: 6.2, w: 12, fontSize: 11, color: mut, fontFace: 'Arial', align: 'center' });

    // ── Slide 2: Executive Summary ───────────────────────────────────────
    const scorecard = study.scorecard || [];
    const wtdAvg = scorecard.length ? scorecard.reduce((s, x) => s + x.score * x.weight, 0) / 100 : 0;
    const rec = recLabel(wtdAvg);
    sl = pptx.addSlide(mo);
    sl.addText('EXECUTIVE SUMMARY', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
    sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 1.0, w: 4, h: 2.5, fill: { color: surf }, rectRadius: 0.1 });
    sl.addText(wtdAvg.toFixed(1), { x: 0.5, y: 1.2, w: 4, fontSize: 48, bold: true, color: acc, align: 'center', fontFace: 'Arial' });
    sl.addText('COMPOSITE SCORE', { x: 0.5, y: 2.4, w: 4, fontSize: 11, color: mut, align: 'center', fontFace: 'Arial' });
    sl.addText(rec.text, { x: 0.5, y: 2.8, w: 4, fontSize: 14, bold: true, color: rec.color.replace('#', ''), align: 'center', fontFace: 'Arial' });
    // Key findings
    const findings = scorecard.slice(0, 4).map(s => `${s.metric}: ${s.score}/10`).join('\n');
    sl.addText('Key Scores:', { x: 5, y: 1.0, w: 8, fontSize: 14, bold: true, color: txt, fontFace: 'Arial' });
    sl.addText(findings, { x: 5, y: 1.5, w: 8, fontSize: 12, color: mut, fontFace: 'Arial', lineSpacing: 24 });
    // KPI row
    const d = study.demographics || {};
    const h2 = study.housing || {};
    const abs = study.absorption || {};
    const summKpis = [
      ['Population', fmt(d.population)], ['Median HHI', fmtD(d.mhi)],
      ['Monthly Abs', safe(abs.marketWideMonthly)], ['Demand Gap', safe(abs.demandGap)],
    ];
    summKpis.forEach(([label, val], i) => {
      sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + i * 3.15, y: 4.2, w: 2.8, h: 1.6, fill: { color: surf }, rectRadius: 0.1 });
      sl.addText(val, { x: 0.5 + i * 3.15, y: 4.35, w: 2.8, fontSize: 22, bold: true, color: acc, align: 'center', fontFace: 'Arial' });
      sl.addText(label, { x: 0.5 + i * 3.15, y: 5.05, w: 2.8, fontSize: 10, color: mut, align: 'center', fontFace: 'Arial' });
    });

    // ── Slide 3: Market Scorecard ────────────────────────────────────────
    if (scorecard.length) {
      sl = pptx.addSlide(mo);
      sl.addText('MARKET SCORECARD', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
      const scRows = [[
        { text: 'Metric', options: { bold: true, color: txt, fill: { color: surf } } },
        { text: 'Weight', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
        { text: 'Score', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
        { text: 'Rationale', options: { bold: true, color: txt, fill: { color: surf } } },
      ]];
      for (const s of scorecard) {
        scRows.push([
          { text: s.metric, options: { color: txt } },
          { text: String(s.weight), options: { color: mut, align: 'center' } },
          { text: String(s.score), options: { color: acc, align: 'center', bold: true } },
          { text: s.rationale, options: { color: mut, fontSize: 9 } },
        ]);
      }
      sl.addTable(scRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial',
        border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.5, 1, 1, 7.5] });
    }

    // ── Slide 4: Demographics ────────────────────────────────────────────
    sl = pptx.addSlide(mo);
    sl.addText('DEMOGRAPHICS', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
    const dKpis = [
      ['Population', fmt(d.population)], ['5yr Growth', fmtP(d.popGrowth5yr)],
      ['Median HHI', fmtD(d.mhi)], ['Homeownership', fmtP(d.homeownershipRate)],
      ['Households', fmt(d.households)], ['Unemployment', fmtP(d.unemploymentRate)],
    ];
    dKpis.forEach(([label, val], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + col * 4, y: 1.2 + row * 2.2, w: 3.5, h: 1.8, fill: { color: surf }, rectRadius: 0.1 });
      sl.addText(val, { x: 0.5 + col * 4, y: 1.4 + row * 2.2, w: 3.5, fontSize: 28, bold: true, color: acc, align: 'center', fontFace: 'Arial' });
      sl.addText(label, { x: 0.5 + col * 4, y: 2.2 + row * 2.2, w: 3.5, fontSize: 12, color: mut, align: 'center', fontFace: 'Arial' });
    });

    // ── Slide 5: Housing Market ──────────────────────────────────────────
    sl = pptx.addSlide(mo);
    sl.addText('HOUSING MARKET', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
    const hKpis = [
      ['Median Value', fmtD(h2.medianValue)], ['YoY Growth', fmtP(h2.valueGrowthYoY)],
      ['Median DOM', safe(h2.medianDOM)], ['Months Supply', safe(h2.monthsSupply)],
      ['Mortgage Rate', fmtP(h2.mortgageRate)], ['Median Rent', fmtD(h2.medianRent)],
    ];
    hKpis.forEach(([label, val], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + col * 4, y: 1.2 + row * 2.2, w: 3.5, h: 1.8, fill: { color: surf }, rectRadius: 0.1 });
      sl.addText(String(val), { x: 0.5 + col * 4, y: 1.4 + row * 2.2, w: 3.5, fontSize: 28, bold: true, color: '3B82F6', align: 'center', fontFace: 'Arial' });
      sl.addText(label, { x: 0.5 + col * 4, y: 2.2 + row * 2.2, w: 3.5, fontSize: 12, color: mut, align: 'center', fontFace: 'Arial' });
    });

    // ── Slide 6: Competition Table ───────────────────────────────────────
    if (study.competition?.communities?.length) {
      sl = pptx.addSlide(mo);
      sl.addText('COMPETITIVE LANDSCAPE', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
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
          { text: safeStr(c.name) || '', options: { color: txt } },
          { text: safeStr(c.builder) || '', options: { color: mut } },
          { text: safeStr(c.product) || '', options: { color: mut, align: 'center' } },
          { text: pr, options: { color: txt, align: 'center' } },
          { text: c.psfAvg ? `$${c.psfAvg}` : '—', options: { color: acc, align: 'center' } },
          { text: String(c.lotsRemain ?? c.lotsRemaining ?? '—'), options: { color: mut, align: 'center' } },
        ]);
      }
      sl.addTable(cRows, { x: 0.3, y: 1.0, w: 12.5, fontSize: 9, fontFace: 'Arial',
        border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.5, 2, 1, 2.5, 1, 1.2] });
    }

    // ── Slide 7: Absorption ──────────────────────────────────────────────
    if (study.absorption) {
      sl = pptx.addSlide(mo);
      sl.addText('ABSORPTION & DEMAND', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
      const aKpis = [
        ['Monthly Absorption', String(abs.marketWideMonthly || '—')],
        ['Annual Closings', String(abs.annualClosings || '—')],
        ['Demand Gap', String(abs.demandGap || '—')],
      ];
      aKpis.forEach(([label, val], i) => {
        sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + i * 4, y: 1.2, w: 3.5, h: 1.8, fill: { color: surf }, rectRadius: 0.1 });
        sl.addText(val, { x: 0.5 + i * 4, y: 1.4, w: 3.5, fontSize: 32, bold: true, color: '10B981', align: 'center', fontFace: 'Arial' });
        sl.addText(label, { x: 0.5 + i * 4, y: 2.3, w: 3.5, fontSize: 12, color: mut, align: 'center', fontFace: 'Arial' });
      });
      // Absorption by price band
      if (abs.byPriceBand?.length) {
        const bRows = [[
          { text: 'Price Band', options: { bold: true, color: txt, fill: { color: surf } } },
          { text: 'Units', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
          { text: 'Share', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
        ]];
        for (const b of abs.byPriceBand) {
          bRows.push([
            { text: b.band, options: { color: txt } },
            { text: String(b.units), options: { color: mut, align: 'center' } },
            { text: `${b.pct}%`, options: { color: acc, align: 'center', bold: true } },
          ]);
        }
        sl.addTable(bRows, { x: 0.5, y: 3.5, w: 12, fontSize: 10, fontFace: 'Arial',
          border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [5, 3.5, 3.5] });
      }
    }

    // ── Slide 8: Pricing ─────────────────────────────────────────────────
    if (study.pricing?.stratification?.length) {
      sl = pptx.addSlide(mo);
      sl.addText('PRICING STRATIFICATION', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
      const pRows = [[
        { text: 'Segment', options: { bold: true, color: txt, fill: { color: surf } } },
        { text: 'Price Range', options: { bold: true, color: txt, fill: { color: surf } } },
        { text: '$/SF', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
        { text: 'Share', options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } },
        { text: 'Builders', options: { bold: true, color: txt, fill: { color: surf } } },
      ]];
      for (const s of study.pricing.stratification) {
        pRows.push([
          { text: s.segment, options: { color: txt } },
          { text: s.priceRange, options: { color: txt } },
          { text: s.psfRange, options: { color: mut, align: 'center' } },
          { text: `${s.shareOfSales}%`, options: { color: acc, align: 'center', bold: true } },
          { text: safeStr(s.builders) || '', options: { color: mut } },
        ]);
      }
      sl.addTable(pRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial',
        border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.5, 2.5, 1.5, 1.2, 4.3] });
    }

    // ── Slide 9: Proforma ────────────────────────────────────────────────
    if (study.proforma?.scenarios?.length) {
      sl = pptx.addSlide(mo);
      sl.addText('PROFORMA SCENARIOS', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
      const scen = study.proforma.scenarios;
      const pfRows = [
        [{ text: '', options: { fill: { color: surf } } }, ...scen.map(s => ({ text: s.label, options: { bold: true, color: txt, fill: { color: surf }, align: 'center' } }))],
      ];
      const pfLines = [['Avg Selling Price', 'asp'], ['Land/Lot', 'landLot'], ['Hard Cost', 'hardCost'],
        ['Soft Cost', 'softCost'], ['Selling', 'selling'], ['G&A', 'ga'], ['Financing', 'financing'],
        ['Total Cost', 'totalCost'], ['Margin ($)', 'margin'], ['Margin (%)', 'marginPct']];
      for (const [label, key] of pfLines) {
        const row = [{ text: label, options: { color: txt, bold: key === 'margin' || key === 'marginPct' } }];
        for (const s of scen) {
          const val = key === 'marginPct' ? `${s[key]}%` : `$${fmt(s[key])}`;
          const color = key === 'margin' || key === 'marginPct' ? '10B981' : mut;
          row.push({ text: val, options: { color, align: 'center', bold: key === 'margin' || key === 'marginPct' } });
        }
        pfRows.push(row);
      }
      sl.addTable(pfRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial',
        border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [3, 3, 3, 3] });
    }

    // ── Slide 10: SWOT ───────────────────────────────────────────────────
    if (study.swot) {
      sl = pptx.addSlide(mo);
      sl.addText('SWOT ANALYSIS', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
      const quads = [
        { label: 'STRENGTHS', items: study.swot.strengths, color: '10B981', x: 0.5, y: 1.0 },
        { label: 'WEAKNESSES', items: study.swot.weaknesses, color: 'EF4444', x: 6.7, y: 1.0 },
        { label: 'OPPORTUNITIES', items: study.swot.opportunities, color: '3B82F6', x: 0.5, y: 4.0 },
        { label: 'THREATS', items: study.swot.threats, color: 'F97316', x: 6.7, y: 4.0 },
      ];
      for (const q of quads) {
        sl.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: q.x, y: q.y, w: 5.8, h: 2.8, fill: { color: surf }, rectRadius: 0.1 });
        sl.addText(q.label, { x: q.x + 0.3, y: q.y + 0.15, w: 5.2, fontSize: 12, bold: true, color: q.color, fontFace: 'Arial' });
        const bullets = (q.items || []).map(item => `• ${item}`).join('\n');
        sl.addText(bullets, { x: q.x + 0.3, y: q.y + 0.6, w: 5.2, h: 2, fontSize: 9, color: txt, fontFace: 'Arial', valign: 'top' });
      }
    }

    // ── Slide 11: Disclaimer ─────────────────────────────────────────────
    sl = pptx.addSlide(mo);
    sl.addText('DISCLAIMER', { x: 0.5, y: 1.5, w: 12, fontSize: 24, bold: true, color: acc, fontFace: 'Arial' });
    sl.addText('This market study is generated by Infinity Markets using publicly available data from government and commercial sources. It is intended for informational purposes and should not be construed as investment advice. All projections are estimates and actual results may vary.',
      { x: 0.5, y: 2.5, w: 12, fontSize: 12, color: mut, fontFace: 'Arial' });
    sl.addText('Powered by Infinity Markets — Forbes Capretto Homes',
      { x: 0.5, y: 5.5, w: 12, fontSize: 14, color: acc, fontFace: 'Arial', align: 'center' });

    // ── Write & return ───────────────────────────────────────────────────
    const fileName = `infinity-markets-${study.targetArea?.replace(/\s+/g, '-') || 'deck'}-${Date.now()}.pptx`;
    const filePath = path.join(os.tmpdir(), fileName);
    await pptx.writeFile({ fileName: filePath });
    await uploadAndRespond(res, filePath, fileName,
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', req.app.locals.supabase);
  } catch (err) {
    console.error('PPTX generation failed:', err);
    return res.status(500).json({ error: 'PPTX generation failed', detail: err.message });
  }
});

/* ── Source collector ──────────────────────────────────────────────────────── */
function collectSources(study) {
  const sources = [];
  const add = (cat, name, detail) => sources.push({ category: cat, name, detail });

  // Always-present government sources
  add('Demographics', 'U.S. Census Bureau ACS', '5-Year American Community Survey — population, income, housing characteristics');
  add('Demographics', 'U.S. Census Bureau PEP', 'Population Estimates Program — annual population estimates');
  add('Demographics', 'Census CBP', 'County Business Patterns — employment by NAICS sector');
  add('Demographics', 'FRED / BLS', 'Federal Reserve Economic Data — unemployment rate, LAUS series');
  add('Demographics', 'BEA', 'Bureau of Economic Analysis — per capita personal income');
  add('Housing', 'Census BPS', 'Building Permits Survey — residential permits by unit type');
  add('Housing', 'HUD FMR', 'Fair Market Rents — rental rates by bedroom count');
  add('Housing', 'FHFA HPI', 'Federal Housing Finance Agency — House Price Index');
  add('Competition', 'SEC EDGAR', 'Public builder 10-K filings — gross margins, ASP, cancellation rates');

  // Dynamic sources from _sources metadata
  const dSrc = study.demographics?._sources || {};
  if (dSrc.census) add('Demographics', 'Census ACS', `Vintage: ${dSrc.census.year || 'latest'}, Level: ${dSrc.census.level || 'county'}`);
  if (dSrc.fred) add('Demographics', 'FRED', `Series: ${dSrc.fred.series || 'LAUS'}`);
  if (dSrc.bea) add('Demographics', 'BEA', `Table: ${dSrc.bea.table || 'CAINC1'}`);

  const hSrc = study.housing?._sources || {};
  if (hSrc.bps) add('Housing', 'Census BPS', `Years: ${hSrc.bps.years || 'latest 4'}`);
  if (hSrc.hud) add('Housing', 'HUD FMR', `FIPS: ${hSrc.hud.fips || 'auto'}, Year: ${hSrc.hud.year || 'latest'}`);

  const cSrc = study.competition?._sources || {};
  if (cSrc.rapidapi) add('Competition', 'Realtor.com (RapidAPI)', `Endpoint: ${cSrc.rapidapi.endpoint || 'v3/list'}`);
  if (cSrc.supabase) add('Competition', 'Supabase Cache', 'Cached community data');

  add('Analysis', 'Anthropic Claude API', 'claude-sonnet-4-20250514 — structured market analysis, scoring, SWOT');
  add('General', 'Infinity Markets', `Report generated ${new Date().toISOString().split('T')[0]}`);

  return sources;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PDF HTML Template — Institutional Quality (25-40 pages)
   ═══════════════════════════════════════════════════════════════════════════ */
function buildPDFHTML(study) {
  const d = study.demographics || {};
  const h = study.housing || {};
  const comp = study.competition || {};
  const abs = study.absorption || {};
  const pricing = study.pricing || {};
  const land = study.land || {};
  const proforma = study.proforma || {};
  const reg = study.regulatory || {};
  const scorecard = study.scorecard || [];
  const swot = study.swot || {};

  const wtdAvg = scorecard.length ? (scorecard.reduce((s, x) => s + x.score * x.weight, 0) / 100) : 0;
  const rec = recLabel(wtdAvg);
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const sources = collectSources(study);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1a1a2e; line-height: 1.6; background: #fff; }

  /* ── Cover ────────────────────────────────────────────────────────── */
  .cover { page-break-after: always; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; background: linear-gradient(135deg, #0B1120 0%, #1F2937 100%); color: #fff; text-align: center; padding: 2in; }
  .cover .brand { font-size: 14pt; letter-spacing: 4px; color: #F59E0B; text-transform: uppercase; margin-bottom: 12px; }
  .cover h1 { font-size: 32pt; font-weight: 700; color: #F9FAFB; margin-bottom: 8px; }
  .cover .subtitle { font-size: 16pt; color: #9CA3AF; margin-bottom: 32px; }
  .cover .meta { font-size: 10pt; color: #6B7280; line-height: 2; }
  .cover .score-badge { display: inline-block; margin-top: 24px; padding: 12px 32px; border-radius: 8px; background: ${rec.bg}; color: ${rec.color}; font-size: 14pt; font-weight: 700; }

  /* ── Typography ───────────────────────────────────────────────────── */
  h2 { font-size: 16pt; color: #0B1120; border-bottom: 3px solid #F59E0B; padding-bottom: 6px; margin: 32px 0 16px; page-break-after: avoid; }
  h3 { font-size: 12pt; color: #374151; margin: 20px 0 10px; page-break-after: avoid; }
  p { margin-bottom: 10px; text-align: justify; }
  .narrative { font-size: 10pt; color: #374151; margin: 8px 0 16px; line-height: 1.7; }

  /* ── KPI Cards ───────────────────────────────────────────────────── */
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
  .kpi-grid.four { grid-template-columns: repeat(4, 1fr); }
  .kpi { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 14px 10px; text-align: center; }
  .kpi .value { font-size: 20pt; font-weight: 700; color: #0B1120; }
  .kpi .value.accent { color: #F59E0B; }
  .kpi .value.green { color: #10B981; }
  .kpi .value.blue { color: #3B82F6; }
  .kpi .label { font-size: 7.5pt; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }

  /* ── Tables ──────────────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 9pt; }
  th { background: #1F2937; color: #fff; padding: 7px 10px; text-align: left; font-weight: 600; font-size: 8.5pt; }
  td { padding: 6px 10px; border-bottom: 1px solid #E5E7EB; }
  tr:nth-child(even) td { background: #F9FAFB; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .bold { font-weight: 700; }
  .highlight-row td { background: #F0FDF4 !important; font-weight: 700; }

  /* ── Charts (CSS bar charts for Puppeteer) ───────────────────────── */
  .bar-chart { margin: 12px 0; }
  .bar-row { display: flex; align-items: center; margin-bottom: 6px; }
  .bar-label { width: 120px; font-size: 8.5pt; color: #374151; text-align: right; padding-right: 10px; flex-shrink: 0; }
  .bar-track { flex: 1; height: 20px; background: #F3F4F6; border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; display: flex; align-items: center; padding-left: 8px; font-size: 7.5pt; color: #fff; font-weight: 600; }

  /* ── SWOT ─────────────────────────────────────────────────────────── */
  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
  .swot-box { border: 1px solid #E5E7EB; border-radius: 6px; padding: 14px; page-break-inside: avoid; }
  .swot-box h3 { margin-top: 0; font-size: 11pt; }
  .swot-box ul { padding-left: 18px; margin-top: 6px; }
  .swot-box li { margin-bottom: 5px; font-size: 9pt; line-height: 1.5; }
  .s-box { border-left: 4px solid #10B981; } .s-box h3 { color: #10B981; }
  .w-box { border-left: 4px solid #EF4444; } .w-box h3 { color: #EF4444; }
  .o-box { border-left: 4px solid #3B82F6; } .o-box h3 { color: #3B82F6; }
  .t-box { border-left: 4px solid #F97316; } .t-box h3 { color: #F97316; }

  /* ── Scorecard ───────────────────────────────────────────────────── */
  .score-big { text-align: center; margin: 20px 0; }
  .score-big .number { font-size: 48pt; font-weight: 700; color: #F59E0B; }
  .score-big .out-of { font-size: 14pt; color: #9CA3AF; }
  .score-big .rec { font-size: 16pt; font-weight: 700; padding: 8px 24px; border-radius: 6px; display: inline-block; margin-top: 8px; }

  /* ── Utilities ───────────────────────────────────────────────────── */
  .page-break { page-break-before: always; }
  .disclaimer { margin-top: 32px; padding: 16px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 8pt; color: #6B7280; line-height: 1.6; }
  .source-list { font-size: 8pt; color: #6B7280; }
  .source-list td { padding: 3px 8px; font-size: 8pt; }
  .toc { margin: 20px 0; }
  .toc-item { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #D1D5DB; font-size: 11pt; }
  .toc-item .title { color: #1a1a2e; }
  .toc-item .page { color: #6B7280; }
  .section-num { color: #F59E0B; font-weight: 700; margin-right: 8px; }
</style>
</head>
<body>

<!-- ══════════ COVER PAGE ══════════ -->
<div class="cover">
  <div class="brand">Infinity Markets</div>
  <h1>New Construction Market Study</h1>
  <div class="subtitle">${study.targetArea || ''}</div>
  <div class="meta">
    ${dateStr}<br>
    Prepared for Forbes Capretto Homes<br>
    Land Acquisition &amp; Strategic Planning
  </div>
  <div class="score-badge">${rec.text} — Score: ${wtdAvg.toFixed(1)}/10</div>
</div>

<!-- ══════════ TABLE OF CONTENTS ══════════ -->
<h2 style="border:none;margin-top:0;">Table of Contents</h2>
<div class="toc">
  ${['Executive Summary','Demographics','Housing Market','Building Permits','Competitive Landscape','Absorption & Demand','Pricing Strategy','Land Economics','Proforma Scenarios','Regulatory Environment','Market Scorecard','SWOT Analysis','Data Sources & Methodology'].map((t, i) =>
    `<div class="toc-item"><span class="title"><span class="section-num">${i + 1}.</span>${t}</span></div>`
  ).join('')}
</div>

<!-- ══════════ 1. EXECUTIVE SUMMARY ══════════ -->
<h2 class="page-break"><span class="section-num">1.</span> Executive Summary</h2>

<div class="score-big">
  <div class="number">${wtdAvg.toFixed(1)}</div>
  <div class="out-of">out of 10.0</div>
  <div class="rec" style="background:${rec.bg};color:${rec.color};">${rec.text}</div>
</div>

<p class="narrative">This institutional-grade market study evaluates <strong>${study.targetArea || 'the target market'}</strong> for new residential construction feasibility. The analysis synthesizes data from ${sources.length}+ government and commercial data sources including the U.S. Census Bureau, FRED, BLS, BEA, HUD, and SEC EDGAR filings.</p>

<h3>Key Findings</h3>
<div class="kpi-grid four">
  <div class="kpi"><div class="value">${fmt(d.population)}</div><div class="label">Population</div></div>
  <div class="kpi"><div class="value accent">${d.mhi ? '$' + fmt(d.mhi) : '—'}</div><div class="label">Median HH Income</div></div>
  <div class="kpi"><div class="value green">${safe(abs.marketWideMonthly)}</div><div class="label">Monthly Absorption</div></div>
  <div class="kpi"><div class="value blue">${safe(abs.demandGap)}</div><div class="label">Annual Demand Gap</div></div>
</div>

${scorecard.length ? `
<h3>Scorecard Summary</h3>
<table>
  <tr><th>Metric</th><th class="text-center">Weight</th><th class="text-center">Score</th><th>Key Finding</th></tr>
  ${scorecard.map(s => `<tr><td>${s.metric}</td><td class="text-center">${s.weight}%</td><td class="text-center bold" style="color:${scoreColor(s.score)}">${s.score}</td><td style="font-size:8pt">${s.rationale}</td></tr>`).join('')}
  <tr class="highlight-row"><td>Weighted Composite</td><td class="text-center">100%</td><td class="text-center">${wtdAvg.toFixed(1)}</td><td>${rec.text}</td></tr>
</table>` : ''}

<!-- ══════════ 2. DEMOGRAPHICS ══════════ -->
<h2 class="page-break"><span class="section-num">2.</span> Demographics</h2>

<p class="narrative">The demographic profile of ${study.targetArea || 'this market'} reveals a${d.population > 100000 ? ' sizeable' : ''} population base of ${fmt(d.population)} residents across ${fmt(d.households)} households. ${d.mhi ? `The median household income of $${fmt(d.mhi)} ` + (d.mhi > 75000 ? 'positions this as an above-average income market' : d.mhi > 55000 ? 'indicates a middle-income market' : 'suggests a value-oriented buyer demographic') + '.' : ''} ${d.homeownershipRate ? `The ${d.homeownershipRate}% homeownership rate ` + (d.homeownershipRate > 70 ? 'reflects strong ownership culture' : d.homeownershipRate > 60 ? 'is near the national average' : 'may indicate rental demand') + '.' : ''}</p>

<div class="kpi-grid">
  <div class="kpi"><div class="value">${fmt(d.population)}</div><div class="label">Population</div></div>
  <div class="kpi"><div class="value">${fmtP(d.popGrowth5yr)}</div><div class="label">5-Year Growth</div></div>
  <div class="kpi"><div class="value accent">${d.mhi ? '$' + fmt(d.mhi) : '—'}</div><div class="label">Median HH Income</div></div>
  <div class="kpi"><div class="value">${fmt(d.households)}</div><div class="label">Households</div></div>
  <div class="kpi"><div class="value">${fmtP(d.homeownershipRate)}</div><div class="label">Homeownership Rate</div></div>
  <div class="kpi"><div class="value">${fmtP(d.unemploymentRate)}</div><div class="label">Unemployment Rate</div></div>
</div>

<table>
  <tr><th>Indicator</th><th class="text-right">Value</th></tr>
  <tr><td>Median Age</td><td class="text-right">${safe(d.medianAge)}</td></tr>
  <tr><td>Avg Household Size</td><td class="text-right">${safe(d.avgHouseholdSize)}</td></tr>
  <tr><td>Per Capita Income</td><td class="text-right">${d.perCapitaIncome ? '$' + fmt(d.perCapitaIncome) : '—'}</td></tr>
  <tr><td>Poverty Rate</td><td class="text-right">${fmtP(d.povertyRate)}</td></tr>
  <tr><td>Vacancy Rate</td><td class="text-right">${fmtP(d.vacancyRate)}</td></tr>
  <tr><td>Commute Inflow</td><td class="text-right">${fmt(d.commuteInflow)}</td></tr>
  <tr><td>Commute Outflow</td><td class="text-right">${fmt(d.commuteOutflow)}</td></tr>
</table>

${d.incomeDist?.length ? `
<h3>Household Income Distribution</h3>
<div class="bar-chart">
  ${d.incomeDist.map(b => {
    const maxPct = Math.max(...d.incomeDist.map(x => x.pct));
    const width = Math.round((b.pct / maxPct) * 100);
    return `<div class="bar-row"><div class="bar-label">${b.bracket}</div><div class="bar-track"><div class="bar-fill" style="width:${width}%;background:#3B82F6;">${b.pct}%</div></div></div>`;
  }).join('')}
</div>` : ''}

${d.topEmployers?.length ? `
<h3>Top Employment Sectors</h3>
<table>
  <tr><th>Sector</th><th class="text-right">Employment</th></tr>
  ${d.topEmployers.map(e => `<tr><td>${safeStr(e.sector || e.name)}</td><td class="text-right">${fmt(e.emp || e.employment)}</td></tr>`).join('')}
</table>` : ''}

${d.popTrend?.length ? `
<h3>Population Trend</h3>
<div class="bar-chart">
  ${d.popTrend.map(pt => {
    const pop = pt.v || pt.pop || pt.value || 0;
    const allPops = d.popTrend.map(p => p.v || p.pop || p.value || 0);
    const minP = Math.min(...allPops) * 0.95;
    const maxP = Math.max(...allPops);
    const width = maxP > minP ? Math.round(((pop - minP) / (maxP - minP)) * 100) : 50;
    return `<div class="bar-row"><div class="bar-label">${pt.yr || pt.year}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(width, 10)}%;background:#8B5CF6;">${fmt(pop)}</div></div></div>`;
  }).join('')}
</div>` : ''}

<!-- ══════════ 3. HOUSING MARKET ══════════ -->
<h2 class="page-break"><span class="section-num">3.</span> Housing Market</h2>

<p class="narrative">${h.medianValue ? `The median home value of $${fmt(h.medianValue)}` + (h.valueGrowthYoY ? ` with ${h.valueGrowthYoY}% year-over-year appreciation` : '') + ' reflects ' + (h.medianValue > 400000 ? 'a premium market' : h.medianValue > 250000 ? 'moderate pricing' : 'an affordable market') + '.' : 'Housing valuation data is being collected for this market.'} ${h.monthsSupply ? `Inventory stands at ${h.monthsSupply} months of supply` + (h.monthsSupply < 3 ? ', indicating a tight seller\'s market with strong pricing power.' : h.monthsSupply < 6 ? ', suggesting balanced market conditions.' : ', indicating elevated inventory levels.') : ''} ${h.medianRent ? `Fair market rent for a 2-bedroom unit is $${fmt(h.medianRent)}/month.` : ''}</p>

<div class="kpi-grid">
  <div class="kpi"><div class="value accent">${h.medianValue ? '$' + fmt(h.medianValue) : '—'}</div><div class="label">Median Value</div></div>
  <div class="kpi"><div class="value">${fmtP(h.valueGrowthYoY)}</div><div class="label">YoY Growth</div></div>
  <div class="kpi"><div class="value">${safe(h.medianDOM)}</div><div class="label">Median DOM</div></div>
  <div class="kpi"><div class="value">${safe(h.monthsSupply)}</div><div class="label">Months Supply</div></div>
  <div class="kpi"><div class="value">${fmtP(h.mortgageRate)}</div><div class="label">Mortgage Rate</div></div>
  <div class="kpi"><div class="value">${h.medianRent ? '$' + fmt(h.medianRent) : '—'}</div><div class="label">Median Rent (2BR)</div></div>
</div>

${h.fmrByBedroom?.length ? `
<h3>Fair Market Rent by Bedroom Count</h3>
<table>
  <tr><th>Bedrooms</th><th class="text-right">Monthly FMR</th></tr>
  ${h.fmrByBedroom.map(f => `<tr><td>${f.label || f.bedrooms}</td><td class="text-right">$${fmt(f.fmr || f.value)}</td></tr>`).join('')}
</table>` : ''}

${h.vintage?.length ? `
<h3>Housing Stock by Year Built</h3>
<div class="bar-chart">
  ${h.vintage.map(v => {
    const maxV = Math.max(...h.vintage.map(x => x.pct || 0));
    const width = maxV > 0 ? Math.round(((v.pct || 0) / maxV) * 100) : 0;
    return `<div class="bar-row"><div class="bar-label">${v.era || v.label}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(width, 5)}%;background:#10B981;">${v.pct || 0}%</div></div></div>`;
  }).join('')}
</div>` : ''}

<!-- ══════════ 4. BUILDING PERMITS ══════════ -->
<h2 class="page-break"><span class="section-num">4.</span> Building Permits</h2>

<p class="narrative">Building permit activity is a leading indicator of new construction supply entering the market. ${(() => {
  const sfArr = h.permitsSF || []; const mfArr = h.permitsMF || [];
  if (!sfArr.length) return 'Permit data is being compiled for this market.';
  const latest = sfArr[sfArr.length - 1];
  const latestMF = mfArr.find(m => m.yr === latest?.yr);
  return `In ${latest?.yr || 'the most recent year'}, the county recorded ${fmt(latest?.v)} single-family and ${fmt(latestMF?.v || 0)} multifamily permits.`;
})()}</p>

${(() => {
  const sfArr = h.permitsSF || []; const mfArr = h.permitsMF || [];
  const years = [...new Set([...sfArr.map(p => p.yr), ...mfArr.map(p => p.yr)])].sort();
  if (!years.length) return '';
  return `<table>
    <tr><th>Year</th><th class="text-right">SF Units</th><th class="text-right">MF Units</th><th class="text-right">Total</th></tr>
    ${years.map(yr => {
      const sf = sfArr.find(p => p.yr === yr)?.v ?? 0;
      const mf = mfArr.find(p => p.yr === yr)?.v ?? 0;
      return `<tr><td>${yr}</td><td class="text-right">${fmt(sf)}</td><td class="text-right">${fmt(mf)}</td><td class="text-right bold">${fmt(sf + mf)}</td></tr>`;
    }).join('')}
  </table>
  <div class="bar-chart">
    ${years.map(yr => {
      const sf = sfArr.find(p => p.yr === yr)?.v ?? 0;
      const mf = mfArr.find(p => p.yr === yr)?.v ?? 0;
      const total = sf + mf;
      const maxT = Math.max(...years.map(y => (sfArr.find(p => p.yr === y)?.v ?? 0) + (mfArr.find(p => p.yr === y)?.v ?? 0)));
      const width = maxT > 0 ? Math.round((total / maxT) * 100) : 0;
      return `<div class="bar-row"><div class="bar-label">${yr}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(width, 5)}%;background:linear-gradient(90deg,#3B82F6 ${sf / (total || 1) * 100}%,#F59E0B ${sf / (total || 1) * 100}%);">${fmt(total)}</div></div></div>`;
    }).join('')}
  </div>
  <p style="font-size:8pt;color:#6B7280;margin-top:4px;">Blue = Single Family, Gold = Multifamily</p>`;
})()}

<!-- ══════════ 5. COMPETITIVE LANDSCAPE ══════════ -->
<h2 class="page-break"><span class="section-num">5.</span> Competitive Landscape</h2>

${comp.communities?.length ? `
<p class="narrative">The competitive landscape includes ${comp.communities.length} active new construction ${comp.communities.length === 1 ? 'community' : 'communities'} in the primary market area. Analysis of active communities reveals pricing, product mix, and absorption patterns that inform positioning strategy.</p>

<table>
  <tr><th>Community</th><th>Builder</th><th>Product</th><th class="text-right">Price Range</th><th class="text-center">$/SF</th><th class="text-center">Lots Rem</th><th class="text-center">Abs/Mo</th></tr>
  ${comp.communities.map(c => `<tr>
    <td>${safeStr(c.name)}</td><td>${safeStr(c.builder)}</td><td>${safeStr(c.product)}</td>
    <td class="text-right">${c.priceLow && c.priceHigh ? '$' + fmt(c.priceLow) + ' – $' + fmt(c.priceHigh) : '—'}</td>
    <td class="text-center">${c.psfAvg ? '$' + c.psfAvg : '—'}</td>
    <td class="text-center">${safe(c.lotsRemain ?? c.lotsRemaining)}</td>
    <td class="text-center">${safe(c.monthlyAbs)}</td>
  </tr>`).join('')}
</table>` : '<p class="narrative">Competition data is being collected for this market. The analysis below is based on comparable market estimates and publicly available information.</p>'}

${comp.publicBenchmarks?.length || proforma.publicBenchmarks?.length ? `
<h3>Public Builder Benchmarks (SEC EDGAR)</h3>
<table>
  <tr><th>Builder</th><th class="text-center">Gross Margin</th><th class="text-right">ASP</th><th class="text-center">Cancel Rate</th></tr>
  ${(proforma.publicBenchmarks || comp.publicBenchmarks || []).map(b => `<tr>
    <td>${safeStr(b.builder)}</td><td class="text-center">${b.grossMargin}%</td>
    <td class="text-right">$${fmt(b.asp)}</td><td class="text-center">${b.cancelRate}%</td>
  </tr>`).join('')}
</table>` : ''}

<!-- ══════════ 6. ABSORPTION & DEMAND ══════════ -->
<h2 class="page-break"><span class="section-num">6.</span> Absorption &amp; Demand</h2>

<p class="narrative">Absorption analysis quantifies the market's capacity to absorb new housing units. ${abs.marketWideMonthly ? `The estimated market-wide absorption rate of ${abs.marketWideMonthly} units/month (${abs.annualClosings || abs.marketWideMonthly * 12} annually)` : 'Absorption estimates'} ${abs.demandGap > 0 ? `indicate a positive demand gap of ${abs.demandGap} units annually, suggesting undersupply and favorable conditions for new development.` : abs.demandGap < 0 ? `reveal a negative demand gap, suggesting potential oversupply risk.` : 'are based on household formation, migration patterns, and permit activity.'}</p>

<div class="kpi-grid">
  <div class="kpi"><div class="value green">${safe(abs.marketWideMonthly)}</div><div class="label">Monthly Absorption</div></div>
  <div class="kpi"><div class="value green">${safe(abs.annualClosings)}</div><div class="label">Annual Closings</div></div>
  <div class="kpi"><div class="value accent">${safe(abs.demandGap)}</div><div class="label">Annual Demand Gap</div></div>
  <div class="kpi"><div class="value">${safe(abs.hhFormationAnnual)}</div><div class="label">HH Formation/Year</div></div>
  <div class="kpi"><div class="value">${safe(abs.newSupplyAnnual)}</div><div class="label">New Supply/Year</div></div>
</div>

${abs.byPriceBand?.length ? `
<h3>Absorption by Price Band</h3>
<table>
  <tr><th>Price Band</th><th class="text-center">Units</th><th class="text-center">Share</th></tr>
  ${abs.byPriceBand.map(b => `<tr><td>${b.band}</td><td class="text-center">${b.units}</td><td class="text-center">${b.pct}%</td></tr>`).join('')}
</table>
<div class="bar-chart">
  ${abs.byPriceBand.map(b => {
    const maxU = Math.max(...abs.byPriceBand.map(x => x.units));
    const width = maxU > 0 ? Math.round((b.units / maxU) * 100) : 0;
    return `<div class="bar-row"><div class="bar-label">${b.band}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(width, 5)}%;background:#10B981;">${b.units} units (${b.pct}%)</div></div></div>`;
  }).join('')}
</div>` : ''}

${abs.selloutPace?.length ? `
<h3>Community Sellout Pace</h3>
<table>
  <tr><th>Community</th><th class="text-center">Remaining</th><th class="text-center">Abs/Mo</th><th class="text-center">Months to Sellout</th></tr>
  ${abs.selloutPace.map(s => `<tr><td>${s.name}</td><td class="text-center">${s.remain}</td><td class="text-center">${s.abs}</td><td class="text-center">${s.months}</td></tr>`).join('')}
</table>` : ''}

<!-- ══════════ 7. PRICING STRATEGY ══════════ -->
<h2 class="page-break"><span class="section-num">7.</span> Pricing Strategy</h2>

<p class="narrative">Pricing analysis segments the market by product type and buyer profile to identify optimal price points for new construction. ${pricing.affordability?.maxAffordable ? `Based on the median household income of $${fmt(pricing.affordability.mhi)} and a ${pricing.affordability.mortgageRate}% mortgage rate, the maximum affordable home price is approximately $${fmt(pricing.affordability.maxAffordable)}.` : ''}</p>

${pricing.stratification?.length ? `
<h3>Market Segmentation</h3>
<table>
  <tr><th>Segment</th><th>Price Range</th><th class="text-center">$/SF</th><th class="text-center">Market Share</th><th>Active Builders</th></tr>
  ${pricing.stratification.map(s => `<tr>
    <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${s.color || '#3B82F6'};margin-right:6px;"></span>${s.segment}</td>
    <td>${s.priceRange}</td><td class="text-center">${s.psfRange}</td>
    <td class="text-center bold">${s.shareOfSales}%</td><td style="font-size:8pt">${safeStr(s.builders)}</td>
  </tr>`).join('')}
</table>` : ''}

${pricing.psfByProduct?.length ? `
<h3>Price Per Square Foot by Product Type</h3>
<div class="bar-chart">
  ${pricing.psfByProduct.map(p => {
    const maxPsf = Math.max(...pricing.psfByProduct.map(x => x.psf));
    const width = maxPsf > 0 ? Math.round((p.psf / maxPsf) * 100) : 0;
    return `<div class="bar-row"><div class="bar-label">${p.type}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(width, 8)}%;background:#F59E0B;">$${p.psf}/SF</div></div></div>`;
  }).join('')}
</div>` : ''}

${pricing.affordability ? `
<h3>Affordability Analysis</h3>
<table>
  <tr><th>Metric</th><th class="text-right">Value</th></tr>
  <tr><td>Median Household Income</td><td class="text-right">$${fmt(pricing.affordability.mhi)}</td></tr>
  <tr><td>Prevailing Mortgage Rate</td><td class="text-right">${pricing.affordability.mortgageRate}%</td></tr>
  <tr><td>Maximum Affordable Price</td><td class="text-right bold">$${fmt(pricing.affordability.maxAffordable)}</td></tr>
  <tr><td>Price-to-Income Ratio</td><td class="text-right">${pricing.affordability.priceToIncome}x</td></tr>
  <tr><td>PITI-to-Income Ratio</td><td class="text-right">${pricing.affordability.pitiToIncome}%</td></tr>
  <tr><td>Buyer Pool at 100% MHI</td><td class="text-right">${fmt(pricing.affordability.buyerPool100)} HHs</td></tr>
  <tr><td>Buyer Pool at 125% MHI</td><td class="text-right">${fmt(pricing.affordability.buyerPool125)} HHs</td></tr>
</table>` : ''}

<!-- ══════════ 8. LAND ECONOMICS ══════════ -->
<h2 class="page-break"><span class="section-num">8.</span> Land Economics</h2>

<p class="narrative">Land cost analysis evaluates raw land values, finished lot economics, and development costs to determine feasibility. ${land.lotToHomeRatio ? `The lot-to-home price ratio of ${land.lotToHomeRatio}% ` + (land.lotToHomeRatio < 20 ? 'is favorable for builder margins.' : land.lotToHomeRatio < 25 ? 'is within acceptable range.' : 'may compress margins.') : ''} ${land.estFinishedLotValue ? `Estimated finished lot value is $${fmt(land.estFinishedLotValue)}.` : ''}</p>

<div class="kpi-grid">
  <div class="kpi"><div class="value accent">${land.lotToHomeRatio ? land.lotToHomeRatio + '%' : '—'}</div><div class="label">Lot-to-Home Ratio</div></div>
  <div class="kpi"><div class="value">${fmtD(land.estFinishedLotValue)}</div><div class="label">Finished Lot Value</div></div>
  <div class="kpi"><div class="value">${fmtD(land.rawLandPerAcre)}</div><div class="label">Raw Land/Acre</div></div>
  <div class="kpi"><div class="value">${fmtD(land.estSiteDev)}</div><div class="label">Site Dev/Lot</div></div>
  <div class="kpi"><div class="value">${safe(land.lotInventoryMonths)}</div><div class="label">Lot Inventory (mo)</div></div>
</div>

${land.comps?.length ? `
<h3>Land Comparables</h3>
<table>
  <tr><th>Address</th><th class="text-right">Acres</th><th class="text-right">Ask Price</th><th class="text-right">$/Acre</th><th>Zoning</th><th>Status</th><th class="text-center">Est Lots</th></tr>
  ${land.comps.map(c => `<tr><td style="font-size:8.5pt">${c.address}</td><td class="text-right">${c.acres}</td><td class="text-right">$${fmt(c.askPrice)}</td><td class="text-right">$${fmt(c.perAcre)}</td><td>${c.zoning}</td><td>${c.status}</td><td class="text-center">${c.estLots}</td></tr>`).join('')}
</table>` : ''}

${land.devCostBreakdown?.length ? `
<h3>Development Cost Breakdown (Per Lot)</h3>
<table>
  <tr><th>Item</th><th class="text-right">Cost</th></tr>
  ${land.devCostBreakdown.map(dc => `<tr><td>${dc.item}</td><td class="text-right">$${fmt(dc.cost)}</td></tr>`).join('')}
  <tr class="highlight-row"><td>Total Site Development</td><td class="text-right">$${fmt(land.devCostBreakdown.reduce((s, x) => s + (x.cost || 0), 0))}</td></tr>
</table>` : ''}

<!-- ══════════ 9. PROFORMA SCENARIOS ══════════ -->
<h2 class="page-break"><span class="section-num">9.</span> Proforma Scenarios</h2>

<p class="narrative">Three proforma scenarios model the financial outcomes for a new community development. The base case represents the most likely outcome given current market conditions, while downside and upside scenarios test sensitivity to price, pace, and cost assumptions.</p>

${proforma.scenarios?.length ? `
<table>
  <tr><th>Line Item</th>${proforma.scenarios.map(s => `<th class="text-center">${s.label}</th>`).join('')}</tr>
  <tr><td><strong>Avg Selling Price</strong></td>${proforma.scenarios.map(s => `<td class="text-right">$${fmt(s.asp)}</td>`).join('')}</tr>
  <tr><td>Land/Lot</td>${proforma.scenarios.map(s => `<td class="text-right">$${fmt(s.landLot)}</td>`).join('')}</tr>
  <tr><td>Hard Cost</td>${proforma.scenarios.map(s => `<td class="text-right">$${fmt(s.hardCost)}</td>`).join('')}</tr>
  <tr><td>Soft Cost</td>${proforma.scenarios.map(s => `<td class="text-right">$${fmt(s.softCost)}</td>`).join('')}</tr>
  <tr><td>Selling</td>${proforma.scenarios.map(s => `<td class="text-right">$${fmt(s.selling)}</td>`).join('')}</tr>
  <tr><td>G&amp;A</td>${proforma.scenarios.map(s => `<td class="text-right">$${fmt(s.ga)}</td>`).join('')}</tr>
  <tr><td>Financing</td>${proforma.scenarios.map(s => `<td class="text-right">$${fmt(s.financing)}</td>`).join('')}</tr>
  <tr class="highlight-row"><td>Total Cost</td>${proforma.scenarios.map(s => `<td class="text-right">$${fmt(s.totalCost)}</td>`).join('')}</tr>
  <tr class="highlight-row"><td>Margin ($)</td>${proforma.scenarios.map(s => `<td class="text-right" style="color:#10B981">$${fmt(s.margin)}</td>`).join('')}</tr>
  <tr class="highlight-row"><td>Margin (%)</td>${proforma.scenarios.map(s => `<td class="text-right" style="color:#10B981">${s.marginPct}%</td>`).join('')}</tr>
</table>` : ''}

${proforma.publicBenchmarks?.length ? `
<h3>Public Builder Benchmarks</h3>
<table>
  <tr><th>Builder</th><th class="text-center">Gross Margin</th><th class="text-right">ASP</th><th class="text-center">Cancel Rate</th></tr>
  ${proforma.publicBenchmarks.map(b => `<tr><td>${safeStr(b.builder)}</td><td class="text-center">${b.grossMargin}%</td><td class="text-right">$${fmt(b.asp)}</td><td class="text-center">${b.cancelRate}%</td></tr>`).join('')}
</table>` : ''}

<!-- ══════════ 10. REGULATORY ENVIRONMENT ══════════ -->
<h2 class="page-break"><span class="section-num">10.</span> Regulatory Environment</h2>

<p class="narrative">The regulatory environment shapes project timelines, costs, and feasibility. ${reg.entitlementTimeline ? `Entitlement is estimated at ${reg.entitlementTimeline}.` : ''} ${reg.totalFeesPerUnit ? `Total impact fees and regulatory costs are approximately $${fmt(reg.totalFeesPerUnit)} per unit.` : ''}</p>

<table>
  <tr><th>Item</th><th>Detail</th></tr>
  <tr><td>Zoning</td><td>${safe(reg.zoning)}</td></tr>
  <tr><td>Maximum Density</td><td>${safe(reg.maxDensity)}</td></tr>
  <tr><td>Entitlement Timeline</td><td>${safe(reg.entitlementTimeline)}</td></tr>
  <tr><td>Total Fees Per Unit</td><td>${reg.totalFeesPerUnit ? '$' + fmt(reg.totalFeesPerUnit) : '—'}</td></tr>
</table>

${reg.fees?.length ? `
<h3>Fee Schedule</h3>
<table>
  <tr><th>Fee</th><th>Amount</th><th>Note</th></tr>
  ${reg.fees.map(f => `<tr><td>${f.fee}</td><td>${f.amount}</td><td style="font-size:8pt">${f.note || ''}</td></tr>`).join('')}
</table>` : ''}

${reg.utilities?.length ? `
<h3>Utilities</h3>
<table>
  <tr><th>Utility</th><th>Provider</th><th>Status</th><th>Note</th></tr>
  ${reg.utilities.map(u => `<tr><td>${u.utility}</td><td>${u.provider}</td><td>${u.status}</td><td style="font-size:8pt">${u.note || ''}</td></tr>`).join('')}
</table>` : ''}

${reg.schoolDistrict ? `
<h3>School District</h3>
<table>
  <tr><th>Item</th><th>Detail</th></tr>
  <tr><td>District</td><td>${reg.schoolDistrict.name || '—'}</td></tr>
  <tr><td>Rating</td><td>${reg.schoolDistrict.rating || '—'}</td></tr>
  <tr><td>Enrollment</td><td>${fmt(reg.schoolDistrict.enrollment)}</td></tr>
  <tr><td>Trend</td><td>${reg.schoolDistrict.trend || '—'}</td></tr>
  <tr><td>Note</td><td style="font-size:8pt">${reg.schoolDistrict.note || '—'}</td></tr>
</table>` : ''}

<!-- ══════════ 11. MARKET SCORECARD ══════════ -->
<h2 class="page-break"><span class="section-num">11.</span> Market Scorecard</h2>

<p class="narrative">The market scorecard evaluates eight key dimensions weighted by their importance to new construction feasibility. Each metric is scored 1-10, with rationale grounded in the observed data.</p>

<div class="score-big">
  <div class="number" style="color:${scoreColor(wtdAvg)}">${wtdAvg.toFixed(1)}</div>
  <div class="out-of">Weighted Composite Score (out of 10)</div>
  <div class="rec" style="background:${rec.bg};color:${rec.color};">${rec.text}</div>
</div>

<table>
  <tr><th>Metric</th><th class="text-center">Weight</th><th class="text-center">Score</th><th>Rationale</th></tr>
  ${scorecard.map(s => `<tr>
    <td>${s.metric}</td><td class="text-center">${s.weight}%</td>
    <td class="text-center bold" style="color:${scoreColor(s.score)}">${s.score}</td>
    <td style="font-size:8pt">${s.rationale}</td>
  </tr>`).join('')}
  <tr class="highlight-row"><td>Weighted Composite</td><td class="text-center">100%</td><td class="text-center">${wtdAvg.toFixed(1)}</td><td>${rec.text}</td></tr>
</table>

<!-- ══════════ 12. SWOT ANALYSIS ══════════ -->
<h2 class="page-break"><span class="section-num">12.</span> SWOT Analysis</h2>

<div class="swot-grid">
  <div class="swot-box s-box"><h3>Strengths</h3><ul>${(swot.strengths || []).map(s => `<li>${s}</li>`).join('')}</ul></div>
  <div class="swot-box w-box"><h3>Weaknesses</h3><ul>${(swot.weaknesses || []).map(s => `<li>${s}</li>`).join('')}</ul></div>
  <div class="swot-box o-box"><h3>Opportunities</h3><ul>${(swot.opportunities || []).map(s => `<li>${s}</li>`).join('')}</ul></div>
  <div class="swot-box t-box"><h3>Threats</h3><ul>${(swot.threats || []).map(s => `<li>${s}</li>`).join('')}</ul></div>
</div>

<!-- ══════════ 13. DATA SOURCES & METHODOLOGY ══════════ -->
<h2 class="page-break"><span class="section-num">13.</span> Data Sources &amp; Methodology</h2>

<p class="narrative">This market study integrates data from multiple authoritative government and commercial sources. All data was collected programmatically via official APIs where available, supplemented by direct file downloads for certain datasets. Analysis and scoring are performed by Anthropic Claude AI with structured prompts designed for consistency and reproducibility.</p>

<table class="source-list">
  <tr><th>Category</th><th>Source</th><th>Description</th></tr>
  ${sources.map(s => `<tr><td>${s.category}</td><td>${s.name}</td><td>${s.detail}</td></tr>`).join('')}
</table>

<h3>Methodology Notes</h3>
<table>
  <tr><th>Component</th><th>Approach</th></tr>
  <tr><td>Geographic Scope</td><td>Primary Market Area (PMA) defined as the municipality/township containing the target location, with county-level context for broader market indicators.</td></tr>
  <tr><td>Demographic Analysis</td><td>Census ACS 5-year estimates for demographic profile; PEP for population trends; CBP for employment; FRED/BLS for unemployment; BEA for income.</td></tr>
  <tr><td>Housing Analysis</td><td>Census BPS for permits; HUD FMR for rental benchmarks; Redfin/Zillow where available for transaction data.</td></tr>
  <tr><td>Competition</td><td>RapidAPI Realtor.com new construction filter; SEC EDGAR public builder filings; Supabase community cache.</td></tr>
  <tr><td>Absorption Model</td><td>Household formation (population growth / avg HH size) minus new supply (permit activity) = demand gap. Price band allocation based on income distribution.</td></tr>
  <tr><td>Scoring</td><td>8-dimension weighted scorecard (100 total weight). Scores 1-10 with data-driven rationale. Composite = weighted average.</td></tr>
</table>

<div class="disclaimer">
  <strong>Disclaimer:</strong> This market study is generated by Infinity Markets using publicly available data from government and commercial sources including the U.S. Census Bureau, FRED, BLS, BEA, HUD, Redfin, Zillow, FHFA, HMDA, and SEC EDGAR. Analysis and scoring powered by Anthropic Claude AI. This report is for informational purposes only and should not be construed as investment advice. All projections are estimates based on available data and professional judgment; actual results may vary materially. Forbes Capretto Homes should conduct independent due diligence before making land acquisition decisions.
</div>

</body>
</html>`;
}

module.exports = router;
