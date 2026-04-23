import { useState } from 'react';
import { T } from '../lib/tokens';
import { api } from '../lib/api';

export default function DeliverableModal({ onClose, study }) {
  const [status, setStatus] = useState({ pdf: "idle", xlsx: "idle", pptx: "idle" });

  const generate = async (type) => {
    setStatus(s => ({ ...s, [type]: "generating" }));
    try {
      const result = await api.post(`/api/deliverables/${type}`, { study });
      if (result instanceof Blob) {
        const url = URL.createObjectURL(result);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${study?.targetArea || 'market-study'}.${type === 'xlsx' ? 'xlsx' : type === 'pptx' ? 'pptx' : 'pdf'}`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (result?.url) {
        // Supabase Storage URL — open in new tab
        window.open(result.url, '_blank');
      }
      setStatus(s => ({ ...s, [type]: "complete" }));
    } catch {
      setStatus(s => ({ ...s, [type]: "error" }));
    }
  };

  const items = [
    { key: "pdf", label: "PDF Market Study Report", desc: "15+ section institutional-grade report with all data tables, charts, and source citations", icon: "📄", pages: "~45 pages" },
    { key: "xlsx", label: "Excel Data Workbook", desc: "11-tab workbook: Demographics, Supply, Comp Table, Builders, Absorption, Pricing, Land, Proforma, Scorecard, Sources", icon: "📊", pages: "11 tabs" },
    { key: "pptx", label: "PowerPoint Executive Deck", desc: "25-slide investor-ready presentation with key findings and strategic recommendations", icon: "📽", pages: "25 slides" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: "32px 36px", maxWidth: 520, width: "90%" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 700, margin: 0, color: T.text }}>Generate Deliverables</h2>
        <p style={{ fontSize: 12, color: T.textDim, marginTop: 6 }}>{study?.targetArea || 'Market Study'} — Full Market Study</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
          {items.map(it => (
            <div key={it.key} style={{ background: T.surface, borderRadius: 8, padding: "16px 20px", border: `1px solid ${status[it.key] === "complete" ? T.green + "44" : T.cardBorder}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{it.icon} {it.label}</div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 3 }}>{it.desc}</div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{it.pages}</div>
                </div>
                {status[it.key] === "idle" && (
                  <button onClick={() => generate(it.key)} style={{ padding: "8px 18px", background: T.accent, border: "none", borderRadius: 6, color: "#0a0b0d", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: T.font, flexShrink: 0 }}>Generate</button>
                )}
                {status[it.key] === "generating" && (
                  <div style={{ fontSize: 11, color: T.blue, fontWeight: 600, flexShrink: 0 }}>◉ Generating...</div>
                )}
                {status[it.key] === "complete" && (
                  <span style={{ fontSize: 11, color: T.green, fontWeight: 600, flexShrink: 0 }}>✓ Downloaded</span>
                )}
                {status[it.key] === "error" && (
                  <button onClick={() => { setStatus(s => ({ ...s, [it.key]: "idle" })); }} style={{ padding: "6px 14px", background: T.redDim, border: `1px solid ${T.red}33`, borderRadius: 5, color: T.red, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: T.font, flexShrink: 0 }}>Retry</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          <button onClick={() => { generate("pdf"); generate("xlsx"); generate("pptx"); }} style={{ padding: "10px 22px", background: T.accent, border: "none", borderRadius: 6, color: "#0a0b0d", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Generate All</button>
          <button onClick={onClose} style={{ padding: "10px 22px", background: "transparent", border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.textDim, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Close</button>
        </div>
      </div>
    </div>
  );
}
