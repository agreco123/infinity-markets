import { T } from '../lib/tokens';

const DATA_SOURCES = [
  { name: "Census Geocoder",   tier: "TIER 1" }, { name: "Census ACS 5-Year",  tier: "TIER 1" },
  { name: "Census PEP",        tier: "TIER 1" }, { name: "FRED Unemployment",  tier: "TIER 1" },
  { name: "FRED HPI",          tier: "TIER 1" }, { name: "FRED Mortgage 30yr", tier: "TIER 1" },
  { name: "FRED PPI",          tier: "TIER 1" }, { name: "BLS Employment",     tier: "TIER 1" },
  { name: "BEA GDP",           tier: "TIER 1" }, { name: "Census LODES",       tier: "TIER 1" },
  { name: "HUD FMR",           tier: "TIER 1" }, { name: "Redfin ZIP",         tier: "TIER 1" },
  { name: "Zillow ZHVI",       tier: "TIER 1" }, { name: "Census BPS",         tier: "TIER 1" },
  { name: "HMDA",              tier: "TIER 1" }, { name: "FHFA HPI",           tier: "TIER 1" },
  { name: "RapidAPI Realtor",  tier: "TIER 2" }, { name: "NewHomeSource",      tier: "TIER 1" },
  { name: "SEC EDGAR",         tier: "TIER 1" }, { name: "NCES EDGE",          tier: "TIER 1" },
  { name: "Claude · narrative",tier: "AI"     },
];

export default function DataPullAnimation({ progress }) {
  const completed = Math.floor((progress / 100) * DATA_SOURCES.length);
  const activeIdx = Math.min(completed, DATA_SOURCES.length - 1);

  return (
    <div style={{ padding: `${T.s5} 0` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: T.s2 }}>
        {DATA_SOURCES.map((s, i) => {
          const done = i < completed;
          const loading = i === activeIdx && !done;
          const stateInk = done ? T.green : loading ? T.brassInk : T.inkMuted;
          const stateFill = done ? T.greenTint : loading ? T.brassWash : T.surface;
          const stateRule = done ? T.green : loading ? T.brass : T.rule;
          return (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: T.s3,
              padding: `${T.s2} ${T.s4}`,
              background: stateFill,
              border: `1px solid ${stateRule}`,
              borderLeft: `3px solid ${stateRule}`,
              borderRadius: T.rSm,
              transition: "all 240ms ease",
            }}>
              <span style={{ fontSize: T.fs12, color: stateInk, fontWeight: 600, fontFamily: T.fontMono, lineHeight: 1 }}>
                {done ? "✓" : loading ? "●" : "○"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: T.fs12, fontWeight: 600, color: done || loading ? T.ink : T.inkMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                <div style={{ fontSize: 9, color: T.inkFaint, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 1 }}>{s.tier}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: T.s5, position: "relative" }}>
        <div style={{ height: 2, background: T.rule, borderRadius: 1 }}>
          <div style={{
            width: `${progress}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${T.green}, ${T.brass})`,
            borderRadius: 1,
            transition: "width 360ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          }} />
        </div>
        <div style={{ position: "absolute", right: 0, top: 8, fontFamily: T.fontMono, fontSize: T.fs11, color: T.inkMuted, fontVariantNumeric: "tabular-nums" }}>
          {progress}%
        </div>
      </div>
    </div>
  );
}
