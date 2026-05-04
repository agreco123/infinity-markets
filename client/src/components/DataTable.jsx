import { T } from '../lib/tokens';

/**
 * Legacy DataTable shim with editorial styling. API unchanged: { columns, rows, maxH }.
 *   - columns: [{ key?, label, align?, render?, bold?, color?(row) }]
 *   - rows: array of objects
 *   - maxH: max-height in px for scroll
 */
export default function DataTable({ columns, rows, maxH = 320 }) {
  if (!rows?.length) {
    return <div style={{ fontSize: T.fs12, color: T.inkMuted, padding: T.s5, fontStyle: "italic" }}>No data available.</div>;
  }
  return (
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: maxH, border: `1px solid ${T.rule}`, borderRadius: T.rMd }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.fontBody, fontSize: T.fs13, fontVariantNumeric: "tabular-nums lining-nums" }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={{
                position: "sticky", top: 0, zIndex: 1,
                background: T.surface,
                color: T.green,
                fontFamily: T.fontBody,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: T.trackEyebrow,
                fontSize: T.fs10,
                padding: "11px 14px",
                textAlign: c.align || "left",
                borderBottom: `1.5px solid ${T.green}`,
                whiteSpace: "nowrap",
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? T.surface : T.canvas }}
              onMouseEnter={e => e.currentTarget.style.background = T.greenTint}
              onMouseLeave={e => e.currentTarget.style.background = ri % 2 === 0 ? T.surface : T.canvas}
            >
              {columns.map((c, ci) => (
                <td key={ci} style={{
                  padding: "10px 14px",
                  color: c.color?.(r) || (ci === 0 ? T.ink : T.inkSoft),
                  textAlign: c.align || "left",
                  fontWeight: c.bold ? 600 : 400,
                  fontVariantNumeric: "tabular-nums",
                  borderBottom: `1px solid ${T.rule}`,
                  whiteSpace: "nowrap",
                }}>
                  {c.render ? c.render(r) : (r[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
