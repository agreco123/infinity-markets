import { T } from '../lib/tokens';

export default function Section({ title, subtitle, children, style }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: T.radius, padding: "20px 22px", ...style }}>
      {title && <div style={{ marginBottom: 14 }}><h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0, fontFamily: T.fontDisplay }}>{title}</h3>{subtitle && <p style={{ fontSize: 11, color: T.textDim, margin: "3px 0 0" }}>{subtitle}</p>}</div>}
      {children}
    </div>
  );
}
