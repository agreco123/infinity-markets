import { T } from '../lib/tokens';
import { ForbesLogo } from './ui';

export default function Header({ query, onReset, right = null }) {
  return (
    <header style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: `${T.s4} ${T.s8}`,
      borderBottom: `1px solid ${T.rule}`,
      background: T.surface,
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.s5 }}>
        <button onClick={onReset} aria-label="Home" style={{ display: "flex", alignItems: "center", gap: T.s3 }}>
          <ForbesLogo height={24} />
        </button>
        <div style={{ width: 1, height: 22, background: T.rule }} />
        <div style={{ fontFamily: T.fontBody, fontSize: T.fs10, fontWeight: 700, letterSpacing: "0.32em", color: T.brassInk, textTransform: "uppercase" }}>
          Infinity Markets · v4.2
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: T.s5 }}>
        {query && (
          <div style={{ fontSize: T.fs12, color: T.inkMuted, fontFamily: T.fontBody }}>
            Study target · <span style={{ color: T.green, fontWeight: 600 }}>{query}</span>
          </div>
        )}
        {right}
      </div>
    </header>
  );
}
