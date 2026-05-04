/**
 * Infinity Markets v4.2.0 — Editorial PDF stylesheet
 *
 * Forbes Capretto editorial / institutional palette:
 *   Forbes green     #004D41   (ink, ribbons, headers, dividers)
 *   Forbes brass     #D3B257   (KPI emphasis, GO chip, callouts)
 *   Ivory canvas     #F7F3EC   (light section banding)
 *   Charcoal ink     #1A1A1A   (body text)
 *   Hairline rule    rgba(26,26,26,0.10)
 *
 * Typography:
 *   Source Serif 4 — display headings, lede, KPI numerals, large quotes
 *   Inter           — body, tables, footnotes, eyebrows, ribbons
 *   JetBrains Mono  — figures (tabular nums applied separately)
 *
 * The fonts are loaded via @import inside the <style> block so Puppeteer
 * fetches them at PDF render time (Render's puppeteer container has
 * outbound network). For air-gapped renders we'd self-host the woff2 — a
 * later pass; out of scope for v4.2.0.
 *
 * This module exports:
 *   PDF_STYLES_CSS      — the master <style> block contents
 *   buildCoverHTML(cfg) — the cover page HTML
 *   buildAppendixCSS    — additional CSS shared with the manifest appendix
 */

/* ── Embed brand logos as base64 data URIs so Puppeteer NEVER 404s ────────── */
const fs = require('fs');
const path = require('path');

let LOGO_PRIMARY_DATAURI = '';
let LOGO_REVERSE_DATAURI = '';
try {
  const primary = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'brand', 'forbes-capretto-logo.svg'));
  LOGO_PRIMARY_DATAURI = 'data:image/svg+xml;base64,' + primary.toString('base64');
} catch (_) { /* logo missing → renderer falls back to wordmark text */ }
try {
  const reverse = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'brand', 'forbes-capretto-logo-reverse.svg'));
  LOGO_REVERSE_DATAURI = 'data:image/svg+xml;base64,' + reverse.toString('base64');
} catch (_) {}

