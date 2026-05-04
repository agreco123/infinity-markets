import { T } from '../lib/tokens';

export default function TradeAreaMap({ geo }) {
  if (!geo) return null;
  return (
    <div style={{
      height: 220,
      background: T.surface,
      border: `1px solid ${T.rule}`,
      borderRadius: T.rLg,
      padding: T.s5,
      position: "relative",
      overflow: "hidden",
      boxShadow: T.shadowSoft,
    }}>
      {/* Subtle ivory grid */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.55, pointerEvents: "none",
        backgroundImage: `linear-gradient(${T.rule} 1px, transparent 1px),linear-gradient(90deg, ${T.rule} 1px, transparent 1px)`,
        backgroundSize: "32px 32px",
      }} />
      {/* Concentric trade-area rings */}
      <div aria-hidden style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", border: `1px dashed ${T.greenWash}`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
        <div style={{ position: "absolute", width: 110, height: 110, borderRadius: "50%", border: `1px dashed ${T.brassWash}`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
      </div>
      <div style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 14, height: 14,
        background: T.brass,
        border: `2px solid ${T.green}`,
        borderRadius: "50%",
        boxShadow: `0 0 0 6px ${T.brassWash}`,
      }} />
      {/* Caption */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: T.fs10, fontWeight: 600, letterSpacing: T.trackEyebrow, textTransform: "uppercase", color: T.green }}>Trade area</div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: T.fs22, fontWeight: 500, color: T.ink, marginTop: 4, letterSpacing: "-0.01em" }}>{geo.name}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: T.fs11, color: T.inkMuted, fontFamily: T.fontMono, fontVariantNumeric: "tabular-nums" }}>
            {geo.lat?.toFixed(4)}° N · {Math.abs(geo.lon || 0).toFixed(4)}° W
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: T.s3 }}>
          <div style={{ display: "flex", gap: T.s4, fontSize: T.fs11 }}>
            <span style={{ color: T.green, fontWeight: 600 }}>● Primary market area</span>
            <span style={{ color: T.brassInk, fontWeight: 600 }}>● Secondary market area</span>
          </div>
          {geo.zips?.length ? (
            <div style={{ fontSize: T.fs11, color: T.inkMuted, fontFamily: T.fontMono }}>
              ZIPs · {geo.zips.join(" · ")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
