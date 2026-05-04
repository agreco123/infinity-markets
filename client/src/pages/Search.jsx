import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { T } from '../lib/tokens';
import {
  Page, Container, Stack, Row, Display, Body, Eyebrow, Ribbon, Button,
  ForbesLogo, Card, Divider, Chip
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';

/**
 * Editorial entry: ivory canvas, Forbes lockup full-bleed, hairline rules,
 * brass-accent search field. The "v1.0" footer pill becomes a quiet
 * "INFINITY MARKETS · Forbes Capretto Homes · ESTABLISHED ITERATION" mark.
 */
export default function Search({ onSearch }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { user, loading } = useAuth() || {};

  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = () => { if (query.trim()) onSearch(query.trim()); };

  const today = new Date();
  const dateLine = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const recents = [
    "Cranberry Township, PA",
    "Newstead, NY 14001",
    "Salt Lake City CCD, UT",
    "Plum Borough, PA 15239",
    "Upper St. Clair, PA 15241",
  ];

  return (
    <Page style={{ display: "flex", flexDirection: "column" }}>
      {/* ── Top masthead ───────────────────────────────────────────── */}
      <header style={{
        padding: `${T.s5} ${T.s8}`,
        borderBottom: `1px solid ${T.rule}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: T.surface,
      }}>
        <ForbesLogo height={28} />
        <div style={{ display: "flex", alignItems: "center", gap: T.s5, fontSize: T.fs12, color: T.inkMuted, fontVariantNumeric: "tabular-nums" }}>
          <span>{dateLine}</span>
          <span style={{ color: T.inkFaint }}>·</span>
          <span>VOL. 4 NO. 2</span>
          <span style={{ color: T.inkFaint }}>·</span>
          {user
            ? <button onClick={() => navigate('/studies')} style={{ color: T.green, fontWeight: 600 }}>{user.email}</button>
            : !loading && <button onClick={() => navigate('/login')} style={{ color: T.green, fontWeight: 600 }}>Sign in</button>}
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: `${T.s11} ${T.s7}`,
        background: `linear-gradient(180deg, ${T.canvas} 0%, ${T.surfaceAlt} 100%)`,
      }}>
        <Container max="940px" padX="0" padY="0" style={{ width: "100%" }}>
          <Stack gap={T.s7} style={{ alignItems: "center", textAlign: "center" }}>
            <Ribbon color={T.brassInk} bg={T.brassWash}>INFINITY MARKETS · INSTITUTIONAL EDITION</Ribbon>

            <Display size={64} style={{
              fontWeight: 400,
              maxWidth: "880px",
              letterSpacing: "-0.025em",
              lineHeight: 1.06,
            }}>
              The land underwriting instrument
              <span style={{ color: T.green, fontStyle: "italic" }}> built </span>
              for Forbes Capretto Homes.
            </Display>

            <Body size={T.fs18} color={T.inkSoft} style={{ maxWidth: "640px", lineHeight: 1.62 }}>
              Measured-first market intelligence for new construction. Demographics,
              housing economics, competitive supply, pricing strata, pro forma rigor,
              and a GO / NO-GO verdict — every value tagged to its source.
            </Body>

            {/* Search field */}
            <div style={{
              width: "100%",
              maxWidth: 720,
              background: T.surface,
              border: `1.5px solid ${T.green}`,
              borderRadius: T.rMd,
              boxShadow: "0 12px 36px -16px rgba(0,77,65,0.20)",
              display: "flex",
              alignItems: "stretch",
              overflow: "hidden",
              marginTop: T.s4,
            }}>
              <div style={{ display: "flex", alignItems: "center", padding: `0 ${T.s4}`, borderRight: `1px solid ${T.rule}` }}>
                <SearchIcon />
              </div>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="City, township, ZIP, county, or street address…"
                aria-label="Target market"
                style={{
                  flex: 1,
                  padding: "20px 16px",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontFamily: T.fontBody,
                  fontSize: T.fs16,
                  color: T.ink,
                  letterSpacing: "0.005em",
                }}
              />
              <Button kind="primary" size="lg" onClick={submit} style={{ borderRadius: 0, padding: "0 28px", letterSpacing: "0.08em" }}>
                Run study
              </Button>
            </div>

            {/* Recent / sample chips */}
            <Row gap={T.s2} wrap="wrap" justify="center" style={{ marginTop: T.s2, maxWidth: 720 }}>
              <span style={{ fontSize: T.fs11, color: T.inkMuted, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", marginRight: T.s2 }}>Try</span>
              {recents.map(r => (
                <button
                  key={r}
                  onClick={() => { setQuery(r); inputRef.current?.focus(); }}
                  style={{
                    fontFamily: T.fontBody,
                    fontSize: T.fs12,
                    color: T.green,
                    background: "rgba(0,77,65,0.04)",
                    border: `1px solid rgba(0,77,65,0.18)`,
                    padding: "6px 12px",
                    borderRadius: T.rPill,
                    cursor: "pointer",
                    transition: "background 120ms ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.brassWash; e.currentTarget.style.borderColor = T.brass; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,77,65,0.04)"; e.currentTarget.style.borderColor = "rgba(0,77,65,0.18)"; }}
                >
                  {r}
                </button>
              ))}
            </Row>
          </Stack>
        </Container>
      </section>

      {/* ── What you get ───────────────────────────────────────────── */}
      <section style={{ padding: `${T.s10} ${T.s7}`, background: T.surface, borderTop: `1px solid ${T.rule}` }}>
        <Container max="1180px" padX="0" padY="0">
          <Row align="flex-end" justify="space-between" style={{ marginBottom: T.s7 }}>
            <Stack gap={T.s2}>
              <Eyebrow>The deliverables</Eyebrow>
              <Display size={32} as="h2" style={{ letterSpacing: "-0.015em", maxWidth: 720 }}>
                Five outputs. One verdict. Every figure provenance-tagged.
              </Display>
            </Stack>
          </Row>

          <Divider kind="strong" style={{ marginBottom: T.s7 }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: T.s4 }}>
            {[
              { tag: "OUTPUT A", title: "GO / NO-GO Memo", body: "Two-page acquisition-committee deliverable. Target land basis, expected gross margin, IRR, top-three risks." },
              { tag: "OUTPUT B", title: "Proforma Workbook", body: "Monthly revenue × cost × cash flow. Unlevered + levered IRR. 81-cell sensitivity grid. Tornado of the top 10 drivers." },
              { tag: "OUTPUT C", title: "Parcel Underwriting", body: "Zoning, finished-lot yield, impact-fee burden, FEMA, NWI wetlands, soils. Section 9A–9D in the report." },
              { tag: "OUTPUT D", title: "Market Study PDF", body: "Fourteen-section narrative. Editorial typography. Every tile tagged measured / derived / modeled / LLM / missing." },
              { tag: "OUTPUT E", title: "Source Manifest", body: "Appendix A. Per-field URL, fetched-at, provenance class, confidence. Audit trail for the underwriting committee." },
            ].map((c, i) => (
              <Card key={i} accent={i % 2 === 0 ? T.green : T.brass} padding={T.s5} style={{ display: "flex", flexDirection: "column", gap: T.s3 }}>
                <Eyebrow color={T.brassInk}>{c.tag}</Eyebrow>
                <div style={{ fontFamily: T.fontDisplay, fontSize: T.fs20, fontWeight: 500, lineHeight: 1.25, color: T.ink, letterSpacing: "-0.005em" }}>{c.title}</div>
                <Body size={T.fs13} color={T.inkSoft}>{c.body}</Body>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* ── How it works (data-rich quiet block) ─────────────────── */}
      <section style={{ padding: `${T.s10} ${T.s7}`, background: T.canvas, borderTop: `1px solid ${T.rule}` }}>
        <Container max="1180px" padX="0" padY="0">
          <Row align="flex-end" justify="space-between" style={{ marginBottom: T.s7 }}>
            <Stack gap={T.s2}>
              <Eyebrow>The pipeline</Eyebrow>
              <Display size={32} as="h2" style={{ letterSpacing: "-0.015em", maxWidth: 740 }}>
                Twenty-nine sources. Ten phases. One canonical schema.
              </Display>
            </Stack>
            <Body size={T.fs13} color={T.inkMuted} style={{ maxWidth: 320, textAlign: "right" }}>
              ACS · BLS · BEA · Census BPS · FRED · Redfin · Zillow ZHVI · NewHomeSource · SEC EDGAR · LODES · ATTOM · ecode360 · FEMA FIRM · USFWS NWI · USGS soils.
            </Body>
          </Row>
          <Divider kind="strong" style={{ marginBottom: T.s7 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: T.s5 }}>
            {[
              { step: "01", label: "Geocode", note: "FIPS / CBSA / ZIPs." },
              { step: "02", label: "Demographics", note: "ACS 5-yr · DTI ceiling." },
              { step: "03", label: "Housing", note: "ZHVI · Redfin DOM · vintage." },
              { step: "04", label: "Competition", note: "EDGAR · NHS · Redfin listings." },
              { step: "05", label: "Pricing strata", note: "Tier P25 / P50 / P75 by ZIP." },
              { step: "06", label: "Absorption", note: "13-mo per-band · seasonality." },
              { step: "07", label: "Pro forma", note: "Revenue · cost · IRR · sensitivity." },
              { step: "08", label: "Scorecard", note: "HHI · weighted measured." },
              { step: "09", label: "Verdict", note: "GO / NO-GO arithmetic." },
              { step: "10", label: "Render", note: "PDF · XLSX · PPTX · manifest." },
            ].map(p => (
              <div key={p.step} style={{ display: "flex", flexDirection: "column", gap: T.s2 }}>
                <div style={{ fontFamily: T.fontDisplay, fontSize: T.fs26, color: T.brass, fontWeight: 400, lineHeight: 1, letterSpacing: "-0.01em" }}>{p.step}</div>
                <div style={{ fontFamily: T.fontBody, fontSize: T.fs13, fontWeight: 600, color: T.ink, marginTop: T.s2 }}>{p.label}</div>
                <div style={{ fontFamily: T.fontBody, fontSize: T.fs12, color: T.inkMuted, lineHeight: 1.5 }}>{p.note}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Footer (editorial colophon) ────────────────────────────── */}
      <footer style={{
        padding: `${T.s7} ${T.s7}`,
        background: T.green,
        color: "rgba(255,255,255,0.78)",
        borderTop: `4px solid ${T.brass}`,
      }}>
        <Container max="1180px" padX="0" padY="0">
          <Row justify="space-between" align="flex-start" wrap="wrap" gap={T.s6}>
            <Stack gap={T.s3} style={{ maxWidth: 320 }}>
              <ForbesLogo variant="reverse" height={26} />
              <Body size={T.fs12} color="rgba(255,255,255,0.62)" style={{ lineHeight: 1.6 }}>
                Forbes Capretto Homes · Institutional-grade land underwriting and market intelligence. Provenance-tagged, measured-first, audit-ready.
              </Body>
            </Stack>
            <Stack gap={T.s3}>
              <Eyebrow color={T.brass}>Application</Eyebrow>
              <Body size={T.fs12} color="rgba(255,255,255,0.78)">Studies · Reports · Source Manifest</Body>
            </Stack>
            <Stack gap={T.s3}>
              <Eyebrow color={T.brass}>Compliance</Eyebrow>
              <Body size={T.fs12} color="rgba(255,255,255,0.78)">LAW #2 measured-first · LAW #5 25–31% margin band · LAW #6 no silent defaults.</Body>
            </Stack>
            <Stack gap={T.s3}>
              <Eyebrow color={T.brass}>Build</Eyebrow>
              <Body size={T.fs12} color="rgba(255,255,255,0.62)">Infinity Markets v4.2.0 · Editorial edition · {today.getFullYear()}</Body>
            </Stack>
          </Row>
        </Container>
      </footer>
    </Page>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke={T.green} strokeWidth="1.6" />
      <path d="M16 16 L21 21" stroke={T.green} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
