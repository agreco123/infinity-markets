import { T } from '../lib/tokens';

export default function PhaseTracker({ phases }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 4, marginBottom: T.s6 }}>
      {phases.map((p, i) => {
        const isComplete = p.status === 'complete';
        const isActive = p.status === 'active';
        return (
          <div key={i} style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: `${T.s4} ${T.s2}`,
            background: isActive ? T.greenTint : isComplete ? T.surface : T.surface,
            borderTop: isComplete ? `2px solid ${T.green}` : isActive ? `2px solid ${T.brass}` : `2px solid ${T.rule}`,
            borderBottom: `1px solid ${T.rule}`,
            transition: "all 200ms ease",
          }}>
            <div style={{ fontFamily: T.fontDisplay, fontSize: T.fs18, fontWeight: 400, color: isComplete ? T.green : isActive ? T.brass : T.inkFaint, letterSpacing: "-0.01em", lineHeight: 1 }}>
              {isComplete ? "✓" : isActive ? "●" : "○"}
            </div>
            <div style={{ marginTop: T.s2, fontFamily: T.fontBody, fontSize: T.fs10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: isComplete ? T.green : isActive ? T.brassInk : T.inkMuted }}>
              {p.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
