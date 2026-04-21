import { useState, useEffect } from 'react';
import { T } from '../lib/tokens';
import { api } from '../lib/api';
import Header from '../components/Header';
import PhaseTracker from '../components/PhaseTracker';
import DataPullAnimation from '../components/DataPullAnimation';

export default function Loading({ study, onReset }) {
  const { geo, phase, progress, error, lastQuery } = study;

  const phases = [
    { label: "Geo", status: phase === 'geocode' ? 'active' : progress > 10 ? 'complete' : 'pending' },
    { label: "Ph 1", status: phase === 'demographics' ? 'active' : progress > 35 ? 'complete' : 'pending' },
    { label: "Ph 2", status: phase === 'housing' ? 'active' : progress > 50 ? 'complete' : 'pending' },
    { label: "Ph 3", status: phase === 'competition' ? 'active' : progress > 60 ? 'complete' : 'pending' },
    { label: "Ph 4-9", status: phase === 'analysis' ? 'active' : progress >= 100 ? 'complete' : 'pending' },
    { label: "Deliver", status: progress >= 100 ? 'complete' : 'pending' },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text, padding: "40px 48px" }}>
      <Header query={geo?.name || geo?.input} onReset={onReset} />
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Collecting Market Data — All Phases</h2>
        <p style={{ color: T.textDim, fontSize: 13, marginBottom: 4 }}>Target: <span style={{ color: T.accent }}>{geo?.name || 'Resolving...'}</span></p>
        <PhaseTracker phases={phases} />
        <DataPullAnimation progress={progress} />
        {error && (
          <div style={{ marginTop: 20, padding: "16px 20px", background: T.redDim, border: `1px solid ${T.red}33`, borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.red, marginBottom: 6 }}>Error</div>
            <div style={{ fontSize: 12, color: T.text }}>{error}</div>
            <button onClick={onReset} style={{ marginTop: 12, padding: "8px 18px", background: T.red, border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>← Start Over</button>
          </div>
        )}
        {error && <DebugPanel query={lastQuery} />}
      </div>
    </div>
  );
}

/* ── Embedded Debug Panel ─────────────────────────────────────────────────── */

