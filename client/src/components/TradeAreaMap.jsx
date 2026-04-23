import { T } from '../lib/tokens';

export default function TradeAreaMap({ geo }) {
  if (!geo) return null;
  return (
    <div style={{ height: 240, background: "linear-gradient(135deg, #0d1117, #111820, #0f1218)", borderRadius: T.radius, border: `1px solid ${T.cardBorder}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.05, backgroundImage: `linear-gradient(${T.accent} 1px, transparent 1px),linear-gradient(90deg, ${T.accent} 1px, transparent 1px)`, backgroundSize: "40px 40px" }} />
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: T.accent, boxShadow: `0 0 20px ${T.accentGlow}`, position: "relative", zIndex: 1 }} />
      <div style={{ position: "absolute", width: 100, height: 100, borderRadius: "50%", border: `2px dashed ${T.accent}33`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
      <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", border: `1px dashed ${T.blue}22`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
      <div style={{ marginTop: 20, textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{geo.name}</div>
        <div style={{ fontSize: 11, color: T.textDim, marginTop: 3 }}>{geo.lat?.toFixed(4)}°N, {Math.abs(geo.lon || 0).toFixed(4)}°W · {geo.msaName || ''}</div>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 8 }}>
          <span style={{ fontSize: 10, color: T.accent }}>● PMA</span>
          <span style={{ fontSize: 10, color: T.blue }}>● SMA</span>
          {geo.zips && <span style={{ fontSize: 10, color: T.textMuted }}>ZIPs: {geo.zips.join(", ")}</span>}
        </div>
      </div>
    </div>
  );
}
