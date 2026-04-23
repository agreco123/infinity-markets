import { T } from '../lib/tokens';

export default function KPI({ label, value, sub, trend, icon, color = T.accent }) {
  const tc = trend > 0 ? T.green : trend < 0 ? T.red : T.textDim;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: T.radius, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 5 }}
      onMouseEnter={e => e.currentTarget.style.borderColor = color + "44"}
      onMouseLeave={e => e.currentTarget.style.borderColor = T.cardBorder}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10.5, fontWeight: 500, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
        {icon && <span style={{ fontSize: 13, opacity: 0.5 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>{value}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {trend !== undefined && trend !== null && <span style={{ fontSize: 11, fontWeight: 600, color: tc, background: trend > 0 ? T.greenDim : trend < 0 ? T.redDim : "transparent", padding: "2px 6px", borderRadius: 4 }}>{trend > 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%</span>}
        {sub && <span style={{ fontSize: 11, color: T.textMuted }}>{sub}</span>}
      </div>
    </div>
  );
}
