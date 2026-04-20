import { useState, useEffect } from 'react';
import { T } from '../lib/tokens';
import { api } from '../lib/api';

const S = {
  page: { minHeight: '100vh', background: T.bg, fontFamily: T.font, color: T.text, padding: '24px 32px' },
  h1: { fontSize: 28, fontFamily: T.fontDisplay, fontWeight: 700, margin: '0 0 4px', color: T.accent },
  subtitle: { fontSize: 12, color: T.textMuted, marginBottom: 24 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 },
  card: { background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: 8, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: 700, marginBottom: 10, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.05em' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: `1px solid ${T.cardBorder}22` },
  label: { color: T.textDim },
  ok: { color: '#22c55e', fontWeight: 600 },
  err: { color: '#ef4444', fontWeight: 600 },
  warn: { color: '#f59e0b', fontWeight: 600 },
  btn: { padding: '8px 16px', background: T.accent, border: 'none', borderRadius: 6, color: '#0a0b0d', fontWeight: 700, fontSize: 12, fontFamily: T.font, cursor: 'pointer', textTransform: 'uppercase' },
  btnSm: { padding: '5px 10px', background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: 4, color: T.text, fontSize: 11, fontFamily: T.font, cursor: 'pointer' },
  input: { flex: 1, padding: '8px 12px', background: T.bg, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.text, fontSize: 13, fontFamily: T.font, outline: 'none' },
  pre: { background: T.bg, border: `1px solid ${T.cardBorder}`, borderRadius: 6, padding: 12, fontSize: 11, fontFamily: 'monospace', color: T.textDim, overflow: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
};

function Row({ label, value, status }) {
  const c = status === 'ok' ? S.ok : status === 'err' ? S.err : status === 'warn' ? S.warn : {};
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <span style={c}>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</span>
    </div>
  );
}

export default function Debug() {
  const [health, setHealth] = useState(null);
  const [full, setFull] = useState(null);
  const [geoQuery, setGeoQuery] = useState('Amherst, NY');
  const [geoResult, setGeoResult] = useState(null);
  const [srcQuery, setSrcQuery] = useState({ stateFips: '36', countyFips: '029', cbsa: '15380', zips: '14221,14226' });
  const [srcResult, setSrcResult] = useState(null);
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState({});

  const load = async (key, fn) => {
    setLoading(p => ({ ...p, [key]: true }));
    try { await fn(); } catch (e) { console.error(key, e); }
    setLoading(p => ({ ...p, [key]: false }));
  };

  useEffect(() => { load('health', async () => setHealth(await api.get('/api/health'))); }, []);

  const runFull = () => load('full', async () => setFull(await api.get('/api/health/full')));
  const runGeo = () => load('geo', async () => setGeoResult(await api.get(`/api/health/geocode?q=${encodeURIComponent(geoQuery)}`)));
  const runSrc = () => load('src', async () => {
    const p = new URLSearchParams(srcQuery).toString();
    setSrcResult(await api.get(`/api/health/sources?${p}`));
  });
  const runLogs = () => load('logs', async () => setLogs(await api.get('/api/health/logs?limit=30')));

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Infinity Markets — Debug Console</h1>
      <div style={S.subtitle}>Production diagnostics & data source testing</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button style={S.btn} onClick={runFull} disabled={loading.full}>{loading.full ? 'Running...' : 'Full Diagnostics'}</button>
        <button style={S.btnSm} onClick={runLogs} disabled={loading.logs}>Source Logs</button>
        <a href="/" style={{ ...S.btnSm, textDecoration: 'none' }}>← Back to App</a>
      </div>

      <div style={S.grid}>

        {/* Quick Health */}
        <div style={S.card}>
          <div style={S.cardTitle}>Quick Health</div>
          {health ? (
            <>
              <Row label="Status" value={health.status} status={health.status === 'ok' ? 'ok' : 'err'} />
              <Row label="Version" value={health.version} />
              <Row label="Uptime" value={health.uptime + 's'} />
              <Row label="Memory" value={health.memory} />
              <Row label="Node" value={health.node} />
            </>
          ) : <div style={{ color: T.textMuted, fontSize: 12 }}>Loading...</div>}
        </div>

        {/* Geocoder Test */}
        <div style={S.card}>
          <div style={S.cardTitle}>Geocoder Test</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input style={S.input} value={geoQuery} onChange={e => setGeoQuery(e.target.value)} placeholder="City, ST or ZIP" onKeyDown={e => e.key === 'Enter' && runGeo()} />
            <button style={S.btn} onClick={runGeo} disabled={loading.geo}>{loading.geo ? '...' : 'Test'}</button>
          </div>
          {geoResult && (
            <>
              <Row label="Resolved" value={geoResult.resolved ? 'YES' : 'NO'} status={geoResult.resolved ? 'ok' : 'err'} />
              {geoResult.finalMatch && <Row label="Address" value={geoResult.finalMatch.address} />}
              {geoResult.finalMatch && <Row label="FIPS" value={`${geoResult.finalMatch.stateFips}-${geoResult.finalMatch.countyFips}`} />}
              {geoResult.finalMatch && <Row label="Geo Keys" value={(geoResult.finalMatch.geoKeys || []).join(', ')} />}
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, fontWeight: 600 }}>Strategy Results:</div>
              {(geoResult.strategies || []).map((s, i) => (
                <div key={i} style={{ ...S.row, fontSize: 11 }}>
                  <span>{i + 1}. {s.name}</span>
                  <span style={s.matchCount > 0 ? S.ok : s.error ? S.err : { color: T.textMuted }}>
                    {s.matchCount > 0 ? `✓ ${s.matchCount} match (${s.ms}ms)` : s.error ? `✗ ${s.error.substring(0, 60)}` : `— 0 (${s.ms}ms)`}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Env Vars */}
        {full && (
          <div style={S.card}>
            <div style={S.cardTitle}>Environment Variables</div>
            {Object.entries(full.env || {}).map(([k, v]) => (
              <Row key={k} label={k} value={v} status={v === 'SET' ? 'ok' : 'err'} />
            ))}
          </div>
        )}

        {/* External APIs */}
        {full && (
          <div style={S.card}>
            <div style={S.cardTitle}>External API Reachability</div>
            {Object.entries(full.apis || {}).map(([name, r]) => (
              <Row key={name} label={`${name} (${r.ms}ms)`} value={r.ok ? `${r.status} OK` : r.error || `${r.status}`} status={r.ok ? 'ok' : 'err'} />
            ))}
          </div>
        )}

        {/* Supabase Tables */}
        {full && (
          <div style={S.card}>
            <div style={S.cardTitle}>Supabase Tables</div>
            {Object.entries(full.supabase?.tables || {}).map(([t, cnt]) => (
              <Row key={t} label={t} value={cnt} status={typeof cnt === 'number' ? (cnt > 0 ? 'ok' : 'warn') : 'err'} />
            ))}
          </div>
        )}

        {/* System + Storage */}
        {full && (
          <div style={S.card}>
            <div style={S.cardTitle}>System & Storage</div>
            <Row label="Node" value={full.system?.node} />
            <Row label="Uptime" value={full.system?.uptime + 's'} />
            <Row label="Memory RSS" value={full.system?.memory?.rss} />
            <Row label="Heap Used" value={full.system?.memory?.heap} />
            <Row label="Storage Buckets" value={Array.isArray(full.storage) ? full.storage.map(b => `${b.name} (${b.public ? 'public' : 'private'})`).join(', ') : full.storage?.error} />
          </div>
        )}

        {/* Data Source Tester */}
        <div style={{ ...S.card, gridColumn: '1 / -1' }}>
          <div style={S.cardTitle}>Data Source Tester</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {['stateFips', 'countyFips', 'cbsa', 'zips'].map(k => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: T.textMuted }}>{k}</span>
                <input style={{ ...S.input, width: k === 'zips' ? 180 : 80 }} value={srcQuery[k]} onChange={e => setSrcQuery(p => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
            <button style={{ ...S.btn, alignSelf: 'flex-end' }} onClick={runSrc} disabled={loading.src}>{loading.src ? 'Testing...' : 'Test All Sources'}</button>
          </div>
          {srcResult && Object.entries(srcResult.results || {}).map(([name, r]) => (
            <div key={name} style={{ ...S.row, alignItems: 'flex-start' }}>
              <span style={{ ...S.label, minWidth: 200 }}>{name}</span>
              <span style={r.status === 'ok' ? S.ok : S.err}>
                {r.status === 'ok' ? `✓ ${r.ms}ms` : `✗ ${r.error}`}
                {r.preview && <span style={{ color: T.textMuted, marginLeft: 8, fontSize: 11 }}>{JSON.stringify(r.preview).substring(0, 120)}</span>}
              </span>
            </div>
          ))}
        </div>

        {/* Source Logs */}
        {logs && (
          <div style={{ ...S.card, gridColumn: '1 / -1' }}>
            <div style={S.cardTitle}>Source Logs ({logs.count})</div>
            <pre style={S.pre}>{JSON.stringify(logs.logs, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Raw JSON dump */}
      {(full || geoResult || srcResult) && (
        <div style={{ marginTop: 24 }}>
          <div style={S.cardTitle}>Raw JSON</div>
          <pre style={S.pre}>{JSON.stringify({ health, full, geoResult, srcResult }, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
