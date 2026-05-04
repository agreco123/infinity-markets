import { useState, useEffect } from 'react';
import { T } from '../lib/tokens';
import { api } from '../lib/api';
import Header from '../components/Header';
import PhaseTracker from '../components/PhaseTracker';
import DataPullAnimation from '../components/DataPullAnimation';
import { Page, Container, Stack, Row, Eyebrow, Display, Body, Banner, Button, Card, Divider } from '../components/ui';

export default function Loading({ study, onReset }) {
  const { geo, phase, progress, error, lastQuery } = study;

  const phases = [
    { label: "Geo",        status: phase === 'geocode'      ? 'active' : progress > 10 ? 'complete' : 'pending' },
    { label: "Demographics", status: phase === 'demographics' ? 'active' : progress > 35 ? 'complete' : 'pending' },
    { label: "Housing",     status: phase === 'housing'      ? 'active' : progress > 50 ? 'complete' : 'pending' },
    { label: "Competition", status: phase === 'competition'  ? 'active' : progress > 60 ? 'complete' : 'pending' },
    { label: "Analysis",    status: phase === 'analysis'     ? 'active' : progress >= 100 ? 'complete' : 'pending' },
    { label: "Render",      status: progress >= 100 ? 'complete' : 'pending' },
  ];

  return (
    <Page>
      <Header query={geo?.name || lastQuery} onReset={onReset} />
      <Container max="1180px" padX={T.s8} padY={T.s8}>
        <Stack gap={T.s6}>
          <Stack gap={T.s2}>
            <Eyebrow>Pipeline · running</Eyebrow>
            <Display size={36} as="h1" style={{ letterSpacing: "-0.015em" }}>
              Collecting market data
              {geo?.name && <span style={{ color: T.inkMuted }}> for </span>}
              {geo?.name && <span style={{ color: T.green, fontStyle: "italic" }}>{geo.name}</span>}
            </Display>
            <Body color={T.inkMuted} style={{ maxWidth: T.proseMaxW }}>
              Twenty-nine sources across ten phases. Every value is tagged measured, derived, modeled, LLM, or missing — no silent defaults.
            </Body>
          </Stack>

          <Divider kind="strong" />

          <Card padding={T.s6}>
            <PhaseTracker phases={phases} />
            <DataPullAnimation progress={progress} />
          </Card>

          {error && (
            <Banner tone="error">
              <Stack gap={T.s2}>
                <div style={{ fontWeight: 700, fontSize: T.fs13, letterSpacing: "0.04em", textTransform: "uppercase" }}>Pipeline error</div>
                <div style={{ fontSize: T.fs13 }}>{error}</div>
                <div style={{ marginTop: T.s2 }}>
                  <Button kind="danger" size="sm" onClick={onReset}>← Start over</Button>
                </div>
              </Stack>
            </Banner>
          )}

          {error && <DebugPanel query={lastQuery} />}
        </Stack>
      </Container>
    </Page>
  );
}

/* ── Embedded Debug Panel (RETAINED FROM v4.1.4 — DO NOT MODIFY DATA PATH) ── */
/* Re-styled outer container only; all api calls preserved.                     */

