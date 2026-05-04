import { useState, useMemo } from 'react';
import { T, fmt, fmtK, fmtPct, fmtDollar, fmtDate, provFor } from '../lib/tokens';
import Header from '../components/Header';
import TradeAreaMap from '../components/TradeAreaMap';
import KPI from '../components/KPI';
import Section from '../components/Section';
import DataTable from '../components/DataTable';
import SparkLine from '../components/SparkLine';
import SparkBar from '../components/SparkBar';
import HBarChart from '../components/HBarChart';
import RadarChart from '../components/RadarChart';
import SWOTMatrix from '../components/SWOTMatrix';
import DeliverableModal from '../components/DeliverableModal';
import {
  Page, Container, Stack, Row, Eyebrow, Display, Title, Body, Ribbon, Verdict,
  Button, Card, Divider, Banner, ProvenanceChip, Chip,
} from '../components/ui';

/**
 * Editorial Dashboard, v4.2.0.
 *
 * Data contract is identical to v4.1.4: pulls geo, demographics, housing,
 * competition, analysis (absorption/pricing/land/proforma/regulatory/scorecard/swot)
 * from the useStudy hook. Tab keys preserved so deep-links still work.
 *
 * Visual changes only:
 *   - Ivory canvas with hairline rules (was dark Bloomberg-style)
 *   - Forbes lockup in Header on every page
 *   - Editorial KPI grid with brass/green accents
 *   - Verdict pill on the masthead replaces the floating score badge
 *   - Source attribution chips on the KPIs (provenance from study._env)
 *   - All tables use the editorial DataTable shim (which also has chips)
 */

