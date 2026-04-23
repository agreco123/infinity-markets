/**
 * Infinity Markets v4.1 — deliverables/helpers.js
 *
 * Extracted from the monolithic deliverables.js as part of V41-1
 * (H-6 refactor). All functions preserved byte-exactly from the
 * original file. No behavior change.
 *
 * Exports:
 *   deepMergeNullWins  — null-preserving deep merge at render boundary
 *   fmt / fmtD / fmtP / fmt1  — numeric formatters (em-dash on null/NaN)
 *   safe / safeNum / safeStr  — scalar/string coercion helpers
 *   esc                — HTML-escape string (PDF-safe)
 *   scoreColor         — 0-10 score → hex color
 *   recLabel           — score → {text, color, bg} recommendation badge
 *   scopeLabel         — geographic-scope human label
 *   uploadAndRespond   — shared Supabase-storage upload + fallback response
 */
const fs = require('fs');

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

module.exports = {
  deepMergeNullWins,
  fmt, fmtD, fmtP, fmt1,
  safe, safeNum, safeStr,
  esc,
  scoreColor, recLabel, scopeLabel,
  uploadAndRespond,
};
