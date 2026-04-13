import { T } from '../lib/tokens';

export default function SparkLine({ data, keyY = "v", height = 60, color = T.accent }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d[keyY]));
  const min = Math.min(...data.map(d => d[keyY]));
  const range = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 100},${height - 4 - ((d[keyY] - min) / range) * (height - 8)}`).join(" ");
  const gid = `g-${color.replace('#','')}-${keyY}`;
  return (
    <svg viewBox={`0 0 100 ${height}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${height} ${pts} 100,${height}`} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
