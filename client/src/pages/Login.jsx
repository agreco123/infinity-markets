import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { T } from '../lib/tokens';
import { Page, Container, Stack, Row, Body, Eyebrow, Title, Button, ForbesLogo, Banner, Divider } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const submit = async () => {
    setError(null); setLoading(true);
    try {
      if (isSignup) await signup(email, password);
      else await login(email, password);
      navigate('/');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <Page style={{ display: "flex", minHeight: "100vh" }}>
      {/* Left: editorial pane */}
      <div style={{
        flex: "0 0 46%",
        background: T.green,
        color: "#FFFFFF",
        padding: `${T.s10} ${T.s9}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}>
        <ForbesLogo variant="reverse" height={32} />

        <Stack gap={T.s5} style={{ maxWidth: 460 }}>
          <Eyebrow color={T.brass}>Infinity Markets · Forbes Capretto</Eyebrow>
          <div style={{
            fontFamily: T.fontDisplay,
            fontSize: 44,
            fontWeight: 400,
            lineHeight: 1.12,
            letterSpacing: "-0.015em",
            color: "#FFFFFF",
          }}>
            Underwriting in days, not weeks. Backed by sources, not vibes.
          </div>
          <Body size={T.fs15} color="rgba(255,255,255,0.78)" style={{ lineHeight: 1.65 }}>
            Sign in to access your saved studies, regenerate deliverables, and export the GO / NO-GO memo in your firm's format.
          </Body>
        </Stack>

        <Body size={T.fs11} color="rgba(255,255,255,0.55)" style={{ letterSpacing: "0.06em" }}>
          v4.2.0 · EDITORIAL EDITION · {new Date().getFullYear()}
        </Body>
      </div>

      {/* Right: form pane */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: T.s9,
        background: T.canvas,
      }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Stack gap={T.s6}>
            <Stack gap={T.s2}>
              <Eyebrow>Account access</Eyebrow>
              <Title style={{ fontSize: 30 }}>{isSignup ? "Create your account" : "Welcome back"}</Title>
              <Body color={T.inkMuted}>{isSignup ? "Enter an email and password to begin." : "Sign in with your Forbes Capretto credentials."}</Body>
            </Stack>

            <Divider />

            {error && <Banner tone="error">{error}</Banner>}

            <Stack gap={T.s3}>
              <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@forbescapretto.com" autoFocus />
              <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" onEnter={submit} />
            </Stack>

            <Button kind="primary" size="lg" onClick={submit} disabled={loading || !email || !password} style={{ width: "100%", letterSpacing: "0.08em" }}>
              {loading ? "Authenticating…" : (isSignup ? "Create account" : "Sign in")}
            </Button>

            <Row justify="space-between" align="center">
              <button onClick={() => { setIsSignup(!isSignup); setError(null); }} style={{ fontSize: T.fs12, color: T.green, fontWeight: 500 }}>
                {isSignup ? "Already have an account? Sign in" : "Need an account? Sign up"}
              </button>
              <button onClick={() => navigate('/')} style={{ fontSize: T.fs12, color: T.inkMuted }}>
                ← Continue without account
              </button>
            </Row>
          </Stack>
        </div>
      </div>
    </Page>
  );
}

function Field({ label, type = "text", value, onChange, placeholder, autoFocus, onEnter }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: T.fs10, fontWeight: 600, letterSpacing: T.trackEyebrow, textTransform: "uppercase", color: T.green }}>{label}</span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()}
        placeholder={placeholder}
        style={{
          padding: "13px 14px",
          background: T.surface,
          border: `1.5px solid ${T.ruleStrong}`,
          borderRadius: T.rMd,
          fontSize: T.fs14,
          fontFamily: T.fontBody,
          color: T.ink,
          outline: "none",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
        }}
        onFocus={(e) => { e.target.style.borderColor = T.green; e.target.style.boxShadow = `0 0 0 3px ${T.greenTint}`; }}
        onBlur={(e) => { e.target.style.borderColor = T.ruleStrong; e.target.style.boxShadow = "none"; }}
      />
    </label>
  );
}
