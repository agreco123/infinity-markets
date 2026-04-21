import { T } from '../lib/tokens';

export default function SparkBar({ data, keyY = "v", height = 60, color = T.accent }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d[keyY]));
  const w = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      {data.map((d, i) => {
        const h2 = (d[keyY] / max) * (height - 4);
        return <rect key={i} x={i * w + w * 0.15} y={height - h2} width={w * 0.7} height={h2} rx="1.5" fill={color} opacity={0.85} />;
      })}
    </svg>
  );
}
