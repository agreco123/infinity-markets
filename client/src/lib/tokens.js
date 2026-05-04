/**
 * Forbes Capretto / Infinity Markets — Design Tokens
 *
 * Editorial / institutional aesthetic. Locked to Forbes Capretto brand:
 *   - Forbes Green (deep emerald)  #004D41   — primary ink, sidebar, ribbons
 *   - Forbes Brass (warm gold)     #D3B257   — single accent, KPI emphasis, GO chip
 *   - Ivory canvas                 #F7F3EC   — body background (light theme)
 *   - Charcoal ink                 #1A1A1A   — body text on ivory
 *   - Off-white surfaces           #FFFFFF   — cards
 *
 * Typography: Source Serif 4 (display) + Inter (body) + JetBrains Mono (figures).
 * Loaded via index.html <link rel="stylesheet"> from Google Fonts.
 *
 * The legacy dark tokens are retained as `T.dark.*` so older components that
 * still reference T.bg / T.surface / T.card etc. compile cleanly during the
 * incremental migration. Prefer the named tokens (T.canvas, T.ink, T.brass…)
 * in new code. Format helpers (fmt, fmtK, fmtPct, fmtDollar) are unchanged.
 */

export const BRAND = {
  green: "#004D41",        // Forbes green — Pantone-derived, ex SVG
  greenDeep: "#003329",
  greenSoft: "#0F6655",
  brass: "#D3B257",        // Forbes brass — Pantone-derived, ex SVG
  brassSoft: "#E8CB85",
  brassInk: "#7A5A1F",
  ivory: "#F7F3EC",
  parchment: "#EFE8DA",
  rule: "#1A1A1A",
  ink: "#1A1A1A",
  inkSoft: "#3A3A3A",
  inkMuted: "#6B6B66",
  inkFaint: "#8F8F88",
  surface: "#FFFFFF",
};

