import { useState, useRef, useEffect } from 'react';
import { T } from '../lib/tokens';

export default function Search({ onSearch }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = () => { if (query.trim()) onSearch(query.trim()); };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, position: "relative" }}>
      <div style={{ position: "absolute", top: "-20%", left: "50%", transform: "translateX(-50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${T.accent}08, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ marginBottom: 48, textAlign: "center", position: "relative" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.35em", color: T.accent, textTransform: "uppercase", marginBottom: 12 }}>Forbes Capretto Homes</div>
        <h1 style={{ fontSize: 52, fontFamily: T.fontDisplay, fontWeight: 700, margin: 0, background: `linear-gradient(135deg, ${T.text}, ${T.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Infinity Markets</h1>
        <p style={{ fontSize: 15, color: T.textDim, marginTop: 12, maxWidth: 480, lineHeight: 1.6 }}>Institutional-grade new construction market studies — 10 phases, 29 data sources, 3 deliverables.</p>
      </div>
      <div style={{ display: "flex", width: "100%", maxWidth: 560, background: T.surface, borderRadius: 10, border: `1px solid ${T.cardBorder}`, overflow: "hidden" }}>
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder="Enter city, township, ZIP, or address..." style={{ flex: 1, padding: "16px 20px", background: "transparent", border: "none", color: T.text, fontSize: 15, fontFamily: T.font, outline: "none" }} />
        <button onClick={handleSearch} style={{ padding: "0 28px", background: T.accent, border: "none", color: "#0a0b0d", fontWeight: 700, fontSize: 13, fontFamily: T.font, cursor: "pointer", textTransform: "uppercase" }}>Analyze</button>
      </div>
      <div style={{ marginTop: 20, display: "flex", gap: 14, fontSize: 11, color: T.textMuted }}>
        {["Cranberry Twp, PA", "16066", "Amherst, NY", "14221"].map(s => (
          <span key={s} onClick={() => setQuery(s)} style={{ cursor: "pointer", padding: "4px 10px", borderRadius: 4, background: T.surface, border: `1px solid ${T.cardBorder}` }} onMouseEnter={e => e.currentTarget.style.color = T.accent} onMouseLeave={e => e.currentTarget.style.color = T.textMuted}>{s}</span>
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 20, fontSize: 10, color: T.textMuted }}>INFINITY MARKETS v1.0 · Full Platform</div>
    </div>
  );
}