export default function Dashboard({ study, onReset }) {
  const [tab, setTab] = useState("overview");
  const [scExp, setScExp] = useState(null);
  const [proformaScenario, setProformaScenario] = useState(0);
  const [showDeliverables, setShowDeliverables] = useState(false);

  const { geo, demographics: d, housing: h, competition: comp, study: studyObj } = study;
  const absorption = study.analysis?.absorption;
  const pricing = study.analysis?.pricing;
  const land = study.analysis?.land;
  const proforma = study.analysis?.proforma;
  const regulatory = study.analysis?.regulatory;
  const scorecard = study.analysis?.scorecard;
  const swot = study.analysis?.swot;

  const communities = comp?.communities || [];
  const builders = comp?.builders || [];
  const sc = scorecard || [];
  const ws = sc.length ? sc.reduce((s, m) => s + (m.score || 0) * ((m.weight || 0) / 100), 0) : 0;
  const scn = proforma?.scenarios?.[proformaScenario] || {};

  const verdict = useMemo(() => {
    if (!sc.length) return null;
    if (ws >= 7.5) return "go";
    if (ws >= 6) return "conditional";
    return "no-go";
  }, [sc.length, ws]);

  const tabs = [
    { key: "overview",     label: "Overview" },
    { key: "demographics", label: "Demographics" },
    { key: "housing",      label: "Housing" },
    { key: "competition",  label: "Competition" },
    { key: "absorption",   label: "Absorption" },
    { key: "pricing",      label: "Pricing" },
    { key: "land",         label: "Land" },
    { key: "margins",      label: "Pro forma" },
    { key: "regulatory",   label: "Regulatory" },
    { key: "scorecard",    label: "Scorecard" },
    { key: "sources",      label: "Sources" },
  ];

  const todayLine = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <Page>
      <Header
        query={geo?.name}
        onReset={onReset}
        right={
          <Row gap={T.s3}>
            {sc.length > 0 && verdict && (
              <Verdict kind={verdict} style={{ fontSize: T.fs11, padding: "6px 14px" }} />
            )}
            <Button kind="primary" onClick={() => setShowDeliverables(true)}>↓ Deliverables</Button>
          </Row>
        }
      />

      {showDeliverables && <DeliverableModal onClose={() => setShowDeliverables(false)} study={studyObj} />}

      <Container max="1240px" padX={T.s8} padY={T.s7}>
        <Stack gap={T.s7}>
          {/* ── Masthead ───────────────────────────────────────────── */}
          <Stack gap={T.s4}>
            <Row justify="space-between" align="flex-start" wrap="wrap" gap={T.s5}>
              <Stack gap={T.s2} style={{ minWidth: 360 }}>
                <Eyebrow>Land underwriting · Market study</Eyebrow>
                <Display size={48} style={{ letterSpacing: "-0.02em", lineHeight: 1.05 }}>
                  {geo?.name || "—"}
                </Display>
                <Body size={T.fs13} color={T.inkMuted} style={{ fontFamily: T.fontMono, fontVariantNumeric: "tabular-nums" }}>
                  FIPS {geo?.stateFips}-{geo?.countyFips}{geo?.subdivFips ? `-${geo.subdivFips}` : ""} · CBSA {geo?.cbsa || "—"} · ZIPs {geo?.zips?.join(" · ") || "—"}
                </Body>
              </Stack>

              {sc.length > 0 && (
                <Card padding={T.s4} accent={T.brass} style={{ minWidth: 260 }}>
                  <Stack gap={T.s2}>
                    <Eyebrow color={T.brassInk}>Composite scorecard</Eyebrow>
                    <Row align="baseline" gap={T.s3}>
                      <div style={{
                        fontFamily: T.fontDisplay,
                        fontSize: 56,
                        fontWeight: 400,
                        letterSpacing: "-0.025em",
                        lineHeight: 1,
                        color: ws >= 7.5 ? T.green : ws >= 6 ? T.brassInk : T.red,
                      }}>{ws.toFixed(1)}</div>
                      <div style={{ fontSize: T.fs15, color: T.inkMuted, fontFamily: T.fontDisplay, fontStyle: "italic" }}>/ 10.0</div>
                    </Row>
                    <Body size={T.fs11} color={T.inkMuted}>
                      {ws >= 7.5 ? "Strong entry" : ws >= 6 ? "Proceed with caution" : "Pass"} ·  {sc.length} weighted metrics
                    </Body>
                  </Stack>
                </Card>
              )}
            </Row>

            <Divider kind="strong" />
          </Stack>

          {/* ── Tab nav ───────────────────────────────────────────── */}
          <div style={{
            display: "flex",
            gap: T.s2,
            overflowX: "auto",
            borderBottom: `1px solid ${T.rule}`,
            margin: `0 -${T.s2}`,
            paddingBottom: 0,
          }}>
            {tabs.map(tt => {
              const active = tab === tt.key;
              return (
                <button
                  key={tt.key}
                  onClick={() => setTab(tt.key)}
                  style={{
                    padding: `${T.s3} ${T.s4}`,
                    background: "transparent",
                    color: active ? T.green : T.inkMuted,
                    fontFamily: T.fontBody,
                    fontSize: T.fs12,
                    fontWeight: active ? 700 : 500,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    borderBottom: `2px solid ${active ? T.green : "transparent"}`,
                    marginBottom: -1,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "color 120ms ease, border-color 120ms ease",
                  }}
                >
                  {tt.label}
                </button>
              );
            })}
          </div>

          {/* ── OVERVIEW (NEW) ─────────────────────────────────────── */}
          {tab === "overview" && (
            <Stack gap={T.s5}>
              <Row gap={T.s4} wrap="wrap">
                <div style={{ flex: "2 1 480px", minWidth: 360 }}>
                  <TradeAreaMap geo={geo} />
                </div>
                <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: T.s3 }}>
                  <KPI label="Population" value={fmt(d?.population)} trend={d?.popGrowth5yr} sub="ACS · 5-yr" color={T.green} />
                  <KPI label="Median HHI" value={fmtDollar(d?.mhi)} trend={d?.mhiYoY ?? d?.mhiGrowth} sub="ACS B19013" color={T.green} />
                  <KPI label="Median home value" value={fmtDollar(h?.medianValue)} trend={h?.valueGrowthYoY} sub="Zillow ZHVI" color={T.brass} />
                </div>
              </Row>

              <Section title="At a glance" subtitle="Headline figures · provenance-tagged">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: T.s3 }}>
                  <KPI label="Active communities" value={fmt(communities.length)} sub="In primary market" color={T.green} />
                  <KPI label="Days on market" value={h?.medianDOM ? `${h.medianDOM} days` : "—"} sub="Redfin median" color={T.green} />
                  <KPI label="Months supply" value={h?.monthsSupply ?? "—"} sub="Redfin / inventory" color={T.brass} />
                  <KPI label="Sale-to-list" value={h?.saleToList != null ? `${(h.saleToList > 2 ? h.saleToList : (h.saleToList * 100)).toFixed(1)}%` : "—"} sub="Redfin" color={T.green} />
                  <KPI label="Affordability ceiling" value={fmtDollar(d?.affordableCeiling)} sub="DTI 28% · FRED 30yr" color={T.brass} />
                  <KPI label="Permits SFD/yr" value={h?.permitsSF?.length ? fmt(h.permitsSF[h.permitsSF.length - 1]?.v) : "—"} sub="Census BPS" color={T.green} />
                </div>
              </Section>

              {sc.length > 0 && (
                <Row gap={T.s4} wrap="wrap" align="stretch">
                  <Section title="Scorecard signal" subtitle="Weighted measured composite" style={{ flex: "2 1 420px" }}>
                    <ScorecardCompactGrid sc={sc} />
                  </Section>
                  <Section title="Verdict" subtitle="LAW #5 · 25-31% margin band" style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: T.s4 }}>
                    {verdict && <Verdict kind={verdict} style={{ fontSize: T.fs14, padding: "12px 28px" }} />}
                    <Body size={T.fs13} color={T.inkMuted} style={{ textAlign: "center", maxWidth: 240 }}>
                      Composite {ws.toFixed(1)} / 10. The full reasoning trail and source attribution lives in Output A — the GO/NO-GO memo.
                    </Body>
                  </Section>
                </Row>
              )}
            </Stack>
          )}

          {/* ════ DEMOGRAPHICS ════ */}
          {tab === "demographics" && d && (
            <Stack gap={T.s5}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: T.s3 }}>
                <KPI label="Population" value={fmt(d.population)} trend={d.popGrowth5yr} sub="5-yr" />
                <KPI label="Median HHI" value={fmtDollar(d.mhi)} trend={d.mhiYoY ?? d.mhiGrowth} sub="ACS 5-yr" />
                <KPI label="Households" value={fmt(d.households)} sub={`Avg ${d.avgHouseholdSize ?? "—"}`} />
                <KPI label="Median age" value={d.medianAge ?? "—"} sub="years" />
                <KPI label="Homeownership" value={d.homeownershipRate != null ? `${d.homeownershipRate}%` : "—"} />
                <KPI label="Unemployment" value={d.unemploymentRate != null ? `${d.unemploymentRate}%` : "—"} sub="MSA · BLS" color={T.green} />
              </div>
              <Row gap={T.s4} wrap="wrap" align="stretch">
                <Section title="Population trend" subtitle="Census ACS + PEP" style={{ flex: "1 1 360px" }}>
                  {d.popTrend && (
                    <>
                      <SparkLine data={d.popTrend} height={80} color={T.green} />
                      <Row justify="space-between" style={{ fontSize: T.fs10, color: T.inkFaint, marginTop: T.s2, fontVariantNumeric: "tabular-nums" }}>
                        {d.popTrend.map(p => <span key={p.yr}>{p.yr}</span>)}
                      </Row>
                    </>
                  )}
                </Section>
                <Section title="Income distribution" subtitle="ACS 5-Year, primary market" style={{ flex: "1 1 360px" }}>
                  {d.incomeDist && <HBarChart data={d.incomeDist} color={T.green} />}
                </Section>
              </Row>
              <Row gap={T.s4} wrap="wrap" align="stretch">
                <Section title="Top employers" subtitle="Census CBP + BLS" style={{ flex: "1 1 360px" }}>
                  <DataTable columns={[
                    { key: "name", label: "Employer", bold: true },
                    { key: "sector", label: "Sector" },
                    { label: "Employees", align: "right", render: r => fmt(r.est) },
                  ]} rows={d.topEmployers || []} />
                </Section>
                <Section title="Commute dynamics" subtitle="Census LODES inflow / outflow" style={{ flex: "1 1 360px" }}>
                  <Row gap={T.s5} align="center" justify="space-around" style={{ paddingTop: T.s3 }}>
                    {[
                      { v: d.commuteInflow, l: "INFLOW", c: T.green },
                      { v: d.commuteOutflow, l: "OUTFLOW", c: T.brass },
                      { v: (d.commuteInflow || 0) - (d.commuteOutflow || 0), l: "NET", c: T.green },
                    ].map((x, i) => (
                      <div key={i} style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: T.fontDisplay, fontSize: T.fs32, fontWeight: 400, color: x.c, letterSpacing: "-0.015em", lineHeight: 1 }}>
                          {i === 2 ? "+" : ""}{fmtK(x.v || 0)}
                        </div>
                        <div style={{ fontSize: T.fs10, fontWeight: 700, letterSpacing: T.trackEyebrow, color: T.inkMuted, marginTop: T.s2 }}>{x.l}</div>
                      </div>
                    ))}
                  </Row>
                </Section>
              </Row>
            </Stack>
          )}

          {/* ════ HOUSING ════ */}
          {tab === "housing" && h && (
            <Stack gap={T.s5}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: T.s3 }}>
                <KPI label="Median value" value={fmtDollar(h.medianValue)} trend={h.valueGrowthYoY} sub="YoY" />
                <KPI label="Days on market" value={h.medianDOM != null ? `${h.medianDOM}` : "—"} sub="days" />
                <KPI label="Sale-to-list" value={h.saleToList != null ? `${(h.saleToList > 2 ? h.saleToList : (h.saleToList * 100)).toFixed(1)}%` : "—"} />
                <KPI label="Months supply" value={h.monthsSupply ?? "—"} />
                <KPI label="Vacancy" value={h.vacancyRate != null ? `${h.vacancyRate}%` : "—"} />
                <KPI label="Median rent" value={fmtDollar(h.medianRent)} sub="HUD FMR" />
              </div>
              <Row gap={T.s4} wrap="wrap" align="stretch">
                <Section title="Price trend" subtitle="Redfin ZIP-level, in thousands" style={{ flex: "1 1 360px" }}>
                  {h.priceTrend && (
                    <>
                      <SparkLine data={h.priceTrend} height={80} color={T.green} />
                      <Row justify="space-between" style={{ fontSize: T.fs10, color: T.inkFaint, marginTop: T.s2 }}>
                        {h.priceTrend.map(p => <span key={p.mo}>{p.mo}</span>)}
                      </Row>
                    </>
                  )}
                </Section>
                <Section title="SF building permits" subtitle="Census BPS, primary market" style={{ flex: "1 1 360px" }}>
                  {h.permitsSF && (
                    <>
                      <SparkBar data={h.permitsSF} height={80} color={T.green} />
                      <Row justify="space-between" style={{ fontSize: T.fs10, color: T.inkFaint, marginTop: T.s2 }}>
                        {h.permitsSF.map(p => <span key={p.yr}>{p.yr}</span>)}
                      </Row>
                    </>
                  )}
                </Section>
              </Row>
              <Row gap={T.s4} wrap="wrap" align="stretch">
                <Section title="MF building permits" style={{ flex: "1 1 360px" }}>
                  {h.permitsMF && (
                    <>
                      <SparkBar data={h.permitsMF} height={80} color={T.brass} />
                      <Row justify="space-between" style={{ fontSize: T.fs10, color: T.inkFaint, marginTop: T.s2 }}>
                        {h.permitsMF.map(p => <span key={p.yr}>{p.yr}</span>)}
                      </Row>
                    </>
                  )}
                </Section>
                <Section title="Housing vintage" style={{ flex: "1 1 360px" }}>
                  {h.vintage && <HBarChart data={h.vintage} keyLabel="era" keyVal="pct" color={T.brass} />}
                </Section>
              </Row>
            </Stack>
          )}

          {/* ════ COMPETITION ════ */}
          {tab === "competition" && !comp && (
            <Banner tone="warn">Competition data could not be loaded. Try re-running the study or check API connectivity.</Banner>
          )}
          {tab === "competition" && comp && (
            <Stack gap={T.s5}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: T.s3 }}>
                <KPI label="Communities" value={fmt(communities.length)} />
                <KPI label="Total lots" value={fmt(communities.reduce((s, c) => s + (c.lotsTotal || 0), 0))} />
                <KPI label="Remaining lots" value={fmt(communities.reduce((s, c) => s + (c.lotsRemain || 0), 0))} color={T.brass} />
                <KPI label="Avg absorption" value={communities.length ? `${(communities.reduce((s, c) => s + (c.monthlyAbs || 0), 0) / communities.length).toFixed(1)}/mo` : '—'} color={T.green} />
              </div>
              <Section title="Active communities" subtitle={`${communities.length} matches in primary market area`}>
                <DataTable maxH={420} columns={[
                  { key: "name", label: "Community", bold: true },
                  { key: "builder", label: "Builder" },
                  { key: "product", label: "Type" },
                  { label: "Price range", align: "right", render: r => `$${fmtK(r.priceLow)} – $${fmtK(r.priceHigh)}` },
                  { label: "$/SF", align: "right", render: r => r.psfAvg != null ? `$${r.psfAvg}` : "—" },
                  { label: "Lots", align: "center", render: r => `${r.lotsSold ?? 0}/${r.lotsTotal ?? "—"}` },
                  { label: "Remain", align: "center", render: r => r.lotsRemain ?? "—", color: r => (r.lotsRemain != null && r.lotsRemain < 25) ? T.brassInk : T.ink },
                  { label: "Abs/mo", align: "center", render: r => (r.monthlyAbs || 0).toFixed(1), color: r => (r.monthlyAbs || 0) >= 3 ? T.green : T.ink },
                  { key: "incentives", label: "Incentives" },
                ]} rows={communities} />
              </Section>
              <Section title="Builder profiles" subtitle="Market share by builder · EDGAR + community rollup">
                <DataTable columns={[
                  { key: "name", label: "Builder", bold: true },
                  { key: "communities", label: "Comms", align: "center" },
                  { label: "Closings/yr", align: "right", render: r => fmt(r.estClosingsYr) },
                  { label: "Share", align: "right", render: r => r.mktShare != null ? `${r.mktShare}%` : "—", color: r => (r.mktShare || 0) > 20 ? T.green : T.ink },
                  { label: "Avg price", align: "right", render: r => fmtDollar(r.avgPrice) },
                  { key: "positioning", label: "Positioning" },
                ]} rows={builders} />
              </Section>
            </Stack>
          )}

          {/* ════ ABSORPTION ════ */}
          {tab === "absorption" && absorption && (
            <Stack gap={T.s5}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: T.s3 }}>
                <KPI label="Market-wide monthly" value={absorption.marketWideMonthly != null ? `${absorption.marketWideMonthly}/mo` : "—"} color={T.green} />
                <KPI label="Annual closings" value={fmt(absorption.annualClosings)} />
                <KPI label="HH formation/yr" value={fmt(absorption.hhFormationAnnual)} />
                <KPI label="New supply/yr" value={fmt(absorption.newSupplyAnnual)} />
                <KPI label="Demand gap" value={absorption.demandGap != null ? `+${fmt(absorption.demandGap)}/yr` : "—"} sub="undersupplied" color={T.green} />
              </div>
              <Row gap={T.s4} wrap="wrap" align="stretch">
                <Section title="By price band" subtitle="Annual closings distribution" style={{ flex: "1 1 360px" }}>
                  {absorption.byPriceBand && <HBarChart data={absorption.byPriceBand} keyLabel="band" keyVal="pct" color={T.green} />}
                </Section>
                <Section title="By community" subtitle="Monthly sales pace" style={{ flex: "1 1 360px" }}>
                  <Stack gap={T.s2}>
                    {(absorption.byCommunity || []).map((c, i) => (
                      <Row key={i} gap={T.s3} align="center" style={{ fontSize: T.fs12 }}>
                        <span style={{ width: 130, color: T.inkMuted, textAlign: "right", flexShrink: 0 }}>{c.name}</span>
                        <div style={{ flex: 1, height: 8, background: T.canvas, borderRadius: 1, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min((c.abs / 5) * 100, 100)}%`, height: "100%", background: c.abs >= 3 ? T.green : c.abs >= 2 ? T.brass : T.brassInk, borderRadius: 1 }} />
                        </div>
                        <span style={{ width: 36, fontWeight: 600, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{c.abs}</span>
                        <span style={{ fontSize: T.fs10, color: T.inkFaint, width: 80, fontVariantNumeric: "tabular-nums" }}>{c.method}</span>
                      </Row>
                    ))}
                  </Stack>
                </Section>
              </Row>
              <Row gap={T.s4} wrap="wrap" align="stretch">
                <Section title="Seasonality index" subtitle="1.0 = annual average" style={{ flex: "1 1 360px" }}>
                  {absorption.seasonality && (
                    <>
                      <SparkBar data={absorption.seasonality} keyY="idx" height={80} color={T.brass} />
                      <Row justify="space-between" style={{ fontSize: 9, color: T.inkFaint, marginTop: T.s2 }}>
                        {absorption.seasonality.map(m => <span key={m.mo}>{m.mo}</span>)}
                      </Row>
                    </>
                  )}
                </Section>
                <Section title="Sell-out pace" subtitle="Months to clear inventory at current absorption" style={{ flex: "1 1 360px" }}>
                  <DataTable maxH={240} columns={[
                    { key: "name", label: "Community", bold: true },
                    { key: "remain", label: "Remain", align: "center" },
                    { label: "Abs/mo", align: "center", render: r => (r.abs || 0).toFixed(1) },
                    { label: "Months", align: "center", render: r => r.months ?? "—", color: r => (r.months ?? 99) < 10 ? T.brassInk : T.ink },
                  ]} rows={absorption.selloutPace || []} />
                </Section>
              </Row>
            </Stack>
          )}

          {/* ════ PRICING ════ */}
          {tab === "pricing" && pricing && (
            <Stack gap={T.s5}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: T.s3 }}>
                <KPI label="Price-to-income" value={pricing.affordability?.priceToIncome != null ? `${pricing.affordability.priceToIncome}×` : "—"} />
                <KPI label="PITI-to-income" value={pricing.affordability?.pitiToIncome != null ? `${pricing.affordability.pitiToIncome}%` : "—"} color={(pricing.affordability?.pitiToIncome || 30) < 28 ? T.green : T.brass} />
                <KPI label="Pool ≤ $400K" value={pricing.affordability?.buyerPool100 != null ? `${pricing.affordability.buyerPool100}%` : "—"} sub="can afford" color={T.green} />
                <KPI label="Pool ≤ $500K" value={pricing.affordability?.buyerPool125 != null ? `${pricing.affordability.buyerPool125}%` : "—"} />
              </div>
              <Section title="Stratification" subtitle="By market segment">
                <DataTable columns={[
                  { label: "Segment", render: r => <Row gap={T.s2} align="center"><div style={{ width: 8, height: 8, borderRadius: 1, background: r.color || T.green }} /><span style={{ fontWeight: 600 }}>{r.segment}</span></Row> },
                  { key: "priceRange", label: "Prices", align: "right" },
                  { key: "psfRange", label: "$/SF", align: "right" },
                  { label: "Share", align: "right", render: r => r.shareOfSales != null ? `${r.shareOfSales}%` : "—" },
                  { key: "builders", label: "Builders" },
                ]} rows={pricing.stratification || []} />
              </Section>
              <Row gap={T.s4} wrap="wrap" align="stretch">
                <Section title="$/SF by product type" style={{ flex: "1 1 360px" }}>
                  <Stack gap={T.s2}>
                    {(pricing.psfByProduct || []).map((p, i) => (
                      <Row key={i} gap={T.s3} align="center" style={{ fontSize: T.fs12 }}>
                        <span style={{ width: 96, color: T.inkMuted, textAlign: "right", flexShrink: 0 }}>{p.type}</span>
                        <div style={{ flex: 1, height: 10, background: T.canvas, borderRadius: 1, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(((p.psf - 150) / 80) * 100, 100)}%`, height: "100%", background: T.green, borderRadius: 1 }} />
                        </div>
                        <span style={{ width: 56, fontWeight: 700, color: T.green, fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums" }}>${p.psf}</span>
                      </Row>
                    ))}
                  </Stack>
                </Section>
                <Section title="Builder incentives" style={{ flex: "1 1 360px" }}>
                  <DataTable maxH={240} columns={[
                    { key: "builder", label: "Builder", bold: true },
                    { key: "type", label: "Type" },
                    { key: "value", label: "Value", align: "right" },
                  ]} rows={pricing.incentives || []} />
                </Section>
              </Row>
            </Stack>
          )}

          {/* ════ LAND ════ */}
          {tab === "land" && land && (
            <Stack gap={T.s5}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: T.s3 }}>
                <KPI label="Lot-to-home ratio" value={land.lotToHomeRatio != null ? `${land.lotToHomeRatio}%` : "—"} sub="target 18-25%" color={T.green} />
                <KPI label="Est. finished lot" value={fmtDollar(land.estFinishedLotValue)} />
                <KPI label="Raw land/acre" value={fmtDollar(land.rawLandPerAcre)} />
                <KPI label="Site dev/lot" value={fmtDollar(land.estSiteDev)} />
                <KPI label="Lot inventory" value={land.lotInventoryMonths != null ? `${land.lotInventoryMonths} mo` : "—"} sub="at current absorption" />
              </div>
              <Section title="Raw land comps" subtitle="Active and recent transactions in primary market">
                <DataTable columns={[
                  { key: "address", label: "Address", bold: true },
                  { key: "acres", label: "Acres", align: "right" },
                  { label: "Ask price", align: "right", render: r => fmtDollar(r.askPrice) },
                  { label: "$/Acre", align: "right", render: r => fmtDollar(r.perAcre) },
                  { key: "zoning", label: "Zoning" },
                  { key: "status", label: "Status" },
                  { label: "Est. lots", align: "center", render: r => r.estLots ?? "—" },
                ]} rows={land.comps || []} />
              </Section>
              <Section title="Site development cost breakdown" subtitle="Estimated per-lot">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.s3 }}>
                  {(land.devCostBreakdown || []).map((c, i) => (
                    <Row key={i} justify="space-between" align="center" style={{ padding: `${T.s3} ${T.s4}`, background: i % 2 === 0 ? T.canvas : T.surface, borderRadius: T.rSm, fontSize: T.fs13 }}>
                      <span style={{ color: T.ink }}>{c.item}</span>
                      <span style={{ fontWeight: 600, color: T.green, fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums" }}>${fmt(c.cost)}</span>
                    </Row>
                  ))}
                </div>
                {land.devCostBreakdown && (
                  <Row justify="space-between" align="center" style={{ marginTop: T.s4, padding: `${T.s4} ${T.s5}`, background: T.greenTint, border: `1px solid ${T.green}`, borderRadius: T.rMd }}>
                    <span style={{ fontWeight: 600, color: T.green, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: T.fs12 }}>Total finished lot</span>
                    <span style={{ fontFamily: T.fontDisplay, fontSize: T.fs26, fontWeight: 400, color: T.green, letterSpacing: "-0.015em" }}>${fmt(land.devCostBreakdown.reduce((s, c) => s + c.cost, 0))}</span>
                  </Row>
                )}
              </Section>
            </Stack>
          )}

          {/* ════ MARGINS / PRO FORMA ════ */}
          {tab === "margins" && proforma && (
            <Stack gap={T.s5}>
              <Row gap={T.s2} wrap="wrap">
                {(proforma.scenarios || []).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setProformaScenario(i)}
                    style={{
                      padding: `${T.s3} ${T.s4}`,
                      borderRadius: T.rMd,
                      border: `1px solid ${proformaScenario === i ? T.green : T.ruleStrong}`,
                      background: proformaScenario === i ? T.greenTint : T.surface,
                      color: proformaScenario === i ? T.green : T.inkSoft,
                      fontWeight: 600,
                      fontSize: T.fs12,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      fontFamily: T.fontBody,
                    }}
                  >{s.label}</button>
                ))}
              </Row>
              <Section title={`Per-unit pro forma — ${scn.label || ""}`} subtitle="Move-up SFD product">
                <Row gap={T.s7} align="stretch" wrap="wrap">
                  <div style={{ flex: "1 1 360px", minWidth: 320 }}>
                    {[
                      { label: "Average sale price", val: scn.asp, color: T.green, isHero: true },
                      { label: "Land / lot", val: -(scn.landLot || 0) },
                      { label: "Hard cost (construction)", val: -(scn.hardCost || 0) },
                      { label: "Soft cost (5%)", val: -(scn.softCost || 0) },
                      { label: "Selling cost (5%)", val: -(scn.selling || 0) },
                      { label: "G&A (3%)", val: -(scn.ga || 0) },
                      { label: "Financing (2.5%)", val: -(scn.financing || 0) },
                    ].map((r, i) => (
                      <Row key={i} justify="space-between" align="center" style={{ padding: `${T.s3} 0`, borderBottom: `1px solid ${T.rule}`, fontSize: T.fs14 }}>
                        <span style={{ color: T.ink, fontWeight: r.isHero ? 600 : 400 }}>{r.label}</span>
                        <span style={{ fontWeight: 600, fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums", color: r.color || (r.val < 0 ? T.red : T.ink) }}>
                          {r.val < 0 ? `($${fmt(Math.abs(r.val))})` : `$${fmt(r.val)}`}
                        </span>
                      </Row>
                    ))}
                    <Row justify="space-between" align="center" style={{ padding: `${T.s5} 0 ${T.s2}`, borderTop: `2px solid ${T.green}`, marginTop: T.s2 }}>
                      <span style={{ fontFamily: T.fontDisplay, fontWeight: 500, fontSize: T.fs18, color: T.ink }}>Gross margin</span>
                      <span style={{ fontFamily: T.fontDisplay, fontWeight: 500, fontSize: T.fs26, fontVariantNumeric: "tabular-nums", color: (scn.marginPct || 0) >= 25 ? T.green : T.brassInk }}>
                        ${fmt(scn.margin || 0)} <span style={{ fontSize: T.fs15, fontStyle: "italic", color: T.inkMuted }}>· {scn.marginPct || 0}%</span>
                      </span>
                    </Row>
                  </div>
                  <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                    <Eyebrow style={{ marginBottom: T.s3 }}>Public builder benchmarks</Eyebrow>
                    <DataTable maxH={260} columns={[
                      { key: "builder", label: "Builder", bold: true },
                      { label: "Gross margin", align: "right", render: r => r.grossMargin != null ? `${r.grossMargin}%` : "—", color: r => (r.grossMargin || 0) >= 25 ? T.green : T.ink },
                      { label: "ASP", align: "right", render: r => fmtDollar(r.asp) },
                      { label: "Cancel %", align: "right", render: r => r.cancelRate != null ? `${r.cancelRate}%` : "—" },
                    ]} rows={proforma.publicBenchmarks || []} />
                    {proforma.ppiTrend && (
                      <div style={{ marginTop: T.s4 }}>
                        <Eyebrow color={T.brassInk} style={{ marginBottom: T.s2 }}>Construction cost (FRED PPI)</Eyebrow>
                        <SparkLine data={proforma.ppiTrend} height={60} color={T.brass} />
                        <Row justify="space-between" style={{ fontSize: 9, color: T.inkFaint, marginTop: T.s2 }}>
                          {proforma.ppiTrend.map(p => <span key={p.yr}>{p.yr}</span>)}
                        </Row>
                        {proforma.ppiYoY && <Body size={T.fs11} color={T.brassInk} style={{ fontWeight: 600, marginTop: T.s2 }}>PPI +{proforma.ppiYoY}% YoY</Body>}
                      </div>
                    )}
                  </div>
                </Row>
              </Section>
            </Stack>
          )}

          {/* ════ REGULATORY ════ */}
          {tab === "regulatory" && regulatory && (
            <Stack gap={T.s5}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: T.s3 }}>
                <KPI label="Total fees/unit" value={fmtDollar(regulatory.totalFeesPerUnit)} />
                <KPI label="Entitlement" value={(regulatory.entitlementTimeline || '').split("(")[0] || "—"} sub="sketch → BP" />
                <KPI label="Max density" value={(regulatory.maxDensity || '').split("(")[0] || "—"} sub="zoned" />
                {regulatory.schoolDistrict && <KPI label="School rating" value={regulatory.schoolDistrict.rating} sub={regulatory.schoolDistrict.name} color={T.green} />}
              </div>
              <Row gap={T.s4} wrap="wrap" align="stretch">
                <Section title="Development fee schedule" subtitle="Per-unit fees" style={{ flex: "1 1 360px" }}>
                  <DataTable columns={[
                    { key: "fee", label: "Fee", bold: true },
                    { key: "amount", label: "Amount", align: "right" },
                    { key: "note", label: "Notes" },
                  ]} rows={regulatory.fees || []} />
                  <Row justify="space-between" align="center" style={{ marginTop: T.s3, padding: `${T.s3} ${T.s4}`, background: T.greenTint, border: `1px solid ${T.green}`, borderRadius: T.rSm }}>
                    <span style={{ fontSize: T.fs12, fontWeight: 700, letterSpacing: T.trackEyebrow, textTransform: "uppercase", color: T.green }}>Total</span>
                    <span style={{ fontFamily: T.fontDisplay, fontSize: T.fs18, fontWeight: 500, color: T.green, fontVariantNumeric: "tabular-nums" }}>${fmt(regulatory.totalFeesPerUnit)}/unit</span>
                  </Row>
                </Section>
                <Section title="Utility availability" subtitle="Infrastructure status" style={{ flex: "1 1 360px" }}>
                  <DataTable columns={[
                    { key: "utility", label: "Utility", bold: true },
                    { key: "provider", label: "Provider" },
                    { key: "status", label: "Status", color: r => r.status === "Available" ? T.green : T.brassInk },
                    { key: "note", label: "Notes" },
                  ]} rows={regulatory.utilities || []} />
                </Section>
              </Row>
              <Section title="Zoning & entitlement summary">
                <Row gap={T.s5} wrap="wrap" align="stretch" justify="space-around">
                  {[
                    { label: "Primary zoning", val: (regulatory.zoning || '').split("(")[0].trim() || "—" },
                    { label: "Max density", val: (regulatory.maxDensity || '').split("(")[0].trim() || "—" },
                    { label: "Timeline", val: regulatory.entitlementTimeline || "—" },
                  ].map((r, i) => (
                    <Stack key={i} gap={T.s2} style={{ alignItems: "center", textAlign: "center", flex: 1, minWidth: 180 }}>
                      <Eyebrow>{r.label}</Eyebrow>
                      <div style={{ fontFamily: T.fontDisplay, fontSize: T.fs18, fontWeight: 500, color: T.ink, letterSpacing: "-0.005em" }}>{r.val}</div>
                    </Stack>
                  ))}
                </Row>
              </Section>
            </Stack>
          )}

          {/* ════ SCORECARD ════ */}
          {tab === "scorecard" && sc.length > 0 && (
            <Stack gap={T.s5}>
              <Row gap={T.s4} wrap="wrap" align="stretch">
                <Section title="Market scorecard" subtitle="Eight weighted metrics · Claude API" style={{ flex: "2 1 480px" }}>
                  {sc.map((m, i) => (
                    <div key={i}>
                      <Row gap={T.s3} align="center" onClick={() => setScExp(scExp === i ? null : i)} style={{ padding: `${T.s3} 0`, borderBottom: `1px solid ${T.rule}`, cursor: "pointer" }}>
                        <span style={{ flex: "0 0 200px", fontSize: T.fs13, fontWeight: 500, color: T.ink }}>{m.metric}</span>
                        <span style={{ flex: "0 0 50px", fontSize: T.fs10, color: T.inkMuted, textAlign: "center", fontFamily: T.fontMono }}>{m.weight}%</span>
                        <div style={{ flex: 1, height: 6, background: T.canvas, borderRadius: 1, overflow: "hidden" }}>
                          <div style={{ width: `${(m.score || 0) * 10}%`, height: "100%", background: m.score >= 7.5 ? T.green : m.score >= 6 ? T.brass : T.red }} />
                        </div>
                        <span style={{
                          flex: "0 0 50px", fontSize: T.fs15, fontWeight: 500, textAlign: "right",
                          fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums",
                          color: m.score >= 7.5 ? T.green : m.score >= 6 ? T.brassInk : T.red,
                        }}>{(m.score || 0).toFixed(1)}</span>
                        <span style={{ flex: "0 0 14px", fontSize: T.fs10, color: T.inkFaint }}>{scExp === i ? "▴" : "▾"}</span>
                      </Row>
                      {scExp === i && (
                        <div style={{ padding: `${T.s3} ${T.s4}`, background: T.canvas, borderLeft: `2px solid ${T.brass}`, fontSize: T.fs12, color: T.inkSoft, lineHeight: 1.65, marginBottom: T.s2 }}>
                          {m.rationale}
                        </div>
                      )}
                    </div>
                  ))}
                  <Row justify="space-between" align="center" style={{
                    marginTop: T.s5,
                    padding: `${T.s4} ${T.s5}`,
                    background: ws >= 7.5 ? T.greenTint : T.brassWash,
                    border: `1px solid ${ws >= 7.5 ? T.green : T.brass}`,
                    borderRadius: T.rMd,
                  }}>
                    <span style={{ fontSize: T.fs12, fontWeight: 700, letterSpacing: T.trackEyebrow, textTransform: "uppercase", color: ws >= 7.5 ? T.green : T.brassInk }}>Weighted composite</span>
                    <span style={{ fontFamily: T.fontDisplay, fontSize: T.fs32, fontWeight: 400, fontVariantNumeric: "tabular-nums", color: ws >= 7.5 ? T.green : T.brassInk, letterSpacing: "-0.015em" }}>{ws.toFixed(1)}</span>
                  </Row>
                  <Body size={T.fs11} color={T.inkMuted} style={{ marginTop: T.s2, fontStyle: "italic" }}>
                    ≥ 7.5 strong entry · 6.0–7.4 proceed with caution · &lt; 6.0 pass
                  </Body>
                </Section>
                <Stack gap={T.s4} style={{ flex: "1 1 280px" }}>
                  <Section title="Radar profile">
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <RadarChart metrics={sc} size={260} />
                    </div>
                  </Section>
                  <Card padding={T.s5} accent={ws >= 7.5 ? T.green : T.brass} style={{ textAlign: "center" }}>
                    <Eyebrow color={T.brassInk}>Recommendation</Eyebrow>
                    <div style={{ fontFamily: T.fontDisplay, fontSize: T.fs22, fontWeight: 500, color: ws >= 7.5 ? T.green : ws >= 6 ? T.brassInk : T.red, marginTop: T.s2, letterSpacing: "-0.005em" }}>
                      {ws >= 7.5 ? "Strong entry" : ws >= 6 ? "Proceed with caution" : "Pass"}
                    </div>
                    {verdict && <div style={{ marginTop: T.s4 }}><Verdict kind={verdict} /></div>}
                  </Card>
                </Stack>
              </Row>
              {swot && (
                <Section title="SWOT analysis" subtitle="Claude API · independent assessment">
                  <SWOTMatrix swot={swot} />
                </Section>
              )}
            </Stack>
          )}

          {/* ════ SOURCES (NEW — provenance manifest preview) ════ */}
          {tab === "sources" && (
            <Stack gap={T.s5}>
              <Stack gap={T.s2}>
                <Eyebrow>Source manifest</Eyebrow>
                <Title>Provenance trail · {geo?.name}</Title>
                <Body color={T.inkMuted} style={{ maxWidth: T.proseMaxW }}>
                  Every value the report renders is tagged measured, derived, modeled, LLM, or missing. The full audit table appears as Appendix A in the deliverable PDF (Output E). What follows is the live provenance summary for this study.
                </Body>
              </Stack>
              <Divider kind="strong" />
              <SourceManifest study={study} />
            </Stack>
          )}

          {/* No-data fallbacks */}
          {tab === "demographics" && !d && <Banner tone="warn">Demographics data not available for this study yet.</Banner>}
          {tab === "housing" && !h && <Banner tone="warn">Housing data not available.</Banner>}
          {tab === "absorption" && !absorption && <Banner tone="warn">Absorption analysis not available.</Banner>}
          {tab === "pricing" && !pricing && <Banner tone="warn">Pricing analysis not available.</Banner>}
          {tab === "land" && !land && <Banner tone="warn">Land economics not available.</Banner>}
          {tab === "margins" && !proforma && <Banner tone="warn">Pro forma not available.</Banner>}
          {tab === "regulatory" && !regulatory && <Banner tone="warn">Regulatory data not available.</Banner>}
          {tab === "scorecard" && sc.length === 0 && <Banner tone="warn">Scorecard not available.</Banner>}

          {/* Footer / colophon */}
          <Divider />
          <Row justify="space-between" align="flex-end" wrap="wrap" gap={T.s4} style={{ paddingBottom: T.s5 }}>
            <Body size={T.fs10} color={T.inkFaint} style={{ fontFamily: T.fontMono, maxWidth: 720, lineHeight: 1.5 }}>
              Census ACS · PEP · BPS · LODES · FRED · BLS · BEA · HUD · Redfin · Zillow ZHVI · FHFA · HMDA · RapidAPI · NewHomeSource · SEC EDGAR · NCES · ATTOM · ecode360 · FEMA · USFWS NWI · USGS · Claude API.
            </Body>
            <Body size={T.fs10} color={T.inkFaint} style={{ fontVariantNumeric: "tabular-nums" }}>
              Infinity Markets · v4.2.0 · {todayLine}
            </Body>
          </Row>
        </Stack>
      </Container>
    </Page>
  );
}