function DebugPanel({ query }) {
  const [open, setOpen] = useState(true);
  const [health, setHealth] = useState(null);
  const [geoTest, setGeoTest] = useState(null);
  const [fullDiag, setFullDiag] = useState(null);
  const [testQuery, setTestQuery] = useState(query || '');
  const [loading, setLoading] = useState({});
  const [srcResult, setSrcResult] = useState(null);

  const c = {
    panel: { marginTop: 24, background: '#0d1117', border: `1px solid ${T.accent}44`, borderRadius: 10, overflow: 'hidden' },
    hdr: { padding: '12px 16px', background: `${T.accent}11`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    hdrText: { fontSize: 13, fontWeight: 700, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.08em' },
    body: { padding: 16 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 },
    card: { background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 12 },
    cardT: { fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' },
    row: { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, borderBottom: '1px solid #21262d' },
    lbl: { color: '#8b949e' },
    ok: { color: '#3fb950', fontWeight: 600 },
    err: { color: '#f85149', fontWeight: 600 },
    wrn: { color: '#d29922', fontWeight: 600 },
    btn: { padding: '6px 14px', background: T.accent, border: 'none', borderRadius: 5, color: '#0a0b0d', fontWeight: 700, fontSize: 11, fontFamily: T.font, cursor: 'pointer' },
    btnSm: { padding: '4px 10px', background: '#21262d', border: '1px solid #30363d', borderRadius: 4, color: '#c9d1d9', fontSize: 11, fontFamily: T.font, cursor: 'pointer' },
    inp: { flex: 1, padding: '6px 10px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 5, color: '#c9d1d9', fontSize: 12, fontFamily: T.font, outline: 'none' },
    pre: { background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: 10, fontSize: 10, fontFamily: 'monospace', color: '#8b949e', overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 },
  };

  const doLoad = async (key, fn) => {
    setLoading(p => ({ ...p, [key]: true }));
    try { await fn(); } catch (e) { console.error(key, e); }
    setLoading(p => ({ ...p, [key]: false }));
  };

  // Auto-run health + geocoder test on mount
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
      <span style={status === 'ok' ? c.ok : status === 'err' ? c.err : status === 'warn' ? c.wrn : { color: '#c9d1d9', fontSize: 11 }}>
        {typeof value === 'object' ? JSON.stringify(value) : String(value != null ? value : '—')}
      </span>
    </div>
  );

  return (
    <div style={c.panel}>
      <div style={c.hdr} onClick={() => setOpen(!open)}>
        <span style={c.hdrText}>Debug Console</span>
        <span style={{ color: T.accent, fontSize: 16 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={c.body}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button style={c.btn} onClick={runFull} disabled={loading.full}>{loading.full ? 'Running...' : 'Full Diagnostics'}</button>
            {geoTest?.finalMatch && (
              <button style={c.btnSm} onClick={() => runSrc({ stateFips: geoTest.finalMatch.stateFips, countyFips: geoTest.finalMatch.countyFips, zips: '' })} disabled={loading.src}>
                {loading.src ? '...' : 'Test Data Sources'}
              </button>
            )}
          </div>

          <div style={c.grid}>
            {/* Health */}
            <div style={c.card}>
              <div style={c.cardT}>API Health</div>
              {health?.error ? <R label="Connection" value={health.error} status="err" /> : health ? (
                <>
                  <R label="Status" value={health.status} status={health.status === 'ok' ? 'ok' : 'err'} />
                  <R label="Version" value={health.version} />
                  <R label="Uptime" value={health.uptime + 's'} />
                  <R label="Memory" value={health.memory} />
                </>
              ) : <span style={{ fontSize: 11, color: '#8b949e' }}>{loading.health ? 'Checking...' : 'No response'}</span>}
            </div>

            {/* Geocoder */}
            <div style={c.card}>
              <div style={c.cardT}>Geocoder Diagnostic</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input style={c.inp} value={testQuery} onChange={e => setTestQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runGeo()} placeholder="Test location..." />
                <button style={c.btn} onClick={runGeo} disabled={loading.geo}>{loading.geo ? '...' : 'Test'}</button>
              </div>
              {geoTest?.error && <R label="Error" value={geoTest.error} status="err" />}
              {geoTest && !geoTest.error && (
                <>
                  <R label="Resolved" value={geoTest.resolved ? 'YES' : 'NO'} status={geoTest.resolved ? 'ok' : 'err'} />
                  {geoTest.finalMatch && <R label="Address" value={geoTest.finalMatch.address} />}
                  {geoTest.finalMatch && <R label="FIPS" value={geoTest.finalMatch.stateFips + '-' + geoTest.finalMatch.countyFips} />}
                  {geoTest.finalMatch && <R label="County" value={geoTest.finalMatch.countyName} />}
                  <div style={{ fontSize: 10, color: '#8b949e', marginTop: 6, fontWeight: 600 }}>Strategies:</div>
                  {(geoTest.strategies || []).map((st, i) => (
                    <div key={i} style={{ ...c.row, fontSize: 11 }}>
                      <span style={c.lbl}>{i + 1}. {st.name}</span>
                      <span style={st.matchCount > 0 ? c.ok : st.error ? c.err : { color: '#8b949e' }}>
                        {st.matchCount > 0 ? ('✓ ' + st.matchCount + ' (' + st.ms + 'ms)') : st.error ? ('✗ ' + st.error.substring(0, 50)) : ('— 0 (' + st.ms + 'ms)')}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Env Vars */}
            {fullDiag && !fullDiag.error && (
              <div style={c.card}>
                <div style={c.cardT}>Environment</div>
                {Object.entries(fullDiag.env || {}).map(([k, v]) => <R key={k} label={k} value={v} status={v === 'SET' ? 'ok' : 'err'} />)}
              </div>
            )}

            {/* External APIs */}
            {fullDiag && !fullDiag.error && (
              <div style={c.card}>
                <div style={c.cardT}>External APIs</div>
                {Object.entries(fullDiag.apis || {}).map(([n, r]) => (
                  <R key={n} label={n} value={r.ok ? ('✓ ' + r.status + ' (' + r.ms + 'ms)') : ('✗ ' + (r.error || r.status) + ' (' + r.ms + 'ms)')} status={r.ok ? 'ok' : 'err'} />
                ))}
              </div>
            )}

            {/* Supabase Tables */}
            {fullDiag && !fullDiag.error && (
              <div style={c.card}>
                <div style={c.cardT}>Supabase Tables</div>
                {Object.entries(fullDiag.supabase?.tables || {}).map(([t, cnt]) => (
                  <R key={t} label={t} value={cnt} status={typeof cnt === 'number' ? (cnt > 0 ? 'ok' : 'warn') : 'err'} />
                ))}
              </div>
            )}

            {/* Source Tests */}
            {srcResult && !srcResult.error && (
              <div style={{ ...c.card, gridColumn: '1 / -1' }}>
                <div style={c.cardT}>Data Source Tests</div>
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

          {/* Raw JSON */}
          <details style={{ marginTop: 14 }}>
            <summary style={{ fontSize: 11, color: '#8b949e', cursor: 'pointer' }}>Raw JSON</summary>
            <pre style={c.pre}>{JSON.stringify({ health, geoTest, fullDiag, srcResult }, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
