/**
 * Infinity Markets v4.1 — Deliverables Route
 *
 * POST /api/deliverables/pdf  → Puppeteer HTML → PDF (45+ pages)
 * POST /api/deliverables/xlsx → ExcelJS 13-tab workbook
 * POST /api/deliverables/pptx → PptxGenJS 25-slide deck
 *
 * v4.1 (V41-1 / H-6) — file split:
 *   ./deliverables/helpers.js  — fmt/esc/safe/uploadAndRespond/deepMergeNullWins
 *   ./deliverables/pdf.js      — buildPDFHTML + collectSources (HTML generation)
 *   ./deliverables/xlsx.js     — generateXLSX (ExcelJS workbook)
 *   ./deliverables/pptx.js     — generatePPTX (PptxGenJS deck)
 *   deliverables.js (this file) — thin route-handler shim
 *
 * v1.8 (Sprint 5.2): field-coverage release — every study field renders.
 * v1.7 (Sprint 5.1): safeStr helper; puppeteer-core + @sparticuz/chromium on Render.
 */
const express = require('express');
const router  = express.Router();
const path    = require('path');
const os      = require('os');

// v4.1 (V41-1 / H-6): sub-module imports.
const { esc, uploadAndRespond } = require('./deliverables/helpers');
const { buildPDFHTML }          = require('./deliverables/pdf');
const { generateXLSX }          = require('./deliverables/xlsx');
const { generatePPTX }          = require('./deliverables/pptx');

/* ═══════════════════════════════════════════════════════════════════════════
   PDF — Puppeteer server-side render
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
   XLSX — ExcelJS 13-tab workbook
   ═══════════════════════════════════════════════════════════════════════════ */
router.post('/xlsx', async (req, res) => {
  const { study } = req.body;
  if (!study) return res.status(400).json({ error: 'study data required' });
  try {
    await generateXLSX(study, res, req.app.locals.supabase);
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
   PPTX — PptxGenJS 25-slide deck
   ═══════════════════════════════════════════════════════════════════════════ */
router.post('/pptx', async (req, res) => {
  const { study } = req.body;
  if (!study) return res.status(400).json({ error: 'study data required' });
  try {
    await generatePPTX(study, res, req.app.locals.supabase);
  } catch (err) {
    console.error('PPTX generation failed:', err);
    return res.status(500).json({
      error: 'PPTX generation failed',
      detail: err.message,
      where: (err.stack || '').split('\n')[1] || null,
    });
  }
});

module.exports = router;