/* ── ScorecardCompactGrid — shown on Overview tab ─────────────────────────── */
function ScorecardCompactGrid({ sc }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: T.s3 }}>
      {sc.map((m, i) => (
        <div key={i} style={{ padding: `${T.s3} ${T.s4}`, border: `1px solid ${T.rule}`, borderLeft: `3px solid ${m.score >= 7.5 ? T.green : m.score >= 6 ? T.brass : T.red}`, borderRadius: T.rSm }}>
          <div style={{ fontSize: T.fs10, fontWeight: 600, letterSpacing: T.trackEyebrow, textTransform: "uppercase", color: T.inkMuted }}>{m.metric}</div>
          <Row justify="space-between" align="baseline" style={{ marginTop: T.s2 }}>
            <span style={{ fontFamily: T.fontDisplay, fontSize: T.fs22, fontWeight: 500, color: m.score >= 7.5 ? T.green : m.score >= 6 ? T.brassInk : T.red, fontVariantNumeric: "tabular-nums" }}>{(m.score || 0).toFixed(1)}</span>
            <span style={{ fontSize: T.fs10, color: T.inkFaint, fontFamily: T.fontMono }}>w {m.weight}%</span>
          </Row>
        </div>
      ))}
    </div>
  );
}

/* ── SourceManifest — flattens study._env into a table ────────────────────── */
function SourceManifest({ study }) {
  const rows = [];
  const visit = (env, prefix = "") => {
    if (!env || typeof env !== "object") return;
    Object.entries(env).forEach(([k, meta]) => {
      if (meta && typeof meta === "object" && (meta.provenance || meta.source_url || meta.value !== undefined)) {
        rows.push({
          field: prefix ? `${prefix}.${k}` : k,
          provenance: String(meta.provenance || "missing").toLowerCase(),
          confidence: meta.confidence ?? "—",
          fetched_at: meta.fetched_at ?? "—",
          source_url: meta.source_url ?? "—",
          value: meta.value,
        });
      }
    });
  };
  visit(study?._env, "");
  ["geo", "demographics", "housing", "competition", "analysis"].forEach(b => {
    if (study?.[b]?._env) visit(study[b]._env, b);
  });

  if (!rows.length) {
    return (
      <Banner tone="note">
        No <code>_env</code> provenance envelopes are present on this study object yet. They land in the deliverable PDF appendix and are persisted in Supabase via migration 004.
      </Banner>
    );
  }

  const counts = rows.reduce((a, r) => { a[r.provenance] = (a[r.provenance] || 0) + 1; return a; }, {});
  return (
    <Stack gap={T.s4}>
      <Row gap={T.s2} wrap="wrap">
        {Object.entries(counts).map(([k, v]) => (
          <Chip key={k} tone={k}>{k} · {v}</Chip>
        ))}
      </Row>
      <DataTable maxH={520} columns={[
        { key: "field", label: "Field", bold: true },
        { label: "Provenance", render: r => <Chip tone={r.provenance}>{r.provenance}</Chip> },
        { label: "Value", align: "right", render: r => {
          const v = r.value;
          if (v == null) return "—";
          if (typeof v === "number") return fmt(v, 2);
          return String(v).slice(0, 80);
        }},
        { key: "confidence", label: "Conf." },
        { label: "Fetched", render: r => fmtDate(r.fetched_at) },
        { label: "Source", render: r => r.source_url && r.source_url !== "—"
          ? <a href={r.source_url} target="_blank" rel="noopener noreferrer" style={{ color: T.green }}>link ↗</a>
          : "—" },
      ]} rows={rows} />
    </Stack>
  );
}