const PDF_STYLES_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,500;8..60,600;8..60,700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* ── Editorial page setup ─────────────────────────────────────────────── */
@page {
  size: Letter;
  margin: 0.6in 0.65in 0.7in;
  @bottom-left   { content: "FORBES CAPRETTO  ·  INFINITY MARKETS"; font-family: 'Inter', sans-serif; font-size: 8pt; color: #6B6B66; letter-spacing: 0.18em; }
  @bottom-center { content: "—"; color: #B4B4AE; }
  @bottom-right  { content: "Page " counter(page) " of " counter(pages); font-family: 'Inter', sans-serif; font-size: 8pt; color: #6B6B66; font-variant-numeric: tabular-nums; }
}
@page:first {
  margin: 0;
  @bottom-left   { content: ""; }
  @bottom-center { content: ""; }
  @bottom-right  { content: ""; }
}
@page :left  { @top-left  { content: ""; } }
@page :right { @top-right { content: ""; } }

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10.25pt;
  color: #1A1A1A;
  line-height: 1.55;
  background: #FFFFFF;
  -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: 'kern', 'liga', 'tnum', 'lnum';
}

/* ── Headings (display serif, restrained) ────────────────────────────── */
h1 { font-family: 'Source Serif 4', Georgia, serif; font-weight: 400; font-size: 30pt; color: #004D41; letter-spacing: -0.018em; line-height: 1.12; margin-bottom: 8pt; }
h2 {
  font-family: 'Source Serif 4', Georgia, serif;
  font-weight: 400;
  font-size: 20pt;
  color: #1A1A1A;
  letter-spacing: -0.012em;
  line-height: 1.18;
  margin: 28pt 0 6pt;
  padding-top: 10pt;
  padding-bottom: 4pt;
  border-top: 2pt solid #004D41;
  page-break-after: avoid;
}
h2 .num {
  display: inline-block;
  font-family: 'Source Serif 4', Georgia, serif;
  font-style: italic;
  font-weight: 300;
  color: #B47C10;
  margin-right: 12pt;
  font-size: 18pt;
  letter-spacing: -0.01em;
}
h2 .eyebrow {
  display: block;
  font-family: 'Inter', sans-serif;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.20em;
  text-transform: uppercase;
  color: #004D41;
  margin-bottom: 4pt;
}
h3 {
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 11pt;
  color: #1A1A1A;
  margin: 14pt 0 6pt;
  letter-spacing: 0.005em;
  page-break-after: avoid;
}
h3.eyebrow {
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 8.5pt;
  letter-spacing: 0.18em;
  color: #004D41;
  text-transform: uppercase;
  margin: 14pt 0 4pt;
}
.lede {
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 12.5pt;
  line-height: 1.55;
  color: #1A1A1A;
  font-weight: 400;
  letter-spacing: -0.005em;
  margin: 4pt 0 18pt;
  max-width: 6.4in;
}

p {
  margin-bottom: 9pt;
  color: #1A1A1A;
  hyphens: auto;
}
p.narrative { font-size: 10pt; color: #3A3A3A; line-height: 1.65; margin: 6pt 0 14pt; }
p.note { font-size: 8.5pt; color: #6B6B66; font-style: italic; line-height: 1.55; margin-top: 6pt; }

a, a:visited { color: #004D41; text-decoration: none; border-bottom: 0.5pt solid rgba(0, 77, 65, 0.4); }

hr.rule { border: 0; border-top: 0.75pt solid rgba(26, 26, 26, 0.12); margin: 14pt 0; }
hr.rule.brass { border-top: 1.5pt solid #D3B257; margin: 18pt 0; }
hr.rule.green { border-top: 1.5pt solid #004D41; margin: 18pt 0; }

/* ── Cover page ───────────────────────────────────────────────────────── */
.cover {
  page-break-after: always;
  position: relative;
  height: 11in;
  width: 8.5in;
  padding: 0.85in 0.85in 0.7in;
  color: #FFFFFF;
  background: #004D41;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}
.cover::before {
  content: "";
  position: absolute;
  top: 0; right: 0;
  width: 4in; height: 11in;
  background:
    repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 1.5pt, transparent 1.5pt 14pt);
  pointer-events: none;
}
.cover-mark {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 2;
}
.cover-mark img { height: 36pt; }
.cover-mark .id {
  font-family: 'Inter', sans-serif;
  font-size: 8pt;
  font-weight: 600;
  letter-spacing: 0.32em;
  color: #D3B257;
  text-transform: uppercase;
}
.cover-body {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 18pt;
  margin-top: 2in;
}
.cover-eyebrow {
  font-family: 'Inter', sans-serif;
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 0.32em;
  color: #D3B257;
  text-transform: uppercase;
}
.cover-title {
  font-family: 'Source Serif 4', Georgia, serif;
  font-weight: 400;
  font-size: 56pt;
  color: #FFFFFF;
  letter-spacing: -0.025em;
  line-height: 1.04;
  max-width: 6.6in;
}
.cover-title em { font-style: italic; color: #D3B257; }
.cover-sub {
  font-family: 'Source Serif 4', Georgia, serif;
  font-weight: 300;
  font-size: 17pt;
  color: rgba(255,255,255,0.85);
  letter-spacing: -0.005em;
  line-height: 1.4;
  max-width: 5.6in;
  margin-top: 2pt;
}
.cover-meta {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18pt;
  border-top: 1pt solid rgba(255,255,255,0.18);
  padding-top: 22pt;
}
.cover-meta .cell .l {
  font-family: 'Inter', sans-serif;
  font-size: 7.5pt;
  font-weight: 600;
  letter-spacing: 0.20em;
  color: #D3B257;
  text-transform: uppercase;
  margin-bottom: 4pt;
}
.cover-meta .cell .v {
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 13pt;
  font-weight: 400;
  color: #FFFFFF;
  letter-spacing: -0.005em;
  line-height: 1.25;
}
.cover-verdict {
  position: absolute;
  bottom: 0.85in;
  right: 0.85in;
  z-index: 3;
  text-align: right;
}
.cover-verdict .l {
  font-family: 'Inter', sans-serif;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.32em;
  color: rgba(255,255,255,0.62);
  margin-bottom: 6pt;
}
.cover-verdict .pill {
  display: inline-block;
  font-family: 'Inter', sans-serif;
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: 0.32em;
  padding: 9pt 22pt;
  border-radius: 30pt;
  text-transform: uppercase;
}
.pill-go        { background: #D3B257; color: #003329; }
.pill-condition { background: rgba(211,178,87,0.55); color: #FFFFFF; border: 1pt solid #D3B257; }
.pill-no-go     { background: #FFFFFF; color: #7A1B1B; border: 1pt solid #FFFFFF; }

/* ── Inside-cover (TOC) ───────────────────────────────────────────────── */
.toc-page { page-break-after: always; padding-top: 12pt; }
.toc-eyebrow {
  font-family: 'Inter', sans-serif;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.32em;
  color: #004D41;
  text-transform: uppercase;
  margin-bottom: 6pt;
}
.toc-title {
  font-family: 'Source Serif 4', Georgia, serif;
  font-weight: 400;
  font-size: 28pt;
  color: #1A1A1A;
  letter-spacing: -0.018em;
  line-height: 1.1;
  margin-bottom: 24pt;
}
.toc-list { list-style: none; }
.toc-list li {
  display: grid;
  grid-template-columns: 30pt 1fr auto;
  gap: 12pt;
  padding: 10pt 0;
  border-bottom: 0.5pt solid rgba(26,26,26,0.10);
  font-family: 'Inter', sans-serif;
  font-size: 11pt;
  color: #1A1A1A;
}
.toc-list li .num {
  font-family: 'Source Serif 4', Georgia, serif;
  font-style: italic;
  font-weight: 300;
  color: #B47C10;
  font-size: 13pt;
}
.toc-list li .pg {
  font-family: 'Inter', sans-serif;
  font-size: 9.5pt;
  color: #6B6B66;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

/* ── Executive summary ────────────────────────────────────────────────── */
.exec-summary { page-break-after: always; padding-top: 4pt; }
.exec-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12pt;
  margin: 16pt 0 22pt;
}
.exec-tile {
  background: #FAF7F0;
  border: 0.5pt solid rgba(26,26,26,0.10);
  border-left: 2pt solid #004D41;
  padding: 12pt 14pt;
  page-break-inside: avoid;
}
.exec-tile.brass { border-left-color: #D3B257; }
.exec-tile .l {
  font-family: 'Inter', sans-serif;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #004D41;
  text-transform: uppercase;
  margin-bottom: 6pt;
}
.exec-tile .v {
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 18pt;
  font-weight: 400;
  color: #1A1A1A;
  letter-spacing: -0.012em;
  line-height: 1.05;
}
.exec-tile .s {
  font-family: 'Inter', sans-serif;
  font-size: 8pt;
  color: #6B6B66;
  margin-top: 4pt;
}
.exec-block {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18pt;
  margin-top: 18pt;
}
.exec-callouts {
  background: #F7F3EC;
  border-left: 2pt solid #D3B257;
  padding: 14pt 18pt;
}
.exec-callouts h4 {
  font-family: 'Inter', sans-serif;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #7A5A1F;
  text-transform: uppercase;
  margin-bottom: 8pt;
}
.exec-callouts ol { margin-left: 16pt; padding-left: 0; }
.exec-callouts li { font-size: 10pt; line-height: 1.5; margin-bottom: 6pt; color: #3A3A3A; }

/* ── KPI grid ─────────────────────────────────────────────────────────── */
.kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10pt; margin: 12pt 0; }
.kpi-grid.four { grid-template-columns: repeat(4, 1fr); }
.kpi-grid.five { grid-template-columns: repeat(5, 1fr); }
.kpi-grid.six  { grid-template-columns: repeat(6, 1fr); }
.kpi {
  background: #FFFFFF;
  border: 0.5pt solid rgba(26,26,26,0.12);
  border-left: 2pt solid #004D41;
  padding: 11pt 12pt;
  page-break-inside: avoid;
  display: flex;
  flex-direction: column;
  gap: 4pt;
}
.kpi.brass { border-left-color: #D3B257; }
.kpi.red   { border-left-color: #A82020; }
.kpi .label {
  font-family: 'Inter', sans-serif;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: #004D41;
  text-transform: uppercase;
}
.kpi .value {
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 22pt;
  font-weight: 400;
  letter-spacing: -0.018em;
  line-height: 1.04;
  color: #1A1A1A;
}
.kpi .value.accent { color: #D3B257; }
.kpi .value.green  { color: #004D41; }
.kpi .value.red    { color: #A82020; }
.kpi .value.muted  { color: #6B6B66; }
.kpi .value.blue   { color: #0B4EA0; }
.kpi .sub {
  font-family: 'Inter', sans-serif;
  font-size: 8pt;
  color: #6B6B66;
  margin-top: 2pt;
}
.kpi .delta {
  font-family: 'Inter', sans-serif;
  font-size: 8pt;
  font-weight: 600;
  display: inline-block;
}
.kpi .delta.pos { color: #0F6655; }
.kpi .delta.neg { color: #A82020; }

/* ── Tables (editorial hairline rules) ────────────────────────────────── */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 8pt 0 14pt;
  font-family: 'Inter', sans-serif;
  font-size: 9pt;
  font-variant-numeric: tabular-nums lining-nums;
  page-break-inside: auto;
}
th {
  background: transparent;
  color: #004D41;
  padding: 8pt 10pt 6pt;
  text-align: left;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 7.5pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  border-bottom: 1.25pt solid #004D41;
  vertical-align: bottom;
}
td {
  padding: 6.5pt 10pt;
  border-bottom: 0.5pt solid rgba(26,26,26,0.08);
  vertical-align: top;
  color: #1A1A1A;
}
tr:nth-child(even) td { background: #FAF7F0; }
tr:hover td { background: #F1EAD8; }
.text-right { text-align: right; }
.text-center { text-align: center; }
.bold { font-weight: 600; }
.highlight-row td { background: rgba(0, 77, 65, 0.07) !important; font-weight: 600; }

.scope-tag {
  display: inline-block;
  background: rgba(211,178,87,0.14);
  color: #7A5A1F;
  padding: 2pt 8pt;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  border-radius: 10pt;
  margin-left: 6pt;
}

/* ── Bar charts (editorial) ───────────────────────────────────────────── */
.bar-chart { margin: 10pt 0 12pt; }
.bar-row { display: flex; align-items: center; margin-bottom: 5pt; }
.bar-label { width: 138pt; font-family: 'Inter', sans-serif; font-size: 8.5pt; color: #3A3A3A; text-align: right; padding-right: 10pt; flex-shrink: 0; }
.bar-track { flex: 1; height: 14pt; background: #F1EAD8; border-radius: 1pt; overflow: hidden; position: relative; }
.bar-fill { height: 100%; display: flex; align-items: center; padding-left: 8pt; font-family: 'Inter', sans-serif; font-size: 7pt; color: #FFFFFF; font-weight: 600; letter-spacing: 0.04em; }
.bar-fill.green { background: #004D41; }
.bar-fill.brass { background: #D3B257; color: #1A1A1A; }
.bar-fill.muted { background: rgba(0,77,65,0.42); }

/* ── SWOT ─────────────────────────────────────────────────────────────── */
.swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; margin: 12pt 0; }
.swot-box {
  background: #FFFFFF;
  border: 0.5pt solid rgba(26,26,26,0.10);
  border-top: 2pt solid #004D41;
  padding: 14pt;
  page-break-inside: avoid;
}
.swot-box h3 { margin-top: 0; font-size: 9pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #004D41; margin-bottom: 8pt; }
.swot-box ul { padding-left: 0; list-style: none; margin-top: 4pt; }
.swot-box li { margin-bottom: 5pt; font-size: 9pt; line-height: 1.5; color: #3A3A3A; padding-left: 12pt; position: relative; }
.swot-box li::before { content: "—"; position: absolute; left: 0; color: #D3B257; font-weight: 700; }
.s-box { border-top-color: #004D41; }
.w-box { border-top-color: #A82020; }
.w-box h3 { color: #A82020; }
.o-box { border-top-color: #D3B257; }
.o-box h3 { color: #7A5A1F; }
.t-box { border-top-color: #B47C10; }
.t-box h3 { color: #B47C10; }

/* ── Score block (scorecard tab) ──────────────────────────────────────── */
.score-big { text-align: center; margin: 24pt 0 18pt; padding: 22pt 0; border-top: 1.5pt solid #004D41; border-bottom: 1.5pt solid #004D41; }
.score-big .number { font-family: 'Source Serif 4', Georgia, serif; font-size: 56pt; font-weight: 400; letter-spacing: -0.02em; line-height: 1; color: #004D41; }
.score-big .out-of { font-family: 'Source Serif 4', Georgia, serif; font-style: italic; font-weight: 300; font-size: 18pt; color: #6B6B66; margin-left: 6pt; }
.score-big .rec { display: inline-block; margin-top: 12pt; padding: 8pt 24pt; font-family: 'Inter', sans-serif; font-size: 11pt; font-weight: 700; letter-spacing: 0.32em; text-transform: uppercase; border-radius: 30pt; }
.rec-strong  { background: #004D41; color: #FFFFFF; }
.rec-caution { background: #D3B257; color: #3A2A06; }
.rec-pass    { background: #FFFFFF; color: #7A1B1B; border: 1pt solid #7A1B1B; }

/* ── Provenance chips (V41-4 lineage, editorial recolor) ──────────────── */
.prov, .prov-error, .prov-proxy, .prov-asp-err{
  display: inline-block;
  font-family: 'Inter', sans-serif;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.10em;
  padding: 1.5pt 6pt;
  border-radius: 10pt;
  text-transform: uppercase;
  margin-left: 4pt;
  vertical-align: middle;
  line-height: 1.3;
}
.prov-measured{ color: #003329; background: rgba(0,77,65,0.12); border: 0.5pt solid #004D41; }
.prov-derived{ color: #072E60; background: rgba(11,78,160,0.10); border: 0.5pt solid #0B4EA0; }
.prov-modeled{ color: #6F4B08; background: rgba(180,124,16,0.12); border: 0.5pt solid #B47C10; }
.prov-llm{ color: #3F2D5C; background: rgba(108,76,156,0.12); border: 0.5pt solid #6C4C9C; }
.prov-missing{ color: #6B6B66; background: rgba(26,26,26,0.04); border: 0.5pt solid rgba(26,26,26,0.20); }
.prov-error{ color: #6B1212; background: rgba(168,32,32,0.10); border: 0.5pt solid #A82020; }
.prov-error, .prov-asp-err{ color: #6B1212; background: rgba(168,32,32,0.10); border: 0.5pt solid #A82020; }
.prov-proxy{ color: #6F4B08; background: rgba(211,178,87,0.18); border: 0.5pt solid #B47C10; }

.prov-error-block{
  margin: 10pt 0;
  padding: 12pt 14pt;
  background: rgba(168,32,32,0.05);
  border-left: 2pt solid #A82020;
  font-size: 9pt;
  line-height: 1.5;
  color: #1A1A1A;
}
.prov-error-block strong { color: #A82020; font-weight: 700; }

/* ── Disclaimer + Source manifest (Appendix A) ────────────────────────── */
.page-break { page-break-before: always; }
.disclaimer { margin-top: 24pt; padding: 14pt 16pt; background: #FAF7F0; border: 0.5pt solid rgba(26,26,26,0.10); border-left: 2pt solid #D3B257; font-size: 8pt; color: #3A3A3A; line-height: 1.65; }
.disclaimer strong { color: #1A1A1A; }

.source-list { font-size: 8pt; color: #3A3A3A; }
.source-list td { padding: 4pt 8pt; font-size: 8pt; vertical-align: top; }
.source-list th { font-size: 7pt; }
.source-list code, .manifest-table code {
  font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
  font-size: 7.5pt;
  color: #1A1A1A;
  background: rgba(26,26,26,0.04);
  padding: 1pt 4pt;
  border-radius: 2pt;
}
.manifest-table {
  font-size: 8pt;
}
.manifest-table th { font-size: 7pt; }
.manifest-table .url { color: #004D41; word-break: break-all; }

/* ── Section number ribbon ────────────────────────────────────────────── */
.section-mast {
  display: flex;
  align-items: flex-end;
  gap: 14pt;
  margin: 30pt 0 0;
  padding-bottom: 6pt;
  border-bottom: 2pt solid #004D41;
  page-break-after: avoid;
}
.section-mast .num {
  font-family: 'Source Serif 4', Georgia, serif;
  font-style: italic;
  font-weight: 300;
  color: #B47C10;
  font-size: 36pt;
  letter-spacing: -0.025em;
  line-height: 1;
  flex-shrink: 0;
}
.section-mast .label {
  flex: 1;
}
.section-mast .label .eyebrow {
  font-family: 'Inter', sans-serif;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.20em;
  color: #004D41;
  text-transform: uppercase;
}
.section-mast .label h2 {
  margin: 4pt 0 0;
  padding: 0;
  border: 0;
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 22pt;
  font-weight: 400;
  color: #1A1A1A;
  letter-spacing: -0.012em;
  line-height: 1.1;
}

/* ── Chip strip on KPI rows ───────────────────────────────────────────── */
.chip-strip { display: flex; align-items: center; gap: 6pt; flex-wrap: wrap; margin-top: 4pt; }

/* ── Legacy class compat shims (for existing classes still emitted) ───── */
.kpi .value.orange { color: #B47C10; }
.bar-fill.gold { background: #D3B257; color: #1A1A1A; }
.bar-fill.blue { background: #0B4EA0; }

/* ── Legacy class compat additions (v4.1.x → v4.2.0 migration) ────────── */
.def-list {
  display: grid;
  grid-template-columns: 130pt 1fr;
  gap: 6pt 16pt;
  margin: 8pt 0 14pt;
  padding: 10pt 12pt;
  background: #FAF7F0;
  border-left: 2pt solid #D3B257;
  border-radius: 1pt;
}
.def-list dt { font-family: 'Inter', sans-serif; font-size: 8pt; font-weight: 700; letter-spacing: 0.16em; color: #004D41; text-transform: uppercase; padding-top: 1pt; }
.def-list dd { font-family: 'Inter', sans-serif; font-size: 9.5pt; color: #1A1A1A; }
.footer-note { margin-top: 10pt; padding-top: 8pt; font-family: 'Inter', sans-serif; font-size: 8pt; color: #6B6B66; line-height: 1.55; border-top: 0.5pt solid rgba(26,26,26,0.10); }
.score-summary { margin: 12pt 0; padding: 14pt 18pt; background: #FAF7F0; border-left: 2pt solid #004D41; }
.score-summary p { margin: 0; font-size: 10pt; color: #3A3A3A; line-height: 1.55; }

/* Legacy wrapper alias for older emit paths that still use the wrapper. */
.prov-chip{ display: inline-block; font-family: 'Inter', sans-serif; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.10em; padding: 1.5pt 6pt; border-radius: 10pt; text-transform: uppercase; margin-left: 4pt; vertical-align: middle; line-height: 1.3; }
.prov-chip.prov-dot{ padding: 0 4pt; font-size: 9pt; line-height: 1; letter-spacing: 0; }
.prov-error-head{ font-family: 'Inter', sans-serif; font-weight: 700; color: #A82020; font-size: 9.5pt; letter-spacing: 0.04em; }
.prov-error-body{ color: #3A3A3A; font-size: 9pt; margin-top: 4pt; line-height: 1.5; }

`;

/**
 * Build the cover-page HTML.
 * @param {object} cfg  { targetArea, fips, cbsa, dateLine, studyId, verdict, scoreText }
 */
function buildCoverHTML(cfg) {
  const {
    targetArea = "—",
    fips = "—",
    cbsa = "—",
    dateLine = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    studyId = "",
    verdict = null,            // 'go' | 'conditional' | 'no-go' | null
    scoreText = null,
  } = cfg || {};

  const verdictMap = {
    "go":          { label: "GO",          cls: "pill-go" },
    "conditional": { label: "CONDITIONAL", cls: "pill-condition" },
    "no-go":       { label: "NO-GO",       cls: "pill-no-go" },
  };
  const v = verdictMap[verdict];

  const logoHTML = LOGO_REVERSE_DATAURI
    ? `<img src="${LOGO_REVERSE_DATAURI}" alt="Forbes Capretto Homes" />`
    : `<span style="font-family:'Source Serif 4',serif;font-style:italic;font-size:14pt;color:#FFF;">Forbes Capretto</span>`;

  return `
  <div class="cover">
    <div class="cover-mark">
      ${logoHTML}
      <div class="id">INFINITY MARKETS · v4.2</div>
    </div>
    <div class="cover-body">
      <div class="cover-eyebrow">Land underwriting · Market study</div>
      <h1 class="cover-title">${escapeHTML(targetArea)}</h1>
      <p class="cover-sub">An institutional-grade analysis of demographics, supply, competition, pricing, absorption, land economics, regulatory burden, and financial pro forma — every figure provenance-tagged.</p>
    </div>
    <div class="cover-meta">
      <div class="cell"><div class="l">Date</div><div class="v">${escapeHTML(dateLine)}</div></div>
      <div class="cell"><div class="l">FIPS</div><div class="v">${escapeHTML(fips)}</div></div>
      <div class="cell"><div class="l">CBSA</div><div class="v">${escapeHTML(cbsa)}</div></div>
      <div class="cell"><div class="l">Edition</div><div class="v">v4.2.0 · Editorial</div></div>
    </div>
    ${v ? `
      <div class="cover-verdict">
        <div class="l">Underwriting verdict</div>
        <div class="pill ${v.cls}">${v.label}</div>
        ${scoreText ? `<div style="font-family:'Source Serif 4',serif;font-style:italic;font-size:11pt;color:rgba(255,255,255,0.78);margin-top:8pt;">${escapeHTML(scoreText)}</div>` : ""}
      </div>` : ""}
  </div>`;
}

/**
 * Build the table-of-contents page.
 * @param {Array<{num:string,label:string,page?:string}>} entries
 */
function buildTOCHTML(entries) {
  const items = (entries || []).map(e => `
    <li><span class="num">${escapeHTML(e.num)}</span><span class="label">${escapeHTML(e.label)}</span><span class="pg">${escapeHTML(e.page || "—")}</span></li>
  `).join("");
  return `
  <div class="toc-page">
    <div class="toc-eyebrow">Table of contents</div>
    <h1 class="toc-title">In this report</h1>
    <ul class="toc-list">${items}</ul>
  </div>`;
}

function escapeHTML(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  PDF_STYLES_CSS,
  buildCoverHTML,
  buildTOCHTML,
  LOGO_PRIMARY_DATAURI,
  LOGO_REVERSE_DATAURI,
};
