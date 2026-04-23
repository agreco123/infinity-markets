export const T = {
  bg: "#0a0b0d", surface: "#111318", surfaceHover: "#181b22",
  card: "#14161c", cardBorder: "#1e2028",
  accent: "#c9a55c", accentDim: "rgba(201,165,92,0.15)", accentGlow: "rgba(201,165,92,0.3)",
  text: "#e8e6e1", textDim: "#8a8b8e", textMuted: "#5a5b5e",
  green: "#3ecf8e", greenDim: "rgba(62,207,142,0.12)",
  red: "#ef4444", redDim: "rgba(239,68,68,0.12)",
  blue: "#60a5fa", blueDim: "rgba(96,165,250,0.12)",
  purple: "#a78bfa", purpleDim: "rgba(167,139,250,0.12)",
  orange: "#fb923c", orangeDim: "rgba(251,146,60,0.12)",
  radius: "8px",
  font: "'DM Sans', 'Helvetica Neue', sans-serif",
  fontDisplay: "'Playfair Display', Georgia, serif",
};

export const fmt = (n, d = 0) => n?.toLocaleString("en-US", { maximumFractionDigits: d }) ?? "—";
export const fmtK = (n) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : fmt(n);
export const fmtPct = (n) => n != null ? `${n}%` : "—";
export const fmtDollar = (n) => n != null ? `$${fmt(n)}` : "—";
