import { T } from '../lib/tokens';

export default function DataTable({ columns, rows, maxH = 280 }) {
  if (!rows?.length) return <div style={{ fontSize: 12, color: T.textMuted, padding: 12 }}>No data available</div>;
  return (
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: maxH, borderRadius: 6, border: `1px solid ${T.cardBorder}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>{columns.map((c, i) => (
          <th key={i} style={{ position: "sticky", top: 0, background: T.surface, color: T.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10, padding: "9px 11px", textAlign: c.align || "left", borderBottom: `1px solid ${T.cardBorder}`, whiteSpace: "nowrap" }}>{c.label}</th>
        ))}</tr></thead>
        <tbody>{rows.map((r, ri) => (
          <tr key={ri} style={{ borderBottom: `1px solid ${T.cardBorder}22` }} onMouseEnter={e => e.currentTarget.style.background = T.surfaceHover} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            {columns.map((c, ci) => (
              <td key={ci} style={{ padding: "7px 11px", color: c.color?.(r) || T.text, textAlign: c.align || "left", fontWeight: c.bold ? 600 : 400, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{c.render ? c.render(r) : r[c.key]}</td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
