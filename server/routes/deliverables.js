/**
 * Infinity Markets v1.8 — Deliverables Route (Sprint 5.2)
 *
 * POST /api/deliverables/pdf  → Puppeteer HTML → PDF (45+ pages, institutional quality)
 * POST /api/deliverables/xlsx → ExcelJS multi-tab workbook with formulas
 * POST /api/deliverables/pptx → PptxGenJS 25-slide executive deck
 *
 * v1.8 (Sprint 5.2) — Comprehensive bug-fix + field-coverage release:
 * - RENDERS EVERY FIELD in the study object across all 3 formats
 * - Adds: geo block, byCommunity table, seasonality chart, psfByProduct chart,
 *   incentives table, ppiTrend + ppiYoY, priceTrend (Zillow ZHVI), builders list,
 *   totalUnits, PPTX regulatory slide, PPTX incentives slide, PPTX price-trend slide,
 *   PPTX recommendation slide, PPTX builders slide
 * - Fixes popTrend geographic-scope labeling (tags county vs. township)
 * - Labels permits with geo.county so township studies don't say wrong name
 * - Hardens ALL string/number renders with safeStr/safeNum (no more [object Object]
 *   or NaN in any output)
 * - Improves error responses: always includes stack.split('\n')[0] for debugging
 *
 * v1.7 (Sprint 5.1):
 * - Added safeStr() helper to prevent [Object Object] in all outputs
 * - Switched PDF engine to puppeteer-core + @sparticuz/chromium for Render
 */
const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
// v4.0.0 Phase 3 Step 9 — canonical schema at the render boundary.
const { normalizeStudy, unwrapEnvelope, enforceSchema } = require('../lib/studySchema');

// v4.0.1 — null-preserving deep merge. Used at render boundary so that
// canonical values from normalizeStudy() fill in null/missing leaves
// without overwriting existing non-null data. Empty arrays are replaced
// by populated canonical arrays; populated arrays win.
function deepMergeNullWins(target, source) {
  if (source == null) return target;
  if (target == null) return source;
  if (typeof target !== 'object' || typeof source !== 'object') return target;
  if (Array.isArray(target) || Array.isArray(source)) {
    if (Array.isArray(target) && target.length > 0) return target;
    return source;
  }
  const out = Object.assign({}, target);
  for (const k of Object.keys(source)) {
    if (k.startsWith('_')) continue;
    const sv = source[k];
    const tv = out[k];
    if (tv == null) {
      out[k] = sv;
    } else if (Array.isArray(tv) && Array.isArray(sv)) {
      out[k] = tv.length > 0 ? tv : sv;
    } else if (typeof tv === 'object' && typeof sv === 'object' && !Array.isArray(tv) && !Array.isArray(sv)) {
      out[k] = deepMergeNullWins(tv, sv);
    }
    // else: tv is a non-null scalar, existing wins
  }
  return out;
}

