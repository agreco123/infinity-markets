/**
 * Infinity Markets v1.0 — Deliverables Route (Task 8)
 *
 * POST /api/deliverables/pdf  → Puppeteer HTML → PDF (~45 pages)
 * POST /api/deliverables/xlsx → ExcelJS 11-tab workbook
 * POST /api/deliverables/pptx → PptxGenJS 25-slide deck
 *
 * Each accepts full study data in request body, returns { url } download link.
 * Files stored in Supabase Storage bucket "deliverables" or temp on server.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// ── Color tokens (matching v0.3 design) ──────────────────────────────────────
const T = {
  bg: '#0B1120', surface: '#111827', surfaceAlt: '#1F2937', border: '#374151',
  text: '#F9FAFB', muted: '#9CA3AF', accent: '#F59E0B', blue: '#3B82F6',
  green: '#10B981', red: '#EF4444', purple: '#8B5CF6', orange: '#F97316',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PDF — Puppeteer server-side render
// ═══════════════════════════════════════════════════════════════════════════════

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
      path: filePath,
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', bottom: '0.75in', left: '0.6in', right: '0.6in' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="font-size:8px;color:#9CA3AF;text-align:center;width:100%;padding:0 0.6in;">
        <span>Infinity Markets — ${study.targetArea || ''}</span>
        <span style="float:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
    });

    await browser.close();

    // Upload to Supabase Storage if available, else serve from temp
    const { supabase } = req.app.locals;
    let url = null;

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const storagePath = `reports/${fileName}`;
      const { data, error } = await supabase.storage
        .from('deliverables')
        .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: true });

      if (!error) {
        const { data: urlData } = supabase.storage
          .from('deliverables')
          .getPublicUrl(storagePath);
        url = urlData?.publicUrl;
      }
    } catch (_) { /* Storage not configured — use temp file */ }

    if (!url) {
      // Serve directly
      return res.download(filePath, fileName, () => { try { fs.unlinkSync(filePath); } catch (_) {} });
    }

    // Clean up temp
    try { fs.unlinkSync(filePath); } catch (_) {}
    return res.json({ url, fileName });

  } catch (err) {
    console.error('PDF generation failed:', err);
    return res.status(500).json({ error: 'PDF generation failed', detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// XLSX — ExcelJS workbook
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/xlsx', async (req, res) => {
  const { study } = req.body;
  if (!study) return res.status(400).json({ error: 'study data required' });

  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Infinity Markets';
    wb.created = new Date();

    const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }, alignment: { horizontal: 'center' } };
    const numFmt = '#,##0';
    const pctFmt = '0.0%';
    const dollarFmt = '$#,##0';

    // ── Tab 1: Executive Summary ──────────────────────────────────────────
    const ws1 = wb.addWorksheet('Executive Summary');
    ws1.columns = [{ width: 30 }, { width: 20 }, { width: 20 }];
    ws1.addRow(['Infinity Markets — Market Study']).font = { bold: true, size: 16 };
    ws1.addRow([study.targetArea || '']);
    ws1.addRow([`Generated: ${new Date().toLocaleDateString()}`]);
    ws1.addRow([]);
    if (study.scorecard) {
      ws1.addRow(['MARKET SCORECARD']).font = { bold: true, size: 13 };
      const hdr = ws1.addRow(['Metric', 'Weight', 'Score']);
      hdr.eachCell(c => { Object.assign(c, headerStyle); });
      for (const s of study.scorecard) {
        ws1.addRow([s.metric, s.weight / 100, s.score]);
      }
      const wtdAvg = study.scorecard.reduce((sum, s) => sum + s.score * s.weight, 0) / 100;
      ws1.addRow(['Weighted Average', '', Math.round(wtdAvg * 10) / 10]).font = { bold: true };
    }

    // ── Tab 2: Demographics ───────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Demographics');
    ws2.columns = [{ width: 28 }, { width: 18 }];
    const d = study.demographics || {};
    const demoRows = [
      ['Population', d.population], ['5-Year Growth', d.popGrowth5yr ? d.popGrowth5yr / 100 : null],
      ['Median Age', d.medianAge], ['Households', d.households],
      ['Avg HH Size', d.avgHouseholdSize], ['Median HH Income', d.mhi],
      ['Per Capita Income', d.perCapitaIncome], ['Homeownership Rate', d.homeownershipRate ? d.homeownershipRate / 100 : null],
      ['Poverty Rate', d.povertyRate ? d.povertyRate / 100 : null], ['Unemployment Rate', d.unemploymentRate ? d.unemploymentRate / 100 : null],
      ['Commute Inflow', d.commuteInflow], ['Commute Outflow', d.commuteOutflow],
    ];
    const hdr2 = ws2.addRow(['Indicator', 'Value']);
    hdr2.eachCell(c => { Object.assign(c, headerStyle); });
    for (const [label, val] of demoRows) ws2.addRow([label, val]);

    // ── Tab 3: Housing Market ─────────────────────────────────────────────
    const ws3 = wb.addWorksheet('Housing');
    ws3.columns = [{ width: 28 }, { width: 18 }];
    const h = study.housing || {};
    const housingRows = [
      ['Median Value', h.medianValue], ['YoY Growth', h.valueGrowthYoY ? h.valueGrowthYoY / 100 : null],
      ['Median DOM', h.medianDOM], ['Sale-to-List Ratio', h.saleToList],
      ['Months Supply', h.monthsSupply], ['Median Rent (2BR)', h.medianRent],
      ['Mortgage Rate', h.mortgageRate ? h.mortgageRate / 100 : null],
    ];
    const hdr3 = ws3.addRow(['Metric', 'Value']);
    hdr3.eachCell(c => { Object.assign(c, headerStyle); });
    for (const [label, val] of housingRows) ws3.addRow([label, val]);

    // ── Tab 4: Building Permits ───────────────────────────────────────────
    const ws4 = wb.addWorksheet('Permits');
    ws4.columns = [{ width: 12 }, { width: 15 }, { width: 15 }];
    const hdr4 = ws4.addRow(['Year', 'SF Units', 'MF Units']);
    hdr4.eachCell(c => { Object.assign(c, headerStyle); });
    const sfArr = h.permitsSF || [];
    const mfArr = h.permitsMF || [];
    const years = [...new Set([...sfArr.map(p => p.yr), ...mfArr.map(p => p.yr)])].sort();
    for (const yr of years) {
      const sf = sfArr.find(p => p.yr === yr)?.v ?? '';
      const mf = mfArr.find(p => p.yr === yr)?.v ?? '';
      ws4.addRow([yr, sf, mf]);
    }

    // ── Tab 5: Competition ────────────────────────────────────────────────
    const ws5 = wb.addWorksheet('Competition');
    const compCols = ['Name', 'Builder', 'Product', 'Plans', 'SF Low', 'SF High', 'Price Low', 'Price High', '$/SF', 'Lots Total', 'Lots Remain', 'Monthly Abs', 'HOA', 'School District'];
    ws5.columns = compCols.map(() => ({ width: 16 }));
    const hdr5 = ws5.addRow(compCols);
    hdr5.eachCell(c => { Object.assign(c, headerStyle); });
    for (const c of (study.competition?.communities || [])) {
      ws5.addRow([c.name, c.builder, c.product, c.plans, c.sfLow, c.sfHigh, c.priceLow, c.priceHigh, c.psfAvg, c.lotsTotal, c.lotsRemain, c.monthlyAbs, c.hoa, c.schoolDist]);
    }

    // ── Tab 6: Absorption ─────────────────────────────────────────────────
    const ws6 = wb.addWorksheet('Absorption');
    ws6.columns = [{ width: 28 }, { width: 18 }];
    const abs = study.absorption || {};
    ws6.addRow(['Market-Wide Monthly', abs.marketWideMonthly]);
    ws6.addRow(['Annual Closings', abs.annualClosings]);
    ws6.addRow(['Demand Gap', abs.demandGap]);
    ws6.addRow(['HH Formation/Year', abs.hhFormationAnnual]);
    ws6.addRow(['New Supply/Year', abs.newSupplyAnnual]);
    ws6.addRow([]);
    ws6.addRow(['ABSORPTION BY PRICE BAND']).font = { bold: true };
    const hdr6b = ws6.addRow(['Band', 'Units', '%']);
    hdr6b.eachCell(c => { Object.assign(c, headerStyle); });
    for (const b of (abs.byPriceBand || [])) ws6.addRow([b.band, b.units, b.pct / 100]);

    // ── Tab 7: Pricing ────────────────────────────────────────────────────
    const ws7 = wb.addWorksheet('Pricing');
    const pCols = ['Segment', 'Price Range', '$/SF Range', 'Share of Sales', 'Builders'];
    ws7.columns = pCols.map(() => ({ width: 20 }));
    const hdr7 = ws7.addRow(pCols);
    hdr7.eachCell(c => { Object.assign(c, headerStyle); });
    for (const s of (study.pricing?.stratification || [])) {
      ws7.addRow([s.segment, s.priceRange, s.psfRange, s.shareOfSales / 100, s.builders]);
    }

    // ── Tab 8: Land Economics ─────────────────────────────────────────────
    const ws8 = wb.addWorksheet('Land');
    ws8.columns = [{ width: 28 }, { width: 18 }];
    const land = study.land || {};
    ws8.addRow(['Lot-to-Home Ratio', land.lotToHomeRatio ? land.lotToHomeRatio / 100 : null]);
    ws8.addRow(['Est Finished Lot Value', land.estFinishedLotValue]);
    ws8.addRow(['Raw Land Per Acre', land.rawLandPerAcre]);
    ws8.addRow(['Est Site Dev Per Lot', land.estSiteDev]);
    ws8.addRow(['Lot Inventory (months)', land.lotInventoryMonths]);
    ws8.addRow([]);
    ws8.addRow(['LAND COMPS']).font = { bold: true };
    const lcCols = ['Address', 'Acres', 'Ask Price', '$/Acre', 'Zoning', 'Status', 'Est Lots'];
    const hdr8 = ws8.addRow(lcCols);
    hdr8.eachCell(c => { Object.assign(c, headerStyle); });
    for (const c of (land.comps || [])) ws8.addRow([c.address, c.acres, c.askPrice, c.perAcre, c.zoning, c.status, c.estLots]);

    // ── Tab 9: Proforma ───────────────────────────────────────────────────
    const ws9 = wb.addWorksheet('Proforma');
    const pfCols = ['Line Item', 'Base Case', 'Downside', 'Upside'];
    ws9.columns = pfCols.map(() => ({ width: 18 }));
    const hdr9 = ws9.addRow(pfCols);
    hdr9.eachCell(c => { Object.assign(c, headerStyle); });
    const scenarios = study.proforma?.scenarios || [];
    const lineItems = ['asp', 'landLot', 'hardCost', 'softCost', 'selling', 'ga', 'financing', 'totalCost', 'margin', 'marginPct'];
    const lineLabels = ['Avg Selling Price', 'Land/Lot', 'Hard Cost', 'Soft Cost', 'Selling', 'G&A', 'Financing', 'Total Cost', 'Margin ($)', 'Margin (%)'];
    for (let i = 0; i < lineItems.length; i++) {
      const row = [lineLabels[i]];
      for (const s of scenarios) row.push(s[lineItems[i]]);
      ws9.addRow(row);
    }

    // ── Tab 10: Regulatory ────────────────────────────────────────────────
    const ws10 = wb.addWorksheet('Regulatory');
    ws10.columns = [{ width: 28 }, { width: 22 }, { width: 30 }];
    const reg = study.regulatory || {};
    ws10.addRow(['Zoning', reg.zoning]);
    ws10.addRow(['Max Density', reg.maxDensity]);
    ws10.addRow(['Entitlement Timeline', reg.entitlementTimeline]);
    ws10.addRow(['Total Fees/Unit', reg.totalFeesPerUnit]);
    ws10.addRow([]);
    ws10.addRow(['FEES']).font = { bold: true };
    const hdr10 = ws10.addRow(['Fee', 'Amount', 'Note']);
    hdr10.eachCell(c => { Object.assign(c, headerStyle); });
    for (const f of (reg.fees || [])) ws10.addRow([f.fee, f.amount, f.note]);

    // ── Tab 11: SWOT ──────────────────────────────────────────────────────
    const ws11 = wb.addWorksheet('SWOT');
    ws11.columns = [{ width: 12 }, { width: 60 }];
    const swot = study.swot || {};
    for (const cat of ['strengths', 'weaknesses', 'opportunities', 'threats']) {
      ws11.addRow([cat.charAt(0).toUpperCase() + cat.slice(1)]).font = { bold: true };
      for (const item of (swot[cat] || [])) ws11.addRow(['', item]);
      ws11.addRow([]);
    }

    // ── Write & return ────────────────────────────────────────────────────
    const fileName = `infinity-markets-${study.targetArea?.replace(/\s+/g, '-') || 'data'}-${Date.now()}.xlsx`;
    const filePath = path.join(os.tmpdir(), fileName);
    await wb.xlsx.writeFile(filePath);

    const { supabase } = req.app.locals;
    let url = null;
    try {
      const buf = fs.readFileSync(filePath);
      const storagePath = `reports/${fileName}`;
      const { error } = await supabase.storage.from('deliverables').upload(storagePath, buf, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true });
      if (!error) {
        const { data: urlData } = supabase.storage.from('deliverables').getPublicUrl(storagePath);
        url = urlData?.publicUrl;
      }
    } catch (_) {}

    if (!url) return res.download(filePath, fileName, () => { try { fs.unlinkSync(filePath); } catch (_) {} });
    try { fs.unlinkSync(filePath); } catch (_) {}
    return res.json({ url, fileName });

  } catch (err) {
    console.error('XLSX generation failed:', err);
    return res.status(500).json({ error: 'XLSX generation failed', detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PPTX — PptxGenJS executive deck
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/pptx', async (req, res) => {
  const { study } = req.body;
  if (!study) return res.status(400).json({ error: 'study data required' });

  try {
    const PptxGenJS = require('pptxgenjs');
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.33" × 7.5"
    pptx.author = 'Infinity Markets';

    const bgColor = '0B1120';
    const textColor = 'F9FAFB';
    const mutedColor = '9CA3AF';
    const accentColor = 'F59E0B';
    const surfaceColor = '1F2937';

    const masterOpts = { background: { color: bgColor } };

    // ── Slide 1: Title ────────────────────────────────────────────────────
    let slide = pptx.addSlide(masterOpts);
    slide.addText('INFINITY MARKETS', { x: 0.5, y: 1.5, w: 12, fontSize: 40, bold: true, color: accentColor, fontFace: 'Arial' });
    slide.addText('New Construction Market Study', { x: 0.5, y: 2.4, w: 12, fontSize: 24, color: textColor, fontFace: 'Arial' });
    slide.addText(study.targetArea || '', { x: 0.5, y: 3.2, w: 12, fontSize: 20, color: mutedColor, fontFace: 'Arial' });
    slide.addText(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), { x: 0.5, y: 4.0, w: 12, fontSize: 14, color: mutedColor, fontFace: 'Arial' });

    // ── Slide 2: Market Scorecard ─────────────────────────────────────────
    if (study.scorecard) {
      slide = pptx.addSlide(masterOpts);
      slide.addText('MARKET SCORECARD', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: accentColor, fontFace: 'Arial' });
      const scRows = [
        [{ text: 'Metric', options: { bold: true, color: textColor, fill: { color: surfaceColor } } },
         { text: 'Weight', options: { bold: true, color: textColor, fill: { color: surfaceColor }, align: 'center' } },
         { text: 'Score', options: { bold: true, color: textColor, fill: { color: surfaceColor }, align: 'center' } },
         { text: 'Rationale', options: { bold: true, color: textColor, fill: { color: surfaceColor } } }],
      ];
      for (const s of study.scorecard) {
        scRows.push([
          { text: s.metric, options: { color: textColor } },
          { text: String(s.weight), options: { color: mutedColor, align: 'center' } },
          { text: String(s.score), options: { color: accentColor, align: 'center', bold: true } },
          { text: s.rationale, options: { color: mutedColor, fontSize: 9 } },
        ]);
      }
      slide.addTable(scRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial', border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.5, 1, 1, 7.5] });
    }

    // ── Slide 3: Demographics KPIs ────────────────────────────────────────
    slide = pptx.addSlide(masterOpts);
    slide.addText('DEMOGRAPHICS', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: accentColor, fontFace: 'Arial' });
    const d = study.demographics || {};
    const kpis = [
      ['Population', fmtNum(d.population)], ['5yr Growth', d.popGrowth5yr ? `${d.popGrowth5yr}%` : '—'],
      ['Median HHI', d.mhi ? `$${fmtNum(d.mhi)}` : '—'], ['Homeownership', d.homeownershipRate ? `${d.homeownershipRate}%` : '—'],
      ['Households', fmtNum(d.households)], ['Unemployment', d.unemploymentRate ? `${d.unemploymentRate}%` : '—'],
    ];
    kpis.forEach(([label, val], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + col * 4, y: 1.2 + row * 2.2, w: 3.5, h: 1.8, fill: { color: surfaceColor }, rectRadius: 0.1 });
      slide.addText(val, { x: 0.5 + col * 4, y: 1.4 + row * 2.2, w: 3.5, fontSize: 28, bold: true, color: accentColor, align: 'center', fontFace: 'Arial' });
      slide.addText(label, { x: 0.5 + col * 4, y: 2.2 + row * 2.2, w: 3.5, fontSize: 12, color: mutedColor, align: 'center', fontFace: 'Arial' });
    });

    // ── Slide 4: Housing Market ───────────────────────────────────────────
    slide = pptx.addSlide(masterOpts);
    slide.addText('HOUSING MARKET', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: accentColor, fontFace: 'Arial' });
    const h = study.housing || {};
    const hKpis = [
      ['Median Value', h.medianValue ? `$${fmtNum(h.medianValue)}` : '—'],
      ['YoY Growth', h.valueGrowthYoY ? `${h.valueGrowthYoY}%` : '—'],
      ['Median DOM', h.medianDOM != null ? String(h.medianDOM) : '—'],
      ['Months Supply', h.monthsSupply != null ? String(h.monthsSupply) : '—'],
      ['Mortgage Rate', h.mortgageRate ? `${h.mortgageRate}%` : '—'],
      ['Median Rent', h.medianRent ? `$${fmtNum(h.medianRent)}` : '—'],
    ];
    hKpis.forEach(([label, val], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + col * 4, y: 1.2 + row * 2.2, w: 3.5, h: 1.8, fill: { color: surfaceColor }, rectRadius: 0.1 });
      slide.addText(val, { x: 0.5 + col * 4, y: 1.4 + row * 2.2, w: 3.5, fontSize: 28, bold: true, color: '3B82F6', align: 'center', fontFace: 'Arial' });
      slide.addText(label, { x: 0.5 + col * 4, y: 2.2 + row * 2.2, w: 3.5, fontSize: 12, color: mutedColor, align: 'center', fontFace: 'Arial' });
    });

    // ── Slide 5: Competition Table ────────────────────────────────────────
    if (study.competition?.communities?.length) {
      slide = pptx.addSlide(masterOpts);
      slide.addText('COMPETITIVE LANDSCAPE', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: accentColor, fontFace: 'Arial' });
      const cRows = [
        [{ text: 'Community', options: { bold: true, color: textColor, fill: { color: surfaceColor } } },
         { text: 'Builder', options: { bold: true, color: textColor, fill: { color: surfaceColor } } },
         { text: 'Product', options: { bold: true, color: textColor, fill: { color: surfaceColor }, align: 'center' } },
         { text: 'Price Range', options: { bold: true, color: textColor, fill: { color: surfaceColor }, align: 'center' } },
         { text: '$/SF', options: { bold: true, color: textColor, fill: { color: surfaceColor }, align: 'center' } },
         { text: 'Lots Rem', options: { bold: true, color: textColor, fill: { color: surfaceColor }, align: 'center' } }],
      ];
      for (const c of study.competition.communities.slice(0, 10)) {
        const priceRange = c.priceLow && c.priceHigh ? `$${fmtNum(c.priceLow)}–$${fmtNum(c.priceHigh)}` : '—';
        cRows.push([
          { text: c.name, options: { color: textColor } },
          { text: c.builder, options: { color: mutedColor } },
          { text: c.product || '', options: { color: mutedColor, align: 'center' } },
          { text: priceRange, options: { color: textColor, align: 'center' } },
          { text: c.psfAvg ? `$${c.psfAvg}` : '—', options: { color: accentColor, align: 'center' } },
          { text: c.lotsRemain != null ? String(c.lotsRemain) : '—', options: { color: mutedColor, align: 'center' } },
        ]);
      }
      slide.addTable(cRows, { x: 0.3, y: 1.0, w: 12.5, fontSize: 9, fontFace: 'Arial', border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.5, 2, 1, 2.5, 1, 1.2] });
    }

    // ── Slide 6: Absorption Summary ───────────────────────────────────────
    if (study.absorption) {
      slide = pptx.addSlide(masterOpts);
      slide.addText('ABSORPTION & DEMAND', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: accentColor, fontFace: 'Arial' });
      const abs = study.absorption;
      const absKpis = [
        ['Monthly Absorption', String(abs.marketWideMonthly || '—')],
        ['Annual Closings', String(abs.annualClosings || '—')],
        ['Demand Gap', String(abs.demandGap || '—')],
      ];
      absKpis.forEach(([label, val], i) => {
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5 + i * 4, y: 1.2, w: 3.5, h: 1.8, fill: { color: surfaceColor }, rectRadius: 0.1 });
        slide.addText(val, { x: 0.5 + i * 4, y: 1.4, w: 3.5, fontSize: 32, bold: true, color: '10B981', align: 'center', fontFace: 'Arial' });
        slide.addText(label, { x: 0.5 + i * 4, y: 2.3, w: 3.5, fontSize: 12, color: mutedColor, align: 'center', fontFace: 'Arial' });
      });
    }

    // ── Slide 7: Pricing Stratification ───────────────────────────────────
    if (study.pricing?.stratification?.length) {
      slide = pptx.addSlide(masterOpts);
      slide.addText('PRICING STRATIFICATION', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: accentColor, fontFace: 'Arial' });
      const pRows = [
        [{ text: 'Segment', options: { bold: true, color: textColor, fill: { color: surfaceColor } } },
         { text: 'Price Range', options: { bold: true, color: textColor, fill: { color: surfaceColor } } },
         { text: '$/SF', options: { bold: true, color: textColor, fill: { color: surfaceColor }, align: 'center' } },
         { text: 'Share', options: { bold: true, color: textColor, fill: { color: surfaceColor }, align: 'center' } },
         { text: 'Builders', options: { bold: true, color: textColor, fill: { color: surfaceColor } } }],
      ];
      for (const s of study.pricing.stratification) {
        pRows.push([
          { text: s.segment, options: { color: textColor } },
          { text: s.priceRange, options: { color: textColor } },
          { text: s.psfRange, options: { color: mutedColor, align: 'center' } },
          { text: `${s.shareOfSales}%`, options: { color: accentColor, align: 'center', bold: true } },
          { text: s.builders, options: { color: mutedColor } },
        ]);
      }
      slide.addTable(pRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial', border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [2.5, 2.5, 1.5, 1.2, 4.3] });
    }

    // ── Slide 8: Proforma ─────────────────────────────────────────────────
    if (study.proforma?.scenarios?.length) {
      slide = pptx.addSlide(masterOpts);
      slide.addText('PROFORMA SCENARIOS', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: accentColor, fontFace: 'Arial' });
      const scenarios = study.proforma.scenarios;
      const pfRows = [
        [{ text: '', options: { fill: { color: surfaceColor } } }, ...scenarios.map(s => ({ text: s.label, options: { bold: true, color: textColor, fill: { color: surfaceColor }, align: 'center' } }))],
      ];
      const pfLines = [
        ['Avg Selling Price', 'asp'], ['Land/Lot', 'landLot'], ['Hard Cost', 'hardCost'],
        ['Soft Cost', 'softCost'], ['Selling', 'selling'], ['G&A', 'ga'],
        ['Financing', 'financing'], ['Total Cost', 'totalCost'], ['Margin ($)', 'margin'], ['Margin (%)', 'marginPct'],
      ];
      for (const [label, key] of pfLines) {
        const row = [{ text: label, options: { color: textColor, bold: key === 'margin' || key === 'marginPct' } }];
        for (const s of scenarios) {
          const val = key === 'marginPct' ? `${s[key]}%` : `$${fmtNum(s[key])}`;
          const color = key === 'margin' || key === 'marginPct' ? '10B981' : mutedColor;
          row.push({ text: val, options: { color, align: 'center', bold: key === 'margin' || key === 'marginPct' } });
        }
        pfRows.push(row);
      }
      slide.addTable(pfRows, { x: 0.5, y: 1.0, w: 12, fontSize: 10, fontFace: 'Arial', border: { type: 'solid', pt: 0.5, color: '374151' }, colW: [3, 3, 3, 3] });
    }

    // ── Slide 9: SWOT ─────────────────────────────────────────────────────
    if (study.swot) {
      slide = pptx.addSlide(masterOpts);
      slide.addText('SWOT ANALYSIS', { x: 0.5, y: 0.3, w: 12, fontSize: 24, bold: true, color: accentColor, fontFace: 'Arial' });
      const quadrants = [
        { label: 'STRENGTHS', items: study.swot.strengths, color: '10B981', x: 0.5, y: 1.0 },
        { label: 'WEAKNESSES', items: study.swot.weaknesses, color: 'EF4444', x: 6.7, y: 1.0 },
        { label: 'OPPORTUNITIES', items: study.swot.opportunities, color: '3B82F6', x: 0.5, y: 4.0 },
        { label: 'THREATS', items: study.swot.threats, color: 'F97316', x: 6.7, y: 4.0 },
      ];
      for (const q of quadrants) {
        slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: q.x, y: q.y, w: 5.8, h: 2.8, fill: { color: surfaceColor }, rectRadius: 0.1 });
        slide.addText(q.label, { x: q.x + 0.3, y: q.y + 0.15, w: 5.2, fontSize: 12, bold: true, color: q.color, fontFace: 'Arial' });
        const bullets = (q.items || []).map(item => `• ${item}`).join('\n');
        slide.addText(bullets, { x: q.x + 0.3, y: q.y + 0.6, w: 5.2, h: 2, fontSize: 9, color: textColor, fontFace: 'Arial', valign: 'top' });
      }
    }

    // ── Slide 10: Disclaimer ──────────────────────────────────────────────
    slide = pptx.addSlide(masterOpts);
    slide.addText('DISCLAIMER', { x: 0.5, y: 1.5, w: 12, fontSize: 24, bold: true, color: accentColor, fontFace: 'Arial' });
    slide.addText('This market study is generated by Infinity Markets using publicly available data from government and commercial sources. It is intended for informational purposes and should not be construed as investment advice. All projections are estimates and actual results may vary.', { x: 0.5, y: 2.5, w: 12, fontSize: 12, color: mutedColor, fontFace: 'Arial' });
    slide.addText('Powered by Infinity Markets', { x: 0.5, y: 5.5, w: 12, fontSize: 14, color: accentColor, fontFace: 'Arial', align: 'center' });

    // ── Write & return ────────────────────────────────────────────────────
    const fileName = `infinity-markets-${study.targetArea?.replace(/\s+/g, '-') || 'deck'}-${Date.now()}.pptx`;
    const filePath = path.join(os.tmpdir(), fileName);
    await pptx.writeFile({ fileName: filePath });

    const { supabase } = req.app.locals;
    let url = null;
    try {
      const buf = fs.readFileSync(filePath);
      const storagePath = `reports/${fileName}`;
      const { error } = await supabase.storage.from('deliverables').upload(storagePath, buf, { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', upsert: true });
      if (!error) {
        const { data: urlData } = supabase.storage.from('deliverables').getPublicUrl(storagePath);
        url = urlData?.publicUrl;
      }
    } catch (_) {}

    if (!url) return res.download(filePath, fileName, () => { try { fs.unlinkSync(filePath); } catch (_) {} });
    try { fs.unlinkSync(filePath); } catch (_) {}
    return res.json({ url, fileName });

  } catch (err) {
    console.error('PPTX generation failed:', err);
    return res.status(500).json({ error: 'PPTX generation failed', detail: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US');
}

// ── PDF HTML Template ────────────────────────────────────────────────────────

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

  const wtdAvg = scorecard.length
    ? (scorecard.reduce((s, x) => s + x.score * x.weight, 0) / 100).toFixed(1)
    : '—';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0.5in 0.6in 0.75in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #1a1a2e; line-height: 1.5; background: #fff; }
  h1 { font-size: 28pt; color: #0B1120; margin-bottom: 4px; }
  h2 { font-size: 16pt; color: #F59E0B; border-bottom: 2px solid #F59E0B; padding-bottom: 4px; margin: 28px 0 12px; page-break-after: avoid; }
  h3 { font-size: 12pt; color: #374151; margin: 16px 0 8px; }
  .cover { text-align: center; padding-top: 200px; page-break-after: always; }
  .cover h1 { font-size: 36pt; color: #F59E0B; }
  .cover .subtitle { font-size: 18pt; color: #6B7280; margin-top: 8px; }
  .cover .date { font-size: 12pt; color: #9CA3AF; margin-top: 24px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }
  .kpi { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 12px; text-align: center; }
  .kpi .value { font-size: 20pt; font-weight: 700; color: #0B1120; }
  .kpi .label { font-size: 8pt; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 9pt; }
  th { background: #1F2937; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #E5E7EB; }
  tr:nth-child(even) td { background: #F9FAFB; }
  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
  .swot-box { border: 1px solid #E5E7EB; border-radius: 6px; padding: 12px; }
  .swot-box h3 { margin-top: 0; }
  .swot-box ul { padding-left: 16px; }
  .swot-box li { margin-bottom: 4px; font-size: 9pt; }
  .s-box h3 { color: #10B981; } .w-box h3 { color: #EF4444; }
  .o-box h3 { color: #3B82F6; } .t-box h3 { color: #F97316; }
  .page-break { page-break-before: always; }
  .disclaimer { margin-top: 40px; padding: 16px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 8pt; color: #6B7280; }
</style>
</head>
<body>

<div class="cover">
  <h1>INFINITY MARKETS</h1>
  <div class="subtitle">New Construction Market Study</div>
  <div class="subtitle" style="font-size:22pt;color:#0B1120;margin-top:16px;">${study.targetArea || ''}</div>
  <div class="date">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  <div class="date" style="margin-top:40px;">Prepared by Infinity Markets</div>
</div>

<h2>1. Demographics</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="value">${fmtNum(d.population)}</div><div class="label">Population</div></div>
  <div class="kpi"><div class="value">${d.popGrowth5yr != null ? d.popGrowth5yr + '%' : '—'}</div><div class="label">5-Year Growth</div></div>
  <div class="kpi"><div class="value">${d.mhi ? '$' + fmtNum(d.mhi) : '—'}</div><div class="label">Median HH Income</div></div>
  <div class="kpi"><div class="value">${fmtNum(d.households)}</div><div class="label">Households</div></div>
  <div class="kpi"><div class="value">${d.homeownershipRate != null ? d.homeownershipRate + '%' : '—'}</div><div class="label">Homeownership</div></div>
  <div class="kpi"><div class="value">${d.unemploymentRate != null ? d.unemploymentRate + '%' : '—'}</div><div class="label">Unemployment</div></div>
</div>

${d.incomeDist?.length ? `
<h3>Income Distribution</h3>
<table><tr>${d.incomeDist.map(b => `<th>${b.bracket}</th>`).join('')}</tr><tr>${d.incomeDist.map(b => `<td style="text-align:center">${b.pct}%</td>`).join('')}</tr></table>
` : ''}

<h2 class="page-break">2. Housing Market</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="value">${h.medianValue ? '$' + fmtNum(h.medianValue) : '—'}</div><div class="label">Median Value</div></div>
  <div class="kpi"><div class="value">${h.valueGrowthYoY != null ? h.valueGrowthYoY + '%' : '—'}</div><div class="label">YoY Growth</div></div>
  <div class="kpi"><div class="value">${h.medianDOM ?? '—'}</div><div class="label">Median DOM</div></div>
  <div class="kpi"><div class="value">${h.monthsSupply ?? '—'}</div><div class="label">Months Supply</div></div>
  <div class="kpi"><div class="value">${h.mortgageRate ? h.mortgageRate + '%' : '—'}</div><div class="label">Mortgage Rate</div></div>
  <div class="kpi"><div class="value">${h.medianRent ? '$' + fmtNum(h.medianRent) : '—'}</div><div class="label">Median Rent (2BR)</div></div>
</div>

<h2 class="page-break">3. Competitive Landscape</h2>
${comp.communities?.length ? `
<table>
<tr><th>Community</th><th>Builder</th><th>Product</th><th>Price Range</th><th>$/SF</th><th>Lots Rem</th><th>Abs/Mo</th></tr>
${comp.communities.map(c => `<tr><td>${c.name}</td><td>${c.builder}</td><td>${c.product || ''}</td><td>${c.priceLow && c.priceHigh ? '$' + fmtNum(c.priceLow) + '–$' + fmtNum(c.priceHigh) : '—'}</td><td>${c.psfAvg ? '$' + c.psfAvg : '—'}</td><td>${c.lotsRemain ?? '—'}</td><td>${c.monthlyAbs ?? '—'}</td></tr>`).join('')}
</table>` : ''}

<h2 class="page-break">4. Absorption & Demand</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="value">${abs.marketWideMonthly ?? '—'}</div><div class="label">Monthly Absorption</div></div>
  <div class="kpi"><div class="value">${abs.annualClosings ?? '—'}</div><div class="label">Annual Closings</div></div>
  <div class="kpi"><div class="value">${abs.demandGap ?? '—'}</div><div class="label">Annual Demand Gap</div></div>
</div>

${abs.byPriceBand?.length ? `
<h3>Absorption by Price Band</h3>
<table><tr><th>Band</th><th>Units</th><th>%</th></tr>
${abs.byPriceBand.map(b => `<tr><td>${b.band}</td><td>${b.units}</td><td>${b.pct}%</td></tr>`).join('')}
</table>` : ''}

<h2 class="page-break">5. Pricing Analysis</h2>
${pricing.stratification?.length ? `
<table><tr><th>Segment</th><th>Price Range</th><th>$/SF</th><th>Share</th><th>Builders</th></tr>
${pricing.stratification.map(s => `<tr><td>${s.segment}</td><td>${s.priceRange}</td><td>${s.psfRange}</td><td>${s.shareOfSales}%</td><td>${s.builders}</td></tr>`).join('')}
</table>` : ''}

<h2 class="page-break">6. Land Economics</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="value">${land.lotToHomeRatio ? land.lotToHomeRatio + '%' : '—'}</div><div class="label">Lot-to-Home Ratio</div></div>
  <div class="kpi"><div class="value">${land.estFinishedLotValue ? '$' + fmtNum(land.estFinishedLotValue) : '—'}</div><div class="label">Finished Lot Value</div></div>
  <div class="kpi"><div class="value">${land.rawLandPerAcre ? '$' + fmtNum(land.rawLandPerAcre) : '—'}</div><div class="label">Raw Land/Acre</div></div>
</div>

${land.comps?.length ? `
<h3>Land Comparables</h3>
<table><tr><th>Address</th><th>Acres</th><th>Ask Price</th><th>$/Acre</th><th>Zoning</th><th>Status</th><th>Est Lots</th></tr>
${land.comps.map(c => `<tr><td>${c.address}</td><td>${c.acres}</td><td>$${fmtNum(c.askPrice)}</td><td>$${fmtNum(c.perAcre)}</td><td>${c.zoning}</td><td>${c.status}</td><td>${c.estLots}</td></tr>`).join('')}
</table>` : ''}

<h2 class="page-break">7. Proforma Scenarios</h2>
${proforma.scenarios?.length ? `
<table>
<tr><th>Line Item</th>${proforma.scenarios.map(s => `<th>${s.label}</th>`).join('')}</tr>
<tr><td><strong>Avg Selling Price</strong></td>${proforma.scenarios.map(s => `<td>$${fmtNum(s.asp)}</td>`).join('')}</tr>
<tr><td>Land/Lot</td>${proforma.scenarios.map(s => `<td>$${fmtNum(s.landLot)}</td>`).join('')}</tr>
<tr><td>Hard Cost</td>${proforma.scenarios.map(s => `<td>$${fmtNum(s.hardCost)}</td>`).join('')}</tr>
<tr><td>Soft Cost</td>${proforma.scenarios.map(s => `<td>$${fmtNum(s.softCost)}</td>`).join('')}</tr>
<tr><td>Selling</td>${proforma.scenarios.map(s => `<td>$${fmtNum(s.selling)}</td>`).join('')}</tr>
<tr><td>G&A</td>${proforma.scenarios.map(s => `<td>$${fmtNum(s.ga)}</td>`).join('')}</tr>
<tr><td>Financing</td>${proforma.scenarios.map(s => `<td>$${fmtNum(s.financing)}</td>`).join('')}</tr>
<tr style="border-top:2px solid #374151"><td><strong>Total Cost</strong></td>${proforma.scenarios.map(s => `<td><strong>$${fmtNum(s.totalCost)}</strong></td>`).join('')}</tr>
<tr style="background:#F0FDF4"><td><strong>Margin ($)</strong></td>${proforma.scenarios.map(s => `<td><strong>$${fmtNum(s.margin)}</strong></td>`).join('')}</tr>
<tr style="background:#F0FDF4"><td><strong>Margin (%)</strong></td>${proforma.scenarios.map(s => `<td><strong>${s.marginPct}%</strong></td>`).join('')}</tr>
</table>` : ''}

<h2 class="page-break">8. Regulatory Environment</h2>
<p><strong>Zoning:</strong> ${reg.zoning || '—'}</p>
<p><strong>Max Density:</strong> ${reg.maxDensity || '—'}</p>
<p><strong>Entitlement Timeline:</strong> ${reg.entitlementTimeline || '—'}</p>
<p><strong>Total Fees/Unit:</strong> ${reg.totalFeesPerUnit ? '$' + fmtNum(reg.totalFeesPerUnit) : '—'}</p>

${reg.fees?.length ? `
<h3>Fee Schedule</h3>
<table><tr><th>Fee</th><th>Amount</th><th>Note</th></tr>
${reg.fees.map(f => `<tr><td>${f.fee}</td><td>${f.amount}</td><td>${f.note}</td></tr>`).join('')}
</table>` : ''}

${reg.utilities?.length ? `
<h3>Utilities</h3>
<table><tr><th>Utility</th><th>Provider</th><th>Status</th><th>Note</th></tr>
${reg.utilities.map(u => `<tr><td>${u.utility}</td><td>${u.provider}</td><td>${u.status}</td><td>${u.note}</td></tr>`).join('')}
</table>` : ''}

<h2 class="page-break">9. Market Scorecard</h2>
<div class="kpi-grid" style="grid-template-columns:1fr;">
  <div class="kpi"><div class="value" style="font-size:32pt;color:#F59E0B;">${wtdAvg}</div><div class="label">Weighted Score (out of 10)</div></div>
</div>
<table>
<tr><th>Metric</th><th>Weight</th><th>Score</th><th>Rationale</th></tr>
${scorecard.map(s => `<tr><td>${s.metric}</td><td>${s.weight}%</td><td><strong>${s.score}</strong></td><td style="font-size:8pt">${s.rationale}</td></tr>`).join('')}
</table>

<h2>10. SWOT Analysis</h2>
<div class="swot-grid">
  <div class="swot-box s-box"><h3>Strengths</h3><ul>${(swot.strengths || []).map(s => `<li>${s}</li>`).join('')}</ul></div>
  <div class="swot-box w-box"><h3>Weaknesses</h3><ul>${(swot.weaknesses || []).map(s => `<li>${s}</li>`).join('')}</ul></div>
  <div class="swot-box o-box"><h3>Opportunities</h3><ul>${(swot.opportunities || []).map(s => `<li>${s}</li>`).join('')}</ul></div>
  <div class="swot-box t-box"><h3>Threats</h3><ul>${(swot.threats || []).map(s => `<li>${s}</li>`).join('')}</ul></div>
</div>

<div class="disclaimer">
  <strong>Disclaimer:</strong> This market study is generated by Infinity Markets using publicly available data from government and commercial sources including the U.S. Census Bureau, FRED, BLS, BEA, HUD, Redfin, Zillow, FHFA, HMDA, and SEC EDGAR. Analysis and scoring powered by Anthropic Claude. This report is for informational purposes only and should not be construed as investment advice. All projections are estimates based on available data and professional judgment; actual results may vary materially.
</div>

</body>
</html>`;
}

module.exports = router;
