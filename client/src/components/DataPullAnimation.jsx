import { useState, useEffect } from 'react';
import { T } from '../lib/tokens';

const DATA_SOURCES = [
  { name: "Census Geocoder", tier: "Tier 1" }, { name: "Census ACS 5-Year", tier: "Tier 1" },
  { name: "Census Pop Est.", tier: "Tier 1" }, { name: "FRED — Unemployment", tier: "Tier 1" },
  { name: "FRED — HPI", tier: "Tier 1" }, { name: "FRED — Mortgage", tier: "Tier 1" },
  { name: "FRED — PPI", tier: "Tier 1" }, { name: "BLS — Employment", tier: "Tier 1" },
  { name: "BEA — GDP", tier: "Tier 1" }, { name: "Census LODES", tier: "Tier 1" },
  { name: "HUD — FMR", tier: "Tier 1" }, { name: "Redfin — ZIP", tier: "Tier 1" },
  { name: "Zillow — ZHVI", tier: "Tier 1" }, { name: "Census BPS", tier: "Tier 1" },
  { name: "HMDA", tier: "Tier 1" }, { name: "FHFA — HPI", tier: "Tier 1" },
  { name: "RapidAPI Realtor", tier: "Tier 2" }, { name: "NewHomeSource", tier: "Tier 1" },
  { name: "SEC EDGAR", tier: "Tier 1" }, { name: "NCES EDGE", tier: "Tier 1" },
  { name: "Claude API", tier: "AI Engine" },
];

export default function DataPullAnimation({ progress }) {
  // Map real progress (0-100) to source completion
  const completed = Math.floor((progress / 100) * DATA_SOURCES.length);
  const activeIdx = Math.min(completed, DATA_SOURCES.length - 1);

  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 7 }}>
        {DATA_SOURCES.map((s, i) => {
          const done = i < completed;
          const loading = i === activeIdx && !done;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: done ? T.accentDim : loading ? T.blueDim : T.surface, borderRadius: 5, border: `1px solid ${done ? T.accent + "33" : loading ? T.blue + "33" : T.cardBorder}`, transition: "all 0.3s" }}>
              <span style={{ fontSize: 11, color: done ? T.green : loading ? T.blue : T.textMuted }}>{done ? "✓" : loading ? "◉" : "○"}</span>
              <div><div style={{ fontSize: 11, fontWeight: 600, color: done ? T.text : loading ? T.blue : T.textMuted }}>{s.name}</div><div style={{ fontSize: 9, color: T.textMuted }}>{s.tier}</div></div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 14, height: 3, background: T.surface, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${progress}%`, height: "100%", background: `linear-gradient(90deg, ${T.accent}, ${T.blue})`, transition: "width 0.4s", borderRadius: 2 }} />
      </div>
    </div>
  );
}
