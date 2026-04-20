/* ═══════════════════════════════════════════════════════════════════
   Dashboard.jsx  –  Sprint 4 UI Overhaul  (v2.0)
   Infinity Markets · Forbes Capretto Homes
   ─────────────────────────────────────────────────────────────────
   Changes from v1.0:
     • Item 17 — "Browse before generate" preview mode
     • Item 18 — Interactive Recharts with tooltips
     • Item 19 — Enhanced market map section
     • Item 20 — Data quality indicators per section
     • Item 21 — Mobile-responsive layout (useMediaQuery hook)
   ─────────────────────────────────────────────────────────────────
   DEPLOY NOTE: requires `npm install recharts` in client/
   ═══════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { T, fmt, fmtK }   from '../lib/tokens';
import Header              from '../components/Header';
import PhaseTracker        from '../components/PhaseTracker';
import TradeAreaMap        from '../components/TradeAreaMap';
import KPI                 from '../components/KPI';
import Section             from '../components/Section';
import DataTable           from '../components/DataTable';
import RadarChart          from '../components/RadarChart';
import SWOTMatrix          from '../components/SWOTMatrix';
import DeliverableModal    from '../components/DeliverableModal';

/* ── Responsive hook ───────────────────────────────────────────── */
function useMediaQuery() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return { width, isMobile: width < 640, isTablet: width < 1024 };
}

