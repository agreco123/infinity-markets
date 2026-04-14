import { T } from '../lib/tokens';

export default function SWOTMatrix({ swot }) {
  if (!swot) return null;
  const Q = [
    { key: "strengths", label: "Strengths", icon: "S", color: T.green, bg: T.greenDim },
    { key: "weaknesses", label: "Weaknesses", icon: "W", color: T.red, bg: T.redDim },
    { key: "opportunities", label: "Opportunities", icon: "O", color: T.blue, bg: T.blueDim },
    { key: "threats", label: "Threats", icon: "T", color: T.orange, bg: T.orangeDim },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {Q.map(q => (
        <div key={q.key} style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: T.radius, padding: "16px 18px", borderTop: `3px solid ${q.color}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 26, height: 26, borderRadius: 5, background: q.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: q.color, fontFamily: T.fontDisplay }}>{q.icon}</div>
            <span style={{ fontSize: 13, fontWeight: 700, color: q.color }}>{q.label}</span>
          </div>
          {(swot[q.key] || []).map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 6, fontSize: 11, lineHeight: 1.5, marginBottom: 5 }}>
              <span style={{ color: q.color, flexShrink: 0 }}>•</span>
              <span style={{ color: T.text }}>{item}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
