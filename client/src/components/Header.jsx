import { T } from '../lib/tokens';

export default function Header({ query, onReset }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 28px", borderBottom: `1px solid ${T.cardBorder}`, background: T.surface, position: "sticky", top: 0, zIndex: 10, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span onClick={onReset} style={{ fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 700, cursor: "pointer", background: `linear-gradient(135deg, ${T.text}, ${T.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Infinity Markets</span>
        <span style={{ fontSize: 9, color: T.textMuted, background: T.accentDim, padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>v1.0</span>
      </div>
      {query && <div style={{ fontSize: 12, color: T.textDim }}>Study: <span style={{ color: T.accent, fontWeight: 600 }}>{query}</span></div>}
    </div>
  );
}