/* ── Custom Recharts tooltip ───────────────────────────────────── */
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 6,
      padding: "8px 12px", fontSize: 11, boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
    }}>
      <div style={{ color: T.textDim, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || T.accent, fontWeight: 600 }}>
          {p.name}: {formatter ? formatter(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

/* ── Data Quality Badge (Sprint 4 item 20) ─────────────────────── */
function DataQuality({ fields }) {
  const total = fields.length;
  const filled = fields.filter(f => {
    const v = f.value;
    return v !== null && v !== undefined && v !== '' && v !== 0 &&
           v !== '—' && v !== '$0' && v !== 'null%';
  }).length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const color = pct >= 80 ? T.green : pct >= 50 ? '#f59e0b' : '#ef4444';
  const label = pct >= 80 ? 'Good' : pct >= 50 ? 'Partial' : 'Sparse';

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}33`
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {filled}/{total} fields · {label}
    </div>
  );
}

/* ── Preview Overview — browse before generate (Sprint 4 item 17) ─ */
function PreviewOverview({ study, onProceed }) {
  const { demographics: d, housing: h, competition: comp } = study;
  const absorption = study.analysis?.absorption;
  const pricing    = study.analysis?.pricing;
  const land       = study.analysis?.land;
  const proforma   = study.analysis?.proforma;
  const regulatory = study.analysis?.regulatory;
  const scorecard  = study.analysis?.scorecard;

  const sections = [
    {
      name: "Ph 1 — Demographics", icon: "👥",
      fields: [
        { label: "Population", value: d?.population },
        { label: "Median HHI", value: d?.mhi },
        { label: "Households", value: d?.households },
        { label: "Median Age", value: d?.medianAge },
        { label: "Homeownership", value: d?.homeownershipRate },
        { label: "Unemployment", value: d?.unemploymentRate },
        { label: "Pop Trend", value: d?.popTrend?.length > 2 ? "yes" : null },
        { label: "Income Dist", value: d?.incomeDist?.length ? "yes" : null },
        { label: "Top Employers", value: d?.topEmployers?.length ? "yes" : null },
        { label: "Commute Inflow", value: d?.commuteInflow },
      ]
    },
    {
      name: "Ph 2 — Housing Supply", icon: "🏡",
      fields: [
        { label: "Median Value", value: h?.medianValue },
        { label: "DOM", value: h?.medianDOM },
        { label: "Sale-to-List", value: h?.saleToList },
        { label: "Months Supply", value: h?.monthsSupply },
        { label: "Vacancy Rate", value: h?.vacancyRate },
        { label: "Median Rent", value: h?.medianRent },
        { label: "Price Trend", value: h?.priceTrend?.length > 2 ? "yes" : null },
        { label: "SF Permits", value: h?.permitsSF?.length ? "yes" : null },
      ]
    },
    {
      name: "Ph 3 — Competition", icon: "🏘",
      fields: [
        { label: "Communities", value: comp?.communities?.length },
        { label: "Builders", value: comp?.builders?.length },
        { label: "Has Lots Data", value: comp?.communities?.some(c => c.lotsTotal) ? "yes" : null },
        { label: "Has Pricing", value: comp?.communities?.some(c => c.priceLow) ? "yes" : null },
        { label: "Has Absorption", value: comp?.communities?.some(c => c.monthlyAbs) ? "yes" : null },
      ]
    },
    {
      name: "Ph 4 — Absorption", icon: "📊",
      fields: [
        { label: "Market Monthly", value: absorption?.marketWideMonthly },
        { label: "Annual Closings", value: absorption?.annualClosings },
        { label: "HH Formation", value: absorption?.hhFormationAnnual },
        { label: "Demand Gap", value: absorption?.demandGap },
        { label: "By Price Band", value: absorption?.byPriceBand?.length ? "yes" : null },
        { label: "Seasonality", value: absorption?.seasonality?.length ? "yes" : null },
      ]
    },
    {
      name: "Ph 5 — Pricing", icon: "💰",
      fields: [
        { label: "Price-to-Income", value: pricing?.affordability?.priceToIncome },
        { label: "PITI-to-Income", value: pricing?.affordability?.pitiToIncome },
        { label: "Stratification", value: pricing?.stratification?.length ? "yes" : null },
        { label: "PSF by Product", value: pricing?.psfByProduct?.length ? "yes" : null },
      ]
    },
    {
      name: "Ph 6 — Land", icon: "🌿",
      fields: [
        { label: "Lot-to-Home Ratio", value: land?.lotToHomeRatio },
        { label: "Finished Lot Value", value: land?.estFinishedLotValue },
        { label: "Raw Land/Acre", value: land?.rawLandPerAcre },
        { label: "Land Comps", value: land?.comps?.length ? "yes" : null },
      ]
    },
    {
      name: "Ph 7 — Margins", icon: "📈",
      fields: [
        { label: "Scenarios", value: proforma?.scenarios?.length },
        { label: "Benchmarks", value: proforma?.publicBenchmarks?.length ? "yes" : null },
        { label: "PPI Trend", value: proforma?.ppiTrend?.length ? "yes" : null },
      ]
    },
    {
      name: "Ph 8 — Regulatory", icon: "📋",
      fields: [
        { label: "Total Fees", value: regulatory?.totalFeesPerUnit },
        { label: "Zoning", value: regulatory?.zoning },
        { label: "Timeline", value: regulatory?.entitlementTimeline },
        { label: "Utilities", value: regulatory?.utilities?.length ? "yes" : null },
      ]
    },
    {
      name: "Ph 9 — Scorecard", icon: "⭐",
      fields: [
        { label: "Metrics", value: scorecard?.length },
        { label: "SWOT", value: study.analysis?.swot ? "yes" : null },
      ]
    },
  ];

  const allFields = sections.flatMap(s => s.fields);
  const totalFilled = allFields.filter(f => {
    const v = f.value;
    return v !== null && v !== undefined && v !== '' && v !== 0 && v !== '—';
  }).length;
  const overallPct = Math.round((totalFilled / allFields.length) * 100);
  const overallColor = overallPct >= 70 ? T.green : overallPct >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ padding: "0 28px 40px" }}>
      <div style={{
        background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12,
        padding: "28px 32px", marginBottom: 24
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 700, margin: 0, color: T.text }}>
              Data Quality Preview
            </h2>
            <p style={{ color: T.textDim, fontSize: 12, marginTop: 4 }}>
              Review available data before exploring the full study
            </p>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 700, fontFamily: T.fontDisplay, color: overallColor }}>
              {overallPct}%
            </div>
            <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Data Coverage
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {sections.map((sec, i) => {
            const filled = sec.fields.filter(f =>
              f.value !== null && f.value !== undefined && f.value !== '' && f.value !== 0
            ).length;
            const pct = Math.round((filled / sec.fields.length) * 100);
            const color = pct >= 80 ? T.green : pct >= 50 ? '#f59e0b' : '#ef4444';
            return (
              <div key={i} style={{
                background: T.surface, borderRadius: 8, padding: "14px 16px",
                border: `1px solid ${T.cardBorder}44`
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{sec.icon} {sec.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}%</span>
                </div>
                <div style={{ height: 4, background: T.bg, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`, height: "100%", background: color, borderRadius: 2,
                    transition: "width 0.6s ease"
                  }} />
                </div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6 }}>
                  {sec.fields.map((f, j) => {
                    const ok = f.value !== null && f.value !== undefined && f.value !== '' && f.value !== 0;
                    return (
                      <span key={j} style={{ marginRight: 8 }}>
                        <span style={{ color: ok ? T.green : '#ef4444' }}>{ok ? '✓' : '✗'}</span> {f.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 12 }}>
          <button onClick={onProceed} style={{
            padding: "12px 32px", background: T.accent, border: "none", borderRadius: 8,
            color: "#0a0b0d", fontWeight: 700, fontSize: 14, fontFamily: T.font,
            cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em"
          }}>Explore Full Study →</button>
        </div>
      </div>
    </div>
  );
}

/* ── Interactive Trend Chart (Recharts) — Sprint 4 item 18 ─────── */
function TrendChart({ data, xKey, yKey, height = 120, color, label, formatter, isMobile }) {
  if (!data || data.length < 2)
    return <div style={{ color: T.textMuted, fontSize: 11, padding: 10 }}>Insufficient data points</div>;
  const c = color || T.accent;
  const fmtVal = formatter || (v => v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: isMobile ? -20 : 0 }}>
        <defs>
          <linearGradient id={`grad-${label || 'default'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={c} stopOpacity={0.3} />
            <stop offset="95%" stopColor={c} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={`${T.cardBorder}44`} />
        <XAxis dataKey={xKey} tick={{ fontSize: 9, fill: T.textMuted }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 9, fill: T.textMuted }} tickLine={false} axisLine={false}
               tickFormatter={fmtVal} width={isMobile ? 30 : 45} />
        <Tooltip content={<ChartTooltip formatter={fmtVal} />} />
        <Area type="monotone" dataKey={yKey} stroke={c} strokeWidth={2}
              fill={`url(#grad-${label || 'default'})`}
              dot={{ r: 3, fill: c, stroke: T.card, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: c }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Interactive Bar Chart (Recharts) ──────────────────────────── */
function InteractiveBarChart({ data, xKey, yKey, height = 120, color, formatter, isMobile }) {
  if (!data || !data.length)
    return <div style={{ color: T.textMuted, fontSize: 11, padding: 10 }}>No data</div>;
  const c = color || T.accent;
  const fmtVal = formatter || (v => v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: isMobile ? -20 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={`${T.cardBorder}44`} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 9, fill: T.textMuted }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 9, fill: T.textMuted }} tickLine={false} axisLine={false}
               tickFormatter={fmtVal} width={isMobile ? 30 : 45} />
        <Tooltip content={<ChartTooltip formatter={fmtVal} />} />
        <Bar dataKey={yKey} fill={c} radius={[3, 3, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Horizontal Bar (inline, for distributions) ───────────────── */
function HBarInline({ data, keyLabel = "label", keyVal = "value", color }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data.map(d => d[keyVal] || 0), 1);
  const c = color || T.accent;
  return (
    <div>
      {data.map((d, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 5
        }}>
          <span style={{ width: 100, color: T.textDim, textAlign: "right", flexShrink: 0, fontSize: 10 }}>
            {d[keyLabel]}
          </span>
          <div style={{ flex: 1, height: 16, background: T.bg, borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              width: `${(d[keyVal] / max) * 100}%`, height: "100%", background: c,
              borderRadius: 3, transition: "width 0.5s ease"
            }} />
          </div>
          <span style={{ width: 40, fontWeight: 600, color: T.text, fontSize: 10 }}>{d[keyVal]}</span>
        </div>
      ))}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function Dashboard({ study, onReset }) {
  const [tab, setTab]                           = useState("demographics");
  const [scExp, setScExp]                       = useState(null);
  const [proformaScenario, setProformaScenario] = useState(0);
  const [showDeliverables, setShowDeliverables] = useState(false);
  const [previewMode, setPreviewMode]           = useState(true);   // Sprint 4: browse before generate
  const { isMobile, isTablet }                  = useMediaQuery();   // Sprint 4: responsive

  const { geo, demographics: d, housing: h, competition: comp, study: studyObj } = study;
  const absorption  = study.analysis?.absorption;
  const pricing     = study.analysis?.pricing;
  const land        = study.analysis?.land;
  const proforma    = study.analysis?.proforma;
  const regulatory  = study.analysis?.regulatory;
  const scorecard   = study.analysis?.scorecard;
  const swot        = study.analysis?.swot;

  const communities = comp?.communities || [];
  const builders    = comp?.builders || [];
  const sc          = scorecard || [];
  const ws          = sc.length
    ? sc.reduce((s, m) => s + (m.score || 0) * ((m.weight || 0) / 100), 0)
    : 0;
  const scn         = proforma?.scenarios?.[proformaScenario] || {};

  /* ── Data quality fields per section (Sprint 4 item 20) ──────── */
  const dqDemographics = useMemo(() => [
    { label: "Population", value: d?.population },
    { label: "Median HHI", value: d?.mhi },
    { label: "Households", value: d?.households },
    { label: "Median Age", value: d?.medianAge },
    { label: "Homeownership", value: d?.homeownershipRate },
    { label: "Unemployment", value: d?.unemploymentRate },
  ], [d]);

  const dqHousing = useMemo(() => [
    { label: "Median Value", value: h?.medianValue },
    { label: "DOM", value: h?.medianDOM },
    { label: "Sale-to-List", value: h?.saleToList },
    { label: "Months Supply", value: h?.monthsSupply },
    { label: "Vacancy", value: h?.vacancyRate },
    { label: "Median Rent", value: h?.medianRent },
  ], [h]);

  const dqCompetition = useMemo(() => [
    { label: "Communities", value: communities.length || null },
    { label: "Builders", value: builders.length || null },
    { label: "Lot Data", value: communities.some(c => c.lotsTotal) ? "yes" : null },
    { label: "Pricing", value: communities.some(c => c.priceLow) ? "yes" : null },
  ], [communities, builders]);

  const dqAbsorption = useMemo(() => [
    { label: "Monthly Abs", value: absorption?.marketWideMonthly },
    { label: "Annual Close", value: absorption?.annualClosings },
    { label: "HH Formation", value: absorption?.hhFormationAnnual },
    { label: "Demand Gap", value: absorption?.demandGap },
  ], [absorption]);

  const phases = [
    { label: "Geo",     status: "complete" },
    { label: "Ph 1",    status: "complete" },
    { label: "Ph 2",    status: "complete" },
    { label: "Ph 3",    status: "complete" },
    { label: "Ph 4-5",  status: "complete" },
    { label: "Ph 6",    status: "complete" },
    { label: "Ph 7-8",  status: "complete" },
    { label: "Ph 9",    status: "complete" },
    { label: "Deliver", status: "complete" },
  ];

  const tabs = [
    { key: "demographics", label: isMobile ? "Demo"   : "Ph 1 — Demographics" },
    { key: "housing",      label: isMobile ? "Supply"  : "Ph 2 — Supply" },
    { key: "competition",  label: isMobile ? "Comp"    : "Ph 3 — Competition" },
    { key: "absorption",   label: isMobile ? "Abs"     : "Ph 4 — Absorption" },
    { key: "pricing",      label: isMobile ? "Price"   : "Ph 5 — Pricing" },
    { key: "land",         label: isMobile ? "Land"    : "Ph 6 — Land" },
    { key: "margins",      label: isMobile ? "Margin"  : "Ph 7 — Margins" },
    { key: "regulatory",   label: isMobile ? "Reg"     : "Ph 8 — Regulatory" },
    { key: "scorecard",    label: isMobile ? "Score"   : "Ph 9 — Scorecard" },
  ];

  /* ── Responsive grid helpers ─────────────────────────────────── */
  const grid2   = isMobile ? "1fr" : "1fr 1fr";
  const grid3   = isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr";
  const kpiGrid = `repeat(auto-fit, minmax(${isMobile ? '140px' : '170px'}, 1fr))`;
  const padX    = isMobile ? "0 14px 30px" : "0 28px 40px";

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text }}>
      <Header query={geo?.name} onReset={onReset} />
      {showDeliverables && (
        <DeliverableModal onClose={() => setShowDeliverables(false)} study={studyObj} />
      )}

      {/* ══ Sprint 4: Preview Mode (Browse before generate) ══════ */}
      {previewMode && (
        <>
          <div style={{ padding: padX }}>
            <PhaseTracker phases={phases} />
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: isMobile ? "flex-start" : "center", marginBottom: 16,
              flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0
            }}>
              <div>
                <h2 style={{ fontFamily: T.fontDisplay, fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0 }}>
                  {geo?.name}
                </h2>
                <p style={{ color: T.textDim, fontSize: 11, marginTop: 3 }}>
                  FIPS {geo?.stateFips}-{geo?.countyFips}-{geo?.subdivFips} · CBSA {geo?.cbsa} · ZIPs: {geo?.zips?.join(", ")}
                </p>
              </div>
            </div>
            <TradeAreaMap geo={geo} />
          </div>
          <PreviewOverview study={study} onProceed={() => setPreviewMode(false)} />
        </>
      )}

      {/* ══ Full Dashboard (after preview) ═══════════════════════ */}
      {!previewMode && (
        <div style={{ padding: padX }}>
          <PhaseTracker phases={phases} />

          {/* Header row */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center", marginBottom: 16,
            flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0
          }}>
            <div>
              <h2 style={{ fontFamily: T.fontDisplay, fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0 }}>
                {geo?.name}
              </h2>
              <p style={{ color: T.textDim, fontSize: 11, marginTop: 3 }}>
                FIPS {geo?.stateFips}-{geo?.countyFips}-{geo?.subdivFips} · CBSA {geo?.cbsa} · ZIPs: {geo?.zips?.join(", ")}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => setPreviewMode(true)} style={{
                padding: "8px 14px", background: "transparent",
                border: `1px solid ${T.cardBorder}`, borderRadius: 6,
                color: T.textDim, fontWeight: 600, fontSize: 11,
                fontFamily: T.font, cursor: "pointer"
              }}>◀ Data Overview</button>
              {sc.length > 0 && (
                <div style={{
                  padding: "8px 14px",
                  background: ws >= 7.5 ? T.greenDim : T.accentDim,
                  border: `1px solid ${ws >= 7.5 ? T.green : T.accent}33`,
                  borderRadius: 8, textAlign: "center"
                }}>
                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textDim }}>Score</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.fontDisplay, color: ws >= 7.5 ? T.green : T.accent }}>{ws.toFixed(1)}</div>
                </div>
              )}
              <button onClick={() => setShowDeliverables(true)} style={{
                padding: "10px 18px", background: T.accent, border: "none", borderRadius: 6,
                color: "#0a0b0d", fontWeight: 700, fontSize: 12, fontFamily: T.font,
                cursor: "pointer", textTransform: "uppercase"
              }}>⬇ Deliverables</button>
            </div>
          </div>

          {/* Enhanced map (Sprint 4 item 19) */}
          <TradeAreaMap geo={geo} />

          {/* Tab nav — responsive: scrollable on mobile (Sprint 4 item 21) */}
          <div style={{
            display: "flex", gap: 0, marginTop: 20, marginBottom: 18,
            borderBottom: `1px solid ${T.cardBorder}`, overflowX: "auto",
            WebkitOverflowScrolling: "touch", scrollbarWidth: "none"
          }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: isMobile ? "8px 10px" : "10px 14px",
                background: "transparent", border: "none",
                borderBottom: tab === t.key ? `2px solid ${T.accent}` : "2px solid transparent",
                color: tab === t.key ? T.accent : T.textDim,
                fontSize: isMobile ? 10.5 : 11.5, fontWeight: 600, fontFamily: T.font,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0
              }}>{t.label}</button>
            ))}
          </div>

          {/* ════ PHASE 1 — DEMOGRAPHICS ════════════════════════════ */}
          {tab === "demographics" && d && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <DataQuality fields={dqDemographics} />
              <div style={{ display: "grid", gridTemplateColumns: kpiGrid, gap: 10 }}>
                <KPI label="Population" value={fmt(d.population)} trend={d.popGrowth5yr} sub="5-yr" icon="👥" />
                <KPI label="Median HHI" value={`$${fmtK(d.mhi)}`} trend={d.mhiGrowth} sub="5-yr" icon="💰" />
                <KPI label="Households" value={fmt(d.households)} sub={`Avg: ${d.avgHouseholdSize}`} icon="🏠" />
                <KPI label="Median Age" value={d.medianAge} sub="years" icon="📊" />
                <KPI label="Homeownership" value={`${d.homeownershipRate}%`} icon="🔑" />
                <KPI label="Unemployment" value={d.unemploymentRate != null ? `${d.unemploymentRate}%` : 'N/A'} sub="MSA" icon="📉" color={d.unemploymentRate != null ? T.green : T.textMuted} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 14 }}>
                <Section title="Population Trend" subtitle="Census ACS + PEP">
                  {d.popTrend && d.popTrend.length >= 2 ? (
                    <TrendChart data={d.popTrend} xKey="yr" yKey="pop" height={isMobile ? 140 : 160}
                                color={T.accent} label="pop" formatter={v => fmtK(v)} isMobile={isMobile} />
                  ) : (
                    <div style={{ color: T.textMuted, fontSize: 11, padding: 16, textAlign: "center" }}>
                      Insufficient trend data (need 3+ years)
                    </div>
                  )}
                </Section>
                <Section title="Income Distribution" subtitle="ACS 5-Year, PMA">
                  {d.incomeDist ? (
                    <HBarInline data={d.incomeDist} />
                  ) : (
                    <div style={{ color: T.textMuted, fontSize: 11, padding: 16, textAlign: "center" }}>No income data</div>
                  )}
                </Section>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 14 }}>
                <Section title="Top Employers" subtitle="Census CBP + BLS">
                  <DataTable columns={[
                    { key: "name", label: "Employer", bold: true },
                    { key: "sector", label: "Sector" },
                    { key: "est", label: "Employees", align: "right", render: r => fmt(r.est) }
                  ]} rows={d.topEmployers || []} />
                </Section>
                <Section title="Commute Dynamics" subtitle="LODES inflow/outflow">
                  <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 8, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                    {[
                      { v: d.commuteInflow, l: "IN", c: T.green },
                      { v: d.commuteOutflow, l: "OUT", c: T.blue },
                      { v: (d.commuteInflow || 0) - (d.commuteOutflow || 0), l: "Net", c: T.accent }
                    ].map((x, i) => (
                      <div key={i} style={{ textAlign: "center", flex: 1, minWidth: isMobile ? 80 : "auto" }}>
                        <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: x.c, fontFamily: T.fontDisplay }}>
                          {x.v ? `${i === 2 ? "+" : ""}${fmtK(x.v)}` : <span style={{ color: T.textMuted }}>—</span>}
                        </div>
                        <div style={{ fontSize: 10, color: T.textDim, marginTop: 3 }}>{x.l}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            </div>
          )}

          {/* ════ PHASE 2 — HOUSING ═════════════════════════════════ */}
          {tab === "housing" && h && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <DataQuality fields={dqHousing} />
              <div style={{ display: "grid", gridTemplateColumns: kpiGrid, gap: 10 }}>
                <KPI label="Median Value" value={h.medianValue ? `$${fmtK(h.medianValue)}` : '—'} trend={h.valueGrowthYoY} sub="YoY" icon="🏡" />
                <KPI label="DOM" value={h.medianDOM || '—'} sub="days" icon="⏱" color={h.medianDOM ? T.green : T.textMuted} />
                <KPI label="Sale-to-List" value={h.saleToList ? `${(h.saleToList > 2 ? h.saleToList : ((h.saleToList || 0) * 100)).toFixed(1)}%` : '—'} icon="📈" color={h.saleToList ? T.green : T.textMuted} />
                <KPI label="Months Supply" value={h.monthsSupply || '—'} icon="📦" />
                <KPI label="Vacancy" value={`${h.vacancyRate}%`} icon="🔓" />
                <KPI label="Median Rent" value={h.medianRent ? `$${fmt(h.medianRent)}` : '—'} sub="HUD FMR" icon="🏢" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 14 }}>
                <Section title="Price Trend" subtitle="Redfin ZIP, in thousands">
                  {h.priceTrend && h.priceTrend.length >= 2 ? (
                    <TrendChart data={h.priceTrend} xKey="mo" yKey="val" height={isMobile ? 140 : 160}
                                color={T.green} label="price" formatter={v => `$${fmtK(v)}`} isMobile={isMobile} />
                  ) : (
                    <div style={{ color: T.textMuted, fontSize: 11, padding: 16, textAlign: "center", background: T.surface, borderRadius: 6 }}>
                      Price trend data unavailable — Redfin ETL required
                    </div>
                  )}
                </Section>
                <Section title="SF Building Permits" subtitle="Census BPS, PMA">
                  {h.permitsSF && h.permitsSF.length > 0 ? (
                    <InteractiveBarChart data={h.permitsSF} xKey="yr" yKey="val" height={isMobile ? 130 : 150}
                                         color={T.accent} formatter={v => fmt(v)} isMobile={isMobile} />
                  ) : (
                    <div style={{ color: T.textMuted, fontSize: 11, padding: 16, textAlign: "center" }}>No permit data</div>
                  )}
                </Section>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 14 }}>
                <Section title="MF Building Permits">
                  {h.permitsMF && h.permitsMF.length > 0 ? (
                    <InteractiveBarChart data={h.permitsMF} xKey="yr" yKey="val" height={isMobile ? 130 : 150}
                                         color={T.blue} formatter={v => fmt(v)} isMobile={isMobile} />
                  ) : (
                    <div style={{ color: T.textMuted, fontSize: 11, padding: 16, textAlign: "center" }}>No MF permit data</div>
                  )}
                </Section>
                <Section title="Housing Vintage">
                  {h.vintage ? <HBarInline data={h.vintage} keyLabel="era" keyVal="pct" color={T.blue} /> : null}
                </Section>
              </div>
            </div>
          )}

          {/* ════ PHASE 3 — COMPETITION ═════════════════════════════ */}
          {tab === "competition" && !comp && (
            <Section title="Competition Data Unavailable">
              <div style={{ padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: T.textDim, marginBottom: 8 }}>Competition data could not be loaded.</div>
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  This section requires active community data from RapidAPI/NewHomeSource or manual entry.
                </div>
              </div>
            </Section>
          )}
          {tab === "competition" && comp && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <DataQuality fields={dqCompetition} />
              <div style={{ display: "grid", gridTemplateColumns: kpiGrid, gap: 10 }}>
                <KPI label="Communities" value={communities.length} icon="🏘" />
                <KPI label="Total Lots" value={fmt(communities.reduce((s, c) => s + (c.lotsTotal || 0), 0))} icon="📐" />
                <KPI label="Remaining" value={fmt(communities.reduce((s, c) => s + (c.lotsRemain || 0), 0))} icon="📋" color={T.blue} />
                <KPI label="Avg Abs" value={communities.length ? `${(communities.reduce((s, c) => s + (c.monthlyAbs || 0), 0) / communities.length).toFixed(1)}/mo` : '—'} icon="📈" color={T.green} />
              </div>

              <Section title="Community Comp Table" subtitle={`${communities.length} active communities in PMA`}>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <DataTable maxH={320} columns={[
                    { key: "name", label: "Community", bold: true },
                    ...(!isMobile ? [{ key: "builder", label: "Builder" }] : []),
                    { key: "product", label: "Type" },
                    { label: "Price Range", align: "right", render: r => r.priceLow && r.priceHigh ? `$${fmtK(r.priceLow)}–$${fmtK(r.priceHigh)}` : '—' },
                    ...(!isMobile ? [{ label: "$/SF", align: "right", render: r => r.psfAvg ? `$${r.psfAvg}` : '—' }] : []),
                    { label: "Lots", align: "center", render: r => r.lotsSold != null && r.lotsTotal != null ? `${r.lotsSold}/${r.lotsTotal}` : '—' },
                    { label: "Remain", align: "center", render: r => r.lotsRemain != null ? r.lotsRemain : '—', color: r => r.lotsRemain != null && r.lotsRemain < 25 ? T.orange : T.text },
                    { label: "Abs/Mo", align: "center", render: r => (r.monthlyAbs || 0).toFixed(1), color: r => (r.monthlyAbs || 0) >= 3 ? T.green : T.text },
                    ...(!isMobile ? [{ key: "incentives", label: "Incentives" }] : []),
                  ]} rows={communities} />
                </div>
              </Section>

              <Section title="Builder Profiles" subtitle="Market share by builder">
                <DataTable columns={[
                  { key: "name", label: "Builder", bold: true },
                  { key: "communities", label: "Comms", align: "center" },
                  { label: "Closings/Yr", align: "right", render: r => r.estClosingsYr != null ? fmt(r.estClosingsYr) : '—' },
                  { label: "Share", align: "right", render: r => r.mktShare != null ? `${r.mktShare}%` : '—', color: r => r.mktShare > 20 ? T.accent : T.text },
                  ...(!isMobile ? [
                    { label: "Avg Price", align: "right", render: r => r.avgPrice ? `$${fmtK(r.avgPrice)}` : '—' },
                    { key: "positioning", label: "Position" },
                  ] : []),
                ]} rows={builders} />
              </Section>
            </div>
          )}

          {/* ════ PHASE 4 — ABSORPTION ══════════════════════════════ */}
          {tab === "absorption" && absorption && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <DataQuality fields={dqAbsorption} />
              <div style={{ display: "grid", gridTemplateColumns: kpiGrid, gap: 10 }}>
                <KPI label="Market-Wide Monthly" value={`${absorption.marketWideMonthly}/mo`} icon="📊" color={T.green} />
                <KPI label="Annual Closings" value={fmt(absorption.annualClosings)} icon="🏠" />
                <KPI label="HH Formation/Yr" value={fmt(absorption.hhFormationAnnual)} icon="👥" />
                <KPI label="New Supply/Yr" value={fmt(absorption.newSupplyAnnual)} icon="🔨" />
                <KPI label="Demand Gap" value={`+${fmt(absorption.demandGap)}/yr`} sub="units undersupplied" icon="⚡" color={T.green} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 14 }}>
                <Section title="Absorption by Price Band" subtitle="Annual closings distribution">
                  {absorption.byPriceBand ? (
                    <HBarInline data={absorption.byPriceBand} keyLabel="band" keyVal="pct" color={T.accent} />
                  ) : null}
                </Section>
                <Section title="Absorption by Community" subtitle="Monthly sales pace">
                  {(absorption.byCommunity || []).map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 5 }}>
                      <span style={{
                        width: isMobile ? 80 : 120, color: T.textDim, textAlign: "right",
                        flexShrink: 0, fontSize: isMobile ? 9 : 11
                      }}>{c.name}</span>
                      <div style={{ flex: 1, height: 16, background: T.bg, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          width: `${(c.abs / 5) * 100}%`, height: "100%",
                          background: c.abs >= 3 ? T.green : c.abs >= 2 ? T.accent : T.blue,
                          borderRadius: 3, transition: "width 0.5s ease"
                        }} />
                      </div>
                      <span style={{ width: 40, fontWeight: 600, color: T.text }}>{c.abs}</span>
                      {!isMobile && <span style={{ fontSize: 9, color: T.textMuted, width: 70 }}>{c.method}</span>}
                    </div>
                  ))}
                </Section>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 14 }}>
                <Section title="Seasonality Index" subtitle="Monthly sales velocity (1.0 = average)">
                  {absorption.seasonality ? (
                    <InteractiveBarChart data={absorption.seasonality} xKey="mo" yKey="idx"
                                         height={isMobile ? 120 : 140} color={T.blue}
                                         formatter={v => v.toFixed(2)} isMobile={isMobile} />
                  ) : null}
                </Section>
                <Section title="Sell-Out Pace" subtitle="Months to sell out at current absorption">
                  <DataTable maxH={220} columns={[
                    { key: "name", label: "Community", bold: true },
                    { key: "remain", label: "Remain", align: "center" },
                    { label: "Abs/Mo", align: "center", render: r => (r.abs || 0).toFixed(1) },
                    { label: "Months", align: "center", render: r => r.months, color: r => r.months < 10 ? T.orange : T.text },
                  ]} rows={absorption.selloutPace || []} />
                </Section>
              </div>
            </div>
          )}

          {/* ════ PHASE 5 — PRICING ═════════════════════════════════ */}
          {tab === "pricing" && pricing && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: kpiGrid, gap: 10 }}>
                <KPI label="Price-to-Income" value={`${pricing.affordability?.priceToIncome || '—'}x`} icon="📊" />
                <KPI label="PITI-to-Income" value={`${pricing.affordability?.pitiToIncome || '—'}%`} icon="🏦" color={(pricing.affordability?.pitiToIncome || 30) < 28 ? T.green : T.orange} />
                <KPI label="Pool ≤$400K" value={`${pricing.affordability?.buyerPool100 || '—'}%`} sub="can afford" icon="👥" color={T.green} />
                <KPI label="Pool ≤$500K" value={`${pricing.affordability?.buyerPool125 || '—'}%`} icon="👥" />
              </div>

              <Section title="Stratification" subtitle="By market segment">
                <div style={{ overflowX: "auto" }}>
                  <DataTable columns={[
                    { label: "Segment", render: r => <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: r.color || T.accent }} /><span style={{ fontWeight: 600 }}>{r.segment}</span></div> },
                    { key: "priceRange", label: "Prices", align: "right" },
                    ...(!isMobile ? [{ key: "psfRange", label: "$/SF", align: "right" }] : []),
                    { label: "Share", align: "right", render: r => r.shareOfSales != null ? `${r.shareOfSales}%` : '—' },
                    ...(!isMobile ? [{ key: "builders", label: "Builders" }] : []),
                  ]} rows={pricing.stratification || []} />
                </div>
              </Section>

              <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 14 }}>
                <Section title="$/SF by Product Type">
                  {(pricing.psfByProduct || []).map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 6 }}>
                      <span style={{ width: isMobile ? 60 : 80, color: T.textDim, textAlign: "right", flexShrink: 0, fontSize: isMobile ? 9 : 11 }}>{p.type}</span>
                      <div style={{ flex: 1, height: 18, background: T.bg, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${((p.psf - 150) / 80) * 100}%`, height: "100%", background: T.accent, borderRadius: 3, transition: "width 0.5s ease" }} />
                      </div>
                      <span style={{ width: 40, fontWeight: 700, color: T.accent, fontFamily: T.fontDisplay }}>${p.psf}</span>
                    </div>
                  ))}
                </Section>
                <Section title="Builder Incentives">
                  <DataTable maxH={200} columns={[
                    { key: "builder", label: "Builder", bold: true },
                    { key: "type", label: "Type" },
                    { key: "value", label: "Value", align: "right" },
                  ]} rows={pricing.incentives || []} />
                </Section>
              </div>
            </div>
          )}

          {/* ════ PHASE 6 — LAND ════════════════════════════════════ */}
          {tab === "land" && land && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: kpiGrid, gap: 10 }}>
                <KPI label="Lot-to-Home Ratio" value={`${land.lotToHomeRatio}%`} sub="target 18-25%" icon="📐" color={T.green} />
                <KPI label="Est. Finished Lot" value={`$${fmtK(land.estFinishedLotValue)}`} icon="🏗" />
                <KPI label="Raw Land/Acre" value={`$${fmtK(land.rawLandPerAcre)}`} icon="🌿" />
                <KPI label="Site Dev/Lot" value={`$${fmtK(land.estSiteDev)}`} icon="🚜" />
                <KPI label="Lot Inventory" value={`${land.lotInventoryMonths} mo`} sub="at current abs" icon="⏳" />
              </div>

              <Section title="Raw Land Comps" subtitle="Active and recent land transactions in PMA">
                <div style={{ overflowX: "auto" }}>
                  <DataTable columns={[
                    { key: "address", label: "Address", bold: true },
                    { key: "acres", label: "Acres", align: "right" },
                    { label: "Ask Price", align: "right", render: r => `$${fmtK(r.askPrice)}` },
                    { label: "$/Acre", align: "right", render: r => `$${fmtK(r.perAcre)}` },
                    ...(!isMobile ? [
                      { key: "zoning", label: "Zoning" },
                      { key: "status", label: "Status" },
                    ] : []),
                    { label: "Est. Lots", align: "center", render: r => r.estLots },
                  ]} rows={land.comps || []} />
                </div>
              </Section>

              <Section title="Site Development Cost Breakdown" subtitle="Estimated per-lot development costs">
                <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 8 }}>
                  {(land.devCostBreakdown || []).map((c, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", padding: "6px 10px",
                      background: i % 2 === 0 ? T.surface : "transparent", borderRadius: 4, fontSize: 12
                    }}>
                      <span style={{ color: T.text }}>{c.item}</span>
                      <span style={{ fontWeight: 600, color: T.accent, fontFamily: T.fontDisplay }}>${fmt(c.cost)}</span>
                    </div>
                  ))}
                </div>
                {land.devCostBreakdown && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px", background: T.accentDim, borderRadius: 6,
                    display: "flex", justifyContent: "space-between", alignItems: "center"
                  }}>
                    <span style={{ fontWeight: 600, color: T.accent }}>Total Finished Lot Cost</span>
                    <span style={{ fontSize: 20, fontWeight: 700, fontFamily: T.fontDisplay, color: T.accent }}>
                      ${fmt(land.devCostBreakdown.reduce((s, c) => s + c.cost, 0))}
                    </span>
                  </div>
                )}
              </Section>
            </div>
          )}

          {/* ════ PHASE 7 — MARGINS ═════════════════════════════════ */}
          {tab === "margins" && proforma && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                {(proforma.scenarios || []).map((s, i) => (
                  <button key={i} onClick={() => setProformaScenario(i)} style={{
                    padding: "8px 16px", borderRadius: 6,
                    border: `1px solid ${proformaScenario === i ? T.accent : T.cardBorder}`,
                    background: proformaScenario === i ? T.accentDim : T.surface,
                    color: proformaScenario === i ? T.accent : T.textDim,
                    fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: T.font,
                  }}>{s.label}</button>
                ))}
              </div>

              <Section title={`Per-Unit Proforma — ${scn.label || ''}`} subtitle="Move-up SFD product">
                <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 20 }}>
                  <div>
                    {[
                      { label: "Average Sale Price", val: scn.asp, color: T.green },
                      { label: "Land / Lot", val: -(scn.landLot || 0) },
                      { label: "Hard Cost (Construction)", val: -(scn.hardCost || 0) },
                      { label: "Soft Cost (5%)", val: -(scn.softCost || 0) },
                      { label: "Selling Cost (5%)", val: -(scn.selling || 0) },
                      { label: "G&A (3%)", val: -(scn.ga || 0) },
                      { label: "Financing (2.5%)", val: -(scn.financing || 0) },
                    ].map((r, i) => (
                      <div key={i} style={{
                        display: "flex", justifyContent: "space-between", padding: "8px 0",
                        borderBottom: `1px solid ${T.cardBorder}22`, fontSize: isMobile ? 11 : 13
                      }}>
                        <span style={{ color: T.text }}>{r.label}</span>
                        <span style={{ fontWeight: 600, fontFamily: T.fontDisplay, color: r.color || (r.val < 0 ? T.red : T.text) }}>
                          {r.val < 0 ? `($${fmt(Math.abs(r.val))})` : `$${fmt(r.val)}`}
                        </span>
                      </div>
                    ))}
                    <div style={{
                      display: "flex", justifyContent: "space-between", padding: "12px 0",
                      borderTop: `2px solid ${T.accent}44`, marginTop: 4, fontSize: isMobile ? 13 : 15
                    }}>
                      <span style={{ fontWeight: 700, color: T.text }}>Gross Margin</span>
                      <span style={{ fontWeight: 700, fontFamily: T.fontDisplay, color: (scn.marginPct || 0) >= 20 ? T.green : T.orange }}>
                        ${fmt(scn.margin || 0)} ({scn.marginPct || 0}%)
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                      Public Builder Benchmarks
                    </div>
                    <DataTable maxH={200} columns={[
                      { key: "builder", label: "Builder", bold: true },
                      { label: "Gross Margin", align: "right", render: r => `${r.grossMargin}%`, color: r => r.grossMargin >= 25 ? T.green : T.text },
                      { label: "ASP", align: "right", render: r => `$${fmtK(r.asp)}` },
                      ...(!isMobile ? [{ label: "Cancel %", align: "right", render: r => `${r.cancelRate}%` }] : []),
                    ]} rows={proforma.publicBenchmarks || []} />
                    {proforma.ppiTrend && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6 }}>Construction Cost Index (PPI)</div>
                        <TrendChart data={proforma.ppiTrend} xKey="yr" yKey="val" height={80}
                                    color={T.orange} label="ppi" isMobile={isMobile} />
                        {proforma.ppiYoY && (
                          <div style={{ fontSize: 11, color: T.orange, fontWeight: 600, marginTop: 4 }}>
                            PPI +{proforma.ppiYoY}% YoY
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            </div>
          )}

          {/* ════ PHASE 8 — REGULATORY ══════════════════════════════ */}
          {tab === "regulatory" && regulatory && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: kpiGrid, gap: 10 }}>
                <KPI label="Total Fees/Unit" value={`$${fmtK(regulatory.totalFeesPerUnit)}`} icon="💰" />
                <KPI label="Entitlement" value={(regulatory.entitlementTimeline || '').split("(")[0]} sub="sketch → BP" icon="📋" />
                <KPI label="Max Density" value={(regulatory.maxDensity || '').split("(")[0]} sub="zoned" icon="📐" />
                {regulatory.schoolDistrict && (
                  <KPI label="School Rating" value={regulatory.schoolDistrict.rating} sub={regulatory.schoolDistrict.name} icon="🎓" color={T.green} />
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: grid2, gap: 14 }}>
                <Section title="Development Fee Schedule" subtitle="Per-unit fees">
                  <DataTable columns={[
                    { key: "fee", label: "Fee", bold: true },
                    { key: "amount", label: "Amount", align: "right" },
                    ...(!isMobile ? [{ key: "note", label: "Notes" }] : []),
                  ]} rows={regulatory.fees || []} />
                  <div style={{
                    marginTop: 10, padding: "8px 12px", background: T.accentDim, borderRadius: 5,
                    display: "flex", justifyContent: "space-between"
                  }}>
                    <span style={{ fontWeight: 600, color: T.accent, fontSize: 12 }}>Total</span>
                    <span style={{ fontWeight: 700, color: T.accent, fontFamily: T.fontDisplay }}>
                      ${fmt(regulatory.totalFeesPerUnit)}/unit
                    </span>
                  </div>
                </Section>
                <Section title="Utility Availability" subtitle="Infrastructure status">
                  <DataTable columns={[
                    { key: "utility", label: "Utility", bold: true },
                    ...(!isMobile ? [{ key: "provider", label: "Provider" }] : []),
                    { key: "status", label: "Status", color: r => r.status === "Available" ? T.green : T.orange },
                    ...(!isMobile ? [{ key: "note", label: "Notes" }] : []),
                  ]} rows={regulatory.utilities || []} />
                </Section>
              </div>

              <Section title="Zoning & Entitlement Summary">
                <div style={{ display: "grid", gridTemplateColumns: grid3, gap: 16 }}>
                  {[
                    { label: "Primary Zoning", val: (regulatory.zoning || '').split("(")[0].trim() },
                    { label: "Max Density", val: (regulatory.maxDensity || '').split("(")[0].trim() },
                    { label: "Timeline", val: regulatory.entitlementTimeline },
                  ].map((r, i) => (
                    <div key={i} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: T.textDim, marginBottom: 6 }}>{r.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{r.val}</div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* ════ PHASE 9 — SCORECARD + SWOT ════════════════════════ */}
          {tab === "scorecard" && sc.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px", gap: 16 }}>
                <Section title="Market Scorecard" subtitle="8 weighted metrics · Claude API">
                  {sc.map((m, i) => (
                    <div key={i}>
                      <div onClick={() => setScExp(scExp === i ? null : i)} style={{
                        display: "flex", alignItems: "center", gap: isMobile ? 8 : 12,
                        padding: "9px 0", borderBottom: `1px solid ${T.cardBorder}22`, cursor: "pointer"
                      }}>
                        <span style={{ width: isMobile ? 120 : 200, fontSize: isMobile ? 10.5 : 12, fontWeight: 500, color: T.text }}>{m.metric}</span>
                        {!isMobile && <span style={{ width: 36, fontSize: 10, color: T.textDim, textAlign: "center" }}>{m.weight}%</span>}
                        <div style={{ flex: 1, height: 7, background: T.surface, borderRadius: 4, overflow: "hidden" }}>
                          <div style={{
                            width: `${(m.score || 0) * 10}%`, height: "100%", borderRadius: 4,
                            background: m.score >= 7.5 ? T.green : m.score >= 6 ? T.accent : T.red,
                            transition: "width 0.5s ease"
                          }} />
                        </div>
                        <span style={{
                          width: 36, fontSize: 13, fontWeight: 700, textAlign: "right", fontFamily: T.fontDisplay,
                          color: m.score >= 7.5 ? T.green : m.score >= 6 ? T.accent : T.red
                        }}>{(m.score || 0).toFixed(1)}</span>
                        <span style={{ fontSize: 9, color: T.textMuted, width: 14 }}>{scExp === i ? "▲" : "▼"}</span>
                      </div>
                      {scExp === i && (
                        <div style={{
                          padding: "8px 14px 12px", background: T.surface, borderRadius: 5,
                          fontSize: 11, color: T.textDim, lineHeight: 1.6,
                          borderLeft: `3px solid ${T.accent}44`, marginBottom: 4
                        }}>{m.rationale}</div>
                      )}
                    </div>
                  ))}
                  <div style={{
                    marginTop: 14, padding: "12px 16px", borderRadius: 6,
                    background: ws >= 7.5 ? T.greenDim : T.accentDim,
                    border: `1px solid ${ws >= 7.5 ? T.green : T.accent}33`,
                    display: "flex", justifyContent: "space-between", alignItems: "center"
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: ws >= 7.5 ? T.green : T.accent }}>Weighted Composite</span>
                    <span style={{ fontSize: 22, fontWeight: 700, fontFamily: T.fontDisplay, color: ws >= 7.5 ? T.green : T.accent }}>{ws.toFixed(1)}</span>
                  </div>
                  <p style={{ fontSize: 10, color: T.textMuted, marginTop: 8 }}>
                    ≥ 7.5 = Strong Entry · 6.0–7.4 = Proceed w/ Caution · &lt; 6.0 = Pass
                  </p>
                </Section>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Section title="Radar" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <RadarChart metrics={sc} size={isMobile ? 200 : 240} />
                  </Section>
                  <div style={{
                    background: T.card, border: `1px solid ${T.cardBorder}`,
                    borderRadius: T.radius, padding: "16px 18px", textAlign: "center"
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textDim, marginBottom: 6 }}>Recommendation</div>
                    <div style={{
                      fontSize: 17, fontWeight: 700, fontFamily: T.fontDisplay,
                      color: ws >= 7.5 ? T.green : T.accent
                    }}>
                      {ws >= 7.5 ? "STRONG ENTRY" : ws >= 6 ? "PROCEED W/ CAUTION" : "PASS"}
                    </div>
                  </div>
                </div>
              </div>

              {swot && (
                <Section title="SWOT Analysis" subtitle="Claude API — independent assessment">
                  <SWOTMatrix swot={swot} />
                </Section>
              )}
            </div>
          )}

          {/* No-data fallback for tabs */}
          {tab === "demographics" && !d && <NoData />}
          {tab === "housing" && !h && <NoData />}
          {tab === "absorption" && !absorption && <NoData />}
          {tab === "pricing" && !pricing && <NoData />}
          {tab === "land" && !land && <NoData />}
          {tab === "margins" && !proforma && <NoData />}
          {tab === "regulatory" && !regulatory && <NoData />}
          {tab === "scorecard" && sc.length === 0 && <NoData />}

          {/* Footer — v2.0 */}
          <div style={{
            marginTop: 28, padding: "14px 0", borderTop: `1px solid ${T.cardBorder}`,
            fontSize: 10, color: T.textMuted, display: "flex", justifyContent: "space-between",
            flexWrap: "wrap", gap: 8
          }}>
            <span>Census ACS/PEP/BPS · FRED · BLS · BEA · HUD · Redfin · Zillow · FHFA · HMDA · LODES · RapidAPI · NewHomeSource · SEC EDGAR · NCES · Claude API</span>
            <span>Infinity Markets v2.0 · {new Date().toLocaleDateString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function NoData() {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 14, color: T.textDim }}>Data not available for this phase.</div>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
        The API may not have returned results, or analysis is still processing.
      </div>
    </div>
  );
}