function DebugPanel({ query }) {
  const [open, setOpen] = useState(true);
  const [health, setHealth] = useState(null);
  const [geoTest, setGeoTest] = useState(null);
  const [fullDiag, setFullDiag] = useState(null);
  const [testQuery, setTestQuery] = useState(query || '');
  const [loading, setLoading] = useState({});
  const [srcResult, setSrcResult] = useState(null);

  const c = {
    panel:   { marginTop: T.s5, background: T.surface, border: `1px solid ${T.rule}`, borderRadius: T.rLg, overflow: 'hidden' },
    hdr:     { padding: `${T.s4} ${T.s5}`, background: T.greenTint, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.rule}` },
    hdrText: { fontSize: T.fs11, fontWeight: 700, color: T.green, textTransform: 'uppercase', letterSpacing: '0.18em' },
    body:    { padding: T.s5 },
    grid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: T.s3 },
    card:    { background: T.surface, border: `1px solid ${T.rule}`, borderRadius: T.rMd, padding: T.s4 },
    cardT:   { fontSize: T.fs10, fontWeight: 700, color: T.green, marginBottom: T.s3, textTransform: 'uppercase', letterSpacing: '0.16em' },
    row:     { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: T.fs12, borderBottom: `1px solid ${T.rule}`, fontVariantNumeric: 'tabular-nums' },
    lbl:     { color: T.inkMuted },
    ok:      { color: T.greenSoft, fontWeight: 600 },
    err:     { color: T.red, fontWeight: 600 },
    wrn:     { color: T.brassInk, fontWeight: 600 },
    btn:     { padding: '7px 14px', background: T.green, border: 'none', borderRadius: T.rMd, color: '#FFF', fontWeight: 700, fontSize: T.fs11, fontFamily: T.fontBody, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' },
    btnSm:   { padding: '5px 10px', background: T.surface, border: `1px solid ${T.ruleStrong}`, borderRadius: T.rMd, color: T.ink, fontSize: T.fs11, fontFamily: T.fontBody, cursor: 'pointer' },
    inp:     { flex: 1, padding: '7px 10px', background: T.surface, border: `1px solid ${T.ruleStrong}`, borderRadius: T.rMd, color: T.ink, fontSize: T.fs12, fontFamily: T.fontBody, outline: 'none' },
    pre:     { background: T.canvas, border: `1px solid ${T.rule}`, borderRadius: T.rMd, padding: T.s3, fontSize: 10, fontFamily: T.fontMono, color: T.inkSoft, overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: T.s2 },
  };

  const doLoad = async (key, fn) => {
    setLoading(p => ({ ...p, [key]: true }));
    try { await fn(); } catch (e) { console.error(key, e); }
    setLoading(p => ({ ...p, [key]: false }));
  };

  useEffect(() => {
    doLoad('health', async () => {
      try { setHealth(await api.get('/api/health')); } catch (e) { setHealth({ error: e.message }); }
    });
    if (query) {
      doLoad('geo', async () => {
        try { setGeoTest(await api.get('/api/health/geocode?q=' + encodeURIComponent(query))); } catch (e) { setGeoTest({ error: e.message }); }
      });
    }
  }, []);

  const runFull = () => doLoad('full', async () => {
    try { setFullDiag(await api.get('/api/health/full')); } catch (e) { setFullDiag({ error: e.message }); }
  });
  const runGeo = () => doLoad('geo', async () => {
    try { setGeoTest(await api.get('/api/health/geocode?q=' + encodeURIComponent(testQuery))); } catch (e) { setGeoTest({ error: e.message }); }
  });
  const runSrc = (fips) => doLoad('src', async () => {
    try { setSrcResult(await api.get('/api/health/sources?' + new URLSearchParams(fips).toString())); } catch (e) { setSrcResult({ error: e.message }); }
  });

  const R = ({ label, value, status }) => (
    <div style={c.row}>
      <span style={c.lbl}>{label}</span>
      <span style={status === 'ok' ? c.ok : status === 'err' ? c.err : status === 'warn' ? c.wrn : { color: T.ink, fontSize: T.fs11 }}>
        {typeof value === 'object' ? JSON.stringify(value) : String(value != null ? value : '—')}
      </span>
    </div>
  );

  return (
    <div style={c.panel}>
      <div style={c.hdr} onClick={() => setOpen(!open)}>
        <span style={c.hdrText}>Diagnostic console</span>
        <span style={{ color: T.green, fontSize: T.fs15 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={c.body}>
          <div style={{ display: 'flex', gap: T.s2, marginBottom: T.s4, flexWrap: 'wrap' }}>
            <button style={c.btn} onClick={runFull} disabled={loading.full}>{loading.full ? 'Running…' : 'Run full diagnostics'}</button>
            {geoTest?.finalMatch && (
              <button style={c.btnSm} onClick={() => runSrc({ stateFips: geoTest.finalMatch.stateFips, countyFips: geoTest.finalMatch.countyFips, zips: '' })} disabled={loading.src}>
                {loading.src ? '…' : 'Test data sources'}
              </button>
            )}
          </div>

          <div style={c.grid}>
            <div style={c.card}>
              <div style={c.cardT}>API health</div>
              {health?.error
                ? <R label="Connection" value={health.error} status="err" />
                : health ? <>
                    <R label="Status" value={health.status} status={health.status === 'ok' ? 'ok' : 'err'} />
                    <R label="Version" value={health.version} />
                    <R label="Uptime" value={health.uptime + 's'} />
                    <R label="Memory" value={health.memory} />
                  </>
                : <span style={{ fontSize: T.fs11, color: T.inkMuted }}>{loading.health ? 'Checking…' : 'No response'}</span>}
            </div>

            <div style={c.card}>
              <div style={c.cardT}>Geocoder diagnostic</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: T.s2 }}>
                <input style={c.inp} value={testQuery} onChange={e => setTestQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runGeo()} placeholder="Test location…" />
                <button style={c.btn} onClick={runGeo} disabled={loading.geo}>{loading.geo ? '…' : 'Test'}</button>
              </div>
              {geoTest?.error && <R label="Error" value={geoTest.error} status="err" />}
              {geoTest && !geoTest.error && (
                <>
                  <R label="Resolved" value={geoTest.resolved ? 'YES' : 'NO'} status={geoTest.resolved ? 'ok' : 'err'} />
                  {geoTest.finalMatch && <R label="Address" value={geoTest.finalMatch.address} />}
                  {geoTest.finalMatch && <R label="FIPS" value={geoTest.finalMatch.stateFips + '-' + geoTest.finalMatch.countyFips} />}
                  {geoTest.finalMatch && <R label="County" value={geoTest.finalMatch.countyName} />}
                  <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 6, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Strategies</div>
                  {(geoTest.strategies || []).map((st, i) => (
                    <div key={i} style={{ ...c.row, fontSize: T.fs11 }}>
                      <span style={c.lbl}>{i + 1}. {st.name}</span>
                      <span style={st.matchCount > 0 ? c.ok : st.error ? c.err : { color: T.inkMuted }}>
                        {st.matchCount > 0 ? ('✓ ' + st.matchCount + ' (' + st.ms + 'ms)') : st.error ? ('✗ ' + st.error.substring(0, 50)) : ('— 0 (' + st.ms + 'ms)')}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {fullDiag && !fullDiag.error && (
              <div style={c.card}>
                <div style={c.cardT}>Environment</div>
                {Object.entries(fullDiag.env || {}).map(([k, v]) => <R key={k} label={k} value={v} status={v === 'SET' ? 'ok' : 'err'} />)}
              </div>
            )}

            {fullDiag && !fullDiag.error && (
              <div style={c.card}>
                <div style={c.cardT}>External APIs</div>
                {Object.entries(fullDiag.apis || {}).map(([n, r]) => (
                  <R key={n} label={n} value={r.ok ? ('✓ ' + r.status + ' (' + r.ms + 'ms)') : ('✗ ' + (r.error || r.status) + ' (' + r.ms + 'ms)')} status={r.ok ? 'ok' : 'err'} />
                ))}
              </div>
            )}

            {fullDiag && !fullDiag.error && (
              <div style={c.card}>
                <div style={c.cardT}>Supabase tables</div>
                {Object.entries(fullDiag.supabase?.tables || {}).map(([t, cnt]) => (
                  <R key={t} label={t} value={cnt} status={typeof cnt === 'number' ? (cnt > 0 ? 'ok' : 'warn') : 'err'} />
                ))}
              </div>
            )}

            {srcResult && !srcResult.error && (
              <div style={{ ...c.card, gridColumn: '1 / -1' }}>
                <div style={c.cardT}>Data source tests</div>
                {Object.entries(srcResult.results || {}).map(([n, r]) => (
                  <div key={n} style={{ ...c.row, alignItems: 'flex-start' }}>
                    <span style={{ ...c.lbl, minWidth: 180 }}>{n}</span>
                    <span style={r.status === 'ok' ? c.ok : c.err}>
                      {r.status === 'ok' ? ('✓ ' + r.ms + 'ms') : ('✗ ' + r.error)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <details style={{ marginTop: T.s4 }}>
            <summary style={{ fontSize: T.fs11, color: T.inkMuted, cursor: 'pointer' }}>Raw JSON</summary>
            <pre style={c.pre}>{JSON.stringify({ health, geoTest, fullDiag, srcResult }, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