export const T = {
  // ── Editorial / light theme (NEW DEFAULT) ───────────────────────────────
  canvas: BRAND.ivory,
  surface: BRAND.surface,
  surfaceAlt: BRAND.parchment,
  ink: BRAND.ink,
  inkSoft: BRAND.inkSoft,
  inkMuted: BRAND.inkMuted,
  inkFaint: BRAND.inkFaint,
  rule: "rgba(26,26,26,0.08)",
  ruleStrong: "rgba(26,26,26,0.18)",
  ruleEmphasis: "rgba(26,26,26,0.42)",

  green: BRAND.green,
  greenDeep: BRAND.greenDeep,
  greenSoft: BRAND.greenSoft,
  greenTint: "rgba(0,77,65,0.06)",
  greenWash: "rgba(0,77,65,0.12)",

  brass: BRAND.brass,
  brassSoft: BRAND.brassSoft,
  brassInk: BRAND.brassInk,
  brassTint: "rgba(211,178,87,0.10)",
  brassWash: "rgba(211,178,87,0.22)",

  // Provenance taxonomy (LAW #2). Each pairs a fill, a stroke, an ink.
  provMeasured: { fill: "rgba(0,77,65,0.08)",   stroke: "#004D41", ink: "#003329", label: "MEASURED" },
  provDerived:  { fill: "rgba(11,78,160,0.08)", stroke: "#0B4EA0", ink: "#072E60", label: "DERIVED"  },
  provModeled:  { fill: "rgba(180,124,16,0.10)",stroke: "#B47C10", ink: "#6F4B08", label: "MODELED"  },
  provLLM:      { fill: "rgba(108,76,156,0.10)",stroke: "#6C4C9C", ink: "#3F2D5C", label: "LLM"      },
  provMissing: { fill: "rgba(26,26,26,0.04)", stroke: "rgba(26,26,26,0.18)", ink: "#6B6B66", label: "MISSING" },
  provError:   { fill: "rgba(168,32,32,0.08)",  stroke: "#A82020", ink: "#6B1212", label: "ERROR"    },
  provProxy:   { fill: "rgba(180,124,16,0.10)", stroke: "#B47C10", ink: "#6F4B08", label: "PROXY"    },

  // Verdict pills
  verdictGo:        { fill: "#004D41", ink: "#FFFFFF", label: "GO"          },
  verdictCondition: { fill: "#D3B257", ink: "#3A2A06", label: "CONDITIONAL" },
  verdictNoGo:      { fill: "#7A1B1B", ink: "#FFFFFF", label: "NO-GO"       },

  // Spacing scale (8px grid + half-steps for editorial trim)
  s1: "4px", s2: "8px", s3: "12px", s4: "16px", s5: "20px", s6: "24px",
  s7: "32px", s8: "40px", s9: "48px", s10: "64px", s11: "80px", s12: "96px",

  // Radii — editorial reports use small radii or none; cards 6px max
  rNone: "0px", rSm: "2px", rMd: "4px", rLg: "6px", rPill: "999px",

  // Typography
  fontDisplay: '"Source Serif 4", "Source Serif Pro", Georgia, "Times New Roman", serif',
  fontBody:    '"Inter", "Helvetica Neue", Arial, sans-serif',
  fontMono:    '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  fontFigure:  '"Inter", "Helvetica Neue", Arial, sans-serif',  // tabular nums applied separately

  // Type scale (editorial — wide vertical rhythm)
  fs10: "10px", fs11: "11px", fs12: "12px", fs13: "13px", fs14: "14px",
  fs15: "15px", fs16: "16px", fs18: "18px", fs20: "20px", fs22: "22px",
  fs26: "26px", fs32: "32px", fs40: "40px", fs48: "48px", fs64: "64px",

  // Weights — restrained
  fwLight: 300, fwReg: 400, fwMed: 500, fwSemi: 600, fwBold: 700,

  // Letter-spacing for editorial small-caps
  trackTight: "-0.02em",
  trackBody:  "0",
  trackEdit:  "0.02em",
  trackEyebrow: "0.18em",
  trackRibbon:  "0.32em",

  // Line heights
  lhTight: 1.15, lhDisplay: 1.18, lhBody: 1.55, lhProse: 1.7,

  // Elevation (extremely sparing — editorial = flat)
  shadowNone: "none",
  shadowHair: "0 0 0 0.5px rgba(26,26,26,0.10)",
  shadowSoft: "0 1px 0 rgba(26,26,26,0.04), 0 0 0 0.5px rgba(26,26,26,0.10)",
  shadowLift: "0 6px 24px -8px rgba(0,77,65,0.20), 0 0 0 0.5px rgba(26,26,26,0.10)",

  // Layout
  pageMaxW: "1240px", proseMaxW: "720px", sidebarW: "256px", topbarH: "60px",

  // ── Legacy dark theme tokens (retained for incremental migration) ───────
  bg: "#F7F3EC", surfaceHover: "#EFE8DA",
  card: "#FFFFFF", cardBorder: "rgba(26,26,26,0.10)",
  accent: "#004D41", accentDim: "rgba(0,77,65,0.08)", accentGlow: "rgba(211,178,87,0.20)",
  text: "#1A1A1A", textDim: "#6B6B66", textMuted: "#8F8F88",
  red: "#A82020", redDim: "rgba(168,32,32,0.08)",
  blue: "#0B4EA0", blueDim: "rgba(11,78,160,0.08)",
  purple: "#6C4C9C", purpleDim: "rgba(108,76,156,0.10)",
  orange: "#B47C10", orangeDim: "rgba(180,124,16,0.10)",
  radius: "4px",
  font: '"Inter", "Helvetica Neue", Arial, sans-serif',

  // Old aliases (kept literally to avoid breaking <span style={{...T.font}}>)
  // greenDim alias — old code used T.greenDim
  greenDim: "rgba(0,77,65,0.10)",
};

export const BREAK = { sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1536 };

/* ── Format helpers (used everywhere — DO NOT change signatures) ─────────── */
export const fmt = (n, d = 0) =>
  (n == null || Number.isNaN(Number(n)))
    ? "—"
    : Number(n).toLocaleString("en-US", { maximumFractionDigits: d });

export const fmtK = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return fmt(v);
};

export const fmtPct = (n, d = 1) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(d)}%`;
};

export const fmtDollar = (n, d = 0) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `$${fmt(n, d)}`;
};

export const fmtDollarK = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return fmtDollar(v);
};

export const fmtDate = (s) => {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return s; }
};

/**
 * Provenance helper. Reads study._env (or study[bucket]._env) and returns
 * a normalized class so renderers can show the right chip.
 * Mirrors the server-side provChip() in deliverables/pdf.js.
 */
export function provFor(study, bucket, field) {
  if (!study) return "missing";
  const buckets = [study._env, study?.[bucket]?._env];
  for (const env of buckets) {
    if (!env) continue;
    const direct = env[field];
    if (direct?.provenance) return String(direct.provenance).toLowerCase();
    const dotted = env[`${bucket}.${field}`];
    if (dotted?.provenance) return String(dotted.provenance).toLowerCase();
  }
  return "missing";
}
