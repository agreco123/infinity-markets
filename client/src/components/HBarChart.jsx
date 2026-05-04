import { T } from '../lib/tokens';

export default function HBarChart({ data, keyLabel = "bracket", keyVal = "pct", color = T.accent }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d[keyVal]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
          <span style={{ width: 80, color: T.textDim, textAlign: "right", flexShrink: 0 }}>{d[keyLabel]}</span>
          <div style={{ flex: 1, height: 16, background: T.bg, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${(d[keyVal] / max) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${d.color || color}, ${d.color || color}cc)`, borderRadius: 3, transition: "width 0.8s" }} />
          </div>
          <span style={{ width: 44, color: T.text, fontWeight: 600 }}>{d[keyVal]}%</span>
        </div>
      ))}
    </div>
  );
}