/* ═══ Helpers ═════════════════════════════════════════════════════════════ */
function fmt(n)  { if (n == null || Number.isNaN(+n)) return '—'; return Number(n).toLocaleString('en-US'); }
function fmtD(n) { if (n == null || Number.isNaN(+n)) return '—'; return '$' + Number(n).toLocaleString('en-US'); }
function fmtP(n) { if (n == null || Number.isNaN(+n)) return '—'; return Number(n) + '%'; }
function fmt1(n) { if (n == null || Number.isNaN(+n)) return '—'; return Number(n).toFixed(1); }
function safe(v, fallback) { return v != null && v !== '' && v !== 0 ? v : (fallback || '—'); }
function safeNum(v, fallback = null) {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * safeStr — flatten any value to a display-safe string (prevents [Object Object]).
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
      if (typeof item === 'object' && item !== null) return item.name || item.builder || item.type || item.description || JSON.stringify(item);
      return String(item);
    }).join(', ');
  }
  if (typeof v === 'object') {
    if (v.name) return v.name;
    if (v.builder) return v.builder;
    if (v.description) return v.description;
    if (v.type && v.amount != null) return `${v.type}: $${Number(v.amount).toLocaleString('en-US')}`;
    if (v.type && v.value != null) return `${v.type}: ${v.value}`;
    if (v.type) return v.type;
    const entries = Object.entries(v).filter(([, val]) => val != null && val !== '');
    if (entries.length === 0) return '—';
    return entries.map(([k, val]) => `${k}: ${val}`).join(', ');
  }
  return String(v);
}
/** Escape strings intended for PDF HTML (already server-trusted content, but belt-and-suspenders) */
function esc(s) {
  if (s == null) return '—';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
/** Geographic scope label — helps readers understand when a data point is county-wide vs. township-level */
function scopeLabel(study, level = 'county') {
  const g = study.geo || {};
  if (level === 'county') return g.county ? `${g.county} County` : 'the county';
  if (level === 'cbsa')   return g.cbsaName || g.cbsa || 'the metro';
  if (level === 'subdiv') return g.name || g.subdivision || 'the township';
  if (level === 'state')  return g.stateAbbr || g.state || 'the state';
  return g.name || 'the market';
}

/* ═══ Upload helper ═══════════════════════════════════════════════════════ */
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
   PDF — Puppeteer server-side render (45+ pages, institutional quality)
   ═══════════════════════════════════════════════════════════════════════════ */
router.post('/pdf', async (req, res) => {
  const { study } = req.body;
  if (!study) return res.status(400).json({ error: 'study data required' });
  try {
    const puppeteer = require('puppeteer-core');
    const chromium  = require('@sparticuz/chromium');
    const html = buildPDFHTML(study);
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const fileName = `infinity-markets-${(study.targetArea || 'report').replace(/\s+/g, '-')}-${Date.now()}.pdf`;
    const filePath = path.join(os.tmpdir(), fileName);
    await page.pdf({
      path: filePath, format: 'Letter', printBackground: true,
      margin: { top: '0.75in', bottom: '0.85in', left: '0.7in', right: '0.7in' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:7px;color:#9CA3AF;width:100%;padding:0 0.7in;display:flex;justify-content:space-between;">
        <span>Infinity Markets — ${esc(study.targetArea || '')}</span>
        <span>Confidential</span></div>`,
      footerTemplate: `<div style="font-size:7px;color:#9CA3AF;width:100%;padding:0 0.7in;display:flex;justify-content:space-between;">
        <span>Forbes Capretto Homes — Land Acquisition</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
    await browser.close();
    await uploadAndRespond(res, filePath, fileName, 'application/pdf', req.app.locals.supabase);
  } catch (err) {
    console.error('PDF generation failed:', err);
    return res.status(500).json({
      error: 'PDF generation failed',
      detail: err.message,
      where: (err.stack || '').split('\n')[1] || null,
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   XLSX — ExcelJS multi-tab workbook (13 tabs)
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
  } catch (err) {
    console.error('XLSX generation failed:', err);
    return res.status(500).json({
      error: 'XLSX generation failed',
      detail: err.message,
      where: (err.stack || '').split('\n')[1] || null,
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   PPTX — PptxGenJS executive deck (25 slides)
   ═══════════════════════════════════════════════════════════════════════════ */
router.post('/pptx', async (req, res) => {
  const { study } = req.body;
  if (!study) return res.status(400).json({ error: 'study data required' });
  try {
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
  } catch (err) {
    console.error('PPTX generation failed:', err);
    return res.status(500).json({
      error: 'PPTX generation failed',
      detail: err.message,
      where: (err.stack || '').split('\n')[1] || null,
    });
  }
});

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
  p('<div class="kpi"><div class="value">' + fmt(d.population) + '</div><div class="label">Population</div></div>');
  p('<div class="kpi"><div class="value accent">' + (d.mhi ? '$' + fmt(d.mhi) : '—') + '</div><div class="label">Median HH Income</div></div>');
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
  p('<div class="kpi"><div class="value">' + fmt(d.population) + '</div><div class="label">Population</div></div>');
  p('<div class="kpi"><div class="value">' + fmtP(d.popGrowth5yr) + '</div><div class="label">5-Year Growth</div></div>');
  p('<div class="kpi"><div class="value accent">' + (d.mhi ? '$' + fmt(d.mhi) : '—') + '</div><div class="label">Median HH Income</div></div>');
  p('<div class="kpi"><div class="value">' + fmt(d.households) + '</div><div class="label">Households</div></div>');
  p('<div class="kpi"><div class="value">' + fmtP(d.homeownershipRate) + '</div><div class="label">Homeownership Rate</div></div>');
  p('<div class="kpi"><div class="value">' + fmtP(d.unemploymentRate) + '</div><div class="label">Unemployment Rate</div></div></div>');
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
  p('<div class="kpi"><div class="value">' + fmt(h.totalUnits) + '</div><div class="label">Total Units</div></div>');
  p('<div class="kpi"><div class="value accent">' + fmt(h.ownerOccupied) + '</div><div class="label">Owner-Occ</div></div>');
  p('<div class="kpi"><div class="value blue">' + fmt(h.renterOccupied) + '</div><div class="label">Renter-Occ</div></div>');
  p('<div class="kpi"><div class="value red">' + fmtP(h.vacancyRate) + '</div><div class="label">Vacancy</div></div>');
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
  p('<div class="kpi"><div class="value">' + fmt(comp.activeListings) + '</div><div class="label">Active Listings</div></div>');
  p('<div class="kpi"><div class="value accent">$' + fmt(comp.medianListPrice) + '</div><div class="label">Median List</div></div>');
  p('<div class="kpi"><div class="value blue">' + fmt(comp.daysOnMarket) + '</div><div class="label">Days on Market</div></div>');
  p('<div class="kpi"><div class="value green">' + fmt(comp.builderCount || (comp.builders||[]).length) + '</div><div class="label">Active Builders</div></div>');
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

  // v3.0 Step 8: SEC EDGAR public builder benchmarks (from market_study.builder_profiles)
  const ebMarks = Array.isArray(study.competition && study.competition.builders)
    ? study.competition.builders.filter(b => b && (b.revenueUsd != null || b.grossMarginPct != null || b.averageSellingPrice != null || b.cik))
    : [];
  if (ebMarks.length) {
    p('<h3>SEC EDGAR Public Builder Benchmarks (latest 10-K)</h3>');
    p('<p class="narrative" style="font-size:8.5pt;color:#6B7280;">Source: SEC EDGAR companyfacts. Revenue / GP / ASP / cancellation rate extracted from most recent 10-K per builder.</p>');
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

  p('</body></html>');
  return parts.join('');
}

module.exports = router;
