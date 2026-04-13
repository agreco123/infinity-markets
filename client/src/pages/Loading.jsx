import { T } from '../lib/tokens';
import Header from '../components/Header';
import PhaseTracker from '../components/PhaseTracker';
import DataPullAnimation from '../components/DataPullAnimation';

export default function Loading({ study, onReset }) {
  const { geo, phase, progress, error } = study;

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
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
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
      </div>
    </div>
  );
}
