import { T } from '../lib/tokens';

export default function RadarChart({ metrics, size = 260 }) {
  if (!metrics?.length) return null;
  const cx = size / 2, cy = size / 2, r = size * 0.38, n = metrics.length;
  const pt = (i, val) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return { x: cx + Math.cos(a) * (val / 10) * r, y: cy + Math.sin(a) * (val / 10) * r }; };
  const polygon = metrics.map((m, i) => { const p = pt(i, m.score); return `${p.x},${p.y}`; }).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      {[2, 4, 6, 8, 10].map(v => <polygon key={v} points={Array.from({ length: n }, (_, i) => { const p = pt(i, v); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke={T.cardBorder} strokeWidth={v === 10 ? 1.5 : 0.5} />)}
      {metrics.map((_, i) => { const p = pt(i, 10); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={T.cardBorder} strokeWidth={0.5} />; })}
      <polygon points={polygon} fill={T.accentDim} stroke={T.accent} strokeWidth={2} />
      {metrics.map((m, i) => { const p = pt(i, 11); return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill={T.textDim} fontSize={7.5} fontFamily={T.font}>{m.metric.split("&")[0].trim()}</text>; })}
      {metrics.map((m, i) => { const p = pt(i, m.score); return <circle key={i} cx={p.x} cy={p.y} r={3} fill={T.accent} stroke={T.bg} strokeWidth={1.5} />; })}
    </svg>
  );
}
