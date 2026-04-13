import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { T } from '../lib/tokens';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (isSignup) await signup(email, password);
      else await login(email, password);
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: "40px 36px", width: 380 }}>
        <h2 style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 700, margin: 0, textAlign: "center", background: `linear-gradient(135deg, ${T.text}, ${T.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Infinity Markets</h2>
        <p style={{ fontSize: 12, color: T.textDim, textAlign: "center", marginTop: 8 }}>{isSignup ? "Create an account" : "Sign in to continue"}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" style={{ padding: "12px 14px", background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.text, fontSize: 14, fontFamily: T.font, outline: "none" }} />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" onKeyDown={e => e.key === 'Enter' && handleSubmit()} style={{ padding: "12px 14px", background: T.surface, border: `1px solid ${T.cardBorder}`, borderRadius: 6, color: T.text, fontSize: 14, fontFamily: T.font, outline: "none" }} />
          {error && <div style={{ fontSize: 12, color: T.red }}>{error}</div>}
          <button onClick={handleSubmit} disabled={loading} style={{ padding: "12px", background: T.accent, border: "none", borderRadius: 6, color: "#0a0b0d", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: T.font, opacity: loading ? 0.6 : 1 }}>{loading ? "..." : isSignup ? "Sign Up" : "Sign In"}</button>
          <div style={{ fontSize: 12, color: T.textDim, textAlign: "center", cursor: "pointer" }} onClick={() => { setIsSignup(!isSignup); setError(null); }}>
            {isSignup ? "Already have an account? Sign in" : "Need an account? Sign up"}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", cursor: "pointer", marginTop: 4 }} onClick={() => navigate('/')}>← Continue without account</div>
        </div>
      </div>
    </div>
  );
}
