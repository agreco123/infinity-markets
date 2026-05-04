import { T } from '../lib/tokens';

/**
 * Legacy Section shim with editorial styling. Original API: { title, subtitle, children, style }.
 * Renders an editorial panel: eyebrow + title + green underline + body card.
 */
export default function Section({ title, subtitle, children, style }) {
  return (
    <section style={{
      background: T.surface,
      border: `1px solid ${T.rule}`,
      borderRadius: T.rLg,
      padding: `${T.s5} ${T.s6}`,
      boxShadow: T.shadowSoft,
      ...style,
    }}>
      {(title || subtitle) && (
        <header style={{ marginBottom: T.s4, paddingBottom: T.s3, borderBottom: `1px solid ${T.rule}` }}>
          {subtitle && (
            <div style={{ fontSize: T.fs10, fontWeight: 600, letterSpacing: T.trackEyebrow, textTransform: "uppercase", color: T.green, marginBottom: 4 }}>
              {subtitle}
            </div>
          )}
          {title && (
            <h3 style={{
              fontFamily: T.fontDisplay,
              fontSize: T.fs18,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              lineHeight: 1.25,
              color: T.ink,
              margin: 0,
            }}>{title}</h3>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
