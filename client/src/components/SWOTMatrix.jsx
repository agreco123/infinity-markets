import { T } from '../lib/tokens';

export default function SWOTMatrix({ swot }) {
  if (!swot) return null;
  const Q = [
    { key: "strengths",     label: "Strengths",     letter: "S", accent: T.green },
    { key: "weaknesses",    label: "Weaknesses",    letter: "W", accent: T.red },
    { key: "opportunities", label: "Opportunities", letter: "O", accent: T.brass },
    { key: "threats",       label: "Threats",       letter: "T", accent: T.brassInk },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.s4 }}>
      {Q.map(q => (
        <div key={q.key} style={{
          background: T.surface,
          border: `1px solid ${T.rule}`,
          borderTop: `2px solid ${q.accent}`,
          borderRadius: T.rMd,
          padding: T.s5,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.s3, marginBottom: T.s4 }}>
            <div style={{
              width: 28, height: 28,
              border: `1px solid ${q.accent}`,
              color: q.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: T.fontDisplay, fontSize: T.fs15, fontWeight: 600,
              borderRadius: T.rSm,
              background: T.canvas,
            }}>{q.letter}</div>
            <span style={{ fontSize: T.fs10, fontWeight: 700, letterSpacing: T.trackEyebrow, textTransform: "uppercase", color: q.accent }}>{q.label}</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {(swot[q.key] || []).map((item, i) => (
              <li key={i} style={{ display: "flex", gap: T.s2, fontSize: T.fs13, lineHeight: 1.55, color: T.inkSoft }}>
                <span style={{ color: q.accent, flexShrink: 0, fontWeight: 700 }}>—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
