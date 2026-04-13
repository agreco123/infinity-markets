import { T } from '../lib/tokens';

export default function PhaseTracker({ phases }) {
  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 18 }}>
      {phases.map((p, i) => (
        <div key={i} style={{ flex: 1, padding: "9px 6px", textAlign: "center", background: p.status === "complete" ? T.accentDim : p.status === "active" ? T.blueDim : T.surface, borderRadius: i === 0 ? "6px 0 0 6px" : i === phases.length - 1 ? "0 6px 6px 0" : 0, borderRight: i < phases.length - 1 ? `1px solid ${T.bg}` : "none" }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: p.status === "complete" ? T.accent : p.status === "active" ? T.blue : T.textMuted }}>
            {p.status === "complete" ? "✓" : p.status === "active" ? "◉" : "○"} {p.label}
          </div>
        </div>
      ))}
    </div>
  );
}
