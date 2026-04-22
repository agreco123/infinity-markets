import { useState } from 'react';
import { T, fmt, fmtK } from '../lib/tokens';
import Header from '../components/Header';
import PhaseTracker from '../components/PhaseTracker';
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

export default function Dashboard({ study, onReset }) {
  const [tab, setTab] = useState("demographics");
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

  const phases = [
    { label: "Geo", status: "complete" }, { label: "Ph 1", status: "complete" },
    { label: "Ph 2", status: "complete" }, { label: "Ph 3", status: "complete" },
    { label: "Ph 4-5", status: "complete" }, { label: "Ph 6", status: "complete" },
    { label: "Ph 7-8", status: "complete" }, { label: "Ph 9", status: "complete" },
    { label: "Deliver", status: "complete" },
  ];

  const tabs = [
    { key: "demographics", label: "Ph 1 — Demographics" },
    { key: "housing", label: "Ph 2 — Supply" },
    { key: "competition", label: "Ph 3 — Competition" },
    { key: "absorption", label: "Ph 4 — Absorption" },
    { key: "pricing", label: "Ph 5 — Pricing" },
    { key: "land", label: "Ph 6 — Land" },
    { key: "margins", label: "Ph 7 — Margins" },
    { key: "regulatory", label: "Ph 8 — Regulatory" },
    { key: "scorecard", label: "Ph 9 — Scorecard" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text }}>
      <Header query={geo?.name} onReset={onReset} />
      {showDeliverables && <DeliverableModal onClose={() => setShowDeliverables(false)} study={studyObj} />}

      <div style={{ padding: "0 28px 40px" }}>
        <PhaseTracker phases={phases} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 700, margin: 0 }}>{geo?.name}</h2>
            <p style={{ color: T.textDim, fontSize: 11, marginTop: 3 }}>FIPS {geo?.stateFips}-{geo?.countyFips}-{geo?.subdivFips} · CBSA {geo?.cbsa} · ZIPs: {geo?.zips?.join(", ")}</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {sc.length > 0 && (
              <div style={{ padding: "8px 14px", background: ws >= 7.5 ? T.greenDim : T.accentDim, border: `1px solid ${ws >= 7.5 ? T.green : T.accent}33`, borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textDim }}>Score</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.fontDisplay, color: ws >= 7.5 ? T.green : T.accent }}>{ws.toFixed(1)}</div>
              </div>
            )}
            <button onClick={() => setShowDeliverables(true)} style={{ padding: "10px 18px", background: T.accent, border: "none", borderRadius: 6, color: "#0a0b0d", fontWeight: 700, fontSize: 12, fontFamily: T.font, cursor: "pointer", textTransform: "uppercase" }}>⬇ Deliverables</button>
          </div>
        </div>

        <TradeAreaMap geo={geo} />

        {/* Tab nav */}
        <div style={{ display: "flex", gap: 0, marginTop: 20, marginBottom: 18, borderBottom: `1px solid ${T.cardBorder}`, overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "10px 14px", background: "transparent", border: "none", borderBottom: tab === t.key ? `2px solid ${T.accent}` : "2px solid transparent", color: tab === t.key ? T.accent : T.textDim, fontSize: 11.5, fontWeight: 600, fontFamily: T.font, cursor: "pointer", whiteSpace: "nowrap" }}>{t.label}</button>
          ))}
        </div>

        {/* ════ PHASE 1 — DEMOGRAPHICS ════ */}
        {tab === "demographics" && d && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <KPI label="Population" value={fmt(d.population)} trend={d.popGrowth5yr} sub="5-yr" icon="👥" />
              <KPI label="Median HHI" value={`$${fmtK(d.mhi)}`} trend={d.mhiGrowth} sub="5-yr" icon="💰" />
              <KPI label="Households" value={fmt(d.households)} sub={`Avg: ${d.avgHouseholdSize}`} icon="🏠" />
              <KPI label="Median Age" value={d.medianAge} sub="years" icon="📊" />
              <KPI label="Homeownership" value={`${d.homeownershipRate}%`} icon="🔑" />
              <KPI label="Unemployment" value={`${d.unemploymentRate}%`} sub="MSA" icon="📉" color={T.green} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Section title="Population Trend" subtitle="Census ACS + PEP">
                {d.popTrend && <><SparkLine data={d.popTrend} height={70} /><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textMuted, marginTop: 5 }}>{d.popTrend.map(p => <span key={p.yr}>{p.yr}</span>)}</div></>}
              </Section>
              <Section title="Income Distribution" subtitle="ACS 5-Year, PMA">
                {d.incomeDist && <HBarChart data={d.incomeDist} />}
              </Section>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Section title="Top Employers" subtitle="Census CBP + BLS">
                <DataTable columns={[{ key: "name", label: "Employer", bold: true }, { key: "sector", label: "Sector" }, { key: "est", label: "Employees", align: "right", render: r => fmt(r.est) }]} rows={d.topEmployers || []} />
              </Section>
              <Section title="Commute Dynamics" subtitle="LODES inflow/outflow">
                <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 8 }}>
                  {[{ v: d.commuteInflow, l: "IN", c: T.green }, { v: d.commuteOutflow, l: "OUT", c: T.blue }, { v: (d.commuteInflow || 0) - (d.commuteOutflow || 0), l: "Net", c: T.accent }].map((x, i) => (
                    <div key={i} style={{ textAlign: "center", flex: 1 }}><div style={{ fontSize: 24, fontWeight: 700, color: x.c, fontFamily: T.fontDisplay }}>{i === 2 ? "+" : ""}{fmtK(x.v || 0)}</div><div style={{ fontSize: 10, color: T.textDim, marginTop: 3 }}>{x.l}</div></div>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        )}

        {/* ════ PHASE 2 — HOUSING ════ */}
        {tab === "housing" && h && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <KPI label="Median Value" value={`$${fmtK(h.medianValue)}`} trend={h.valueGrowthYoY} sub="YoY" icon="🏡" />
              <KPI label="DOM" value={h.medianDOM} sub="days" icon="⏱" color={T.green} />
              <KPI label="Sale-to-List" value={`${(h.saleToList > 2 ? h.saleToList : ((h.saleToList || 0) * 100)).toFixed(1)}%`} icon="📈" color={T.green} />
              <KPI label="Months Supply" value={h.monthsSupply} icon="📦" />
              <KPI label="Vacancy" value={`${h.vacancyRate}%`} icon="🔓" />
              <KPI label="Median Rent" value={`$${fmt(h.medianRent)}`} sub="HUD FMR" icon="🏢" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Section title="Price Trend" subtitle="Redfin ZIP, in thousands">
                {h.priceTrend && <><SparkLine data={h.priceTrend} height={70} /><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textMuted, marginTop: 5 }}>{h.priceTrend.map(p => <span key={p.mo}>{p.mo}</span>)}</div></>}
              </Section>
              <Section title="SF Building Permits" subtitle="Census BPS, PMA">
                {h.permitsSF && <><SparkBar data={h.permitsSF} height={65} /><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textMuted, marginTop: 5 }}>{h.permitsSF.map(p => <span key={p.yr}>{p.yr}</span>)}</div></>}
              </Section>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Section title="MF Building Permits">
                {h.permitsMF && <><SparkBar data={h.permitsMF} height={65} color={T.blue} /><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textMuted, marginTop: 5 }}>{h.permitsMF.map(p => <span key={p.yr}>{p.yr}</span>)}</div></>}
              </Section>
              <Section title="Housing Vintage">
                {h.vintage && <HBarChart data={h.vintage} keyLabel="era" keyVal="pct" color={T.blue} />}
              </Section>
            </div>
          </div>
        )}

        {/* ════ PHASE 3 — COMPETITION ════ */}
        {tab === "competition" && !comp && (
          <Section title="Competition Data Unavailable"><p style={{ color: T.textDim, fontSize: 13 }}>Competition data could not be loaded. Try re-running the study or check API connectivity.</p></Section>
        )}
        {tab === "competition" && comp && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <KPI label="Communities" value={communities.length} icon="🏘" />
              <KPI label="Total Lots" value={fmt(communities.reduce((s, c) => s + (c.lotsTotal || 0), 0))} icon="📐" />
              <KPI label="Remaining" value={fmt(communities.reduce((s, c) => s + (c.lotsRemain || 0), 0))} icon="📋" color={T.blue} />
              <KPI label="Avg Abs" value={communities.length ? `${(communities.reduce((s, c) => s + (c.monthlyAbs || 0), 0) / communities.length).toFixed(1)}/mo` : '—'} icon="📈" color={T.green} />
            </div>
            <Section title="Community Comp Table" subtitle={`${communities.length} active communities in PMA`}>
              <DataTable maxH={320} columns={[
                { key: "name", label: "Community", bold: true }, { key: "builder", label: "Builder" }, { key: "product", label: "Type" },
                { label: "Price Range", align: "right", render: r => `$${fmtK(r.priceLow)}–$${fmtK(r.priceHigh)}` },
                { label: "$/SF", align: "right", render: r => `$${r.psfAvg}` },
                { label: "Lots", align: "center", render: r => `${r.lotsSold}/${r.lotsTotal}` },
                { label: "Remain", align: "center", render: r => r.lotsRemain, color: r => r.lotsRemain < 25 ? T.orange : T.text },
                { label: "Abs/Mo", align: "center", render: r => (r.monthlyAbs || 0).toFixed(1), color: r => (r.monthlyAbs || 0) >= 3 ? T.green : T.text },
                { key: "incentives", label: "Incentives" },
              ]} rows={communities} />
            </Section>
            <Section title="Builder Profiles" subtitle="Market share by builder">
              <DataTable columns={[
                { key: "name", label: "Builder", bold: true }, { key: "communities", label: "Comms", align: "center" },
                { label: "Closings/Yr", align: "right", render: r => fmt(r.estClosingsYr) },
                { label: "Share", align: "right", render: r => `${r.mktShare}%`, color: r => r.mktShare > 20 ? T.accent : T.text },
                { label: "Avg Price", align: "right", render: r => `$${fmtK(r.avgPrice)}` },
                { key: "positioning", label: "Position" },
              ]} rows={builders} />
            </Section>
          </div>
        )}

        {/* ════ PHASE 4 — ABSORPTION ════ */}
        {tab === "absorption" && absorption && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <KPI label="Market-Wide Monthly" value={`${absorption.marketWideMonthly}/mo`} icon="📊" color={T.green} />
              <KPI label="Annual Closings" value={fmt(absorption.annualClosings)} icon="🏠" />
              <KPI label="HH Formation/Yr" value={fmt(absorption.hhFormationAnnual)} icon="👥" />
              <KPI label="New Supply/Yr" value={fmt(absorption.newSupplyAnnual)} icon="🔨" />
              <KPI label="Demand Gap" value={`+${fmt(absorption.demandGap)}/yr`} sub="units undersupplied" icon="⚡" color={T.green} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Section title="Absorption by Price Band" subtitle="Annual closings distribution">
                {absorption.byPriceBand && <HBarChart data={absorption.byPriceBand} keyLabel="band" keyVal="pct" color={T.accent} />}
              </Section>
              <Section title="Absorption by Community" subtitle="Monthly sales pace">
                {(absorption.byCommunity || []).map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 5 }}>
                    <span style={{ width: 120, color: T.textDim, textAlign: "right", flexShrink: 0 }}>{c.name}</span>
                    <div style={{ flex: 1, height: 16, background: T.bg, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${(c.abs / 5) * 100}%`, height: "100%", background: c.abs >= 3 ? T.green : c.abs >= 2 ? T.accent : T.blue, borderRadius: 3 }} />
                    </div>
                    <span style={{ width: 40, fontWeight: 600, color: T.text }}>{c.abs}</span>
                    <span style={{ fontSize: 9, color: T.textMuted, width: 70 }}>{c.method}</span>
                  </div>
                ))}
              </Section>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Section title="Seasonality Index" subtitle="Monthly sales velocity (1.0 = average)">
                {absorption.seasonality && <><SparkBar data={absorption.seasonality} keyY="idx" height={70} color={T.blue} /><div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.textMuted, marginTop: 5 }}>{absorption.seasonality.map(m => <span key={m.mo}>{m.mo}</span>)}</div></>}
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

        {/* ════ PHASE 5 — PRICING ════ */}
        {tab === "pricing" && pricing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <KPI label="Price-to-Income" value={`${pricing.affordability?.priceToIncome || '—'}x`} icon="📊" />
              <KPI label="PITI-to-Income" value={`${pricing.affordability?.pitiToIncome || '—'}%`} icon="🏦" color={(pricing.affordability?.pitiToIncome || 30) < 28 ? T.green : T.orange} />
              <KPI label="Pool ≤$400K" value={`${pricing.affordability?.buyerPool100 || '—'}%`} sub="can afford" icon="👥" color={T.green} />
              <KPI label="Pool ≤$500K" value={`${pricing.affordability?.buyerPool125 || '—'}%`} icon="👥" />
            </div>
            <Section title="Stratification" subtitle="By market segment">
              <DataTable columns={[
                { label: "Segment", render: r => <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: r.color || T.accent }} /><span style={{ fontWeight: 600 }}>{r.segment}</span></div> },
                { key: "priceRange", label: "Prices", align: "right" }, { key: "psfRange", label: "$/SF", align: "right" },
                { label: "Share", align: "right", render: r => `${r.shareOfSales}%` }, { key: "builders", label: "Builders" },
              ]} rows={pricing.stratification || []} />
            </Section>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Section title="$/SF by Product Type">
                {(pricing.psfByProduct || []).map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 6 }}>
                    <span style={{ width: 80, color: T.textDim, textAlign: "right", flexShrink: 0 }}>{p.type}</span>
                    <div style={{ flex: 1, height: 18, background: T.bg, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${((p.psf - 150) / 80) * 100}%`, height: "100%", background: T.accent, borderRadius: 3 }} />
                    </div>
                    <span style={{ width: 40, fontWeight: 700, color: T.accent, fontFamily: T.fontDisplay }}>${p.psf}</span>
                  </div>
                ))}
              </Section>
              <Section title="Builder Incentives">
                <DataTable maxH={200} columns={[
                  { key: "builder", label: "Builder", bold: true }, { key: "type", label: "Type" }, { key: "value", label: "Value", align: "right" },
                ]} rows={pricing.incentives || []} />
              </Section>
            </div>
          </div>
        )}

        {/* ════ PHASE 6 — LAND ════ */}
        {tab === "land" && land && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <KPI label="Lot-to-Home Ratio" value={`${land.lotToHomeRatio}%`} sub="target 18-25%" icon="📐" color={T.green} />
              <KPI label="Est. Finished Lot" value={`$${fmtK(land.estFinishedLotValue)}`} icon="🏗" />
              <KPI label="Raw Land/Acre" value={`$${fmtK(land.rawLandPerAcre)}`} icon="🌿" />
              <KPI label="Site Dev/Lot" value={`$${fmtK(land.estSiteDev)}`} icon="🚜" />
              <KPI label="Lot Inventory" value={`${land.lotInventoryMonths} mo`} sub="at current abs" icon="⏳" />
            </div>
            <Section title="Raw Land Comps" subtitle="Active and recent land transactions in PMA">
              <DataTable columns={[
                { key: "address", label: "Address", bold: true }, { key: "acres", label: "Acres", align: "right" },
                { label: "Ask Price", align: "right", render: r => `$${fmtK(r.askPrice)}` },
                { label: "$/Acre", align: "right", render: r => `$${fmtK(r.perAcre)}` },
                { key: "zoning", label: "Zoning" }, { key: "status", label: "Status" },
                { label: "Est. Lots", align: "center", render: r => r.estLots },
              ]} rows={land.comps || []} />
            </Section>
            <Section title="Site Development Cost Breakdown" subtitle="Estimated per-lot development costs">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(land.devCostBreakdown || []).map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: i % 2 === 0 ? T.surface : "transparent", borderRadius: 4, fontSize: 12 }}>
                    <span style={{ color: T.text }}>{c.item}</span>
                    <span style={{ fontWeight: 600, color: T.accent, fontFamily: T.fontDisplay }}>${fmt(c.cost)}</span>
                  </div>
                ))}
              </div>
              {land.devCostBreakdown && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: T.accentDim, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: T.accent }}>Total Finished Lot Cost</span>
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: T.fontDisplay, color: T.accent }}>${fmt(land.devCostBreakdown.reduce((s, c) => s + c.cost, 0))}</span>
                </div>
              )}
            </Section>
          </div>
        )}

        {/* ════ PHASE 7 — MARGINS ════ */}
        {tab === "margins" && proforma && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              {(proforma.scenarios || []).map((s, i) => (
                <button key={i} onClick={() => setProformaScenario(i)} style={{
                  padding: "8px 16px", borderRadius: 6, border: `1px solid ${proformaScenario === i ? T.accent : T.cardBorder}`,
                  background: proformaScenario === i ? T.accentDim : T.surface, color: proformaScenario === i ? T.accent : T.textDim,
                  fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: T.font,
                }}>{s.label}</button>
              ))}
            </div>
            <Section title={`Per-Unit Proforma — ${scn.label || ''}`} subtitle="Move-up SFD product">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
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
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.cardBorder}22`, fontSize: 13 }}>
                      <span style={{ color: T.text }}>{r.label}</span>
                      <span style={{ fontWeight: 600, fontFamily: T.fontDisplay, color: r.color || (r.val < 0 ? T.red : T.text) }}>
                        {r.val < 0 ? `($${fmt(Math.abs(r.val))})` : `$${fmt(r.val)}`}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: `2px solid ${T.accent}44`, marginTop: 4, fontSize: 15 }}>
                    <span style={{ fontWeight: 700, color: T.text }}>Gross Margin</span>
                    <span style={{ fontWeight: 700, fontFamily: T.fontDisplay, color: (scn.marginPct || 0) >= 20 ? T.green : T.orange }}>
                      ${fmt(scn.margin || 0)} ({scn.marginPct || 0}%)
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Public Builder Benchmarks</div>
                  <DataTable maxH={200} columns={[
                    { key: "builder", label: "Builder", bold: true },
                    { label: "Gross Margin", align: "right", render: r => `${r.grossMargin}%`, color: r => r.grossMargin >= 25 ? T.green : T.text },
                    { label: "ASP", align: "right", render: r => `$${fmtK(r.asp)}` },
                    { label: "Cancel %", align: "right", render: r => `${r.cancelRate}%` },
                  ]} rows={proforma.publicBenchmarks || []} />
                  {proforma.ppiTrend && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6 }}>Construction Cost Index (PPI)</div>
                      <SparkLine data={proforma.ppiTrend} height={50} color={T.orange} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.textMuted, marginTop: 4 }}>{proforma.ppiTrend.map(p => <span key={p.yr}>{p.yr}</span>)}</div>
                      {proforma.ppiYoY && <div style={{ fontSize: 11, color: T.orange, fontWeight: 600, marginTop: 4 }}>PPI +{proforma.ppiYoY}% YoY</div>}
                    </div>
                  )}
                </div>
              </div>
            </Section>
          </div>
        )}

        {/* ════ PHASE 8 — REGULATORY ════ */}
        {tab === "regulatory" && regulatory && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <KPI label="Total Fees/Unit" value={`$${fmtK(regulatory.totalFeesPerUnit)}`} icon="💰" />
              <KPI label="Entitlement" value={(regulatory.entitlementTimeline || '').split("(")[0]} sub="sketch → BP" icon="📋" />
              <KPI label="Max Density" value={(regulatory.maxDensity || '').split("(")[0]} sub="zoned" icon="📐" />
              {regulatory.schoolDistrict && <KPI label="School Rating" value={regulatory.schoolDistrict.rating} sub={regulatory.schoolDistrict.name} icon="🎓" color={T.green} />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Section title="Development Fee Schedule" subtitle="Per-unit fees">
                <DataTable columns={[
                  { key: "fee", label: "Fee", bold: true }, { key: "amount", label: "Amount", align: "right" }, { key: "note", label: "Notes" },
                ]} rows={regulatory.fees || []} />
                <div style={{ marginTop: 10, padding: "8px 12px", background: T.accentDim, borderRadius: 5, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, color: T.accent, fontSize: 12 }}>Total</span>
                  <span style={{ fontWeight: 700, color: T.accent, fontFamily: T.fontDisplay }}>${fmt(regulatory.totalFeesPerUnit)}/unit</span>
                </div>
              </Section>
              <Section title="Utility Availability" subtitle="Infrastructure status">
                <DataTable columns={[
                  { key: "utility", label: "Utility", bold: true }, { key: "provider", label: "Provider" },
                  { key: "status", label: "Status", color: r => r.status === "Available" ? T.green : T.orange },
                  { key: "note", label: "Notes" },
                ]} rows={regulatory.utilities || []} />
              </Section>
            </div>
            <Section title="Zoning & Entitlement Summary">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
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

        {/* ════ PHASE 9 — SCORECARD + SWOT ════ */}
        {tab === "scorecard" && sc.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
              <Section title="Market Scorecard" subtitle="8 weighted metrics · Claude API">
                {sc.map((m, i) => (
                  <div key={i}>
                    <div onClick={() => setScExp(scExp === i ? null : i)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${T.cardBorder}22`, cursor: "pointer" }}>
                      <span style={{ width: 200, fontSize: 12, fontWeight: 500, color: T.text }}>{m.metric}</span>
                      <span style={{ width: 36, fontSize: 10, color: T.textDim, textAlign: "center" }}>{m.weight}%</span>
                      <div style={{ flex: 1, height: 7, background: T.surface, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${(m.score || 0) * 10}%`, height: "100%", borderRadius: 4, background: m.score >= 7.5 ? T.green : m.score >= 6 ? T.accent : T.red }} />
                      </div>
                      <span style={{ width: 36, fontSize: 13, fontWeight: 700, textAlign: "right", fontFamily: T.fontDisplay, color: m.score >= 7.5 ? T.green : m.score >= 6 ? T.accent : T.red }}>{(m.score || 0).toFixed(1)}</span>
                      <span style={{ fontSize: 9, color: T.textMuted, width: 14 }}>{scExp === i ? "▲" : "▼"}</span>
                    </div>
                    {scExp === i && <div style={{ padding: "8px 14px 12px", background: T.surface, borderRadius: 5, fontSize: 11, color: T.textDim, lineHeight: 1.6, borderLeft: `3px solid ${T.accent}44`, marginBottom: 4 }}>{m.rationale}</div>}
                  </div>
                ))}
                <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 6, background: ws >= 7.5 ? T.greenDim : T.accentDim, border: `1px solid ${ws >= 7.5 ? T.green : T.accent}33`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: ws >= 7.5 ? T.green : T.accent }}>Weighted Composite</span>
                  <span style={{ fontSize: 22, fontWeight: 700, fontFamily: T.fontDisplay, color: ws >= 7.5 ? T.green : T.accent }}>{ws.toFixed(1)}</span>
                </div>
                <p style={{ fontSize: 10, color: T.textMuted, marginTop: 8 }}>≥ 7.5 = Strong Entry · 6.0–7.4 = Proceed w/ Caution · &lt; 6.0 = Pass</p>
              </Section>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Section title="Radar" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <RadarChart metrics={sc} size={240} />
                </Section>
                <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: T.radius, padding: "16px 18px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textDim, marginBottom: 6 }}>Recommendation</div>
                  <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.fontDisplay, color: ws >= 7.5 ? T.green : T.accent }}>{ws >= 7.5 ? "STRONG ENTRY" : ws >= 6 ? "PROCEED W/ CAUTION" : "PASS"}</div>
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

        {/* Footer */}
        <div style={{ marginTop: 28, padding: "14px 0", borderTop: `1px solid ${T.cardBorder}`, fontSize: 10, color: T.textMuted, display: "flex", justifyContent: "space-between" }}>
          <span>Census ACS/PEP/BPS · FRED · BLS · BEA · HUD · Redfin · Zillow · FHFA · HMDA · LODES · RapidAPI · NewHomeSource · SEC EDGAR · NCES · Claude API</span>
          <span>Infinity Markets v1.0 · {new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

function NoData() {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 14, color: T.textDim }}>Data not available for this phase.</div>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>The API may not have returned results, or analysis is still processing.</div>
    </div>
  );
}
